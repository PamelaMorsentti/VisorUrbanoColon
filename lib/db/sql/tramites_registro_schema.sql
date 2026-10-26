-- Schema tramites: módulo de registro de profesionales y constructores
-- Ejecutar con: pnpm --filter @workspace/db run sql:tramites-registro

CREATE SCHEMA IF NOT EXISTS tramites;

DO $$ BEGIN
  CREATE TYPE tramites.tipo_profesional AS ENUM (
    'arquitecto',
    'ingeniero_civil',
    'ingeniero_electrico',
    'ingeniero_mecanico',
    'tecnico_constructor',
    'maestro_mayor_obras',
    'especialista'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tramites.tipo_registro AS ENUM (
    'profesional',
    'constructor',
    'empresa_constructora',
    'gestor_administrativo'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tramites.estado_registro AS ENUM (
    'activo',
    'suspendido',
    'baja',
    'pendiente_documentacion'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS tramites.personas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  es_juridica           boolean NOT NULL DEFAULT false,
  apellido              text,
  nombres               text,
  razon_social          text,
  nombre_completo       text NOT NULL,
  dni                   text,
  cuit_cuil             text,
  dni_pendiente         boolean NOT NULL DEFAULT false,
  domicilio_calle       text,
  domicilio_numero      text,
  domicilio_localidad   text DEFAULT 'Colón',
  domicilio_provincia   text DEFAULT 'Entre Ríos',
  telefono              text,
  email                 text,
  origen                text NOT NULL DEFAULT 'alta_sistema',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_persona_dni ON tramites.personas (dni) WHERE dni IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_persona_nombre ON tramites.personas (nombre_completo);
CREATE INDEX IF NOT EXISTS idx_persona_pendiente ON tramites.personas (dni_pendiente) WHERE dni_pendiente = true;

CREATE TABLE IF NOT EXISTS tramites.matriculas (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id                      uuid NOT NULL REFERENCES tramites.personas(id) ON DELETE CASCADE,
  tipo_registro                   tramites.tipo_registro NOT NULL,
  tipo_profesional                tramites.tipo_profesional,
  especializacion                 text,
  matricula_municipal               text NOT NULL,
  matricula_colegio               text,
  colegio_profesional             text,
  representante_tecnico_persona_id uuid REFERENCES tramites.personas(id),
  representante_tecnico_titulo    text,
  estado                          tramites.estado_registro NOT NULL DEFAULT 'pendiente_documentacion',
  fecha_inscripcion               date,
  fecha_baja                      date,
  motivo_baja                     text,
  ultimo_pago_anio                integer,
  observaciones                   text,
  documentos                      jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  created_by                      uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_matricula_codigo ON tramites.matriculas (matricula_municipal);
CREATE INDEX IF NOT EXISTS idx_matricula_persona ON tramites.matriculas (persona_id);
CREATE INDEX IF NOT EXISTS idx_matricula_tipo ON tramites.matriculas (tipo_registro);
CREATE INDEX IF NOT EXISTS idx_matricula_estado ON tramites.matriculas (estado);

CREATE TABLE IF NOT EXISTS tramites.avales (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matricula_avalada_id  uuid NOT NULL REFERENCES tramites.matriculas(id) ON DELETE CASCADE,
  persona_avalista_id   uuid REFERENCES tramites.personas(id),
  nombre_avalista_texto text,
  fecha_aval            date,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aval_matricula ON tramites.avales (matricula_avalada_id);
