import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import {
  boolean,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const layerTypeEnumValues = ["tms", "wms", "geojson"] as const;
export const layerHealthStatusEnumValues = [
  "unknown",
  "ok",
  "degraded",
  "down",
] as const;

export const layerTypeEnum = pgEnum("layer_type", layerTypeEnumValues);
export const layerHealthStatusEnum = pgEnum(
  "layer_health_status",
  layerHealthStatusEnumValues,
);

const legendEntrySchema = z.object({
  color: z.string().min(1),
  label: z.string().min(1),
});

export const layerCatalogTable = pgTable("layer_catalog", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  group: text("group").notNull(),
  layerType: layerTypeEnum("layer_type").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceLayerName: text("source_layer_name"),
  attribution: text("attribution"),
  isExternal: boolean("is_external").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  supportsGetFeatureInfo: boolean("supports_get_feature_info")
    .notNull()
    .default(false),
  legend: jsonb("legend").$type<Array<{ color: string; label: string }>>(),
  healthStatus: layerHealthStatusEnum("health_status")
    .notNull()
    .default("unknown"),
  healthCheckedAt: timestamp("health_checked_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const selectLayerCatalogSchema = createSelectSchema(layerCatalogTable, {
  legend: z.array(legendEntrySchema).nullable(),
});

export const insertLayerCatalogSchema = createInsertSchema(layerCatalogTable, {
  legend: z.array(legendEntrySchema).optional(),
})
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    key: z.string().min(2).max(120),
    label: z.string().min(2).max(180),
    group: z.string().min(2).max(120),
    sourceUrl: z.string().url(),
  });

export const upsertLayerCatalogSchema = insertLayerCatalogSchema.partial().extend({
  key: z.string().min(2).max(120),
});

export const updateLayerHealthSchema = z.object({
  status: z.enum(layerHealthStatusEnumValues),
  checkedAt: z.string().datetime().optional(),
  lastError: z.string().max(5000).optional(),
});

export type LayerCatalog = typeof layerCatalogTable.$inferSelect;
export type InsertLayerCatalog = z.infer<typeof insertLayerCatalogSchema>;
export type UpsertLayerCatalog = z.infer<typeof upsertLayerCatalogSchema>;
export type UpdateLayerHealth = z.infer<typeof updateLayerHealthSchema>;
