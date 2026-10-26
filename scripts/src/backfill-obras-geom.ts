import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse as parseCsv } from "csv-parse/sync";
import { Client } from "pg";

type GeolocatedRow = {
  source_row_number?: string;
  lon?: string;
  lat?: string;
  ncp?: string;
  ncp_formatted?: string;
};

type ParsedPoint = {
  sourceFile: string;
  sourceRowNumber: string;
  lon: number;
  lat: number;
  ncp: string | null;
  ncpFormatted: string | null;
};

type ResolvedTarget = {
  sourceFile: string;
  sourceRowNumber: string;
  strategy: "exact" | "offset" | "ncp_formatted";
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

function walkFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  const out: string[] = [];
  const stack = [dirPath];

  while (stack.length > 0) {
    const current = stack.pop() as string;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
      } else if (entry.isFile()) {
        out.push(absolute);
      }
    }
  }

  return out;
}

function parseYearFromFileName(filePath: string): number | null {
  const name = path.basename(filePath);
  const matches = name.match(/(19|20)\d{2}/g);
  if (!matches || matches.length === 0) return null;
  const last = Number(matches[matches.length - 1]);
  return Number.isInteger(last) ? last : null;
}

function parseCoordinate(input: string | undefined): number | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function asNullableText(input: string | undefined): string | null {
  const value = String(input ?? "").trim();
  return value ? value : null;
}

function toLookupKey(sourceFile: string, sourceRowNumber: string): string {
  return `${sourceFile}::${sourceRowNumber}`;
}

function candidateRowNumbers(raw: string): string[] {
  const out = new Set<string>();
  const base = raw.trim();
  if (!base) return [];

  out.add(base);
  const n = Number(base);
  if (!Number.isInteger(n)) return [...out];

  // Typical shift between original workbook row numbers and exported CSV rows.
  for (const delta of [3, 2, 1, 4, 5]) {
    const candidate = n - delta;
    if (candidate > 0) out.add(String(candidate));
  }

  return [...out];
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL no definido. Configuralo antes de ejecutar.");
    process.exit(1);
  }

  const dryRun = process.argv.includes("--dry-run");
  const repoRoot = detectRepoRoot(process.cwd());
  const cleaningDir = path.join(repoRoot, "artifacts", "planos-cleaning");

  const geolocatedFiles = walkFiles(cleaningDir)
    .filter((filePath) => filePath.toLowerCase().endsWith(".cadastral-geolocated.csv"))
    .sort((a, b) => a.localeCompare(b));

  if (geolocatedFiles.length === 0) {
    console.error(`No se encontraron archivos *.cadastral-geolocated.csv en ${cleaningDir}`);
    process.exit(1);
  }

  const points = new Map<string, ParsedPoint>();
  const diagnostics = {
    filesRead: 0,
    rowsRead: 0,
    rowsSkippedNoCoords: 0,
    duplicateKeys: 0,
  };

  for (const filePath of geolocatedFiles) {
    const sourceYear = parseYearFromFileName(filePath);
    if (!sourceYear) {
      console.warn(`[WARN] No se detecta anio en ${path.basename(filePath)}. Se omite archivo.`);
      continue;
    }

    const csvText = fs.readFileSync(filePath, "utf8");
    const rows = parseCsv(csvText, {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
    }) as GeolocatedRow[];

    diagnostics.filesRead += 1;

    for (const row of rows) {
      diagnostics.rowsRead += 1;

      const sourceRowNumber = String(row.source_row_number ?? "").trim();
      if (!sourceRowNumber) continue;

      const lon = parseCoordinate(row.lon);
      const lat = parseCoordinate(row.lat);
      if (lon === null || lat === null) {
        diagnostics.rowsSkippedNoCoords += 1;
        continue;
      }

      const sourceFile = `${sourceYear}.csv`;
      const key = toLookupKey(sourceFile, sourceRowNumber);
      if (points.has(key)) {
        diagnostics.duplicateKeys += 1;
      }

      points.set(key, {
        sourceFile,
        sourceRowNumber,
        lon,
        lat,
        ncp: asNullableText(row.ncp),
        ncpFormatted: asNullableText(row.ncp_formatted),
      });
    }
  }

  if (points.size === 0) {
    console.error("No hay puntos validos para aplicar backfill.");
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const updateSql = `
    UPDATE core.obras
    SET
      geom_point = extensions.ST_SetSRID(extensions.ST_MakePoint($1, $2), 4326),
      ncp = COALESCE(NULLIF(core.obras.ncp, ''), $3),
      ncp_formatted = COALESCE(NULLIF(core.obras.ncp_formatted, ''), $4),
      updated_at = now()
    WHERE core.obras.source_file = $5
      AND core.obras.source_row_number = $6
      AND (
        core.obras.geom_point IS NULL
        OR COALESCE(core.obras.ncp, '') = ''
        OR COALESCE(core.obras.ncp_formatted, '') = ''
      )
  `;

  const stats = {
    candidatePoints: points.size,
    rowsUpdated: 0,
    rowsMatchedButUnchanged: 0,
    rowsNotFound: 0,
    rowsMatchedByOffset: 0,
    rowsMatchedByNcp: 0,
    rowsUpdatedFromParcelNcp: 0,
  };

  try {
    await client.query("BEGIN");

    for (const point of points.values()) {
      let resolved: ResolvedTarget | null = null;

      for (const candidateRow of candidateRowNumbers(point.sourceRowNumber)) {
        const existing = await client.query(
          `
            SELECT id
            FROM core.obras
            WHERE source_file = $1
              AND source_row_number = $2
          `,
          [point.sourceFile, candidateRow],
        );

        if (existing.rowCount && existing.rowCount > 0) {
          resolved = {
            sourceFile: point.sourceFile,
            sourceRowNumber: candidateRow,
            strategy: candidateRow === point.sourceRowNumber ? "exact" : "offset",
          };
          break;
        }
      }

      if (!resolved && point.ncpFormatted) {
        const byNcp = await client.query(
          `
            SELECT source_row_number
            FROM core.obras
            WHERE source_file = $1
              AND ncp_formatted = $2
          `,
          [point.sourceFile, point.ncpFormatted],
        );

        if ((byNcp.rowCount ?? 0) === 1) {
          resolved = {
            sourceFile: point.sourceFile,
            sourceRowNumber: String(byNcp.rows[0].source_row_number),
            strategy: "ncp_formatted",
          };
        }
      }

      if (!resolved) {
        stats.rowsNotFound += 1;
        continue;
      }

      if (resolved.strategy === "offset") {
        stats.rowsMatchedByOffset += 1;
      } else if (resolved.strategy === "ncp_formatted") {
        stats.rowsMatchedByNcp += 1;
      }

      if (dryRun) {
        stats.rowsMatchedButUnchanged += 1;
        continue;
      }

      const result = await client.query(updateSql, [
        point.lon,
        point.lat,
        point.ncp,
        point.ncpFormatted,
        resolved.sourceFile,
        resolved.sourceRowNumber,
      ]);
      const affected = result.rowCount ?? 0;

      if (affected > 0) {
        stats.rowsUpdated += affected;
      } else {
        stats.rowsMatchedButUnchanged += 1;
      }
    }

    if (!dryRun) {
      // Fallback: fill missing obra points from cadastral parcel geometry using normalized NCP.
      const parcelFallback = await client.query(`
        WITH obra_target AS (
          SELECT
            o.id,
            regexp_replace(coalesce(o.ncp_formatted, o.ncp, ''), '[^0-9]', '', 'g') AS ncp_norm
          FROM core.obras o
          WHERE o.geom_point IS NULL
            AND coalesce(o.ncp_formatted, o.ncp, '') <> ''
        ),
        parcel_match AS (
          SELECT
            o.id AS obra_id,
            p.geom,
            row_number() OVER (PARTITION BY o.id ORDER BY p.id) AS rn,
            count(*) OVER (PARTITION BY o.id) AS cnt
          FROM obra_target o
          JOIN core.parcela p
            ON regexp_replace(coalesce(p.nomenclatura, p.cod_parcela, p.attrs->>'NCP', ''), '[^0-9]', '', 'g') = o.ncp_norm
        ),
        unique_match AS (
          SELECT obra_id, geom
          FROM parcel_match
          WHERE cnt = 1 AND rn = 1
        )
        UPDATE core.obras o
        SET
          geom_point = extensions.ST_PointOnSurface(u.geom)::extensions.geometry(Point, 4326),
          updated_at = now()
        FROM unique_match u
        WHERE o.id = u.obra_id
          AND o.geom_point IS NULL
      `);

      stats.rowsUpdatedFromParcelNcp = parcelFallback.rowCount ?? 0;
    }

    if (dryRun) {
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }

  console.log(`[INFO] Archivos geolocalizados leidos: ${diagnostics.filesRead}`);
  console.log(`[INFO] Filas geolocalizadas leidas: ${diagnostics.rowsRead}`);
  console.log(`[INFO] Filas sin coordenadas: ${diagnostics.rowsSkippedNoCoords}`);
  console.log(`[INFO] Claves duplicadas sobrescritas: ${diagnostics.duplicateKeys}`);
  console.log(`[INFO] Candidatos para backfill: ${stats.candidatePoints}`);
  console.log(`[INFO] Filas actualizadas en core.obras: ${stats.rowsUpdated}`);
  console.log(`[INFO] Filas resueltas por offset de fila: ${stats.rowsMatchedByOffset}`);
  console.log(`[INFO] Filas resueltas por NCP formateado: ${stats.rowsMatchedByNcp}`);
  console.log(`[INFO] Filas actualizadas por fallback parcela/NCP: ${stats.rowsUpdatedFromParcelNcp}`);
  console.log(`[INFO] Filas existentes sin cambios: ${stats.rowsMatchedButUnchanged}`);
  console.log(`[INFO] Filas no encontradas en core.obras: ${stats.rowsNotFound}`);
  console.log(`[INFO] Modo: ${dryRun ? "dry-run (sin persistir cambios)" : "aplicado"}`);
}

void main().catch((error) => {
  console.error("Error en backfill de geometria de obras:");
  console.error(error);
  process.exit(1);
});
