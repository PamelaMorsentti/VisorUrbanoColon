import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { layerCatalogTable } from "@workspace/db/schema";
import { logger } from "./logger.ts";

const PROBE_TIMEOUT_MS = 10_000;
const CHECK_INTERVAL_MS = Number(
  process.env["HEALTH_CHECK_INTERVAL_MS"] ?? 15 * 60 * 1_000,
);

type HealthStatus = "ok" | "degraded" | "down";

/**
 * Builds a probe URL for the given layer.
 * - WMS  → GetCapabilities request
 * - TMS  → substitutes template vars to get a concrete tile URL (z=2, x=1, y=1)
 */
function buildProbeUrl(layerType: string, sourceUrl: string): string {
  if (layerType === "wms") {
    const sep = sourceUrl.includes("?") ? "&" : "?";
    return `${sourceUrl}${sep}SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0`;
  }

  // TMS: replace all template placeholders with concrete values
  return sourceUrl
    .replace("{z}", "2")
    .replace("{x}", "1")
    .replace("{y}", "1")
    .replace("{-y}", "1")
    .replace(/\{s\}/g, "a")
    .replace("{date}", new Date().toISOString().slice(0, 10));
}

interface ProbeResult {
  status: HealthStatus;
  latencyMs: number;
  error?: string;
}

async function probe(url: string, layerType: string): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const start = Date.now();

  try {
    // Some tile servers don't support HEAD; use GET for WMS, HEAD for TMS
    const method = layerType === "wms" ? "GET" : "HEAD";
    const res = await fetch(url, { signal: controller.signal, method });
    const latencyMs = Date.now() - start;
    clearTimeout(timer);

    if (res.status >= 500) {
      return { status: "down", latencyMs, error: `HTTP ${res.status}` };
    }
    if (res.status >= 400) {
      // 4xx for TMS often means the tile coordinate doesn't exist but server is up
      return {
        status: layerType === "tms" ? "degraded" : "down",
        latencyMs,
        error: `HTTP ${res.status}`,
      };
    }
    return { status: "ok", latencyMs };
  } catch (err: unknown) {
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      status: "down",
      latencyMs,
      error: isAbort ? "Timeout" : err instanceof Error ? err.message : "Network error",
    };
  }
}

async function runHealthCheck(): Promise<void> {
  const layers = await db
    .select({
      key: layerCatalogTable.key,
      layerType: layerCatalogTable.layerType,
      sourceUrl: layerCatalogTable.sourceUrl,
    })
    .from(layerCatalogTable)
    .where(
      and(
        eq(layerCatalogTable.isActive, true),
        eq(layerCatalogTable.isExternal, true),
      ),
    );

  logger.info({ count: layers.length }, "Health check: starting");

  for (const layer of layers) {
    const probeUrl = buildProbeUrl(layer.layerType, layer.sourceUrl);
    const result = await probe(probeUrl, layer.layerType);

    await db
      .update(layerCatalogTable)
      .set({
        healthStatus: result.status,
        healthCheckedAt: new Date(),
        lastError: result.error ?? null,
        updatedAt: new Date(),
      })
      .where(eq(layerCatalogTable.key, layer.key));

    logger.info(
      { key: layer.key, status: result.status, latencyMs: result.latencyMs, error: result.error },
      "Health check: layer checked",
    );
  }

  logger.info("Health check: completed");
}

/**
 * Starts the periodic health check scheduler.
 * Runs once after a short delay (to allow the server to finish booting),
 * then repeats every HEALTH_CHECK_INTERVAL_MS (default: 15 minutes).
 */
export function startHealthCheckScheduler(): void {
  logger.info({ intervalMs: CHECK_INTERVAL_MS }, "Health check scheduler: starting");

  // Initial run — delayed 8 s so the server is fully listening before making outbound requests
  setTimeout(() => {
    runHealthCheck().catch((err) =>
      logger.error({ err }, "Health check: error during initial run"),
    );
  }, 8_000);

  setInterval(() => {
    runHealthCheck().catch((err) =>
      logger.error({ err }, "Health check: error during scheduled run"),
    );
  }, CHECK_INTERVAL_MS);
}
