import fs from "node:fs";
import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import { stringify as stringifyCsv } from "csv-stringify/sync";

type CsvRow = string[];
type CsvTable = CsvRow[];

type IssueSeverity = "warning" | "error";

type Issue = {
  sourceRowNumber: number;
  columnName: string;
  columnIndex: number;
  value: string;
  issueType: string;
  severity: IssueSeverity;
  message: string;
};

type Classification =
  | "detail"
  | "detail_continuation"
  | "antecedente"
  | "aggregate"
  | "month_header"
  | "empty"
  | "detail_unassigned";

type NormalizedRecord = {
  source_row_number: number;
  row_kind: Classification;
  month_context: string;
  legajo_raw: string;
  legajo_canonico: string;
  expediente_raw: string;
  ingreso_raw: string;
  ingreso_iso: string;
  fecha_visado_raw: string;
  fecha_visado_iso: string;
  final_obra_raw: string;
  final_obra_iso: string;
  [key: string]: string | number;
};

type HeaderInfo = {
  colIndex: number;
  unifiedLabel: string;
  key: string;
};

const MONTH_MARKERS = new Set([
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
]);

const AGGREGATE_INGRESO_MARKERS = new Set([
  "a construir",
  "ampliacion",
  "conforme a obra",
  "demolicion",
  "relevamiento",
  "relevamiento / a terminar",
  "relevamiento y ampliacion",
  "remodelacion",
]);

function cell(value: string | undefined): string {
  return (value ?? "").trim();
}

function upper(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(label: string): string {
  const ascii = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const slug = ascii
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  return slug.length > 0 ? slug : "col";
}

function isSpreadsheetError(value: string): boolean {
  const normalized = upper(value);
  return /^#(REF!|ERROR!|VALUE!|N\/A|NAME\?|DIV\/0!|NUM!|NULL!)$/.test(normalized);
}

function parseDateAR(value: string): { iso: string; isValid: boolean } {
  const raw = value.trim();
  if (!raw) {
    return { iso: "", isValid: true };
  }

  const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!match) {
    return { iso: "", isValid: false };
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);

  if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) {
    return { iso: "", isValid: false };
  }

  if (year < 100) {
    year += year >= 70 ? 1900 : 2000;
  }

  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return { iso: "", isValid: false };
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  if (!isRealDate) {
    return { iso: "", isValid: false };
  }

  return {
    iso: `${year.toString().padStart(4, "0")}-${month
      .toString()
      .padStart(2, "0")}-${day.toString().padStart(2, "0")}`,
    isValid: true,
  };
}

function findLastMeaningfulColumn(rows: CsvTable): number {
  let last = -1;
  for (const row of rows) {
    for (let i = row.length - 1; i >= 0; i -= 1) {
      if (cell(row[i]) !== "") {
        if (i > last) {
          last = i;
        }
        break;
      }
    }
  }
  return Math.max(0, last);
}

function buildHeaders(headerRows: CsvTable, columnCount: number): HeaderInfo[] {
  const taken = new Map<string, number>();
  const out: HeaderInfo[] = [];

  for (let col = 0; col < columnCount; col += 1) {
    const parts: string[] = [];

    for (const headerRow of headerRows) {
      const part = cell(headerRow[col]);
      if (!part) {
        continue;
      }
      if (upper(part) === "B") {
        continue;
      }
      if (!parts.some((existing) => upper(existing) === upper(part))) {
        parts.push(part);
      }
    }

    const unifiedLabel = parts.length > 0 ? parts.join(" | ") : `Columna ${col + 1}`;
    const baseKey = slugify(unifiedLabel);
    const count = (taken.get(baseKey) ?? 0) + 1;
    taken.set(baseKey, count);
    const key = count === 1 ? baseKey : `${baseKey}__${count}`;

    out.push({ colIndex: col, unifiedLabel, key });
  }

  return out;
}

function findHeaderIndex(headers: HeaderInfo[], needle: string): number {
  const target = needle.toLowerCase();
  return headers.findIndex((h) => h.unifiedLabel.toLowerCase().includes(target));
}

function countNonEmpty(row: CsvRow): number {
  let count = 0;
  for (const value of row) {
    if (cell(value) !== "") {
      count += 1;
    }
  }
  return count;
}

function classifyRow(
  row: CsvRow,
  sourceRowNumber: number,
  legajoIdx: number,
  expedienteIdx: number,
  ingresoIdx: number,
  lastKnownLegajo: string,
): {
  kind: Classification;
  legajoRaw: string;
  legajoCanonico: string;
  monthMarker: string;
  shouldAdvanceLegajo: boolean;
} {
  const first = upper(cell(row[0]));
  const legajoRaw = legajoIdx >= 0 ? cell(row[legajoIdx]) : "";
  const legajoUpper = upper(legajoRaw);
  const expedienteRaw = expedienteIdx >= 0 ? cell(row[expedienteIdx]) : "";
  const ingresoRaw = ingresoIdx >= 0 ? cell(row[ingresoIdx]) : "";
  const ingresoToken = normalizeToken(ingresoRaw);
  const nonEmpty = countNonEmpty(row);

  if (nonEmpty === 0) {
    return {
      kind: "empty",
      legajoRaw,
      legajoCanonico: lastKnownLegajo,
      monthMarker: "",
      shouldAdvanceLegajo: false,
    };
  }

  if (MONTH_MARKERS.has(first)) {
    return {
      kind: "month_header",
      legajoRaw,
      legajoCanonico: lastKnownLegajo,
      monthMarker: first,
      shouldAdvanceLegajo: false,
    };
  }

  if (first === "TOTALES" || first === "LEGAJOS") {
    return {
      kind: "aggregate",
      legajoRaw,
      legajoCanonico: lastKnownLegajo,
      monthMarker: "",
      shouldAdvanceLegajo: false,
    };
  }

  if (nonEmpty <= 2) {
    return {
      kind: "aggregate",
      legajoRaw,
      legajoCanonico: lastKnownLegajo,
      monthMarker: "",
      shouldAdvanceLegajo: false,
    };
  }

  if (legajoUpper === "ANTECEDENTE") {
    return {
      kind: "antecedente",
      legajoRaw,
      legajoCanonico: lastKnownLegajo,
      monthMarker: "",
      shouldAdvanceLegajo: false,
    };
  }

  if (AGGREGATE_INGRESO_MARKERS.has(ingresoToken) && !expedienteRaw && nonEmpty <= 8) {
    return {
      kind: "aggregate",
      legajoRaw,
      legajoCanonico: lastKnownLegajo,
      monthMarker: "",
      shouldAdvanceLegajo: false,
    };
  }

  const isNumericLegajo = /^\d+$/.test(legajoRaw);
  if (isNumericLegajo) {
    return {
      kind: "detail",
      legajoRaw,
      legajoCanonico: legajoRaw,
      monthMarker: "",
      shouldAdvanceLegajo: true,
    };
  }

  const hasMeaningfulBody = nonEmpty >= 5;
  if (!legajoRaw && hasMeaningfulBody && lastKnownLegajo) {
    return {
      kind: "detail_continuation",
      legajoRaw,
      legajoCanonico: lastKnownLegajo,
      monthMarker: "",
      shouldAdvanceLegajo: false,
    };
  }

  return {
    kind: sourceRowNumber <= 3 ? "empty" : "detail_unassigned",
    legajoRaw,
    legajoCanonico: lastKnownLegajo,
    monthMarker: "",
    shouldAdvanceLegajo: false,
  };
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function detectRepoRoot(): string {
  const cwd = process.cwd();
  const parent = path.resolve(cwd, "..");
  const grandParent = path.resolve(cwd, "..", "..");
  const candidates = [cwd, parent, grandParent];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "pnpm-workspace.yaml"))) {
      return candidate;
    }
  }

  return cwd;
}

function main(): void {
  const inputPath = process.argv[2] ?? "LISTADO PLANOS-hasta-2026.xlsx - 2025(1).csv";
  const repoRoot = detectRepoRoot();
  const outputDir = process.argv[3] ?? path.join(repoRoot, "artifacts", "planos-cleaning");

  if (!fs.existsSync(inputPath)) {
    throw new Error(`No existe el archivo de entrada: ${inputPath}`);
  }

  const rawCsv = fs.readFileSync(inputPath, "utf8");
  const parsed = parseCsv(rawCsv, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: false,
  }) as CsvTable;

  if (parsed.length < 4) {
    throw new Error("El CSV no tiene suficientes filas para encabezado + datos.");
  }

  const lastMeaningfulCol = findLastMeaningfulColumn(parsed);
  const columnCount = lastMeaningfulCol + 1;
  const trimmed = parsed.map((row) => {
    const out = row.slice(0, columnCount);
    while (out.length < columnCount) {
      out.push("");
    }
    return out;
  });

  const headers = buildHeaders(trimmed.slice(0, 3), columnCount);
  const legajoIdx = findHeaderIndex(headers, "legajo");
  const expedienteIdx = findHeaderIndex(headers, "expediente");
  const ingresoIdx = findHeaderIndex(headers, "ingreso");
  const visadoIdx = findHeaderIndex(headers, "fecha de visado");
  const finalObraIdx = findHeaderIndex(headers, "final de obra");

  const records: NormalizedRecord[] = [];
  const issues: Issue[] = [];

  let currentMonth = "";
  let currentLegajo = "";

  for (let i = 3; i < trimmed.length; i += 1) {
    const row = trimmed[i];
    const sourceRowNumber = i + 1;

    const cls = classifyRow(
      row,
      sourceRowNumber,
      legajoIdx,
      expedienteIdx,
      ingresoIdx,
      currentLegajo,
    );

    if (cls.monthMarker) {
      currentMonth = cls.monthMarker;
    }
    if (cls.shouldAdvanceLegajo) {
      currentLegajo = cls.legajoCanonico;
    }

    const ingresoRaw = ingresoIdx >= 0 ? cell(row[ingresoIdx]) : "";
    const visadoRaw = visadoIdx >= 0 ? cell(row[visadoIdx]) : "";
    const finalObraRaw = finalObraIdx >= 0 ? cell(row[finalObraIdx]) : "";

    const ingresoDate = parseDateAR(ingresoRaw);
    const visadoDate = parseDateAR(visadoRaw);
    const finalObraDate = parseDateAR(finalObraRaw);

    const shouldValidateDates =
      cls.kind === "detail" ||
      cls.kind === "detail_continuation" ||
      cls.kind === "antecedente" ||
      cls.kind === "detail_unassigned";

    if (shouldValidateDates && ingresoRaw && !ingresoDate.isValid) {
      issues.push({
        sourceRowNumber,
        columnName: ingresoIdx >= 0 ? headers[ingresoIdx].unifiedLabel : "INGRESO",
        columnIndex: ingresoIdx,
        value: ingresoRaw,
        issueType: "invalid_ar_date",
        severity: "warning",
        message: "Fecha de ingreso invalida para formato AR (dd/mm/aaaa).",
      });
    }

    if (shouldValidateDates && visadoRaw && !visadoDate.isValid) {
      issues.push({
        sourceRowNumber,
        columnName: visadoIdx >= 0 ? headers[visadoIdx].unifiedLabel : "FECHA DE VISADO",
        columnIndex: visadoIdx,
        value: visadoRaw,
        issueType: "invalid_ar_date",
        severity: "warning",
        message: "Fecha de visado invalida para formato AR (dd/mm/aaaa).",
      });
    }

    if (shouldValidateDates && finalObraRaw && !finalObraDate.isValid) {
      issues.push({
        sourceRowNumber,
        columnName: finalObraIdx >= 0 ? headers[finalObraIdx].unifiedLabel : "FINAL DE OBRA",
        columnIndex: finalObraIdx,
        value: finalObraRaw,
        issueType: "invalid_ar_date",
        severity: "warning",
        message: "Fecha de final de obra invalida para formato AR (dd/mm/aaaa).",
      });
    }

    if (cls.kind === "detail_unassigned") {
      issues.push({
        sourceRowNumber,
        columnName: legajoIdx >= 0 ? headers[legajoIdx].unifiedLabel : "LEGAJO",
        columnIndex: legajoIdx,
        value: cls.legajoRaw,
        issueType: "unassigned_legajo",
        severity: "warning",
        message: "Fila con datos que no pudo asignarse a un legajo canonico.",
      });
    }

    const record: NormalizedRecord = {
      source_row_number: sourceRowNumber,
      row_kind: cls.kind,
      month_context: currentMonth,
      legajo_raw: cls.legajoRaw,
      legajo_canonico: cls.legajoCanonico,
      expediente_raw: expedienteIdx >= 0 ? cell(row[expedienteIdx]) : "",
      ingreso_raw: ingresoRaw,
      ingreso_iso: ingresoDate.iso,
      fecha_visado_raw: visadoRaw,
      fecha_visado_iso: visadoDate.iso,
      final_obra_raw: finalObraRaw,
      final_obra_iso: finalObraDate.iso,
    };

    for (let col = 0; col < columnCount; col += 1) {
      const value = cell(row[col]);
      const header = headers[col];
      record[`raw__${header.key}`] = value;

      if (isSpreadsheetError(value)) {
        issues.push({
          sourceRowNumber,
          columnName: header.unifiedLabel,
          columnIndex: col,
          value,
          issueType: "spreadsheet_error_token",
          severity: "error",
          message: "La celda contiene un error de hoja de calculo.",
        });
      }
    }

    records.push(record);
  }

  const baseName = path.basename(inputPath, path.extname(inputPath));
  ensureDir(outputDir);

  const headersOutPath = path.join(outputDir, `${baseName}.headers.json`);
  const normalizedOutPath = path.join(outputDir, `${baseName}.normalized.csv`);
  const reviewOutPath = path.join(outputDir, `${baseName}.review.csv`);
  const summaryOutPath = path.join(outputDir, `${baseName}.summary.json`);

  fs.writeFileSync(headersOutPath, JSON.stringify(headers, null, 2));

  const normalizedCsv = stringifyCsv(records, {
    header: true,
    bom: true,
  });
  fs.writeFileSync(normalizedOutPath, normalizedCsv);

  const reviewRows = issues.map((issue) => ({
    source_row_number: issue.sourceRowNumber,
    severity: issue.severity,
    issue_type: issue.issueType,
    column_name: issue.columnName,
    column_index: issue.columnIndex,
    value: issue.value,
    message: issue.message,
  }));

  const reviewCsv = stringifyCsv(reviewRows, {
    header: true,
    bom: true,
  });
  fs.writeFileSync(reviewOutPath, reviewCsv);

  const byKind: Record<string, number> = {};
  for (const rec of records) {
    byKind[rec.row_kind] = (byKind[rec.row_kind] ?? 0) + 1;
  }

  const summary = {
    inputPath,
    outputDir,
    totalRowsRead: trimmed.length,
    totalDataRows: records.length,
    totalIssues: issues.length,
    rowsByKind: byKind,
    notes: [
      "No se modifica el archivo fuente.",
      "Las fechas se interpretan en formato argentino dd/mm/aaaa.",
      "Los legajos multi-fila se preservan con legajo_canonico para revision manual.",
      "Los encabezados de 3 filas se unifican como general | particular | subparticular.",
    ],
  };

  fs.writeFileSync(summaryOutPath, JSON.stringify(summary, null, 2));

  console.log("Normalizacion completada sin perdida.");
  console.log(`- Headers: ${headersOutPath}`);
  console.log(`- Normalized CSV: ${normalizedOutPath}`);
  console.log(`- Review CSV: ${reviewOutPath}`);
  console.log(`- Summary: ${summaryOutPath}`);
}

main();
