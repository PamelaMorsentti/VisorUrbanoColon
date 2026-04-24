import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  insertLayerCatalogSchema,
  layerCatalogTable,
  updateLayerHealthSchema,
  upsertLayerCatalogSchema,
} from "@workspace/db/schema";
import { externalLayerSeed } from "../lib/externalLayersSeed.ts";

const router: IRouter = Router();

router.get("/layers/catalog", async (req, res) => {
  const onlyActive = req.query.onlyActive === "true";
  const externalOnly = req.query.externalOnly === "true";

  const whereClauses = [];
  if (onlyActive) whereClauses.push(eq(layerCatalogTable.isActive, true));
  if (externalOnly) whereClauses.push(eq(layerCatalogTable.isExternal, true));

  const rows = await db
    .select()
    .from(layerCatalogTable)
    .where(whereClauses.length > 0 ? and(...whereClauses) : undefined)
    .orderBy(asc(layerCatalogTable.group), asc(layerCatalogTable.label));

  return res.json({ data: rows });
});

router.post("/layers/catalog/bootstrap-external", async (_req, res) => {
  const summary = {
    created: 0,
    updated: 0,
  };

  await db.transaction(async (tx) => {
    for (const row of externalLayerSeed) {
      const existing = await tx
        .select({ id: layerCatalogTable.id })
        .from(layerCatalogTable)
        .where(eq(layerCatalogTable.key, row.key))
        .limit(1);

      if (existing.length > 0) {
        await tx
          .update(layerCatalogTable)
          .set({
            ...row,
            updatedAt: new Date(),
          })
          .where(eq(layerCatalogTable.key, row.key));
        summary.updated += 1;
      } else {
        const payload = insertLayerCatalogSchema.parse(row);
        await tx.insert(layerCatalogTable).values(payload);
        summary.created += 1;
      }
    }
  });

  return res.json({
    message: "External layers bootstrap completed",
    ...summary,
    total: externalLayerSeed.length,
  });
});

router.post("/layers/catalog/upsert", async (req, res) => {
  try {
    const payload = upsertLayerCatalogSchema.parse(req.body);

    const existing = await db
      .select({ id: layerCatalogTable.id })
      .from(layerCatalogTable)
      .where(eq(layerCatalogTable.key, payload.key))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db
        .update(layerCatalogTable)
        .set({
          ...payload,
          updatedAt: new Date(),
        })
        .where(eq(layerCatalogTable.key, payload.key))
        .returning();
      return res.json({ mode: "updated", data: updated });
    }

    const insertPayload = insertLayerCatalogSchema.parse(payload);
    const [created] = await db
      .insert(layerCatalogTable)
      .values(insertPayload)
      .returning();
    return res.status(201).json({ mode: "created", data: created });
  } catch (error) {
    return res.status(400).json({
      error: "Invalid layer catalog payload",
      details: error instanceof Error ? error.message : "Unknown validation error",
    });
  }
});

router.patch("/layers/catalog/:key/health", async (req, res) => {
  try {
    const key = req.params.key;
    const payload = updateLayerHealthSchema.parse(req.body);

    const [updated] = await db
      .update(layerCatalogTable)
      .set({
        healthStatus: payload.status,
        healthCheckedAt: payload.checkedAt ? new Date(payload.checkedAt) : new Date(),
        lastError: payload.lastError ?? null,
        updatedAt: new Date(),
      })
      .where(eq(layerCatalogTable.key, key))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: `Layer '${key}' not found` });
    }

    return res.json({ data: updated });
  } catch (error) {
    return res.status(400).json({
      error: "Invalid health update payload",
      details: error instanceof Error ? error.message : "Unknown validation error",
    });
  }
});

router.get("/layers/catalog/health", async (_req, res) => {
  const data = await db
    .select({
      key: layerCatalogTable.key,
      label: layerCatalogTable.label,
      group: layerCatalogTable.group,
      status: layerCatalogTable.healthStatus,
      checkedAt: layerCatalogTable.healthCheckedAt,
      error: layerCatalogTable.lastError,
    })
    .from(layerCatalogTable)
    .orderBy(desc(layerCatalogTable.healthCheckedAt), asc(layerCatalogTable.label));

  return res.json({ data });
});

export default router;
