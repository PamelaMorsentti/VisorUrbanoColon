import fs from "node:fs";
import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import { stringify as stringifyCsv } from "csv-stringify/sync";

type GeolocatedRow = Record<string, string>;

type QueueRow = {
  priority_score: number;
  verification_status: string;
  source_row_number: string;
  legajo_canonico: string;
  confidence: string;
  match_method: string;
  match_count: string;
  address_vs_cadastral_distance_m: string;
  geolocation_source: string;
  raw_ubicacion: string;
  address_query: string;
  address_match_name: string;
  ncp_formatted: string;
  recommended_action: string;
};

function findRepoRoot(startDir: string): string {
  let current = startDir;

  for (;;) {
    const workspaceFile = path.join(current, "pnpm-workspace.yaml");
    if (fs.existsSync(workspaceFile)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

function main(): void {
  const repoRoot = findRepoRoot(path.resolve(process.cwd()));
  const baseName = "LISTADO PLANOS-hasta-2026.xlsx - 2025(1)";
  const cleaningDir = path.join(repoRoot, "artifacts", "planos-cleaning");
  const geolocatedCsvPath = path.join(cleaningDir, `${baseName}.cadastral-geolocated.csv`);
  const queueCsvPath = path.join(cleaningDir, `${baseName}.cadastral-review-queue.csv`);

  if (!fs.existsSync(geolocatedCsvPath)) {
    throw new Error(`Missing geolocated CSV: ${geolocatedCsvPath}`);
  }

  const rows = parseCsv(fs.readFileSync(geolocatedCsvPath, "utf8"), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
  }) as GeolocatedRow[];

  const statusWeight: Record<string, number> = {
    review_large_gap: 120,
    review_medium_gap: 95,
    missing_address_point: 65,
    missing_cadastral_point: 55,
    no_comparison_points: 45,
    verified_nearby: 20,
    verified_close: 0,
  };

  const queue: QueueRow[] = rows
    .map((row) => {
      const status = row.location_verification_status ?? "";
      const distance = Number(row.address_vs_cadastral_distance_m ?? "");
      const distanceBoost = Number.isFinite(distance) ? Math.min(30, Math.round(distance / 50)) : 0;
      const priorityScore = (statusWeight[status] ?? 10) + distanceBoost;

      let action = "Sin accion.";
      if (status === "review_large_gap" || status === "review_medium_gap") {
        action = "Revisar en mapa y validar altura/calle/NCP.";
      } else if (status === "missing_address_point" && row.postal_address_available === "yes") {
        action = "Normalizar direccion y reintentar geocodificacion.";
      } else if (status === "missing_cadastral_point" || status === "no_comparison_points") {
        action = "Completar referencia catastral o confirmar que no aplica.";
      } else if (status === "verified_nearby") {
        action = "Aceptar con observacion.";
      }

      return {
        priority_score: priorityScore,
        verification_status: status,
        source_row_number: row.source_row_number ?? "",
        legajo_canonico: row.legajo_canonico ?? "",
        confidence: row.confidence ?? "",
        match_method: row.match_method ?? "",
        match_count: row.match_count ?? "",
        address_vs_cadastral_distance_m: row.address_vs_cadastral_distance_m ?? "",
        geolocation_source: row.geolocation_source ?? "automatic",
        raw_ubicacion: row.raw_ubicacion ?? "",
        address_query: row.address_query ?? "",
        address_match_name: row.address_match_name ?? "",
        ncp_formatted: row.ncp_formatted ?? "",
        recommended_action: action,
      };
    })
    .filter((row) => row.verification_status !== "verified_close")
    .sort((a, b) => b.priority_score - a.priority_score);

  fs.writeFileSync(queueCsvPath, stringifyCsv(queue, { header: true }), "utf8");

  const counts: Record<string, number> = {};
  for (const row of queue) {
    counts[row.verification_status] = (counts[row.verification_status] ?? 0) + 1;
  }

  console.log(
    JSON.stringify(
      {
        queuePath: queueCsvPath,
        actionable: queue.length,
        counts,
        top5: queue.slice(0, 5),
      },
      null,
      2,
    ),
  );
}

main();
