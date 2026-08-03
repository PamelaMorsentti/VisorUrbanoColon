import fs from "node:fs";
import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import { stringify as stringifyCsv } from "csv-stringify/sync";

type Row = Record<string, string>;

type AdminOverride = {
  source_row_number: string;
  lat: number;
  lon: number;
  reason?: string;
  updated_at?: string;
};

type AdminChangesPayload = {
  overrides?: AdminOverride[];
  addedRows?: Array<Record<string, unknown>>;
  editedRows?: Array<Record<string, unknown>>;
  deletedRows?: string[];
  updatedAt?: string;
};

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

function parseDateAR(value: string): { iso: string; isValid: boolean } {
  const raw = String(value ?? "").trim();
  if (!raw) return { iso: "", isValid: true };

  const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!match) return { iso: "", isValid: false };

  const first = Number(match[1]);
  const second = Number(match[2]);
  let year = Number(match[3]);

  if (!Number.isFinite(first) || !Number.isFinite(second) || !Number.isFinite(year)) {
    return { iso: "", isValid: false };
  }

  if (year < 100) {
    year += year >= 70 ? 1900 : 2000;
  }

  const buildIso = (day: number, month: number): string => {
    if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return "";
    const d = new Date(Date.UTC(year, month - 1, day));
    const ok = d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
    if (!ok) return "";
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };

  const arIso = buildIso(first, second);
  if (arIso) return { iso: arIso, isValid: true };

  const usIso = buildIso(second, first);
  if (usIso) return { iso: usIso, isValid: true };

  return { iso: "", isValid: false };
}

function normalizeCompactDate(value: string): string {
  const raw = String(value ?? "").trim();
  const m = raw.match(/^(\d{2})(\d{2})[\/-](\d{2,4})$/);
  if (!m) return raw;
  return `${m[1]}/${m[2]}/${m[3]}`;
}

function toNumber(value: string): number | null {
  const n = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function main(): void {
  const repoRoot = detectRepoRoot(process.cwd());
  const base = path.join(repoRoot, "artifacts", "planos-cleaning", "2023.fixed");
  const normalizedPath = `${base}.normalized.csv`;
  const geolocatedCsvPath = `${base}.cadastral-geolocated.csv`;
  const adminChangesPath = `${base}.cadastral-admin-changes.json`;
  const reportPath = `${base}.auto-fix-report.json`;

  if (!fs.existsSync(normalizedPath) || !fs.existsSync(geolocatedCsvPath)) {
    throw new Error("Missing required 2023.fixed files.");
  }

  const rows = parseCsv(fs.readFileSync(normalizedPath, "utf8"), {
    columns: true,
    bom: true,
    relax_column_count: true,
    skip_empty_lines: false,
  }) as Row[];

  let fixedIngreso = 0;
  let fixedVisado = 0;
  let fixedFinalObra = 0;

  for (const row of rows) {
    const kind = String(row.row_kind ?? "");
    if (!(kind === "detail" || kind === "detail_continuation" || kind === "detail_unassigned")) {
      continue;
    }

    const ingresoRaw = normalizeCompactDate(String(row.ingreso_raw ?? ""));
    const ingresoParsed = parseDateAR(ingresoRaw);
    if (ingresoRaw && ingresoParsed.isValid && !String(row.ingreso_iso ?? "").trim()) {
      row.ingreso_raw = ingresoRaw;
      row.ingreso_iso = ingresoParsed.iso;
      fixedIngreso += 1;
    }

    const visadoCandidates = [
      String(row.fecha_visado_raw ?? ""),
      String(row.raw__visado ?? ""),
      String(row.raw__final_obra ?? ""),
      String(row.final_obra_raw ?? ""),
      String(row.raw__columna1 ?? ""),
    ].map((v) => normalizeCompactDate(v));

    const currentVisadoOk = parseDateAR(String(row.fecha_visado_raw ?? "")).isValid && String(row.fecha_visado_raw ?? "").trim();
    if (!currentVisadoOk) {
      const parsedCandidates = visadoCandidates
        .filter((candidate) => candidate)
        .map((candidate) => ({ candidate, parsed: parseDateAR(candidate) }))
        .filter((entry) => entry.parsed.isValid && entry.parsed.iso);

      const preferred2023 = parsedCandidates.find((entry) => entry.parsed.iso.startsWith("2023-"));
      const selected = preferred2023 ?? parsedCandidates[0];

      if (selected) {
        row.fecha_visado_raw = selected.candidate;
        row.fecha_visado_iso = selected.parsed.iso;
        row.raw__visado = selected.candidate;
        fixedVisado += 1;
      }
    }

    const finalCandidates = [
      String(row.final_obra_raw ?? ""),
      String(row.raw__final_obra ?? ""),
      String(row.raw__columna1 ?? ""),
    ].map((v) => normalizeCompactDate(v));

    const currentFinalOk = parseDateAR(String(row.final_obra_raw ?? "")).isValid && String(row.final_obra_raw ?? "").trim();
    if (!currentFinalOk) {
      for (const candidate of finalCandidates) {
        if (!candidate) continue;
        const parsed = parseDateAR(candidate);
        if (parsed.isValid && parsed.iso) {
          row.final_obra_raw = candidate;
          row.final_obra_iso = parsed.iso;
          row.raw__final_obra = candidate;
          fixedFinalObra += 1;
          break;
        }
      }
    }
  }

  fs.writeFileSync(
    normalizedPath,
    stringifyCsv(rows, {
      header: true,
      bom: true,
    }),
    "utf8",
  );

  const geoRows = parseCsv(fs.readFileSync(geolocatedCsvPath, "utf8"), {
    columns: true,
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as Row[];

  const existing: AdminChangesPayload = fs.existsSync(adminChangesPath)
    ? (JSON.parse(fs.readFileSync(adminChangesPath, "utf8")) as AdminChangesPayload)
    : {};

  const map = new Map<string, AdminOverride>();
  for (const ov of existing.overrides ?? []) {
    if (!ov || !ov.source_row_number) continue;
    map.set(String(ov.source_row_number), ov);
  }

  let autoOverridesAdded = 0;

  for (const row of geoRows) {
    const sourceRow = String(row.source_row_number ?? "").trim();
    if (!sourceRow) continue;

    const status = String(row.location_verification_status ?? "");
    const geocodeStatus = String(row.address_geocode_status ?? "");
    const lat = toNumber(String(row.address_lat ?? ""));
    const lon = toNumber(String(row.address_lon ?? ""));

    if (status === "missing_cadastral_point" && geocodeStatus === "matched_ign" && lat !== null && lon !== null) {
      if (!map.has(sourceRow)) {
        autoOverridesAdded += 1;
      }
      map.set(sourceRow, {
        source_row_number: sourceRow,
        lat,
        lon,
        reason: "auto_override_from_ign_2023_batch",
        updated_at: new Date().toISOString(),
      });
    }
  }

  const overrides = [...map.values()].sort((a, b) => Number(a.source_row_number) - Number(b.source_row_number));

  const payload: AdminChangesPayload = {
    ...existing,
    overrides,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(adminChangesPath, JSON.stringify(payload, null, 2), "utf8");

  const report = {
    normalizedPath,
    adminChangesPath,
    fixedIngreso,
    fixedVisado,
    fixedFinalObra,
    autoOverridesAdded,
    totalOverrides: overrides.length,
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main();
