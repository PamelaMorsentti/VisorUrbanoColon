import fs from "node:fs";
import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import { stringify as stringifyCsv } from "csv-stringify/sync";

type Row = Record<string, string>;

function detectRepoRoot(startDir: string): string {
  let current = startDir;
  for (;;) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return startDir;
    current = parent;
  }
}

function parseDateAR(value: string): { ok: boolean; iso: string } {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, iso: "" };

  const m = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!m) return { ok: false, iso: "" };

  const first = Number(m[1]);
  const second = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) {
    year += year >= 70 ? 1900 : 2000;
  }

  const buildIso = (day: number, month: number): string => {
    if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return "";
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };

  const ar = buildIso(first, second);
  if (ar) return { ok: true, iso: ar };

  const us = buildIso(second, first);
  if (us) return { ok: true, iso: us };

  return { ok: false, iso: "" };
}

function main(): void {
  const repoRoot = detectRepoRoot(process.cwd());
  const base = path.join(repoRoot, "artifacts", "planos-cleaning", "2023.fixed");

  const norm = parseCsv(fs.readFileSync(`${base}.normalized.csv`, "utf8"), {
    columns: true,
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as Row[];

  const geo = parseCsv(fs.readFileSync(`${base}.cadastral-geolocated.csv`, "utf8"), {
    columns: true,
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as Row[];

  const kinds = new Set(["detail", "detail_continuation", "detail_unassigned"]);
  const detectionIssues: Row[] = [];

  for (const row of norm) {
    if (!kinds.has(String(row.row_kind ?? ""))) continue;

    const ingreso = parseDateAR(String(row.ingreso_raw ?? ""));
    const visado = parseDateAR(String(row.fecha_visado_raw ?? ""));
    const finalObra = parseDateAR(String(row.final_obra_raw ?? ""));

    const pushIssue = (column: string, value: string, issueType: string) => {
      detectionIssues.push({
        source_row_number: row.source_row_number ?? "",
        legajo_canonico: row.legajo_canonico ?? "",
        issue_type: issueType,
        column,
        value,
        expediente_raw: row.expediente_raw ?? "",
        ubicacion: row.raw__ubicacion ?? "",
      });
    };

    if ((row.ingreso_raw ?? "").trim() && !ingreso.ok) {
      pushIssue("ingreso_raw", String(row.ingreso_raw ?? ""), "invalid_ar_date");
    }
    if ((row.fecha_visado_raw ?? "").trim() && !visado.ok) {
      pushIssue("fecha_visado_raw", String(row.fecha_visado_raw ?? ""), "invalid_ar_date");
    }
    if ((row.final_obra_raw ?? "").trim() && !finalObra.ok) {
      pushIssue("final_obra_raw", String(row.final_obra_raw ?? ""), "invalid_ar_date");
    }
    if (String(row.row_kind) === "detail_unassigned") {
      pushIssue("legajo_canonico", String(row.legajo_canonico ?? ""), "unassigned_legajo");
    }
  }

  const geolocIssues: Row[] = [];

  for (const row of geo) {
    const method = String(row.match_method ?? "");
    const matchCount = Number(row.match_count ?? "0");
    const confidence = String(row.confidence ?? "");
    const status = String(row.location_verification_status ?? "");

    const isProblem =
      method === "none" ||
      matchCount !== 1 ||
      confidence === "low" ||
      status === "missing_both_points" ||
      status === "review_large_gap" ||
      status === "review_medium_gap";

    if (!isProblem) continue;

    let prioridad = "media";
    if (status === "missing_both_points" || method === "none") prioridad = "alta";
    if (status === "missing_both_points" && method === "none") prioridad = "critica";

    geolocIssues.push({
      prioridad,
      source_row_number: row.source_row_number ?? "",
      legajo_canonico: row.legajo_canonico ?? "",
      ubicacion: row.raw_ubicacion ?? "",
      match_method: method,
      match_count: String(row.match_count ?? ""),
      confidence,
      location_verification_status: status,
      address_geocode_status: String(row.address_geocode_status ?? ""),
      reason: String(row.reason ?? ""),
    });
  }

  geolocIssues.sort((a, b) => {
    const rank: Record<string, number> = { critica: 0, alta: 1, media: 2 };
    return (rank[a.prioridad] - rank[b.prioridad]) || Number(a.source_row_number) - Number(b.source_row_number);
  });

  const summary = {
    detectionIssues: detectionIssues.length,
    detectionByType: detectionIssues.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.issue_type || "unknown");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    geolocIssues: geolocIssues.length,
    geolocByPriority: geolocIssues.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.prioridad || "media");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    geolocByStatus: geolocIssues.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.location_verification_status || "unknown");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    matchedRows: geo.filter((row) => Number(row.match_count ?? "0") > 0).length,
    totalRows: geo.length,
  };

  fs.writeFileSync(`${base}.postfix.errores-deteccion.csv`, stringifyCsv(detectionIssues, { header: true, bom: true }), "utf8");
  fs.writeFileSync(`${base}.postfix.errores-geolocalizacion.csv`, stringifyCsv(geolocIssues, { header: true, bom: true }), "utf8");
  fs.writeFileSync(`${base}.postfix.errores-resumen.json`, JSON.stringify(summary, null, 2), "utf8");

  console.log(JSON.stringify(summary, null, 2));
}

main();
