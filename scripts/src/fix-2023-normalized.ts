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
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

function looksLikeDate(value: string): boolean {
  const v = String(value ?? "").trim();
  return /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(v);
}

function hasLetters(value: string): boolean {
  return /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(String(value ?? ""));
}

function hasDigits(value: string): boolean {
  return /\d/.test(String(value ?? ""));
}

function parseConcesionParts(value: string): { group: string; manzana: string } {
  const raw = String(value ?? "").trim();
  const m = raw.match(/^(\d{1,3})\s*[,.-]\s*(\d{1,4})$/);
  if (!m) {
    const digits = raw.replace(/\D+/g, "");
    return { group: digits ? String(Number(digits)) : "", manzana: "" };
  }
  return {
    group: String(Number(m[1])),
    manzana: String(Number(m[2])),
  };
}

function isLikelyProfessionalTag(value: string): boolean {
  const v = String(value ?? "").trim().toUpperCase();
  if (!v) return false;
  return (
    v === "ARQ" ||
    v === "ARQ." ||
    v === "M.M.O." ||
    v === "ING." ||
    v === "ING" ||
    v.includes("ING.") ||
    v.includes("ARQ")
  );
}

function isLikelyAddress(value: string): boolean {
  const v = String(value ?? "").trim();
  if (!v) return false;
  return /(N[°º]|NRO|N\.|CALLE|RUTA|AV\.|AVENIDA|BOULEVARD|BVD|BV|S\/N|ESQ)/i.test(v) || (hasDigits(v) && hasLetters(v));
}

function main(): void {
  const repoRoot = detectRepoRoot(process.cwd());
  const inputPath = path.join(repoRoot, "artifacts", "planos-cleaning", "2023.normalized.csv");
  const outputPath = path.join(repoRoot, "artifacts", "planos-cleaning", "2023.fixed.normalized.csv");

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input not found: ${inputPath}`);
  }

  const rows = parseCsv(fs.readFileSync(inputPath, "utf8"), {
    columns: true,
    bom: true,
    relax_column_count: true,
    skip_empty_lines: false,
  }) as Row[];

  let adjustedRows = 0;
  for (const row of rows) {
    const kind = String(row.row_kind ?? "");
    if (!(kind === "detail" || kind === "detail_continuation" || kind === "detail_unassigned")) {
      continue;
    }

    adjustedRows += 1;

    const concesionRaw = String(row.raw__concesion ?? "");
    const exQuintaRaw = String(row.raw__ex_quinta ?? "");
    const manzanaRaw = String(row.raw__manzana ?? "");
    const parcelaRaw = String(row.raw__parcela ?? "");
    const zonificacionRaw = String(row.raw__zonificacion ?? "");
    const ubicacionRaw = String(row.raw__ubicacion ?? "");
    const propietarioRaw = String(row.raw__propietario ?? "");
    const establecimientoRaw = String(row.raw__nombre_del_establecimiento_y_o_empresa ?? "");

    const concesionParts = parseConcesionParts(concesionRaw);

    if (!hasDigits(manzanaRaw)) {
      if (/^\d{1,4}$/.test(exQuintaRaw.trim())) {
        row.raw__manzana = String(Number(exQuintaRaw.trim()));
      } else if (concesionParts.manzana) {
        row.raw__manzana = concesionParts.manzana;
      } else if (/^\d{1,4}$/.test(parcelaRaw.trim())) {
        row.raw__manzana = String(Number(parcelaRaw.trim()));
      }
    }

    if (!hasDigits(parcelaRaw)) {
      if (/^\d{1,4}$/.test(zonificacionRaw.trim())) {
        row.raw__parcela = String(Number(zonificacionRaw.trim()));
      }
    }

    if (concesionParts.group) {
      row.raw__concesion = concesionParts.group;
    }

    // Visado and observations drift in 2023 source.
    const visadoRaw = String(row.raw__visado ?? "");
    const finalRaw = String(row.raw__final_obra ?? "");
    const col1Raw = String(row.raw__columna1 ?? "");
    const obsRaw = String(row.raw__observaciones ?? "");

    if (!looksLikeDate(visadoRaw) && looksLikeDate(finalRaw)) {
      row.raw__visado = finalRaw;
      row.raw__final_obra = looksLikeDate(col1Raw) ? col1Raw : "";
    }

    if (isLikelyProfessionalTag(obsRaw) && hasLetters(visadoRaw) && !looksLikeDate(visadoRaw)) {
      row.raw__titulo_profesional = obsRaw;
      row.raw__observaciones = visadoRaw;
    }

    // Address also drifts one column to the right in many rows.
    if (!isLikelyAddress(ubicacionRaw) && isLikelyAddress(propietarioRaw)) {
      row.raw__ubicacion = propietarioRaw;
      if (hasLetters(establecimientoRaw)) {
        row.raw__propietario = establecimientoRaw;
      }
    }

    // If zonificacion is numeric and ubicacion is textual zone label, restore it.
    if (!hasLetters(zonificacionRaw) && hasLetters(ubicacionRaw)) {
      row.raw__zonificacion = ubicacionRaw;
    }
  }

  const out = stringifyCsv(rows, {
    header: true,
    bom: true,
  });
  fs.writeFileSync(outputPath, out, "utf8");

  console.log(`[fix-2023-normalized] rows adjusted: ${adjustedRows}`);
  console.log(`[fix-2023-normalized] output: ${outputPath}`);
}

main();
