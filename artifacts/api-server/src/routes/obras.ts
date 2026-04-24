import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { Router, type IRouter } from "express";
import { and, asc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { db } from "@workspace/db";
import { obrasPrivadasTable } from "@workspace/db/schema";

const router: IRouter = Router();

type PublicationLevel = "public" | "professional" | "admin";

type DeclarationType = "relevamiento" | "nueva" | "ampliacion" | "proyectada";

type GeoPointFeature = {
  type: "Feature";
  geometry?: { type?: string; coordinates?: unknown[] };
  properties?: Record<string, unknown>;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: GeoPointFeature[];
};

type ParsedFilters = {
  years: number[];
  yearFrom?: number;
  yearTo?: number;
  zonificacion: string[];
  destinoUso: string[];
  declaration: DeclarationType[];
  limit?: number;
  source: "auto" | "file" | "db";
};

type CachedDataset = {
  etag: string;
  lastModified: string;
  mtimeMs: number;
  size: number;
  data: FeatureCollection;
};

const fileDatasetCache = new Map<PublicationLevel, CachedDataset>();

const declarationTypes: DeclarationType[] = ["relevamiento", "nueva", "ampliacion", "proyectada"];

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function parseCsv(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseYears(value: unknown): number[] {
  const years = parseCsv(value)
    .map((item) => Number(item))
    .filter((n) => Number.isFinite(n) && n > 1900 && n < 3000)
    .map((n) => Math.trunc(n));
  return Array.from(new Set(years));
}

function parseOptionalInt(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.trunc(parsed);
}

function parseDeclarationFilters(value: unknown): DeclarationType[] {
  const values = parseCsv(value)
    .map((item) => normalizeText(item))
    .filter((item): item is DeclarationType => declarationTypes.includes(item as DeclarationType));
  return Array.from(new Set(values));
}

function parseSource(value: unknown): "auto" | "file" | "db" {
  if (value === "file" || value === "db") return value;
  return "auto";
}

function parseFilters(query: Record<string, unknown>): ParsedFilters {
  const yearFrom = parseOptionalInt(query.yearFrom);
  const yearTo = parseOptionalInt(query.yearTo);
  const limitRaw = parseOptionalInt(query.limit);
  const limit = limitRaw && limitRaw > 0 ? Math.min(limitRaw, 25_000) : undefined;
  return {
    years: parseYears(query.years),
    yearFrom,
    yearTo,
    zonificacion: parseCsv(query.zonificacion),
    destinoUso: parseCsv(query.destinoUso),
    declaration: parseDeclarationFilters(query.declaration),
    limit,
    source: parseSource(query.source),
  };
}

function getVisadoYear(value: unknown): number | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getUTCFullYear();
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const yyyy = /^\d{4}/.exec(trimmed);
  if (yyyy) return Number(yyyy[0]);
  const maybeDate = new Date(trimmed);
  if (Number.isNaN(maybeDate.getTime())) return null;
  return maybeDate.getUTCFullYear();
}

function isTruthyFlag(value: unknown): boolean {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  if (normalized === "0" || normalized === "false" || normalized === "no") return false;
  return true;
}

function featureMatchesDeclarationFilter(
  feature: GeoPointFeature,
  declarationFilter: DeclarationType[],
): boolean {
  if (declarationFilter.length === 0) return true;
  const props = feature.properties ?? {};
  const flags: Record<DeclarationType, boolean> = {
    relevamiento: isTruthyFlag(props.relevamiento_o_existente),
    nueva: isTruthyFlag(props.a_contruir_obra_nueva),
    ampliacion: isTruthyFlag(props.ampliacion_de_obra_existente),
    proyectada: isTruthyFlag(props.proyectado_no_iniciado),
  };
  return declarationFilter.some((key) => flags[key]);
}

function applyFeatureFilters(features: GeoPointFeature[], filters: ParsedFilters): GeoPointFeature[] {
  const yearsSet = new Set(filters.years);
  const zonificacionSet = new Set(filters.zonificacion.map((v) => normalizeText(v)));
  const destinoUsoSet = new Set(filters.destinoUso.map((v) => normalizeText(v)));

  const filtered = features.filter((feature) => {
    const props = feature.properties ?? {};

    const year = getVisadoYear(props.fecha_de_visado);
    if (yearsSet.size > 0 && (!year || !yearsSet.has(year))) return false;
    if (filters.yearFrom && (!year || year < filters.yearFrom)) return false;
    if (filters.yearTo && (!year || year > filters.yearTo)) return false;

    if (zonificacionSet.size > 0) {
      const zona = normalizeText(props.zonificacion ?? props.zona);
      if (!zonificacionSet.has(zona)) return false;
    }

    if (destinoUsoSet.size > 0) {
      const destino = normalizeText(props.destino_uso ?? props.destino);
      if (!destinoUsoSet.has(destino)) return false;
    }

    if (!featureMatchesDeclarationFilter(feature, filters.declaration)) return false;

    return true;
  });

  if (!filters.limit) return filtered;
  return filtered.slice(0, filters.limit);
}

function hashSignature(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function isMissingObrasTableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("obras_privadas") && message.includes("does not exist");
}

function buildResponseEtag(sourceTag: string, level: PublicationLevel, filters: ParsedFilters, count: number): string {
  const signature = JSON.stringify({
    sourceTag,
    level,
    years: filters.years,
    yearFrom: filters.yearFrom,
    yearTo: filters.yearTo,
    zonificacion: filters.zonificacion,
    destinoUso: filters.destinoUso,
    declaration: filters.declaration,
    limit: filters.limit,
    count,
  });
  return `W/\"${hashSignature(signature)}\"`;
}

function parseLevel(value: unknown): PublicationLevel {
  if (value === "professional" || value === "admin") return value;
  return "public";
}

function candidatePlanosDirs(): string[] {
  const cwd = process.cwd();
  return [
    path.resolve(cwd, "..", "colon-3d", "public", "data", "planos"),
    path.resolve(cwd, "artifacts", "colon-3d", "public", "data", "planos"),
    path.resolve(cwd, "..", "..", "artifacts", "colon-3d", "public", "data", "planos"),
  ];
}

async function resolveDatasetPath(level: PublicationLevel): Promise<string> {
  const fileName = `obras-${level}.geojson`;
  for (const dir of candidatePlanosDirs()) {
    const candidate = path.join(dir, fileName);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  throw new Error(`No se encontró dataset ${fileName} en rutas esperadas`);
}

async function resolveDatasetPathByName(fileName: string): Promise<string> {
  for (const dir of candidatePlanosDirs()) {
    const candidate = path.join(dir, fileName);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  throw new Error(`No se encontró dataset ${fileName} en rutas esperadas`);
}

function ensureFeatureCollection(payload: unknown): FeatureCollection {
  const data = payload as { type?: string; features?: unknown[] };
  if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    throw new Error("El archivo de obras no tiene formato GeoJSON FeatureCollection");
  }

  return {
    type: "FeatureCollection",
    features: data.features as GeoPointFeature[],
  };
}

async function getFileDataset(level: PublicationLevel): Promise<{ path: string; dataset: CachedDataset }> {
  const datasetPath = await resolveDatasetPath(level);
  const stat = await fs.stat(datasetPath);
  const cached = fileDatasetCache.get(level);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return { path: datasetPath, dataset: cached };
  }

  const raw = await fs.readFile(datasetPath, "utf8");
  const data = ensureFeatureCollection(JSON.parse(raw));
  const etag = `\"${hashSignature(`${datasetPath}|${stat.mtimeMs}|${stat.size}`)}\"`;
  const next: CachedDataset = {
    data,
    etag,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    lastModified: stat.mtime.toUTCString(),
  };
  fileDatasetCache.set(level, next);
  return { path: datasetPath, dataset: next };
}

async function getDbFeatures(level: PublicationLevel, filters: ParsedFilters): Promise<GeoPointFeature[]> {
  const whereClauses = [eq(obrasPrivadasTable.publicationLevel, level)];

  if (filters.years.length > 0) {
    whereClauses.push(inArray(obrasPrivadasTable.visadoYear, filters.years));
  }
  if (filters.yearFrom) whereClauses.push(gte(obrasPrivadasTable.visadoYear, filters.yearFrom));
  if (filters.yearTo) whereClauses.push(lte(obrasPrivadasTable.visadoYear, filters.yearTo));
  if (filters.zonificacion.length > 0) {
    whereClauses.push(inArray(obrasPrivadasTable.zonificacion, filters.zonificacion));
  }
  if (filters.destinoUso.length > 0) {
    whereClauses.push(inArray(obrasPrivadasTable.destinoUso, filters.destinoUso));
  }
  if (filters.declaration.length > 0) {
    const declarationClauses = [];
    if (filters.declaration.includes("relevamiento")) declarationClauses.push(eq(obrasPrivadasTable.isRelevamiento, true));
    if (filters.declaration.includes("nueva")) declarationClauses.push(eq(obrasPrivadasTable.isNueva, true));
    if (filters.declaration.includes("ampliacion")) declarationClauses.push(eq(obrasPrivadasTable.isAmpliacion, true));
    if (filters.declaration.includes("proyectada")) declarationClauses.push(eq(obrasPrivadasTable.isProyectada, true));
    if (declarationClauses.length > 0) {
      whereClauses.push(or(...declarationClauses)!);
    }
  }

  const rows = await db
    .select({ rawFeature: obrasPrivadasTable.rawFeature })
    .from(obrasPrivadasTable)
    .where(and(...whereClauses))
    .orderBy(asc(obrasPrivadasTable.sourceRowNumber))
    .limit(filters.limit ?? 25_000);

  return rows.map((row) => row.rawFeature as unknown as GeoPointFeature);
}

async function countDbRows(level: PublicationLevel): Promise<number> {
  const rows = await db
    .select({ id: obrasPrivadasTable.id })
    .from(obrasPrivadasTable)
    .where(eq(obrasPrivadasTable.publicationLevel, level))
    .limit(1);
  return rows.length;
}

router.get("/obras/points", async (req, res) => {
  try {
    const level = parseLevel(req.query.level);
    const filters = parseFilters(req.query as Record<string, unknown>);
    let dbAvailable = true;
    let dbRowCount = 0;
    try {
      dbRowCount = await countDbRows(level);
    } catch (error) {
      if (isMissingObrasTableError(error)) {
        dbAvailable = false;
      } else {
        throw error;
      }
    }

    if (filters.source === "db" && !dbAvailable) {
      return res.status(503).json({
        error: "Fuente DB no disponible",
        details: "La tabla obras_privadas no existe. Ejecuta el push de esquema en lib/db.",
      });
    }

    const useDb = dbAvailable && (filters.source === "db" || (filters.source === "auto" && dbRowCount > 0));

    let features: GeoPointFeature[] = [];
    let sourceTag = "";
    let sourceLabel = "";
    let sourceMode: "db" | "file" = "file";
    let lastModified: string | undefined;

    if (useDb) {
      try {
        features = await getDbFeatures(level, filters);
      } catch (error) {
        if (!(filters.source === "auto" && isMissingObrasTableError(error))) {
          throw error;
        }
        const fileData = await getFileDataset(level);
        sourceTag = fileData.dataset.etag;
        sourceLabel = path.basename(fileData.path);
        sourceMode = "file";
        lastModified = fileData.dataset.lastModified;
        features = applyFeatureFilters(fileData.dataset.data.features, filters);
      }
      if (!sourceTag) {
        sourceTag = `db:${level}`;
        sourceLabel = "db:obras_privadas";
        sourceMode = "db";
      }
    } else {
      const fileData = await getFileDataset(level);
      sourceTag = fileData.dataset.etag;
      sourceLabel = path.basename(fileData.path);
      sourceMode = "file";
      lastModified = fileData.dataset.lastModified;
      features = applyFeatureFilters(fileData.dataset.data.features, filters);
    }

    const responseEtag = buildResponseEtag(sourceTag, level, filters, features.length);
    if (req.headers["if-none-match"] === responseEtag) {
      if (lastModified) res.setHeader("Last-Modified", lastModified);
      res.setHeader("ETag", responseEtag);
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.status(304).end();
    }

    if (lastModified) res.setHeader("Last-Modified", lastModified);
    res.setHeader("ETag", responseEtag);
    res.setHeader("Cache-Control", "public, max-age=60");

    return res.json({
      level,
      source: sourceLabel,
      filters: {
        years: filters.years,
        yearFrom: filters.yearFrom,
        yearTo: filters.yearTo,
        zonificacion: filters.zonificacion,
        destinoUso: filters.destinoUso,
        declaration: filters.declaration,
        source: sourceMode,
      },
      data: {
        type: "FeatureCollection",
        features,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: "No se pudo cargar dataset de Obras Privadas",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.post("/obras/import-from-file", async (req, res) => {
  try {
    const level = parseLevel(req.query.level);
    const replace = req.query.replace !== "false";
    const requestedSource = typeof req.query.sourceFile === "string"
      ? req.query.sourceFile.trim()
      : "";
    const sourcePath = requestedSource
      ? await resolveDatasetPathByName(requestedSource)
      : await resolveDatasetPath(level);

    const raw = await fs.readFile(sourcePath, "utf8");
    const dataset = ensureFeatureCollection(JSON.parse(raw));
    const sourceFile = path.basename(sourcePath);

    const values = dataset.features.map((feature) => {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const visadoRaw = typeof props.fecha_de_visado === "string" ? props.fecha_de_visado.trim() : "";
      const visadoDate = /^\d{4}-\d{2}-\d{2}$/.test(visadoRaw) ? visadoRaw : null;
      return {
        publicationLevel: level,
        sourceFile,
        sourceRowNumber: String(props.source_row_number ?? ""),
        legajoCanonico: String(props.legajo_canonico ?? "") || null,
        ncp: String(props.ncp ?? "") || null,
        zonificacion: String(props.zonificacion ?? props.zona ?? "") || null,
        destinoUso: String(props.destino_uso ?? props.destino ?? "") || null,
        tipo: String(props.tipo ?? props.tipo_obra ?? "") || null,
        visadoDate,
        visadoYear: getVisadoYear(props.fecha_de_visado),
        isRelevamiento: isTruthyFlag(props.relevamiento_o_existente),
        isNueva: isTruthyFlag(props.a_contruir_obra_nueva),
        isAmpliacion: isTruthyFlag(props.ampliacion_de_obra_existente),
        isProyectada: isTruthyFlag(props.proyectado_no_iniciado),
        rawFeature: feature as unknown as Record<string, unknown>,
      };
    }).filter((row) => row.sourceRowNumber.length > 0);

    if (values.length === 0) {
      return res.status(400).json({
        error: "Dataset sin filas importables",
        details: "No se encontraron features con source_row_number",
      });
    }

    const chunkSize = 500;
    let inserted = 0;
    let deleted = 0;

    await db.transaction(async (tx) => {
      if (replace) {
        const removed = await tx
          .delete(obrasPrivadasTable)
          .where(eq(obrasPrivadasTable.publicationLevel, level))
          .returning({ id: obrasPrivadasTable.id });
        deleted = removed.length;
      }

      for (let i = 0; i < values.length; i += chunkSize) {
        const chunk = values.slice(i, i + chunkSize);
        if (replace) {
          const created = await tx.insert(obrasPrivadasTable).values(chunk).returning({ id: obrasPrivadasTable.id });
          inserted += created.length;
        } else {
          const created = await tx
            .insert(obrasPrivadasTable)
            .values(chunk)
            .onConflictDoNothing({
              target: [
                obrasPrivadasTable.publicationLevel,
                obrasPrivadasTable.sourceFile,
                obrasPrivadasTable.sourceRowNumber,
              ],
            })
            .returning({ id: obrasPrivadasTable.id });
          inserted += created.length;
        }
      }
    });

    return res.json({
      message: "Importación de obras completada",
      level,
      sourceFile,
      replace,
      deleted,
      inserted,
      totalRead: dataset.features.length,
      totalPrepared: values.length,
    });
  } catch (error) {
    if (isMissingObrasTableError(error)) {
      return res.status(503).json({
        error: "Tabla obras_privadas inexistente",
        details: "Primero ejecuta el push de esquema en lib/db para crear la tabla.",
      });
    }
    return res.status(500).json({
      error: "No se pudo importar dataset de Obras Privadas",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
