import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), "..", "..");
const dataRoot = path.join(repoRoot, "artifacts", "colon-3d", "public", "data");
const altDataRoot = path.join(repoRoot, "attached_assets");

const LAYERS = [
  {
    layerKey: "jurisdiccion_municipal",
    file: "Municipio.geojson",
    table: "core.jurisdiccion_municipal",
    insertSql: `
      INSERT INTO core.jurisdiccion_municipal (src_id, nombre, source_layer_key, attrs, geom)
      VALUES ($1, $2, $3, $4::jsonb, ${"ST_Multi(ST_CollectionExtract(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326), 3))"})
    `,
  },
  {
    layerKey: "manzana",
    file: "manzana.geojson",
    table: "core.manzana",
    insertSql: `
      INSERT INTO core.manzana (src_id, cod_manzana, nomenclatura, source_layer_key, attrs, geom)
      VALUES ($1, $2, $3, $4, $5::jsonb, ST_Multi(ST_CollectionExtract(ST_SetSRID(ST_GeomFromGeoJSON($6), 4326), 3)))
    `,
  },
  {
    layerKey: "parcela",
    file: "Parcela.geojson",
    table: "core.parcela",
    insertSql: `
      INSERT INTO core.parcela (src_id, cod_parcela, nomenclatura, manzana_ref, source_layer_key, attrs, geom)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, ST_Multi(ST_CollectionExtract(ST_SetSRID(ST_GeomFromGeoJSON($7), 4326), 3)))
    `,
  },
  {
    layerKey: "calle_eje",
    file: "Calle.geojson",
    table: "core.calle_eje",
    insertSql: `
      INSERT INTO core.calle_eje (src_id, nombre, categoria, source_layer_key, attrs, geom)
      VALUES ($1, $2, $3, $4, $5::jsonb, ST_Multi(ST_CollectionExtract(ST_SetSRID(ST_GeomFromGeoJSON($6), 4326), 2)))
    `,
  },
  {
    layerKey: "zonificacion",
    file: ["zonas.geojson", "zonificacion_1776196112300.geojson"],
    table: "core.zonificacion",
    insertSql: `
      INSERT INTO core.zonificacion (src_id, codigo, nombre, fos, fot, altura_max_m, uso_dominante, source_layer_key, attrs, geom)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, ST_Multi(ST_CollectionExtract(ST_SetSRID(ST_GeomFromGeoJSON($10), 4326), 3)))
    `,
  },
  {
    layerKey: "infra_poste",
    file: "postes.geojson",
    table: "core.infra_poste",
    insertSql: `
      INSERT INTO core.infra_poste (src_id, tipo, estado, source_layer_key, attrs, geom)
      VALUES ($1, $2, $3, $4, $5::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($6), 4326)::geometry(Point, 4326))
    `,
  },
  {
    layerKey: "infra_boca_tormenta",
    file: "bocas.geojson",
    table: "core.infra_boca_tormenta",
    insertSql: `
      INSERT INTO core.infra_boca_tormenta (src_id, tipo, estado, source_layer_key, attrs, geom)
      VALUES ($1, $2, $3, $4, $5::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($6), 4326)::geometry(Point, 4326))
    `,
  },
];

function pick(props, keys) {
  for (const key of keys) {
    if (props[key] !== undefined && props[key] !== null && String(props[key]).trim() !== "") {
      return String(props[key]);
    }
  }
  return null;
}

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function closeRingIfNeeded(coords) {
  if (!Array.isArray(coords) || coords.length < 3) return null;
  const ring = [...coords];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last) return null;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  return ring.length >= 4 ? ring : null;
}

function normalizeGeometryForLayer(layerKey, geometry) {
  if (!geometry || !geometry.type) return null;

  if (layerKey !== "zonificacion") {
    return geometry;
  }

  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    return geometry;
  }

  if (geometry.type === "LineString") {
    const ring = closeRingIfNeeded(geometry.coordinates);
    if (!ring) return null;
    return {
      type: "Polygon",
      coordinates: [ring],
    };
  }

  return null;
}

function isGeometryCompatible(layerKey, geometry) {
  if (!geometry || !geometry.type) return false;
  const t = geometry.type;

  if (["jurisdiccion_municipal", "manzana", "parcela", "zonificacion"].includes(layerKey)) {
    if (layerKey === "zonificacion") {
      return t === "Polygon" || t === "MultiPolygon" || t === "LineString";
    }
    return t === "Polygon" || t === "MultiPolygon";
  }
  if (layerKey === "calle_eje") {
    return t === "LineString" || t === "MultiLineString";
  }
  if (["infra_poste", "infra_boca_tormenta"].includes(layerKey)) {
    return t === "Point";
  }
  return true;
}

async function loadEnvFromRoot() {
  if (process.env.DATABASE_URL) return;

  const envPath = path.join(repoRoot, ".env");
  try {
    const envRaw = await fs.readFile(envPath, "utf8");
    for (const line of envRaw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const parts = trimmed.split("=", 2);
      if (parts.length !== 2) continue;
      const key = parts[0].trim();
      const value = parts[1].trim().replace(/^"|"$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // no-op
  }
}

async function readGeoJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new Error(`Invalid GeoJSON FeatureCollection: ${filePath}`);
  }
  return parsed.features;
}

async function resolveLayerFile(fileOrCandidates) {
  const candidates = Array.isArray(fileOrCandidates)
    ? fileOrCandidates
    : [fileOrCandidates];

  for (const candidate of candidates) {
    for (const base of [dataRoot, altDataRoot]) {
      const full = path.join(base, candidate);
      try {
        await fs.access(full);
        return full;
      } catch {
        // continue with next base/candidate
      }
    }
  }

  throw new Error(`No se encontro archivo para capa. Candidatos: ${candidates.join(", ")}`);
}

async function insertRawFeature(client, batchId, layerKey, srcFid, props, geometry) {
  if (!geometry) return;

  await client.query(
    `
      INSERT INTO raw.feature_store (batch_id, layer_key, src_fid, properties, geom)
      VALUES ($1, $2, $3, $4::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))
    `,
    [batchId, layerKey, srcFid, JSON.stringify(props ?? {}), JSON.stringify(geometry)],
  );
}

async function loadLayer(client, cfg) {
  const filePath = await resolveLayerFile(cfg.file);
  const features = await readGeoJson(filePath);

  const batchResult = await client.query(
    `
      INSERT INTO raw.ingest_batch (layer_key, source_type, source_uri, imported_by, row_count, notes)
      VALUES ($1, 'geojson', $2, 'scripts:etl:load-core-postgis', $3, 'replace full load')
      RETURNING id
    `,
    [cfg.layerKey, filePath, features.length],
  );
  const batchId = batchResult.rows[0].id;

  await client.query(`TRUNCATE TABLE ${cfg.table} RESTART IDENTITY`);

  let inserted = 0;
  let skipped = 0;
  for (const feature of features) {
    const props = feature.properties ?? {};
    const srcId = feature.id ? String(feature.id) : pick(props, ["id", "ID", "fid", "FID", "OBJECTID"]);

    if (!isGeometryCompatible(cfg.layerKey, feature.geometry)) {
      skipped += 1;
      continue;
    }

    const normalizedGeometry = normalizeGeometryForLayer(cfg.layerKey, feature.geometry);
    if (!normalizedGeometry) {
      skipped += 1;
      continue;
    }

    await insertRawFeature(client, batchId, cfg.layerKey, srcId, props, normalizedGeometry);

    if (!normalizedGeometry) continue;

    if (cfg.layerKey === "jurisdiccion_municipal") {
      await client.query(cfg.insertSql, [
        srcId,
        pick(props, ["NOMBRE", "MUNICIPIO", "name", "NOM"]),
        cfg.layerKey,
        JSON.stringify(props),
        JSON.stringify(normalizedGeometry),
      ]);
    } else if (cfg.layerKey === "manzana") {
      await client.query(cfg.insertSql, [
        srcId,
        pick(props, ["MANZANA", "COD_MANZ", "CODIGO", "ID"]),
        pick(props, ["NOMENCLATURA", "NOMENCLA", "NOMENCLAT"]),
        cfg.layerKey,
        JSON.stringify(props),
        JSON.stringify(normalizedGeometry),
      ]);
    } else if (cfg.layerKey === "parcela") {
      await client.query(cfg.insertSql, [
        srcId,
        pick(props, ["PARCELA", "COD_PARC", "CODIGO", "ID"]),
        pick(props, ["NOMENCLATURA", "NOMENCLA", "NOMENCLAT"]),
        pick(props, ["MANZANA", "COD_MANZ", "MANZ_REF"]),
        cfg.layerKey,
        JSON.stringify(props),
        JSON.stringify(normalizedGeometry),
      ]);
    } else if (cfg.layerKey === "calle_eje") {
      await client.query(cfg.insertSql, [
        srcId,
        pick(props, ["CALLE", "NOMBRE", "name"]),
        pick(props, ["TIPO", "CATEGORIA", "CLASE"]),
        cfg.layerKey,
        JSON.stringify(props),
        JSON.stringify(normalizedGeometry),
      ]);
    } else if (cfg.layerKey === "zonificacion") {
      await client.query(cfg.insertSql, [
        srcId,
        pick(props, ["CODIGO", "COD", "ZONA"]),
        pick(props, ["NOMBRE", "DESCRIPCION", "DESC", "ZONA"]),
        toNumberOrNull(props.FOS),
        toNumberOrNull(props.FOT),
        toNumberOrNull(props.ALTURA_MAX || props.ALTURA || props.ALT_MAX),
        pick(props, ["USO", "USO_DOM", "USO_DOMINANTE"]),
        cfg.layerKey,
        JSON.stringify(props),
        JSON.stringify(normalizedGeometry),
      ]);
    } else if (cfg.layerKey === "infra_poste" || cfg.layerKey === "infra_boca_tormenta") {
      await client.query(cfg.insertSql, [
        srcId,
        pick(props, ["TIPO", "type", "CLASE"]),
        pick(props, ["ESTADO", "status", "CONDICION"]),
        cfg.layerKey,
        JSON.stringify(props),
        JSON.stringify(normalizedGeometry),
      ]);
    }

    inserted += 1;
  }

  console.log(`[etl] ${cfg.layerKey}: ${inserted}/${features.length} features -> ${cfg.table} (skipped=${skipped})`);
}

async function main() {
  await loadEnvFromRoot();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required (env or .env in repo root)");
  }

  const client = new Client({ connectionString: databaseUrl });

  await client.connect();
  try {
    await client.query("BEGIN");
    for (const layer of LAYERS) {
      await loadLayer(client, layer);
    }
    await client.query("SELECT qa.refresh_topology_issues()");
    await client.query("COMMIT");
    console.log("[etl] Core load completed and QA refreshed");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[etl] Error:", error);
  process.exit(1);
});
