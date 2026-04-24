import { useEffect, useState } from "react";
import {
  EXTERNAL_LAYERS,
  EXTERNAL_LAYER_GROUPS,
  type ExternalLayerDef,
} from "@/lib/layers";

/**
 * Display-only properties per layer key.
 * These are not stored in the DB — they control rendering (color, opacity, zoom).
 */
const DISPLAY_CONFIG: Record<
  string,
  {
    color: string;
    opacity?: number;
    maxZoom?: number;
    subdomains?: string;
    wmsFormat?: string;
    wmsTransparent?: boolean;
  }
> = {
  ext_ign_satelital:    { color: "#22d3ee", opacity: 0.9,  maxZoom: 20 },
  ext_esri_satelital:   { color: "#84cc16", opacity: 0.9,  maxZoom: 19 },
  ext_opentopomap:      { color: "#a8a29e", opacity: 0.85, maxZoom: 17, subdomains: "abc" },
  ext_ign_topo:         { color: "#60a5fa", opacity: 0.85, wmsFormat: "image/png", wmsTransparent: true },
  ext_inta_suelos:      { color: "#ca8a04", opacity: 0.75, wmsFormat: "image/png", wmsTransparent: true },
  ext_segemar_geo:      { color: "#f97316", opacity: 0.75, wmsFormat: "image/png", wmsTransparent: true },
  ext_apn_anp:          { color: "#16a34a", opacity: 0.75, wmsFormat: "image/png", wmsTransparent: true },
  ext_nasa_precip:      { color: "#38bdf8", opacity: 0.75, maxZoom: 7 },
  ext_esa_landcover:    { color: "#4ade80", opacity: 0.75, wmsFormat: "image/png", wmsTransparent: true },
  ext_jrc_surface_water: { color: "#0ea5e9", opacity: 0.8,  maxZoom: 13 },
};

/** Shape of a row returned by GET /api/layers/catalog */
interface CatalogRow {
  id: string;
  key: string;
  label: string;
  description: string | null;
  group: string;
  layerType: "tms" | "wms" | "geojson";
  sourceUrl: string;
  sourceLayerName: string | null;
  attribution: string;
  isActive: boolean;
  supportsGetFeatureInfo: boolean;
  legend: Array<{ color: string; label: string }> | null;
  healthStatus: "unknown" | "ok" | "degraded" | "down";
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

function rowToLayerDef(row: CatalogRow): ExternalLayerDef | null {
  if (row.layerType === "geojson") return null; // not handled as tile layers
  const display = DISPLAY_CONFIG[row.key] ?? { color: "#94a3b8" };
  return {
    id: row.key,
    label: row.label,
    description: row.description ?? "",
    type: row.layerType as "tms" | "wms",
    url: row.sourceUrl,
    wmsLayers: row.sourceLayerName ?? undefined,
    wmsFormat: display.wmsFormat,
    wmsTransparent: display.wmsTransparent,
    attribution: row.attribution,
    color: display.color,
    opacity: display.opacity,
    maxZoom: display.maxZoom,
    subdomains: display.subdomains,
    group: row.group,
    legend: row.legend ?? undefined,
    supportsGetFeatureInfo: row.supportsGetFeatureInfo,
    healthStatus: row.healthStatus,
  };
}

function deriveGroups(layers: ExternalLayerDef[]): string[] {
  const seen = new Set<string>();
  const groups: string[] = [];
  for (const l of layers) {
    if (!seen.has(l.group)) {
      seen.add(l.group);
      groups.push(l.group);
    }
  }
  return groups;
}

/**
 * Fetches the external layer catalog from the API.
 * Falls back to the static EXTERNAL_LAYERS array if the API is unavailable.
 */
export function useLayerCatalog() {
  const [layers, setLayers] = useState<ExternalLayerDef[]>(EXTERNAL_LAYERS);
  const [groups, setGroups] = useState<string[]>(EXTERNAL_LAYER_GROUPS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!API_BASE) return; // no API URL configured → use static fallback silently

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/api/layers/catalog?externalOnly=true&onlyActive=true`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ data: CatalogRow[] }>;
      })
      .then((body) => {
        const mapped = body.data
          .map(rowToLayerDef)
          .filter((l): l is ExternalLayerDef => l !== null);
        if (mapped.length > 0) {
          setLayers(mapped);
          setGroups(deriveGroups(mapped));
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.warn(
          "[useLayerCatalog] API unavailable, using static fallback:",
          err,
        );
        setError(err instanceof Error ? err.message : String(err));
        // Static fallback already set as initial state
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  return { layers, groups, loading, error };
}
