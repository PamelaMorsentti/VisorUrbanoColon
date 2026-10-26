import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

type ManualEntry = {
  createdAt?: string;
  sourceYear?: number;
  createdBy?: string;
  data?: Record<string, unknown>;
};

function detectRepoRoot(startDir: string): string {
  let current = startDir;
  for (;;) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return startDir;
    current = parent;
  }
}

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

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function flag(value: unknown): boolean {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  if (normalized === "0" || normalized === "false" || normalized === "no") return false;
  return true;
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

function buildNcp(data: Record<string, unknown>): string | null {
  const concesion = String(data.concesion ?? "").replace(/\D+/g, "");
  const manzana = String(data.manzana ?? "").replace(/\D+/g, "");
  const parcela = String(data.parcela ?? "").replace(/\D+/g, "");

  if (!manzana || !parcela) return null;

  const sec = concesion ? concesion.slice(-3).padStart(3, "0") : "000";
  const manz = manzana.slice(-4).padStart(4, "0");
  const parc = parcela.slice(-3).padStart(3, "0");
  return `010001${sec}000${manz}--${parc}--`;
}

function stableRowIdFromLine(line: string): string {
  return `manual-${crypto.createHash("sha1").update(line).digest("hex").slice(0, 16)}`;
}

function buildRawFeature(sourceRowNumber: string, sourceYear: number, createdBy: string, data: Record<string, unknown>): Record<string, unknown> {
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

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  if (!arg) return undefined;
  return arg.slice(prefix.length);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  if (!dryRun && !process.env.DATABASE_URL) {
    console.error("DATABASE_URL no definido. Configuralo antes de ejecutar.");
    process.exit(1);
  }

  const repoRoot = detectRepoRoot(process.cwd());
  const inputPath = getArg("input")
    ? path.resolve(process.cwd(), getArg("input") as string)
    : path.join(repoRoot, "artifacts", "planos-cleaning", "manual-obras-entries.jsonl");

  if (!fs.existsSync(inputPath)) {
    console.log(JSON.stringify({
      inputPath,
      dryRun,
      totalLines: 0,
      parsedEntries: 0,
      invalidLines: 0,
      inserted: 0,
      skipped: 0,
      failed: 0,
      note: "No existe archivo de entradas manuales; no hay pendientes para sincronizar.",
    }, null, 2));
    return;
  }

  const lines = fs.readFileSync(inputPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed: Array<{ line: string; entry: ManualEntry }> = [];
  let invalidLines = 0;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as ManualEntry;
      parsed.push({ line, entry });
    } catch {
      invalidLines += 1;
    }
  }

  const client = dryRun
    ? null
    : new Client({ connectionString: process.env.DATABASE_URL });
  if (client) await client.connect();

  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  try {
    for (const { line, entry } of parsed) {
      const data = entry.data ?? {};
      const sourceYear = Number(entry.sourceYear ?? 2025);
      const safeYear = Number.isFinite(sourceYear) && sourceYear >= 2000 && sourceYear <= 2100
        ? Math.trunc(sourceYear)
        : 2025;
      const createdBy = String(entry.createdBy ?? "admin").trim() || "admin";
      const sourceRowNumber = stableRowIdFromLine(line);

      const visadoDate = parseDateForDb(data.visado);
      const visadoYear = visadoDate ? Number(visadoDate.slice(0, 4)) : safeYear;
      const rawFeature = buildRawFeature(sourceRowNumber, safeYear, createdBy, data);

      if (dryRun) {
        inserted += 1;
        continue;
      }

      const sql = `
        INSERT INTO obras_privadas (
          publication_level,
          source_file,
          source_row_number,
          legajo_canonico,
          ncp,
          zonificacion,
          destino_uso,
          tipo,
          visado_date,
          visado_year,
          is_relevamiento,
          is_nueva,
          is_ampliacion,
          is_proyectada,
          raw_feature
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10, $11, $12, $13, $14, $15::jsonb
        )
        ON CONFLICT (publication_level, source_file, source_row_number)
        DO NOTHING
      `;

      const result = await client!.query(sql, [
        "admin",
        "manual-obras-entries.jsonl",
        sourceRowNumber,
        normalizeLegajo(data.legajo),
        buildNcp(data),
        String(data.zonificacion ?? "") || null,
        String(data.uso ?? "") || null,
        String(data.condicion_del_tramite ?? "") || "Manual",
        visadoDate,
        visadoYear,
        flag(data.relevamiento_o_existente),
        flag(data.a_construir_obra_nueva),
        flag(data.ampliacion_obra_existente),
        flag(data.proyectado_no_iniciado),
        JSON.stringify(rawFeature),
      ]);

      if (result.rowCount && result.rowCount > 0) inserted += 1;
      else skipped += 1;
    }
  } catch (error) {
    failed += 1;
    console.error(error);
  } finally {
    if (client) await client.end();
  }

  console.log(JSON.stringify({
    inputPath,
    dryRun,
    totalLines: lines.length,
    parsedEntries: parsed.length,
    invalidLines,
    inserted,
    skipped,
    failed,
  }, null, 2));
}

void main();
