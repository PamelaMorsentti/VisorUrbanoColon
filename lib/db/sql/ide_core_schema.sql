-- IDE municipal base schema for Colón (Entre Ríos)
-- Requires PostgreSQL + PostGIS

BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS qa;
CREATE SCHEMA IF NOT EXISTS meta;

-- Catalog/registry for governance and traceability.
CREATE TABLE IF NOT EXISTS meta.layer_registry (
  layer_key text PRIMARY KEY,
  display_name text NOT NULL,
  domain text NOT NULL,
  geometry_type text NOT NULL,
  target_srid integer NOT NULL DEFAULT 4326,
  source_type text NOT NULL,
  source_uri text,
  license text,
  source_owner text,
  update_frequency text,
  quality_level text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_layer_registry_domain
  ON meta.layer_registry (domain);

-- Generic ingestion batches (audit trail).
CREATE TABLE IF NOT EXISTS raw.ingest_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_key text NOT NULL,
  source_type text NOT NULL,
  source_uri text,
  source_etag text,
  source_version text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by text,
  row_count integer,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_ingest_batch_layer_time
  ON raw.ingest_batch (layer_key, imported_at DESC);

-- Generic raw feature store, before normalization.
CREATE TABLE IF NOT EXISTS raw.feature_store (
  id bigserial PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES raw.ingest_batch(id) ON DELETE CASCADE,
  layer_key text NOT NULL,
  src_fid text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  geom geometry(Geometry, 4326),
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_store_batch
  ON raw.feature_store (batch_id);
CREATE INDEX IF NOT EXISTS idx_feature_store_layer
  ON raw.feature_store (layer_key);
CREATE INDEX IF NOT EXISTS idx_feature_store_props_gin
  ON raw.feature_store USING gin (properties);
CREATE INDEX IF NOT EXISTS idx_feature_store_geom_gist
  ON raw.feature_store USING gist (geom);

-- ==========================
-- Core canonical layers
-- ==========================

CREATE TABLE IF NOT EXISTS core.jurisdiccion_municipal (
  id bigserial PRIMARY KEY,
  src_id text,
  nombre text,
  version_tag text,
  vigencia_desde date,
  vigencia_hasta date,
  source_layer_key text REFERENCES meta.layer_registry(layer_key),
  attrs jsonb NOT NULL DEFAULT '{}'::jsonb,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jurisdiccion_geom_not_empty CHECK (NOT ST_IsEmpty(geom))
);

CREATE INDEX IF NOT EXISTS idx_jurisdiccion_geom
  ON core.jurisdiccion_municipal USING gist (geom);

CREATE TABLE IF NOT EXISTS core.manzana (
  id bigserial PRIMARY KEY,
  src_id text,
  cod_manzana text,
  nomenclatura text,
  source_layer_key text REFERENCES meta.layer_registry(layer_key),
  attrs jsonb NOT NULL DEFAULT '{}'::jsonb,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manzana_geom_not_empty CHECK (NOT ST_IsEmpty(geom))
);

CREATE INDEX IF NOT EXISTS idx_manzana_geom
  ON core.manzana USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_manzana_cod
  ON core.manzana (cod_manzana);

CREATE TABLE IF NOT EXISTS core.parcela (
  id bigserial PRIMARY KEY,
  src_id text,
  cod_parcela text,
  nomenclatura text,
  manzana_ref text,
  source_layer_key text REFERENCES meta.layer_registry(layer_key),
  attrs jsonb NOT NULL DEFAULT '{}'::jsonb,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parcela_geom_not_empty CHECK (NOT ST_IsEmpty(geom))
);

CREATE INDEX IF NOT EXISTS idx_parcela_geom
  ON core.parcela USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_parcela_cod
  ON core.parcela (cod_parcela);

CREATE TABLE IF NOT EXISTS core.calle_eje (
  id bigserial PRIMARY KEY,
  src_id text,
  nombre text,
  categoria text,
  source_layer_key text REFERENCES meta.layer_registry(layer_key),
  attrs jsonb NOT NULL DEFAULT '{}'::jsonb,
  geom geometry(MultiLineString, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calle_geom_not_empty CHECK (NOT ST_IsEmpty(geom))
);

CREATE INDEX IF NOT EXISTS idx_calle_eje_geom
  ON core.calle_eje USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_calle_eje_nombre
  ON core.calle_eje (nombre);

CREATE TABLE IF NOT EXISTS core.zonificacion (
  id bigserial PRIMARY KEY,
  src_id text,
  codigo text,
  nombre text,
  fos numeric,
  fot numeric,
  altura_max_m numeric,
  uso_dominante text,
  source_layer_key text REFERENCES meta.layer_registry(layer_key),
  attrs jsonb NOT NULL DEFAULT '{}'::jsonb,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zonificacion_geom_not_empty CHECK (NOT ST_IsEmpty(geom))
);

CREATE INDEX IF NOT EXISTS idx_zonificacion_geom
  ON core.zonificacion USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_zonificacion_codigo
  ON core.zonificacion (codigo);

CREATE TABLE IF NOT EXISTS core.infra_poste (
  id bigserial PRIMARY KEY,
  src_id text,
  tipo text,
  estado text,
  source_layer_key text REFERENCES meta.layer_registry(layer_key),
  attrs jsonb NOT NULL DEFAULT '{}'::jsonb,
  geom geometry(Point, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT poste_geom_not_empty CHECK (NOT ST_IsEmpty(geom))
);

CREATE INDEX IF NOT EXISTS idx_infra_poste_geom
  ON core.infra_poste USING gist (geom);

CREATE TABLE IF NOT EXISTS core.infra_boca_tormenta (
  id bigserial PRIMARY KEY,
  src_id text,
  tipo text,
  estado text,
  source_layer_key text REFERENCES meta.layer_registry(layer_key),
  attrs jsonb NOT NULL DEFAULT '{}'::jsonb,
  geom geometry(Point, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT boca_geom_not_empty CHECK (NOT ST_IsEmpty(geom))
);

CREATE INDEX IF NOT EXISTS idx_infra_boca_geom
  ON core.infra_boca_tormenta USING gist (geom);

-- Central QA issue table for topology and data quality reports.
CREATE TABLE IF NOT EXISTS qa.topology_issues (
  issue_id bigserial PRIMARY KEY,
  detected_at timestamptz NOT NULL DEFAULT now(),
  rule_code text NOT NULL,
  severity text NOT NULL,
  layer_name text NOT NULL,
  feature_id text,
  related_layer text,
  related_feature_id text,
  message text NOT NULL,
  issue_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  geom geometry(Geometry, 4326)
);

CREATE INDEX IF NOT EXISTS idx_topology_issues_rule_time
  ON qa.topology_issues (rule_code, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_topology_issues_layer
  ON qa.topology_issues (layer_name);
CREATE INDEX IF NOT EXISTS idx_topology_issues_geom
  ON qa.topology_issues USING gist (geom);

-- Initial registry rows aligned with current municipal project scope.
INSERT INTO meta.layer_registry (
  layer_key, display_name, domain, geometry_type, source_type, source_uri, license, source_owner, update_frequency, quality_level, notes
) VALUES
  ('jurisdiccion_municipal', 'Jurisdicción municipal', 'catastro', 'MultiPolygon', 'geojson', 'artifacts/colon-3d/public/data/Municipio.geojson', 'Uso interno municipal', 'Municipalidad de Colón', 'ad-hoc', 'oficial', 'Perímetro institucional base'),
  ('manzana', 'Manzana', 'catastro', 'MultiPolygon', 'geojson', 'artifacts/colon-3d/public/data/manzana.geojson', 'Uso interno municipal', 'Municipalidad de Colón', 'ad-hoc', 'oficial', 'Referencia principal de perímetro urbano reciente'),
  ('parcela', 'Parcela', 'catastro', 'MultiPolygon', 'geojson', 'artifacts/colon-3d/public/data/Parcela.geojson', 'Uso interno municipal', 'Municipalidad de Colón', 'ad-hoc', 'oficial', 'Catastro parcelario'),
  ('calle_eje', 'Eje de calle', 'infraestructura', 'MultiLineString', 'geojson', 'artifacts/colon-3d/public/data/Calle.geojson', 'Uso interno municipal', 'Municipalidad de Colón', 'ad-hoc', 'oficial', 'Red vial principal'),
  ('zonificacion', 'Zonificación urbana', 'planeamiento', 'MultiPolygon', 'geojson', 'artifacts/colon-3d/public/data/zonificacion_1776196112300.geojson', 'Uso interno municipal', 'Municipalidad de Colón', 'ad-hoc', 'oficial', 'Normativa urbanística vigente'),
  ('infra_poste', 'Postes', 'infraestructura', 'Point', 'geojson', 'artifacts/colon-3d/public/data/postes.geojson', 'Uso interno municipal', 'Municipalidad de Colón', 'ad-hoc', 'relevado', 'Infraestructura puntual'),
  ('infra_boca_tormenta', 'Bocas de tormenta', 'infraestructura', 'Point', 'geojson', 'artifacts/colon-3d/public/data/bocas.geojson', 'Uso interno municipal', 'Municipalidad de Colón', 'ad-hoc', 'relevado', 'Infraestructura pluvial puntual')
ON CONFLICT (layer_key) DO NOTHING;

COMMIT;
