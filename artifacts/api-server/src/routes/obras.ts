import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { Router, type IRouter, type Request } from "express";
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
const manualRequiredColumns = ["ingreso", "ubicacion", "propietario", "visado"] as const;
const MANUAL_ADMIN_TOKEN = process.env.OBRAS_MANUAL_ADMIN_TOKEN || "colon-admin-manual";

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
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.trunc(value);
    return n >= 1900 && n <= 2999 ? n : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const yyyy = /^\d{4}/.exec(trimmed);
  if (yyyy) return Number(yyyy[0]);
  const maybeDate = new Date(trimmed);
  if (Number.isNaN(maybeDate.getTime())) return null;
  return maybeDate.getUTCFullYear();
}

function getFeatureVisadoYear(props: Record<string, unknown>): number | null {
  const candidates: unknown[] = [
    props.fecha_de_visado,
    props.fecha_visado_iso,
    props.visado,
    props.raw__visado,
    props.visado_year,
    props.visadoYear,
    props.ano,
    props.anio,
    props.year,
  ];
  for (const candidate of candidates) {
    const year = getVisadoYear(candidate);
    if (year) return year;
  }
  return null;
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

    const year = getFeatureVisadoYear(props);
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

function resolveManualEntriesPath(): string {
  const cwd = process.cwd();
  return path.resolve(cwd, "artifacts", "planos-cleaning", "manual-obras-entries.jsonl");
}

function hasManualAdminAccess(req: Request): boolean {
  const header = req.headers["x-admin-token"];
  if (Array.isArray(header)) return header.some((value) => value.trim() === MANUAL_ADMIN_TOKEN);
  if (typeof header !== "string") return false;
  return header.trim() === MANUAL_ADMIN_TOKEN;
}

type ManualEntryBody = {
  sourceYear?: unknown;
  createdBy?: unknown;
  data?: unknown;
};

function parseDateForDb(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!dmy) return null;

  const dd = Number(dmy[1]);
  const mm = Number(dmy[2]);
  let yy = Number(dmy[3]);
  if (yy < 100) yy += yy >= 70 ? 1900 : 2000;
  if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yy)) return null;
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12 || yy < 1900 || yy > 2100) return null;

  const date = new Date(Date.UTC(yy, mm - 1, dd));
  if (date.getUTCFullYear() !== yy || date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) return null;
  return `${String(yy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function parseNumericCoord(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function normalizeLegajo(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D+/g, "");
  if (!digits || digits.length > 3) return null;
  return String(Number(digits));
}

function buildNcp(data: Record<string, string>): string | null {
  const concesion = String(data.concesion ?? "").replace(/\D+/g, "");
  const manzana = String(data.manzana ?? "").replace(/\D+/g, "");
  const parcela = String(data.parcela ?? "").replace(/\D+/g, "");
  if (!manzana || !parcela) return null;
  const sec = concesion ? concesion.slice(-3).padStart(3, "0") : "000";
  const manz = manzana.slice(-4).padStart(4, "0");
  const parc = parcela.slice(-3).padStart(3, "0");
  return `010001${sec}000${manz}--${parc}--`;
}

function flag(value: unknown): boolean {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  if (normalized === "0" || normalized === "false" || normalized === "no") return false;
  return true;
}

function buildManualRawFeature(
  sourceRowNumber: string,
  sourceYear: number,
  createdBy: string,
  data: Record<string, string>,
): Record<string, unknown> {
  const lat = parseNumericCoord(data.coordenada_lat ?? data.latitud ?? "");
  const lon = parseNumericCoord(data.coordenada_lon ?? data.longitud ?? "");
  const visadoDate = parseDateForDb(data.visado);
  const visadoYear = visadoDate ? Number(visadoDate.slice(0, 4)) : sourceYear;

  return {
    type: "Feature",
    geometry: lat !== null && lon !== null
      ? { type: "Point", coordinates: [lon, lat] }
      : null,
    properties: {
      source_file: "manual-obras-entries.jsonl",
      source_row_number: sourceRowNumber,
      source_year: sourceYear,
      created_by: createdBy,
      fecha_de_visado: visadoDate ?? String(data.visado ?? ""),
      visado_year: visadoYear,
      legajo_canonico: normalizeLegajo(data.legajo) ?? "",
      ncp: buildNcp(data) ?? "",
      zonificacion: String(data.zonificacion ?? ""),
      destino_uso: String(data.uso ?? ""),
      tipo: String(data.condicion_del_tramite ?? "") || "Manual",
      relevamiento_o_existente: String(data.relevamiento_o_existente ?? ""),
      a_contruir_obra_nueva: String(data.a_construir_obra_nueva ?? ""),
      ampliacion_de_obra_existente: String(data.ampliacion_obra_existente ?? ""),
      proyectado_no_iniciado: String(data.proyectado_no_iniciado ?? ""),
      raw_manual_payload: data,
    },
  };
}

function validateManualBody(body: ManualEntryBody): {
  sourceYear: number;
  createdBy: string;
  data: Record<string, string>;
} {
  const sourceYearNum = Number(body.sourceYear);
  if (!Number.isFinite(sourceYearNum) || sourceYearNum < 2000 || sourceYearNum > 2100) {
    throw new Error("sourceYear inválido");
  }

  const createdBy = String(body.createdBy ?? "admin").trim();
  if (!createdBy) throw new Error("createdBy inválido");

  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
    throw new Error("data inválido");
  }

  const data = Object.fromEntries(
    Object.entries(body.data as Record<string, unknown>).map(([key, value]) => [key, String(value ?? "").trim()]),
  );

  const missing = manualRequiredColumns.filter((key) => !data[key]);
  if (missing.length > 0) {
    throw new Error(`Faltan columnas obligatorias: ${missing.join(", ")}`);
  }

  return {
    sourceYear: Math.trunc(sourceYearNum),
    createdBy,
    data,
  };
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
        visadoYear: getFeatureVisadoYear(props),
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

router.post("/obras/manual-entries", async (req, res) => {
  try {
    if (!hasManualAdminAccess(req)) {
      return res.status(403).json({
        error: "Acceso denegado",
        details: "Falta o es invalido el header x-admin-token",
      });
    }

    const payload = validateManualBody(req.body as ManualEntryBody);
    const outputPath = resolveManualEntriesPath();
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const entry = {
      createdAt: new Date().toISOString(),
      source: "admin-manual-form",
      ...payload,
    };

    await fs.appendFile(outputPath, `${JSON.stringify(entry)}\n`, "utf8");

    const sourceRowNumber = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const feature = buildManualRawFeature(sourceRowNumber, payload.sourceYear, payload.createdBy, payload.data);
    const visadoDate = parseDateForDb(payload.data.visado);
    const visadoYear = visadoDate ? Number(visadoDate.slice(0, 4)) : payload.sourceYear;

    let persistedToDb = false;
    let dbDetails: string | null = null;
    try {
      await db.insert(obrasPrivadasTable).values({
        publicationLevel: "admin",
        sourceFile: "manual-obras-entries.jsonl",
        sourceRowNumber,
        legajoCanonico: normalizeLegajo(payload.data.legajo),
        ncp: buildNcp(payload.data),
        zonificacion: String(payload.data.zonificacion ?? "") || null,
        destinoUso: String(payload.data.uso ?? "") || null,
        tipo: String(payload.data.condicion_del_tramite ?? "") || "Manual",
        visadoDate,
        visadoYear,
        isRelevamiento: flag(payload.data.relevamiento_o_existente),
        isNueva: flag(payload.data.a_construir_obra_nueva),
        isAmpliacion: flag(payload.data.ampliacion_obra_existente),
        isProyectada: flag(payload.data.proyectado_no_iniciado),
        rawFeature: feature,
      });
      persistedToDb = true;
    } catch (dbError) {
      dbDetails = dbError instanceof Error ? dbError.message : "unknown db error";
    }

    return res.status(201).json({
      message: persistedToDb
        ? "Obra manual registrada y subida a DB"
        : "Obra manual registrada en archivo (pendiente de subir a DB)",
      output: outputPath,
      sourceYear: payload.sourceYear,
      createdBy: payload.createdBy,
      sourceRowNumber,
      persistedToDb,
      dbDetails,
    });
  } catch (error) {
    return res.status(400).json({
      error: "No se pudo registrar la obra manual",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
