import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse as parseCsv } from "csv-parse/sync";
import { Client } from "pg";

type CsvRow = string[];
type CsvTable = CsvRow[];

type WideRecord = {
  source_file: string;
  source_year: number;
  source_row_number: string;
  legajo_canonico: string;
  mes: string;
  legajo: string;
  expediente: string;
  ingreso: string;
  condicion_del_tramite: string;
  plano_de_mensura: string;
  partida_provincial: string;
  partida_municipal: string;
  concesion: string;
  ex_quinta: string;
  manzana: string;
  parcela: string;
  zonificacion: string;
  ubicacion: string;
  propietario: string;
  nombre_establecimiento_empresa: string;
  proyecto: string;
  direccion_de_obra: string;
  estructura: string;
  constructor: string;
  relevamiento_o_existente: string;
  a_construir_obra_nueva: string;
  ampliacion_obra_existente: string;
  proyectado_no_iniciado: string;
  uso: string;
  cantidad_habitaciones_existente: string;
  cantidad_habitaciones_nuevas: string;
  locales_habitables_existente: string;
  locales_habitables_nuevos: string;
  plazas_existente: string;
  plazas_nuevas: string;
  m2_existentes_antecedente_vivienda: string;
  m2_existentes_antecedente_local: string;
  m2_existentes_relevados_vivienda: string;
  m2_existentes_relevados_local: string;
  m2_a_construir_vivienda: string;
  m2_a_construir_local: string;
  terreno: string;
  fos: string;
  fot: string;
  categoria: string;
  monto_inversion_estimado_declarado: string;
  derechos_edificacion: string;
  titulo_profesional: string;
  observaciones: string;
  visado: string;
  final_obra: string;
  avance_de_obra: string;
  columna1: string;
  raw_payload: Record<string, string>;
};

const CANONICAL_COLUMNS = [
  "mes", "legajo", "expediente", "ingreso", "condicion_del_tramite", "plano_de_mensura",
  "partida_provincial", "partida_municipal", "concesion", "ex_quinta", "manzana", "parcela",
  "zonificacion", "ubicacion", "propietario", "nombre_establecimiento_empresa", "proyecto",
  "direccion_de_obra", "estructura", "constructor", "relevamiento_o_existente", "a_construir_obra_nueva",
  "ampliacion_obra_existente", "proyectado_no_iniciado", "uso", "cantidad_habitaciones_existente",
  "cantidad_habitaciones_nuevas", "locales_habitables_existente", "locales_habitables_nuevos",
  "plazas_existente", "plazas_nuevas", "m2_existentes_antecedente_vivienda",
  "m2_existentes_antecedente_local", "m2_existentes_relevados_vivienda", "m2_existentes_relevados_local",
  "m2_a_construir_vivienda", "m2_a_construir_local", "terreno", "fos", "fot", "categoria",
  "monto_inversion_estimado_declarado", "derechos_edificacion", "titulo_profesional", "observaciones",
  "visado", "final_obra", "avance_de_obra", "columna1",
] as const;

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

function headerToCanonical(input: string): string | null {
  const h = normalizeHeader(input);
  const table: Record<string, string> = {
    mes: "mes",
    legajo: "legajo",
    expediente: "expediente",
    ingreso: "ingreso",
    condicion_del_tramite: "condicion_del_tramite",
    plano_de_mensura: "plano_de_mensura",
    partida_provincial: "partida_provincial",
    partida_municipal: "partida_municipal",
    concesion: "concesion",
    ex_quinta: "ex_quinta",
    manzana: "manzana",
    parcela: "parcela",
    zonificacion: "zonificacion",
    ubicacion: "ubicacion",
    propietario: "propietario",
    nombre_del_establecimiento_y_o_empresa: "nombre_establecimiento_empresa",
    proyecto: "proyecto",
    direccion_de_obra: "direccion_de_obra",
    estructura: "estructura",
    constructor: "constructor",
    relevamiento_o_existente: "relevamiento_o_existente",
    a_contruir_obra_nueva: "a_construir_obra_nueva",
    ampliacion_de_obra_existente: "ampliacion_obra_existente",
    proyectado_no_iniciado: "proyectado_no_iniciado",
    uso: "uso",
    cantidad_de_habitaciones_dormitorios_existente: "cantidad_habitaciones_existente",
    cantidad_de_habitaciones_dormitorios_nuevas: "cantidad_habitaciones_nuevas",
    locales_de_1_habitables_existente: "locales_habitables_existente",
    locales_de_1_habitables_nuevos: "locales_habitables_nuevos",
    n_de_plazas_existente: "plazas_existente",
    n_de_plazas_nuevas: "plazas_nuevas",
    m2_existentes_con_antecedente_vivienda: "m2_existentes_antecedente_vivienda",
    m2_existentes_con_antecedente_local: "m2_existentes_antecedente_local",
    m2_existentes_relevados_vivienda: "m2_existentes_relevados_vivienda",
    m2_existentes_relevados_local: "m2_existentes_relevados_local",
    m2_a_construir_vivienda: "m2_a_construir_vivienda",
    m2_a_construir_local: "m2_a_construir_local",
    terreno: "terreno",
    f_o_s: "fos",
    f_o_t: "fot",
    categoria: "categoria",
    monto_de_la_inversion_estimado_y_o_declarado: "monto_inversion_estimado_declarado",
    derechos_de_edificacion: "derechos_edificacion",
    titulo_profesional: "titulo_profesional",
    observaciones: "observaciones",
    visado: "visado",
    final_obra: "final_obra",
    avance_de_obra: "avance_de_obra",
    columna1: "columna1",
  };

  return table[h] ?? null;
}

function asText(value: unknown): string {
  return String(value ?? "").trim();
}

function hasSignal(value: string): boolean {
  const v = asText(value);
  if (!v) return false;
  if (/[a-zA-Z]/.test(v)) return true;
  return parseNumeric(v) > 0;
}

function normalizeLegajo(value: string): string {
  const digits = asText(value).replace(/\D+/g, "");
  // Business rule: legajo should be at most 3 digits.
  if (!digits || digits.length > 3) return "";
  return String(Number(digits));
}

function normalizeExpediente(value: string): string {
  const withoutMail = asText(value)
    .replace(/\bmail\b[\s:.-]*/gi, "")
    .replace(/^,+\s*/, "")
    .trim();

  if (!withoutMail) return "";

  const parts = withoutMail
    .split(/[,;/]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.replace(/\D+/g, ""))
    .filter(Boolean);

  if (parts.length === 0) return "";
  return parts.join(", ");
}

function parseIntegerComponent(value: string, maxDigits: number): number | null {
  const digits = asText(value).replace(/\D+/g, "");
  if (!digits) return null;
  const clipped = digits.length > maxDigits ? digits.slice(-maxDigits) : digits;
  const n = Number(clipped);
  return Number.isFinite(n) ? n : null;
}

function padNumber(value: number, width: number): string {
  return String(Math.max(0, Math.trunc(value))).padStart(width, "0");
}

function formatParcelNcp(sec: number | null, gru: number | null, manz: number | null, parc: number | null): string {
  if (manz === null || parc === null) return "";
  const secSafe = sec ?? 0;
  const gruSafe = gru ?? 0;
  return `010001${padNumber(secSafe, 3)}${padNumber(gruSafe, 3)}${padNumber(manz, 4)}--${padNumber(parc, 3)}--`;
}

function deriveTipo(wide: WideRecord): string {
  const direct = asText(wide.condicion_del_tramite);
  if (direct) return direct;

  const parts: string[] = [];
  if (hasSignal(wide.relevamiento_o_existente)) parts.push("Relevamiento o existente");
  if (hasSignal(wide.a_construir_obra_nueva)) parts.push("A construir / obra nueva");
  if (hasSignal(wide.ampliacion_obra_existente)) parts.push("Ampliacion de obra existente");
  if (hasSignal(wide.proyectado_no_iniciado)) parts.push("Proyectado (no iniciado)");

  return parts.length > 0 ? parts.join(" + ") : "Sin tipo";
}

function parseNumeric(value: string): number {
  const raw = value.trim();
  if (!raw) return 0;

  // Keep only characters that can participate in a numeric literal.
  const cleaned = raw.replace(/\s+/g, "").replace(/[^0-9,.-]/g, "");
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const hasComma = lastComma !== -1;
  const hasDot = lastDot !== -1;

  let normalized = cleaned;

  if (hasComma && hasDot) {
    // If both are present, the rightmost one is the decimal separator.
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandsSep = decimalSep === "," ? "." : ",";
    normalized = cleaned.split(thousandsSep).join("");
    normalized = normalized.replace(decimalSep, ".");
  } else if (hasComma || hasDot) {
    const sep = hasComma ? "," : ".";
    const parts = cleaned.split(sep);

    if (parts.length > 2) {
      const allGroupsAreThousands = parts.slice(1).every((p) => p.length === 3);
      if (allGroupsAreThousands) {
        normalized = parts.join("");
      } else {
        const decimalPart = parts.pop() ?? "";
        normalized = `${parts.join("")}.${decimalPart}`;
      }
    } else {
      const integerPart = parts[0] ?? "";
      const fractionPart = parts[1] ?? "";

      if (fractionPart.length === 0) {
        normalized = integerPart;
      } else if (fractionPart.length > 3 || fractionPart.length <= 2) {
        normalized = `${integerPart}.${fractionPart}`;
      } else {
        // 3 digits after separator is usually a thousands separator in this dataset.
        normalized = `${integerPart}${fractionPart}`;
      }
    }
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;

  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = v.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (!dmy) return null;
  const dd = dmy[1].padStart(2, "0");
  const mm = dmy[2].padStart(2, "0");
  let yy = dmy[3];
  if (yy.length === 2) yy = Number(yy) > 70 ? `19${yy}` : `20${yy}`;
  return `${yy}-${mm}-${dd}`;
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

function rowHasContent(row: CsvRow): boolean {
  return row.some((c) => asText(c) !== "");
}

function parseYearList(arg: string | undefined): number[] {
  if (!arg) return [2020, 2021, 2022, 2023, 2024, 2025];
  return arg.split(",").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 1900 && n < 2200);
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL no definido. Configuralo antes de ejecutar.");
    process.exit(1);
  }

  const years = parseYearList(process.argv[2]);
  const repoRoot = detectRepoRoot(process.cwd());

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const rawUpsertSql = `
    INSERT INTO core.obras_ingest_raw (source_file, source_year, source_row_number, legajo_canonico, raw_payload)
    VALUES ($1, $2, $3, $4, $5::jsonb)
    ON CONFLICT (source_file, source_row_number)
    DO UPDATE SET
      source_year = EXCLUDED.source_year,
      legajo_canonico = EXCLUDED.legajo_canonico,
      raw_payload = EXCLUDED.raw_payload,
      updated_at = now();
  `;

  const wideUpsertSql = `
    INSERT INTO core.obras_ingest_wide (
      source_file, source_year, source_row_number, legajo_canonico,
      mes, legajo, expediente, ingreso, condicion_del_tramite, plano_de_mensura,
      partida_provincial, partida_municipal, concesion, ex_quinta, manzana, parcela,
      zonificacion, ubicacion, propietario, nombre_establecimiento_empresa, proyecto,
      direccion_de_obra, estructura, constructor, relevamiento_o_existente,
      a_construir_obra_nueva, ampliacion_obra_existente, proyectado_no_iniciado, uso,
      cantidad_habitaciones_existente, cantidad_habitaciones_nuevas,
      locales_habitables_existente, locales_habitables_nuevos, plazas_existente, plazas_nuevas,
      m2_existentes_antecedente_vivienda, m2_existentes_antecedente_local,
      m2_existentes_relevados_vivienda, m2_existentes_relevados_local,
      m2_a_construir_vivienda, m2_a_construir_local, terreno, fos, fot, categoria,
      monto_inversion_estimado_declarado, derechos_edificacion, titulo_profesional,
      observaciones, visado, final_obra, avance_de_obra, columna1,
      raw_payload
    ) VALUES (
      $1,$2,$3,$4,
      $5,$6,$7,$8,$9,$10,
      $11,$12,$13,$14,$15,$16,
      $17,$18,$19,$20,$21,
      $22,$23,$24,$25,
      $26,$27,$28,$29,
      $30,$31,
      $32,$33,$34,$35,
      $36,$37,
      $38,$39,
      $40,$41,$42,$43,$44,$45,
      $46,$47,$48,
      $49,$50,$51,$52,$53,
      $54::jsonb
    )
    ON CONFLICT (source_file, source_row_number)
    DO UPDATE SET
      source_year = EXCLUDED.source_year,
      legajo_canonico = EXCLUDED.legajo_canonico,
      mes = EXCLUDED.mes,
      legajo = EXCLUDED.legajo,
      expediente = EXCLUDED.expediente,
      ingreso = EXCLUDED.ingreso,
      condicion_del_tramite = EXCLUDED.condicion_del_tramite,
      plano_de_mensura = EXCLUDED.plano_de_mensura,
      partida_provincial = EXCLUDED.partida_provincial,
      partida_municipal = EXCLUDED.partida_municipal,
      concesion = EXCLUDED.concesion,
      ex_quinta = EXCLUDED.ex_quinta,
      manzana = EXCLUDED.manzana,
      parcela = EXCLUDED.parcela,
      zonificacion = EXCLUDED.zonificacion,
      ubicacion = EXCLUDED.ubicacion,
      propietario = EXCLUDED.propietario,
      nombre_establecimiento_empresa = EXCLUDED.nombre_establecimiento_empresa,
      proyecto = EXCLUDED.proyecto,
      direccion_de_obra = EXCLUDED.direccion_de_obra,
      estructura = EXCLUDED.estructura,
      constructor = EXCLUDED.constructor,
      relevamiento_o_existente = EXCLUDED.relevamiento_o_existente,
      a_construir_obra_nueva = EXCLUDED.a_construir_obra_nueva,
      ampliacion_obra_existente = EXCLUDED.ampliacion_obra_existente,
      proyectado_no_iniciado = EXCLUDED.proyectado_no_iniciado,
      uso = EXCLUDED.uso,
      cantidad_habitaciones_existente = EXCLUDED.cantidad_habitaciones_existente,
      cantidad_habitaciones_nuevas = EXCLUDED.cantidad_habitaciones_nuevas,
      locales_habitables_existente = EXCLUDED.locales_habitables_existente,
      locales_habitables_nuevos = EXCLUDED.locales_habitables_nuevos,
      plazas_existente = EXCLUDED.plazas_existente,
      plazas_nuevas = EXCLUDED.plazas_nuevas,
      m2_existentes_antecedente_vivienda = EXCLUDED.m2_existentes_antecedente_vivienda,
      m2_existentes_antecedente_local = EXCLUDED.m2_existentes_antecedente_local,
      m2_existentes_relevados_vivienda = EXCLUDED.m2_existentes_relevados_vivienda,
      m2_existentes_relevados_local = EXCLUDED.m2_existentes_relevados_local,
      m2_a_construir_vivienda = EXCLUDED.m2_a_construir_vivienda,
      m2_a_construir_local = EXCLUDED.m2_a_construir_local,
      terreno = EXCLUDED.terreno,
      fos = EXCLUDED.fos,
      fot = EXCLUDED.fot,
      categoria = EXCLUDED.categoria,
      monto_inversion_estimado_declarado = EXCLUDED.monto_inversion_estimado_declarado,
      derechos_edificacion = EXCLUDED.derechos_edificacion,
      titulo_profesional = EXCLUDED.titulo_profesional,
      observaciones = EXCLUDED.observaciones,
      visado = EXCLUDED.visado,
      final_obra = EXCLUDED.final_obra,
      avance_de_obra = EXCLUDED.avance_de_obra,
      columna1 = EXCLUDED.columna1,
      raw_payload = EXCLUDED.raw_payload,
      updated_at = now();
  `;

  const obrasUpsertSql = `
    INSERT INTO core.obras (
      legajo_canonico, expediente, fecha_visado, destino_uso, tipo,
      propietario, constructor, profesional_proyecto, raw_ubicacion,
      direccion_obra, ncp, ncp_formatted, zonificacion, m2_total, m2_a_construir, m2_relevado,
      source_file, source_row_number
    ) VALUES (
      $1,$2,$3,$4,$5,
      $6,$7,$8,$9,
      $10,$11,$12,$13,$14,$15,$16,
      $17,$18
    )
    ON CONFLICT (source_file, source_row_number)
    DO UPDATE SET
      legajo_canonico = EXCLUDED.legajo_canonico,
      expediente = EXCLUDED.expediente,
      fecha_visado = EXCLUDED.fecha_visado,
      destino_uso = EXCLUDED.destino_uso,
      tipo = EXCLUDED.tipo,
      propietario = EXCLUDED.propietario,
      constructor = EXCLUDED.constructor,
      profesional_proyecto = EXCLUDED.profesional_proyecto,
      raw_ubicacion = EXCLUDED.raw_ubicacion,
      direccion_obra = EXCLUDED.direccion_obra,
      ncp = EXCLUDED.ncp,
      ncp_formatted = EXCLUDED.ncp_formatted,
      zonificacion = EXCLUDED.zonificacion,
      m2_total = EXCLUDED.m2_total,
      m2_a_construir = EXCLUDED.m2_a_construir,
      m2_relevado = EXCLUDED.m2_relevado,
      updated_at = now();
  `;

  let inserted = 0;
  try {
    for (const year of years) {
      const csvPath = path.join(repoRoot, "_temporal", "diseno_fuentes", `${year}.csv`);
      if (!fs.existsSync(csvPath)) {
        console.warn(`[WARN] No existe ${csvPath}, se omite.`);
        continue;
      }

      const csvText = fs.readFileSync(csvPath, "utf8");
      const table = parseCsv(csvText, {
        bom: true,
        relax_column_count: true,
        skip_empty_lines: false,
      }) as CsvTable;

      if (table.length < 2) {
        console.warn(`[WARN] ${year}.csv no tiene datos, se omite.`);
        continue;
      }

      const headers = table[0].map((h) => asText(h));
      const headerMap = headers.map((h) => headerToCanonical(h));

      await client.query("BEGIN");
      try {
        for (let i = 1; i < table.length; i += 1) {
          const row = table[i];
          if (!rowHasContent(row)) continue;

          const payload: Record<string, string> = {};
          const wide: Record<string, string> = {};
          for (const col of CANONICAL_COLUMNS) wide[col] = "";

          for (let c = 0; c < headers.length; c += 1) {
            const originalHeader = headers[c] || `col_${c + 1}`;
            const val = asText(row[c]);
            payload[originalHeader] = val;
            const canonical = headerMap[c];
            if (canonical) wide[canonical] = val;
          }

          const sourceFile = `${year}.csv`;
          const sourceRowNumber = String(i + 1);
          const legajoCanonico = normalizeLegajo(wide.legajo);
          const expedienteNormalizado = normalizeExpediente(wide.expediente);

          const sec = parseIntegerComponent(wide.ex_quinta, 3);
          const gru = parseIntegerComponent(wide.concesion, 3);
          const manz = parseIntegerComponent(wide.manzana, 4);
          const parc = parseIntegerComponent(wide.parcela, 3);
          const ncpFormatted = formatParcelNcp(sec, gru, manz, parc);
          const ncpRaw = ncpFormatted ? ncpFormatted.replace(/-/g, "") : null;

          const wideRecord: WideRecord = {
            source_file: sourceFile,
            source_year: year,
            source_row_number: sourceRowNumber,
            legajo_canonico: legajoCanonico,
            mes: wide.mes,
            legajo: wide.legajo,
            expediente: wide.expediente,
            ingreso: wide.ingreso,
            condicion_del_tramite: wide.condicion_del_tramite,
            plano_de_mensura: wide.plano_de_mensura,
            partida_provincial: wide.partida_provincial,
            partida_municipal: wide.partida_municipal,
            concesion: wide.concesion,
            ex_quinta: wide.ex_quinta,
            manzana: wide.manzana,
            parcela: wide.parcela,
            zonificacion: wide.zonificacion,
            ubicacion: wide.ubicacion,
            propietario: wide.propietario,
            nombre_establecimiento_empresa: wide.nombre_establecimiento_empresa,
            proyecto: wide.proyecto,
            direccion_de_obra: wide.direccion_de_obra,
            estructura: wide.estructura,
            constructor: wide["constructor"],
            relevamiento_o_existente: wide.relevamiento_o_existente,
            a_construir_obra_nueva: wide.a_construir_obra_nueva,
            ampliacion_obra_existente: wide.ampliacion_obra_existente,
            proyectado_no_iniciado: wide.proyectado_no_iniciado,
            uso: wide.uso,
            cantidad_habitaciones_existente: wide.cantidad_habitaciones_existente,
            cantidad_habitaciones_nuevas: wide.cantidad_habitaciones_nuevas,
            locales_habitables_existente: wide.locales_habitables_existente,
            locales_habitables_nuevos: wide.locales_habitables_nuevos,
            plazas_existente: wide.plazas_existente,
            plazas_nuevas: wide.plazas_nuevas,
            m2_existentes_antecedente_vivienda: wide.m2_existentes_antecedente_vivienda,
            m2_existentes_antecedente_local: wide.m2_existentes_antecedente_local,
            m2_existentes_relevados_vivienda: wide.m2_existentes_relevados_vivienda,
            m2_existentes_relevados_local: wide.m2_existentes_relevados_local,
            m2_a_construir_vivienda: wide.m2_a_construir_vivienda,
            m2_a_construir_local: wide.m2_a_construir_local,
            terreno: wide.terreno,
            fos: wide.fos,
            fot: wide.fot,
            categoria: wide.categoria,
            monto_inversion_estimado_declarado: wide.monto_inversion_estimado_declarado,
            derechos_edificacion: wide.derechos_edificacion,
            titulo_profesional: wide.titulo_profesional,
            observaciones: wide.observaciones,
            visado: wide.visado,
            final_obra: wide.final_obra,
            avance_de_obra: wide.avance_de_obra,
            columna1: wide.columna1,
            raw_payload: payload,
          };

          const tipo = deriveTipo(wideRecord);

          await client.query(rawUpsertSql, [
            sourceFile,
            year,
            sourceRowNumber,
            legajoCanonico,
            JSON.stringify(payload),
          ]);

          await client.query(wideUpsertSql, [
            wideRecord.source_file, wideRecord.source_year, wideRecord.source_row_number, wideRecord.legajo_canonico,
            wideRecord.mes, wideRecord.legajo, wideRecord.expediente, wideRecord.ingreso, wideRecord.condicion_del_tramite, wideRecord.plano_de_mensura,
            wideRecord.partida_provincial, wideRecord.partida_municipal, wideRecord.concesion, wideRecord.ex_quinta, wideRecord.manzana, wideRecord.parcela,
            wideRecord.zonificacion, wideRecord.ubicacion, wideRecord.propietario, wideRecord.nombre_establecimiento_empresa, wideRecord.proyecto,
            wideRecord.direccion_de_obra, wideRecord.estructura, wideRecord.constructor, wideRecord.relevamiento_o_existente,
            wideRecord.a_construir_obra_nueva, wideRecord.ampliacion_obra_existente, wideRecord.proyectado_no_iniciado, wideRecord.uso,
            wideRecord.cantidad_habitaciones_existente, wideRecord.cantidad_habitaciones_nuevas,
            wideRecord.locales_habitables_existente, wideRecord.locales_habitables_nuevos, wideRecord.plazas_existente, wideRecord.plazas_nuevas,
            wideRecord.m2_existentes_antecedente_vivienda, wideRecord.m2_existentes_antecedente_local,
            wideRecord.m2_existentes_relevados_vivienda, wideRecord.m2_existentes_relevados_local,
            wideRecord.m2_a_construir_vivienda, wideRecord.m2_a_construir_local, wideRecord.terreno, wideRecord.fos, wideRecord.fot, wideRecord.categoria,
            wideRecord.monto_inversion_estimado_declarado, wideRecord.derechos_edificacion, wideRecord.titulo_profesional,
            wideRecord.observaciones, wideRecord.visado, wideRecord.final_obra, wideRecord.avance_de_obra, wideRecord.columna1,
            JSON.stringify(wideRecord.raw_payload),
          ]);

          const m2Construir = parseNumeric(wideRecord.m2_a_construir_vivienda) + parseNumeric(wideRecord.m2_a_construir_local);
          const m2Relevado = parseNumeric(wideRecord.m2_existentes_relevados_vivienda) + parseNumeric(wideRecord.m2_existentes_relevados_local);
          const m2Antecedente = parseNumeric(wideRecord.m2_existentes_antecedente_vivienda) + parseNumeric(wideRecord.m2_existentes_antecedente_local);
          const m2Total = m2Construir + m2Relevado + m2Antecedente;

          await client.query(obrasUpsertSql, [
            legajoCanonico || null,
            expedienteNormalizado || null,
            parseDate(wideRecord.visado),
            wideRecord.uso || null,
            tipo || null,
            wideRecord.propietario || null,
            wideRecord.constructor || null,
            wideRecord.proyecto || null,
            wideRecord.ubicacion || null,
            wideRecord.direccion_de_obra || null,
            ncpRaw,
            ncpFormatted || null,
            wideRecord.zonificacion || null,
            m2Total || null,
            m2Construir || null,
            m2Relevado || null,
            sourceFile,
            sourceRowNumber,
          ]);

          inserted += 1;
        }

        await client.query("COMMIT");
        console.log(`[OK] ${year}: importado`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log(`[DONE] Filas procesadas: ${inserted}`);
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error("Error importando obras a DB:");
  console.error(error);
  process.exit(1);
});
