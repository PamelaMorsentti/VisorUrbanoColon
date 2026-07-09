import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { pgSchema } from "drizzle-orm/pg-core";

export const tramitesSchema = pgSchema("tramites");

export const tipoProfesionalEnumValues = [
  "arquitecto",
  "ingeniero_civil",
  "ingeniero_electrico",
  "ingeniero_mecanico",
  "tecnico_constructor",
  "maestro_mayor_obras",
  "especialista",
] as const;

export const tipoRegistroEnumValues = [
  "profesional",
  "constructor",
  "empresa_constructora",
  "gestor_administrativo",
] as const;

export const estadoRegistroEnumValues = [
  "activo",
  "suspendido",
  "baja",
  "pendiente_documentacion",
] as const;

export const tipoProfesionalEnum = tramitesSchema.enum(
  "tipo_profesional",
  tipoProfesionalEnumValues,
);

export const tipoRegistroEnum = tramitesSchema.enum(
  "tipo_registro",
  tipoRegistroEnumValues,
);

export const estadoRegistroEnum = tramitesSchema.enum(
  "estado_registro",
  estadoRegistroEnumValues,
);

export const personasTable = tramitesSchema.table(
  "personas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    esJuridica: boolean("es_juridica").notNull().default(false),
    apellido: text("apellido"),
    nombres: text("nombres"),
    razonSocial: text("razon_social"),
    nombreCompleto: text("nombre_completo").notNull(),
    dni: text("dni"),
    cuitCuil: text("cuit_cuil"),
    dniPendiente: boolean("dni_pendiente").notNull().default(false),
    domicilioCalle: text("domicilio_calle"),
    domicilioNumero: text("domicilio_numero"),
    domicilioLocalidad: text("domicilio_localidad").default("Colón"),
    domicilioProvincia: text("domicilio_provincia").default("Entre Ríos"),
    telefono: text("telefono"),
    email: text("email"),
    origen: text("origen").notNull().default("alta_sistema"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    dniIdx: index("idx_persona_dni").on(table.dni),
    nombreIdx: index("idx_persona_nombre").on(table.nombreCompleto),
    pendienteIdx: index("idx_persona_pendiente").on(table.dniPendiente),
  }),
);

export const matriculasTable = tramitesSchema.table(
  "matriculas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personasTable.id, { onDelete: "cascade" }),
    tipoRegistro: tipoRegistroEnum("tipo_registro").notNull(),
    tipoProfesional: tipoProfesionalEnum("tipo_profesional"),
    especializacion: text("especializacion"),
    matriculaMunicipal: text("matricula_municipal").notNull(),
    matriculaColegio: text("matricula_colegio"),
    colegioProfesional: text("colegio_profesional"),
    representanteTecnicoPersonaId: uuid("representante_tecnico_persona_id").references(
      () => personasTable.id,
    ),
    representanteTecnicoTitulo: text("representante_tecnico_titulo"),
    estado: estadoRegistroEnum("estado").notNull().default("pendiente_documentacion"),
    fechaInscripcion: date("fecha_inscripcion"),
    fechaBaja: date("fecha_baja"),
    motivoBaja: text("motivo_baja"),
    ultimoPagoAnio: integer("ultimo_pago_anio"),
    observaciones: text("observaciones"),
    documentos: jsonb("documentos").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
  },
  (table) => ({
    personaIdx: index("idx_matricula_persona").on(table.personaId),
    tipoIdx: index("idx_matricula_tipo").on(table.tipoRegistro),
    estadoIdx: index("idx_matricula_estado").on(table.estado),
    codigoUq: uniqueIndex("idx_matricula_codigo").on(table.matriculaMunicipal),
  }),
);

export const avalesTable = tramitesSchema.table(
  "avales",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matriculaAvaladaId: uuid("matricula_avalada_id")
      .notNull()
      .references(() => matriculasTable.id, { onDelete: "cascade" }),
    personaAvalistaId: uuid("persona_avalista_id").references(() => personasTable.id),
    nombreAvalistaTexto: text("nombre_avalista_texto"),
    fechaAval: date("fecha_aval"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    matriculaIdx: index("idx_aval_matricula").on(table.matriculaAvaladaId),
  }),
);

export type Persona = typeof personasTable.$inferSelect;
export type InsertPersona = typeof personasTable.$inferInsert;
export type Matricula = typeof matriculasTable.$inferSelect;
export type InsertMatricula = typeof matriculasTable.$inferInsert;
export type Aval = typeof avalesTable.$inferSelect;
export type InsertAval = typeof avalesTable.$inferInsert;

export type TipoRegistro = (typeof tipoRegistroEnumValues)[number];
export type TipoProfesional = (typeof tipoProfesionalEnumValues)[number];
export type EstadoRegistro = (typeof estadoRegistroEnumValues)[number];
