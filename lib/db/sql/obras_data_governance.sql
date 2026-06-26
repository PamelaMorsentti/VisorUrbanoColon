-- Obras data governance schema (raw + normalized + audit)
-- PostgreSQL + PostGIS

BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

SET search_path = public, core, extensions;

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

-- Column catalog detected from Excel sources 2020-2025.
CREATE TABLE IF NOT EXISTS core.obras_excel_column_catalog (
  id bigserial PRIMARY KEY,
  excel_column_name text NOT NULL,
  canonical_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT obras_excel_column_catalog_key_uq UNIQUE (canonical_key)
);

-- Wide ingestion table: keeps one explicit column per Excel field currently in use.
-- IMPORTANT: raw_payload remains the source of truth for preserving all original content.
CREATE TABLE IF NOT EXISTS core.obras_ingest_wide (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file text NOT NULL,
  source_year integer,
  source_row_number text NOT NULL,
  legajo_canonico text,

  mes text,
  legajo text,
  expediente text,
  ingreso text,
  condicion_del_tramite text,
  plano_de_mensura text,
  partida_provincial text,
  partida_municipal text,
  concesion text,
  ex_quinta text,
  manzana text,
  parcela text,
  zonificacion text,
  ubicacion text,
  propietario text,
  nombre_establecimiento_empresa text,
  proyecto text,
  direccion_de_obra text,
  estructura text,
  constructor text,
  relevamiento_o_existente text,
  a_construir_obra_nueva text,
  ampliacion_obra_existente text,
  proyectado_no_iniciado text,
  uso text,
  cantidad_habitaciones_existente text,
  cantidad_habitaciones_nuevas text,
  locales_habitables_existente text,
  locales_habitables_nuevos text,
  plazas_existente text,
  plazas_nuevas text,
  m2_existentes_antecedente_vivienda text,
  m2_existentes_antecedente_local text,
  m2_existentes_relevados_vivienda text,
  m2_existentes_relevados_local text,
  m2_a_construir_vivienda text,
  m2_a_construir_local text,
  terreno text,
  fos text,
  fot text,
  categoria text,
  monto_inversion_estimado_declarado text,
  derechos_edificacion text,
  titulo_profesional text,
  observaciones text,
  visado text,
  final_obra text,
  avance_de_obra text,
  columna1 text,

  raw_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT obras_ingest_wide_source_row_uq UNIQUE (source_file, source_row_number)
);

CREATE INDEX IF NOT EXISTS obras_ingest_wide_source_year_idx
  ON core.obras_ingest_wide (source_year);

CREATE INDEX IF NOT EXISTS obras_ingest_wide_legajo_idx
  ON core.obras_ingest_wide (legajo);

CREATE INDEX IF NOT EXISTS obras_ingest_wide_visado_idx
  ON core.obras_ingest_wide (visado);

CREATE INDEX IF NOT EXISTS obras_ingest_wide_propietario_idx
  ON core.obras_ingest_wide (propietario);

CREATE INDEX IF NOT EXISTS obras_ingest_wide_proyecto_idx
  ON core.obras_ingest_wide (proyecto);

CREATE INDEX IF NOT EXISTS obras_ingest_wide_uso_idx
  ON core.obras_ingest_wide (uso);

CREATE INDEX IF NOT EXISTS obras_ingest_wide_raw_payload_gin
  ON core.obras_ingest_wide USING gin (raw_payload);

INSERT INTO core.obras_excel_column_catalog (excel_column_name, canonical_key, notes)
VALUES
  ('MES', 'mes', 'Columna base presente en 2020-2025'),
  ('LEGAJO', 'legajo', 'Columna base presente en 2020-2025'),
  ('EXPEDIENTE', 'expediente', 'Columna base presente en 2020-2025'),
  ('INGRESO', 'ingreso', 'Columna base presente en 2020-2025'),
  ('CONDICION del trámite', 'condicion_del_tramite', 'Presente en 2024 y 2025'),
  ('Plano de Mensura', 'plano_de_mensura', 'Columna base presente en 2020-2025'),
  ('Partida Provincial', 'partida_provincial', 'Columna base presente en 2020-2025'),
  ('Partida Municipal', 'partida_municipal', 'Columna base presente en 2020-2025'),
  ('Concesión', 'concesion', 'Columna base presente en 2020-2025'),
  ('Ex-Quinta', 'ex_quinta', 'Columna base presente en 2020-2025'),
  ('Manzana', 'manzana', 'Columna base presente en 2020-2025'),
  ('Parcela', 'parcela', 'Columna base presente en 2020-2025'),
  ('Zonificación', 'zonificacion', 'Columna base presente en 2020-2025'),
  ('Ubicación', 'ubicacion', 'Columna base presente en 2020-2025'),
  ('Propietario', 'propietario', 'Columna base presente en 2020-2025'),
  ('Nombre del Establecimiento y/o empresa', 'nombre_establecimiento_empresa', 'Columna base presente en 2020-2025'),
  ('Proyecto', 'proyecto', 'Columna base presente en 2020-2025'),
  ('Dirección de obra', 'direccion_de_obra', 'Columna base presente en 2020-2025'),
  ('Estructura', 'estructura', 'Columna base presente en 2020-2025'),
  ('Constructor', 'constructor', 'Columna base presente en 2020-2025'),
  ('RELEVAMIENTO o existente', 'relevamiento_o_existente', 'Columna base presente en 2020-2025'),
  ('A CONTRUIR / OBRA NUEVA', 'a_construir_obra_nueva', 'Columna base presente en 2020-2025'),
  ('AMPLIACION de obra existente', 'ampliacion_obra_existente', 'Columna base presente en 2020-2025'),
  ('PROYECTADO (no iniciado)', 'proyectado_no_iniciado', 'Columna base presente en 2020-2025'),
  ('USO', 'uso', 'Columna base presente en 2020-2025'),
  ('Cantidad de Habitaciones (dormitorios) Existente', 'cantidad_habitaciones_existente', 'Columna base presente en 2020-2025'),
  ('Cantidad de Habitaciones (dormitorios) Nuevas', 'cantidad_habitaciones_nuevas', 'Columna base presente en 2020-2025'),
  ('Locales de 1º, Habitables Existente', 'locales_habitables_existente', 'Columna base presente en 2020-2025'),
  ('Locales de 1º, Habitables Nuevos', 'locales_habitables_nuevos', 'Columna base presente en 2020-2025'),
  ('N° de Plazas Existente', 'plazas_existente', 'Columna base presente en 2020-2025'),
  ('N° de Plazas Nuevas', 'plazas_nuevas', 'Columna base presente en 2020-2025'),
  ('M² existentes (con antecedente) Vivienda', 'm2_existentes_antecedente_vivienda', 'Columna base presente en 2020-2025'),
  ('M² existentes (con antecedente) Local', 'm2_existentes_antecedente_local', 'Columna base presente en 2020-2025'),
  ('M² existentes (relevados) Vivienda', 'm2_existentes_relevados_vivienda', 'Columna base presente en 2020-2025'),
  ('M² existentes (relevados) Local', 'm2_existentes_relevados_local', 'Columna base presente en 2020-2025'),
  ('M²     (a construir Vivienda', 'm2_a_construir_vivienda', 'Columna base presente en 2020-2025'),
  ('M²     (a construir Local', 'm2_a_construir_local', 'Columna base presente en 2020-2025'),
  ('Terreno', 'terreno', 'Columna base presente en 2020-2025'),
  ('F. O. S.', 'fos', 'Columna base presente en 2020-2025'),
  ('F. O. T.', 'fot', 'Columna base presente en 2020-2025'),
  ('CATEGORIA', 'categoria', 'Columna base presente en 2020-2025'),
  ('Monto de la Inversión (estimado y/o declarado)', 'monto_inversion_estimado_declarado', 'Columna base presente en 2020-2025'),
  ('Derechos de edificación', 'derechos_edificacion', 'Columna base presente en 2020-2025'),
  ('TITULO PROFESIONAL', 'titulo_profesional', 'Columna base presente en 2020-2025'),
  ('Observaciones', 'observaciones', 'Columna base presente en 2020-2025'),
  ('VISADO', 'visado', 'Columna base presente en 2020-2025'),
  ('FINAL OBRA', 'final_obra', 'Columna base presente en 2020-2025'),
  ('AVANCE DE OBRA', 'avance_de_obra', 'Columna base presente en 2020-2025'),
  ('Columna1', 'columna1', 'Columna residual detectada en 2023')
ON CONFLICT (canonical_key) DO UPDATE
SET
  excel_column_name = EXCLUDED.excel_column_name,
  notes = EXCLUDED.notes,
  is_active = true,
  updated_at = now();

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
  geom_point extensions.geometry(Point, 4326),
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

CREATE UNIQUE INDEX IF NOT EXISTS obras_source_row_uq
  ON core.obras (source_file, source_row_number);

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
