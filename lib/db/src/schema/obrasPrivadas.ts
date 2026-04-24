import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const obrasPublicationLevelEnumValues = ["public", "professional", "admin"] as const;
export const obrasPublicationLevelEnum = pgEnum(
  "obras_publication_level",
  obrasPublicationLevelEnumValues,
);

export const obrasPrivadasTable = pgTable("obras_privadas", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicationLevel: obrasPublicationLevelEnum("publication_level").notNull(),
  sourceFile: text("source_file").notNull(),
  sourceRowNumber: text("source_row_number").notNull(),
  legajoCanonico: text("legajo_canonico"),
  ncp: text("ncp"),
  zonificacion: text("zonificacion"),
  destinoUso: text("destino_uso"),
  tipo: text("tipo"),
  visadoDate: date("visado_date"),
  visadoYear: integer("visado_year"),
  isRelevamiento: boolean("is_relevamiento").notNull().default(false),
  isNueva: boolean("is_nueva").notNull().default(false),
  isAmpliacion: boolean("is_ampliacion").notNull().default(false),
  isProyectada: boolean("is_proyectada").notNull().default(false),
  rawFeature: jsonb("raw_feature").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  sourceIdentityUq: uniqueIndex("obras_privadas_source_identity_uq").on(
    table.publicationLevel,
    table.sourceFile,
    table.sourceRowNumber,
  ),
  visadoYearIdx: index("obras_privadas_visado_year_idx").on(table.visadoYear),
  zonificacionIdx: index("obras_privadas_zonificacion_idx").on(table.zonificacion),
  destinoUsoIdx: index("obras_privadas_destino_uso_idx").on(table.destinoUso),
}));

export type ObrasPrivadas = typeof obrasPrivadasTable.$inferSelect;
export type InsertObrasPrivadas = typeof obrasPrivadasTable.$inferInsert;
