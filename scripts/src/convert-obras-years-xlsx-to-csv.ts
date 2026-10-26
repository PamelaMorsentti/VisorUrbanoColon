import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import XLSX from "xlsx";

function detectRepoRoot(startDir: string): string {
  let current = startDir;
  for (;;) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return startDir;
    current = parent;
  }
}

function parseYearList(arg: string | undefined): number[] {
  if (!arg) return [2020, 2021, 2022, 2023, 2024, 2025];
  return arg
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1900 && n < 3000);
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function countNonEmptyCsvRows(csvText: string): number {
  const lines = csvText.split(/\r?\n/);
  let count = 0;
  for (let i = 1; i < lines.length; i += 1) {
    if (String(lines[i] ?? "").trim().length > 0) count += 1;
  }
  return count;
}

function main(): void {
  const years = parseYearList(process.argv[2]);
  const repoRoot = detectRepoRoot(process.cwd());
  const outDir = path.join(repoRoot, "_temporal", "diseno_fuentes");
  ensureDir(outDir);

  let exported = 0;
  for (const year of years) {
    const inputPath = path.join(repoRoot, `${year}.xlsx`);
    if (!fs.existsSync(inputPath)) {
      console.warn(`[WARN] No existe ${inputPath}; se omite.`);
      continue;
    }

    const workbook = XLSX.readFile(inputPath, {
      cellDates: false,
      dense: true,
      raw: true,
    });

    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) {
      console.warn(`[WARN] ${year}.xlsx no tiene hojas; se omite.`);
      continue;
    }

    const worksheet = workbook.Sheets[firstSheet];
    const csvText = XLSX.utils.sheet_to_csv(worksheet, {
      FS: ",",
      RS: "\n",
      blankrows: true,
      strip: false,
    });

    const outputPath = path.join(outDir, `${year}.csv`);
    fs.writeFileSync(outputPath, csvText, "utf8");

    const rows = countNonEmptyCsvRows(csvText);
    console.log(`[OK] ${year}: ${rows} filas no vacias exportadas (${firstSheet}) -> ${outputPath}`);
    exported += 1;
  }

  if (exported === 0) {
    console.warn("[WARN] No se exporto ningun anio.");
  } else {
    console.log(`[DONE] Anios exportados: ${exported}`);
  }
}

main();
