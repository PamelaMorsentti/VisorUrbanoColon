-- Obras data governance schema (raw + normalized + audit)
-- PostgreSQL + PostGIS

BEGIN;

CREATE SCHEMA IF NOT EXISTS core;

CREATE TABLE IF NOT EXISTS core.obras_ingest_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file text NOT NULL,
  source_year integer,
  source_row_number text NOT NULL,
  legajo_canonico text,
  raw_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS obras_ingest_raw_src_uq
  ON core.obras_ingest_raw (source_file, source_row_number);

CREATE INDEX IF NOT EXISTS obras_ingest_raw_legajo_idx
  ON core.obras_ingest_raw (legajo_canonico);

CREATE INDEX IF NOT EXISTS obras_ingest_raw_payload_gin
  ON core.obras_ingest_raw USING gin (raw_payload);

CREATE TABLE IF NOT EXISTS core.obras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legajo_canonico text,
  expediente text,
  fecha_visado date,
  destino_uso text,
  tipo text,
  propietario text,
  constructor text,
  profesional_proyecto text,
  raw_ubicacion text,
  direccion_obra text,
  ncp text,
  ncp_formatted text,
  zonificacion text,
  m2_total numeric,
  m2_a_construir numeric,
  m2_relevado numeric,
  source_file text,
  source_row_number text,
  geom_point geometry(Point, 4326),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS obras_fecha_visado_idx
  ON core.obras (fecha_visado);

CREATE INDEX IF NOT EXISTS obras_destino_uso_idx
  ON core.obras (destino_uso);

CREATE INDEX IF NOT EXISTS obras_propietario_idx
  ON core.obras (propietario);

CREATE INDEX IF NOT EXISTS obras_profesional_idx
  ON core.obras (profesional_proyecto);

CREATE INDEX IF NOT EXISTS obras_zonificacion_idx
  ON core.obras (zonificacion);

CREATE INDEX IF NOT EXISTS obras_geom_idx
  ON core.obras USING gist (geom_point);

CREATE TABLE IF NOT EXISTS core.profesionales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  matricula text,
  telefono text,
  email text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS profesionales_nombre_matricula_uq
  ON core.profesionales (nombre, matricula);

CREATE TABLE IF NOT EXISTS core.obra_profesional (
  obra_id uuid NOT NULL REFERENCES core.obras(id) ON DELETE CASCADE,
  profesional_id uuid NOT NULL REFERENCES core.profesionales(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'proyecto',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (obra_id, profesional_id, role)
);

CREATE TABLE IF NOT EXISTS core.obras_edit_log (
  id bigserial PRIMARY KEY,
  obra_id uuid NOT NULL REFERENCES core.obras(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  edited_by text NOT NULL,
  reason text,
  edited_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS obras_edit_log_obra_time_idx
  ON core.obras_edit_log (obra_id, edited_at DESC);

COMMIT;
