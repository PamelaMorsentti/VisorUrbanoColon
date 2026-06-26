import fs from "node:fs";
import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";

type CsvRow = string[];
type CsvTable = CsvRow[];

function normalizeHeader(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/²/g, "2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function findLegajoIndex(headers: string[]): number {
  const normalized = headers.map((h) => normalizeHeader(h));
  return normalized.findIndex((h) => h === "legajo");
}

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function legajoCanonical(value: string): string {
  const digits = toText(value).replace(/\D+/g, "");
  if (!digits || digits.length > 3) return "";
  return String(Number(digits));
}

function detectRepoRoot(startDir: string): string {
  let current = startDir;
  for (;;) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return startDir;
    current = parent;
  }
}

function main(): void {
  const repoRoot = detectRepoRoot(process.cwd());
  const baseDir = path.join(repoRoot, "_temporal", "diseno_fuentes");
  const years = [2020, 2021, 2022, 2023, 2024, 2025];

  console.log("year, total_lines, non_empty_rows, rows_with_valid_legajo, unique_legajos");

  for (const year of years) {
    const filePath = path.join(baseDir, `${year}.csv`);
    if (!fs.existsSync(filePath)) {
      console.log(`${year}, MISSING, MISSING, MISSING, MISSING`);
      continue;
    }

    const text = fs.readFileSync(filePath, "utf8");
    const totalLines = text.split(/\r?\n/).filter((line) => line.length > 0).length;
    const table = parseCsv(text, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: false,
    }) as CsvTable;

    if (table.length === 0) {
      console.log(`${year}, ${totalLines}, 0, 0, 0`);
      continue;
    }

    const headers = (table[0] ?? []).map((cell) => toText(cell));
    const legajoIndex = findLegajoIndex(headers);

    let nonEmptyRows = 0;
    let rowsWithValidLegajo = 0;
    const uniqueLegajos = new Set<string>();

    for (let i = 1; i < table.length; i += 1) {
      const row = table[i] ?? [];
      const hasContent = row.some((cell) => toText(cell) !== "");
      if (!hasContent) continue;

      nonEmptyRows += 1;
      const legajoRaw = legajoIndex >= 0 ? toText(row[legajoIndex]) : "";
      const canon = legajoCanonical(legajoRaw);
      if (canon) {
        rowsWithValidLegajo += 1;
        uniqueLegajos.add(canon);
      }
    }

    console.log(`${year}, ${totalLines}, ${nonEmptyRows}, ${rowsWithValidLegajo}, ${uniqueLegajos.size}`);
  }
}

main();
