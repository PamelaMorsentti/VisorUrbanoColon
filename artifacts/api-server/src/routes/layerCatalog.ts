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

function parseBbox4326(bbox: string): [number, number, number, number] | null {
  const parts = bbox.split(",").map((v) => Number(v.trim()));
  if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) return null;
  return [parts[0]!, parts[1]!, parts[2]!, parts[3]!];
}

function parsePositiveInt(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

async function fetchNearbyViaWfs(args: {
  sourceUrl: string;
  sourceLayerName: string;
  bbox: string;
  width: string;
  height: string;
  x: string;
  y: string;
  featureCount: string;
  buffer: string;
}): Promise<unknown | null> {
  const parsedBbox = parseBbox4326(args.bbox);
  const width = parsePositiveInt(args.width);
  const height = parsePositiveInt(args.height);
  const x = Number(args.x);
  const y = Number(args.y);
  const maxFeatures = parsePositiveInt(args.featureCount) ?? 5;
  const bufferPx = parsePositiveInt(args.buffer) ?? 12;

  if (!parsedBbox || !width || !height || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  const [west, south, east, north] = parsedBbox;
  const lon = west + (x / width) * (east - west);
  const lat = north - (y / height) * (north - south);
  const tolX = Math.max((east - west) / width, 1e-7) * Math.max(bufferPx, 10);
  const tolY = Math.max((north - south) / height, 1e-7) * Math.max(bufferPx, 10);

  const minx = lon - tolX;
  const maxx = lon + tolX;
  const miny = lat - tolY;
  const maxy = lat + tolY;

  const wfsParams = new URLSearchParams({
    service: "WFS",
    version: "1.0.0",
    request: "GetFeature",
    typeName: args.sourceLayerName,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    maxFeatures: String(maxFeatures),
    bbox: `${minx},${miny},${maxx},${maxy},EPSG:4326`,
  });

  const wfsResponse = await fetch(`${args.sourceUrl}?${wfsParams.toString()}`, {
    signal: AbortSignal.timeout(8000),
  });

  if (!wfsResponse.ok) return null;
  const contentType = (wfsResponse.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) return null;

  const json = await wfsResponse.json() as { features?: unknown[] };
  if (Array.isArray(json.features) && json.features.length > 0) {
    return json;
  }
  return null;
}

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

router.get("/layers/catalog/:key/feature-info", async (req, res) => {
  const key = req.params.key;
  const bbox = String(req.query.bbox ?? "").trim();
  const width = String(req.query.width ?? "").trim();
  const height = String(req.query.height ?? "").trim();
  const x = String(req.query.x ?? "").trim();
  const y = String(req.query.y ?? "").trim();
  const srs = String(req.query.srs ?? "EPSG:4326").trim();
  const infoFormat = String(req.query.infoFormat ?? "application/json").trim();
  const featureCount = String(req.query.featureCount ?? "5").trim();
  const buffer = String(req.query.buffer ?? "12").trim();

  if (!bbox || !width || !height || !x || !y) {
    return res.status(400).json({
      error: "Missing required query parameters",
      required: ["bbox", "width", "height", "x", "y"],
    });
  }

  const found = await db
    .select({
      key: layerCatalogTable.key,
      layerType: layerCatalogTable.layerType,
      sourceUrl: layerCatalogTable.sourceUrl,
      sourceLayerName: layerCatalogTable.sourceLayerName,
      isExternal: layerCatalogTable.isExternal,
      isActive: layerCatalogTable.isActive,
    })
    .from(layerCatalogTable)
    .where(eq(layerCatalogTable.key, key))
    .limit(1);

  const layer = found[0];
  if (!layer) return res.status(404).json({ error: `Layer '${key}' not found` });
  if (!layer.isExternal || !layer.isActive) {
    return res.status(400).json({ error: `Layer '${key}' is not active external layer` });
  }
  if (layer.layerType !== "wms") {
    return res.status(400).json({ error: `Layer '${key}' is not WMS` });
  }
  if (!layer.sourceLayerName) {
    return res.status(400).json({ error: `Layer '${key}' has no sourceLayerName` });
  }

  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.1.1",
    REQUEST: "GetFeatureInfo",
    LAYERS: layer.sourceLayerName,
    QUERY_LAYERS: layer.sourceLayerName,
    INFO_FORMAT: infoFormat,
    FEATURE_COUNT: featureCount,
    X: x,
    Y: y,
    WIDTH: width,
    HEIGHT: height,
    BBOX: bbox,
    SRS: srs,
    BUFFER: buffer,
  });

  try {
    const fetchFeatureInfo = async (xVal: string, yVal: string) => {
      const q = new URLSearchParams(params);
      q.set("X", xVal);
      q.set("Y", yVal);
      return fetch(`${layer.sourceUrl}?${q.toString()}`, {
        signal: AbortSignal.timeout(8000),
      });
    };

    const upstream = await fetchFeatureInfo(x, y);

    const contentType = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      return res.status(502).json({
        error: "Upstream WMS request failed",
        status: upstream.status,
        contentType,
        details: detail.slice(0, 600),
      });
    }

    if (contentType.toLowerCase().includes("application/json")) {
      const data = await upstream.json() as { features?: unknown[] };
      if (Array.isArray(data.features) && data.features.length > 0) {
        return res.json(data);
      }

      // Retry around the clicked pixel for thin/small geometries that are hard to hit.
      const xNum = Number(x);
      const yNum = Number(y);
      const offsets = [
        [8, 0],
        [-8, 0],
        [0, 8],
        [0, -8],
        [12, 12],
        [12, -12],
        [-12, 12],
        [-12, -12],
        [20, 0],
        [-20, 0],
        [0, 20],
        [0, -20],
      ];
      if (Number.isFinite(xNum) && Number.isFinite(yNum)) {
        for (const [dx, dy] of offsets) {
          const retry = await fetchFeatureInfo(String(Math.round(xNum + dx)), String(Math.round(yNum + dy)));
          if (!retry.ok) continue;
          const retryCt = (retry.headers.get("content-type") ?? "").toLowerCase();
          if (!retryCt.includes("application/json")) continue;
          const retryJson = await retry.json() as { features?: unknown[] };
          if (Array.isArray(retryJson.features) && retryJson.features.length > 0) {
            return res.json(retryJson);
          }
        }
      }

      if (srs.toUpperCase() === "EPSG:4326") {
        const wfsData = await fetchNearbyViaWfs({
          sourceUrl: layer.sourceUrl,
          sourceLayerName: layer.sourceLayerName,
          bbox,
          width,
          height,
          x,
          y,
          featureCount,
          buffer,
        });
        if (wfsData) return res.json(wfsData);
      }

      return res.json(data);
    }

    const text = await upstream.text();
    return res.status(502).json({
      error: "Upstream WMS did not return JSON",
      contentType,
      details: text.slice(0, 600),
    });
  } catch (error) {
    return res.status(502).json({
      error: "Failed to query upstream WMS",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
