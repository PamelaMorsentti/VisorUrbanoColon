import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

type DbRow = {
  source_file: string;
  source_row_number: string;
  legajo_canonico: string | null;
  raw_ubicacion: string | null;
  ncp: string | null;
  ncp_formatted: string | null;
  zonificacion: string | null;
  fecha_de_visado: string | null;
  tipo: string | null;
  destino_uso: string | null;
  relevamiento_o_existente: string | null;
  a_construir_obra_nueva: string | null;
  ampliacion_obra_existente: string | null;
  proyectado_no_iniciado: string | null;
  m2_existentes_relevados_vivienda: string | null;
  m2_existentes_relevados_local: string | null;
  m2_a_construir_vivienda: string | null;
  m2_a_construir_local: string | null;
  lon: number;
  lat: number;
};

type Feature = {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: Record<string, unknown>;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: Feature[];
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

function toText(v: unknown): string {
  return String(v ?? "").trim();
}

function toFeature(row: DbRow): Feature {
  const year = row.fecha_de_visado ? Number(row.fecha_de_visado.slice(0, 4)) : null;

  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [row.lon, row.lat],
    },
    properties: {
      source_file: toText(row.source_file),
      source_row_number: toText(row.source_row_number),
      legajo_canonico: toText(row.legajo_canonico),
      row_kind: "detail",
      raw_ubicacion: toText(row.raw_ubicacion),
      ncp: toText(row.ncp),
      ncp_formatted: toText(row.ncp_formatted),
      lon: row.lon.toFixed(8),
      lat: row.lat.toFixed(8),
      geolocation_source: "db_backfill",
      location_verification_status: "db_imported",
      zonificacion: toText(row.zonificacion),
      fecha_de_visado: toText(row.fecha_de_visado),
      visado_year: year,
      tipo: toText(row.tipo),
      destino_uso: toText(row.destino_uso),
      relevamiento_o_existente: toText(row.relevamiento_o_existente),
      // Keep legacy key used by filters/UI.
      a_contruir_obra_nueva: toText(row.a_construir_obra_nueva),
      ampliacion_de_obra_existente: toText(row.ampliacion_obra_existente),
      proyectado_no_iniciado: toText(row.proyectado_no_iniciado),
      m_existentes_relevados_vivienda: toText(row.m2_existentes_relevados_vivienda),
      m_existentes_relevados_local: toText(row.m2_existentes_relevados_local),
      m_a_construir_vivienda: toText(row.m2_a_construir_vivienda),
      m_a_construir_local: toText(row.m2_a_construir_local),
    },
  };
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL no definido. Configuralo antes de ejecutar.");
    process.exit(1);
  }

  const repoRoot = detectRepoRoot(process.cwd());
  const planosDir = path.join(repoRoot, "artifacts", "colon-3d", "public", "data", "planos");
  fs.mkdirSync(planosDir, { recursive: true });

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const result = await client.query<DbRow>(`
      SELECT
        o.source_file,
        o.source_row_number,
        o.legajo_canonico,
        o.raw_ubicacion,
        o.ncp,
        o.ncp_formatted,
        o.zonificacion,
        to_char(o.fecha_visado, 'YYYY-MM-DD') AS fecha_de_visado,
        o.tipo,
        o.destino_uso,
        w.relevamiento_o_existente,
        w.a_construir_obra_nueva,
        w.ampliacion_obra_existente,
        w.proyectado_no_iniciado,
        w.m2_existentes_relevados_vivienda,
        w.m2_existentes_relevados_local,
        w.m2_a_construir_vivienda,
        w.m2_a_construir_local,
        extensions.ST_X(o.geom_point::extensions.geometry) AS lon,
        extensions.ST_Y(o.geom_point::extensions.geometry) AS lat
      FROM core.obras o
      LEFT JOIN core.obras_ingest_wide w
        ON w.source_file = o.source_file
       AND w.source_row_number = o.source_row_number
      WHERE o.geom_point IS NOT NULL
      ORDER BY o.source_file, o.source_row_number
    `);

    const features = result.rows.map(toFeature);
    const fc: FeatureCollection = { type: "FeatureCollection", features };

    const outputs = [
      path.join(planosDir, "obras-public.geojson"),
      path.join(planosDir, "obras-professional.geojson"),
      path.join(planosDir, "obras-admin.geojson"),
    ];

    for (const output of outputs) {
      fs.writeFileSync(output, JSON.stringify(fc, null, 2), "utf8");
      console.log(`[OK] Escrito ${output}`);
    }

    const years = new Set<number>();
    for (const feature of features) {
      const year = Number(feature.properties.visado_year);
      if (Number.isFinite(year)) years.add(year);
    }

    const yearsDesc = Array.from(years).sort((a, b) => b - a);
    console.log(`[DONE] Features exportadas: ${features.length}`);
    console.log(`[DONE] Anios presentes en capas: ${yearsDesc.join(", ")}`);
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error("Error exportando capas de obras desde DB:");
  console.error(error);
  process.exit(1);
});
