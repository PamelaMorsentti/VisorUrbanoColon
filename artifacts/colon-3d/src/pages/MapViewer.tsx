import { useEffect, useRef, useState, useCallback } from "react";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FeatureCollection = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Geometry = any;
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Header from "@/components/Header";
import LayersPanel from "@/components/LayersPanel";
import FeatureInfo from "@/components/FeatureInfo";
import ZonaPanel from "@/components/ZonaPanel";
import ZonaLegend from "@/components/ZonaLegend";
import CadastralSearch from "@/components/CadastralSearch";
import DensidadPanel, { getDensityColor } from "@/components/DensidadPanel";
import ParcelReport, { ReportData, LayerIntersection } from "@/components/ParcelReport";
import BaseMapSelector from "@/components/BaseMapSelector";
import MeasureTool, { type MeasureMode } from "@/components/MeasureTool";
import LayerUpload from "@/components/LayerUpload";
import AnalysisPanel from "@/components/AnalysisPanel";
import AuthPanel from "@/components/AuthGate";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/auth";
import { LAYERS, COLON_CENTER, COLON_ZOOM, ZONA_COLORS } from "@/lib/layers";
import { ZONA_NORMAS } from "@/lib/zonaData";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");

type LeafletLayer = L.GeoJSON | L.LayerGroup;
type DensidadData = Record<string, { count: number; area: number }>;

// ─── Geometry helpers ────────────────────────────────────────────────────────

function computeCentroid(geometry: Geometry): [number, number] | null {
  if (!geometry) return null;
  if (geometry.type === "Point") return [geometry.coordinates[1], geometry.coordinates[0]];
  if (geometry.type === "LineString") {
    const coords = geometry.coordinates;
    if (!coords?.length) return null;
    // Use middle coordinate for street placement
    const mid = coords[Math.floor(coords.length / 2)];
    return [mid[1], mid[0]];
  }
  if (geometry.type === "Polygon") {
    const ring = geometry.coordinates[0];
    if (!ring?.length) return null;
    let sx = 0, sy = 0;
    for (const c of ring) { sx += c[0]; sy += c[1]; }
    return [sy / ring.length, sx / ring.length];
  }
  if (geometry.type === "MultiPolygon") {
    const ring = geometry.coordinates[0]?.[0];
    if (!ring) return null;
    let sx = 0, sy = 0;
    for (const c of ring) { sx += c[0]; sy += c[1]; }
    return [sy / ring.length, sx / ring.length];
  }
  return null;
}

// Compute the overall direction of a LineString (first → last point)
// Returns CSS rotation angle in degrees for the label
function computeLineAngle(geometry: Geometry): number {
  if (geometry?.type !== "LineString") return 0;
  const coords = geometry.coordinates;
  if (coords.length < 2) return 0;
  const p1 = coords[0];
  const p2 = coords[coords.length - 1];
  const dx = p2[0] - p1[0]; // longitude diff (east = positive)
  const dy = p2[1] - p1[1]; // latitude diff  (north = positive)
  // Geographic angle from east axis: atan2(dy, dx)
  // Map screen: east=right, north=UP. CSS rotate: clockwise positive.
  // For a NE line: dx>0, dy>0 → angle>0 → on screen tilts up-right
  //   → CSS should be negative (counter-clockwise from horizontal) to point up-right
  // So: cssAngle = -geographicAngle. Normalize to [-90,90] for readability.
  let angle = Math.atan2(dy, dx) * 180 / Math.PI;
  // Flip so text always reads left→right (don't rotate > 90° or < -90°)
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  return -angle; // negate for CSS screen coordinate system
}

function computePolygonAreaM2(coords: number[][]): number {
  if (!coords || coords.length < 3) return 0;
  const LAT = 111320;
  const centerLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const LNG = LAT * Math.cos(centerLat * Math.PI / 180);
  let area = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += (coords[i][0] * LNG) * (coords[j][1] * LAT) - (coords[j][0] * LNG) * (coords[i][1] * LAT);
  }
  return Math.abs(area / 2);
}

function preprocessZonas(data: FeatureCollection): FeatureCollection {
  return {
    ...data,
    features: data.features.map((f: FeatureCollection) => {
      if (f.geometry?.type === "LineString") {
        const coords = [...f.geometry.coordinates];
        const first = coords[0], last = coords[coords.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) coords.push(coords[0]);
        return { ...f, geometry: { type: "Polygon", coordinates: [coords] } };
      }
      return f;
    }),
  };
}

function getFeatureBounds(geometry: Geometry): L.LatLngBounds | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layer = L.geoJSON({ type: "Feature", geometry, properties: {} } as any);
    const b = layer.getBounds();
    return b.isValid() ? b : null;
  } catch { return null; }
}

// ─── Report layer config ─────────────────────────────────────────────────────

type IntersectionRelation = "centroid_in_feature" | "feature_in_parcel" | "proximity";

interface ReportLayerCfg {
  id: string;
  label: string;
  relation: IntersectionRelation;
  proximityM?: number;
  maxResults?: number;
  relationLabel: string; // human-readable relation description
}

const REPORT_LAYERS: ReportLayerCfg[] = [
  { id: "manzana",   label: "Manzana catastral",     relation: "centroid_in_feature",  maxResults: 1,  relationLabel: "La parcela pertenece a esta manzana" },
  { id: "barrios",   label: "Barrio",                 relation: "centroid_in_feature",  maxResults: 1,  relationLabel: "Barrio en el que se ubica la parcela" },
  { id: "edif",      label: "Edificios (PB)",         relation: "feature_in_parcel",    maxResults: 10, relationLabel: "Construcciones planta baja dentro de la parcela" },
  { id: "edif_palta",label: "Edif. Planta Alta",      relation: "feature_in_parcel",    maxResults: 10, relationLabel: "Construcciones planta alta dentro de la parcela" },
  { id: "arbol",     label: "Arbolado urbano",        relation: "feature_in_parcel",    maxResults: 15, relationLabel: "Árboles urbanos inventariados en la parcela" },
  { id: "calle",     label: "Calles lindantes",       relation: "proximity", proximityM: 80,  maxResults: 5,  relationLabel: "Calles a menos de 80 m del centroide" },
  { id: "hidro",     label: "Hidrografía cercana",    relation: "proximity", proximityM: 200, maxResults: 3,  relationLabel: "Cursos de agua a menos de 200 m" },
  { id: "bocas",     label: "Bocas de tormenta",      relation: "proximity", proximityM: 120, maxResults: 4,  relationLabel: "Bocas de tormenta a menos de 120 m" },
];

// ─── Geometry helpers (spatial) ──────────────────────────────────────────────

// Ray-casting point-in-polygon (lng, lat order)
function pointInPolygon(px: number, py: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi))
      inside = !inside;
  }
  return inside;
}

// Distance in meters between two [lng, lat] points (haversine approx)
function distanceMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const dLat = (b[1] - a[1]) * Math.PI / 180;
  const dLng = (b[0] - a[0]) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// ─── Label text ──────────────────────────────────────────────────────────────

function getLabelText(layerId: string, props: Record<string, unknown>, index: number): string {
  switch (layerId) {
    case "zonas": return String(props.ZONA || "");
    case "seccion": {
      const v = props.SECCION;
      return v != null ? `S-${v}` : `S${index + 1}`;
    }
    case "manzana": {
      const m = props.MANZ;
      if (m && Number(m) > 0) return String(m);
      const g = props.GRU;
      return g != null && Number(g) > 0 ? String(g) : "";
    }
    case "parcela": return props.NPARC != null ? String(props.NPARC) : "";
    case "barrios": return props.NOMBRE ? String(props.NOMBRE) : `B${index + 1}`;
    case "grupo": return props.GRUPO != null ? `G-${props.GRUPO}` : `G${index + 1}`;
    case "calle": return props.CALLE ? String(props.CALLE).replace(/^CALLE\s+/i, "") : "";
    default: return "";
  }
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function getLayerStyle(layerId: string): L.PathOptions {
  switch (layerId) {
    case "manzana":    return { fillColor: "#1e2432", fillOpacity: 0.75, color: "#3a4255", weight: 1, opacity: 0.9 };
    case "parcela":    return { fillColor: "transparent", fillOpacity: 0, color: "#5b6882", weight: 0.6, opacity: 0.8 };
    case "calle":      return { color: "#525861", weight: 1.5, opacity: 0.9 };
    case "vias":       return { color: "#d97706", weight: 2.5, opacity: 0.9 };
    case "municipio":  return { fillColor: "transparent", fillOpacity: 0, color: "#60a5fa", weight: 2, opacity: 0.9, dashArray: "6 4" };
    case "seccion":    return { fillColor: "transparent", fillOpacity: 0, color: "#a78bfa", weight: 1.5, opacity: 0.8, dashArray: "5 3" };
    case "barrios":    return { fillColor: "#3b82f6", fillOpacity: 0.06, color: "#60a5fa", weight: 1.5, opacity: 0.8 };
    case "edif":       return { fillColor: "#4a6080", fillOpacity: 1, color: "#364d68", weight: 0.5, opacity: 1 };
    case "edif_palta": return { fillColor: "#a05a20", fillOpacity: 1, color: "#7c4015", weight: 0.5, opacity: 1 };
    case "cota10":     return { color: "#5eead4", weight: 0.8, opacity: 0.6 };
    case "hidro":      return { color: "#38bdf8", weight: 1.5, opacity: 0.75 };
    case "arbol":      return { fillColor: "#16a34a", fillOpacity: 0.55, color: "#22c55e", weight: 1, opacity: 0.9 };
    case "grupo":      return { fillColor: "#7c3aed", fillOpacity: 0.10, color: "#7c3aed", weight: 1, opacity: 0.6 };
    case "zonas":      return { fillOpacity: 0.18, weight: 2, opacity: 0.9 };
    default:           return { fillColor: "#4b5563", fillOpacity: 0.5, color: "#6b7280", weight: 1 };
  }
}

function getZonaStyle(zonaName: string | null): L.PathOptions {
  const color = ZONA_COLORS[zonaName || ""] || ZONA_COLORS[""];
  return { fillColor: color, fillOpacity: 0.18, color, weight: 2, opacity: 0.9 };
}

function getManzanaDensityStyle(feature: FeatureCollection, densData: DensidadData, maxCount: number): L.PathOptions {
  const ncm = feature?.properties?.NCM;
  const d = ncm && densData[ncm];
  const count = d ? d.count : 0;
  const fillColor = getDensityColor(count, maxCount);
  return { fillColor, fillOpacity: count > 0 ? 0.85 : 0.3, color: "#3a4255", weight: 0.5, opacity: 0.5 };
}

function getPointLayer(layerId: string, latlng: L.LatLng): L.Layer {
  let color = "#6b7280", radius = 3;
  if (layerId === "postes") { color = "#fbbf24"; radius = 2.5; }
  else if (layerId === "bocas") { color = "#38bdf8"; radius = 4.5; }
  return L.circleMarker(latlng, { radius, fillColor: color, fillOpacity: 0.85, color, weight: 1, opacity: 0.9 });
}

const HIGHLIGHT_STYLE: L.PathOptions = {
  color: "#facc15", weight: 3, opacity: 1,
  fillColor: "#facc15", fillOpacity: 0.3,
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function MapViewer() {
  const { user } = useAuth();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layerRefs = useRef<Record<string, LeafletLayer>>({});
  const labelRefs = useRef<Record<string, L.LayerGroup>>({});
  const loadingRef = useRef<Set<string>>(new Set());
  const highlightRef = useRef<L.GeoJSON | null>(null);
  const addressMarkerRef = useRef<L.Marker | null>(null);
  const densidadDataRef = useRef<DensidadData | null>(null);
  const densidadActiveRef = useRef(false); // for use inside hover closures
  const zonasRawDataRef = useRef<FeatureCollection | null>(null); // preprocessed zonas for zone detection
  const cNivelDataRef = useRef<FeatureCollection | null>(null); // c_nivel for elevation lookup
  const layerCacheRef = useRef<Record<string, FeatureCollection>>({}); // all loaded GeoJSON, keyed by layer id

  const [layersPanelOpen, setLayersPanelOpen] = useState(false);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [densidadPanelOpen, setDensidadPanelOpen] = useState(false);
  const [zonaLegendOpen, setZonaLegendOpen] = useState(false);
  const [densidadActive, setDensidadActive] = useState(false);
  const [measureMode, setMeasureMode] = useState<MeasureMode>("none");
  const [authPanelOpen, setAuthPanelOpen] = useState(false);
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false);
  const [analysisPanelOpen, setAnalysisPanelOpen] = useState(false);
  const [densidadStats, setDensidadStats] = useState<{
    totalEdif: number; manzanasConEdif: number; maxCount: number; maxArea: number;
  } | null>(null);

  const [selectedFeature, setSelectedFeature] = useState<{
    props: Record<string, unknown>;
    layerLabel: string;
    centroid?: [number, number] | null; // [lng, lat]
    geometry?: Geometry | null;
  } | null>(null);
  const [selectedZona, setSelectedZona] = useState<string | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loadedSources, setLoadedSources] = useState<Set<string>>(new Set());
  const [mapReady, setMapReady] = useState(false);

  const [visibleLayers, setVisibleLayers] = useState<Record<string, boolean>>(
    Object.fromEntries(LAYERS.map(l => [l.id, l.defaultVisible]))
  );

  // Keep ref in sync with state for use in closures
  useEffect(() => { densidadActiveRef.current = densidadActive; }, [densidadActive]);

  // ── On-demand layer data fetcher (with cache) ────────────────────────────

  const fetchAndCacheLayer = useCallback(async (layerId: string): Promise<FeatureCollection | null> => {
    if (layerCacheRef.current[layerId]) return layerCacheRef.current[layerId];
    const layerDef = LAYERS.find(l => l.id === layerId);
    if (!layerDef) return null;
    try {
      const r = await fetch(`${BASE_PATH}/data/${layerDef.file}`);
      const data: FeatureCollection = await r.json();
      layerCacheRef.current[layerId] = data;
      if (layerId === "zonas") zonasRawDataRef.current = data;
      if (layerId === "cota10") cNivelDataRef.current = data;
      return data;
    } catch { return null; }
  }, []);

  // ── Address search result handler ────────────────────────────────────────

  const handleAddressFound = useCallback((lat: number, lng: number, name: string) => {
    const map = leafletMapRef.current;
    if (!map) return;
    // Remove previous marker
    if (addressMarkerRef.current) { map.removeLayer(addressMarkerRef.current); addressMarkerRef.current = null; }
    // Create a custom pin marker
    const pin = L.divIcon({
      className: "",
      html: `<div style="
        width:20px;height:28px;
        background:#3b82f6;
        border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        border:2px solid #fff;
        box-shadow:0 2px 8px rgba(0,0,0,0.5);
      "></div>`,
      iconSize: [20, 28],
      iconAnchor: [10, 28],
    });
    const marker = L.marker([lat, lng], { icon: pin });
    const shortName = name.split(",").slice(0, 2).join(",");
    marker.bindPopup(
      `<div style="font-family:Inter,sans-serif;font-size:12px;color:#e2e8f0;min-width:160px">
        <div style="font-weight:600;margin-bottom:4px">📍 Dirección encontrada</div>
        <div style="font-size:11px;color:#94a3b8">${shortName}</div>
      </div>`,
      { className: "dark-popup" }
    );
    marker.addTo(map).openPopup();
    addressMarkerRef.current = marker;
    map.once("click", () => {
      if (addressMarkerRef.current) { map.removeLayer(addressMarkerRef.current); addressMarkerRef.current = null; }
    });
  }, []);

  // ── Print report handler ─────────────────────────────────────────────────

  const handlePrint = useCallback(async () => {
    if (!selectedFeature) return;
    const props = selectedFeature.props;
    const centroid = selectedFeature.centroid; // [lng, lat]
    const parcelGeometry = selectedFeature.geometry;

    // Get parcel polygon ring for "feature inside parcel" tests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parcelRing: number[][] | null = null;
    if (parcelGeometry?.type === "Polygon") {
      parcelRing = parcelGeometry.coordinates[0];
    } else if (parcelGeometry?.type === "MultiPolygon") {
      parcelRing = parcelGeometry.coordinates[0]?.[0] || null;
    }

    // ── Zone detection ────────────────────────────────────────────────────
    let zonaName: string | null = null;
    const zonasData = await fetchAndCacheLayer("zonas");
    if (centroid && zonasData) {
      const [lng, lat] = centroid;
      for (const f of zonasData.features) {
        const g = f.geometry;
        if (!g) continue;
        const rings: number[][][] = g.type === "Polygon" ? g.coordinates : g.type === "MultiPolygon" ? g.coordinates.flat(1) : [];
        if (rings.some((ring: number[][]) => pointInPolygon(lng, lat, ring))) {
          zonaName = f.properties?.ZONA || null;
          break;
        }
      }
    }
    const normasList = zonaName ? (ZONA_NORMAS[zonaName] || []) : [];
    const normas = normasList.length > 0 ? normasList[0] : null;

    // ── Elevation curves ─────────────────────────────────────────────────
    const cotas: Array<{ Z: number; COTA: number; NOMBRE: string }> = [];
    const cNivelData = await fetchAndCacheLayer("cota10");
    if (centroid && cNivelData) {
      const [lng, lat] = centroid;
      const nearby = cNivelData.features
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((f: any) => {
          const coords = f.geometry?.coordinates || [];
          const mid = coords[Math.floor(coords.length / 2)];
          if (!mid) return null;
          const dist = distanceMeters([lng, lat], [mid[0], mid[1]]);
          return { props: f.properties, dist };
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((x: any) => x && x.dist < 300)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .sort((a: any, b: any) => a.dist - b.dist)
        .slice(0, 6);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const item of nearby as any[]) {
        if (!item) continue;
        cotas.push({ Z: item.props.Z, COTA: item.props.COTA, NOMBRE: item.props.NOMBRE });
      }
    }

    // ── Layer intersections ───────────────────────────────────────────────
    // Fetch all report layers in parallel
    const layerDataList = await Promise.all(
      REPORT_LAYERS.map(cfg => fetchAndCacheLayer(cfg.id).then(d => ({ cfg, data: d })))
    );

    const intersections: LayerIntersection[] = [];

    for (const { cfg, data } of layerDataList) {
      if (!data) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const features: Record<string, unknown>[] = [];
      const max = cfg.maxResults ?? 10;

      if (cfg.relation === "centroid_in_feature" && centroid) {
        const [lng, lat] = centroid;
        for (const f of data.features) {
          if (features.length >= max) break;
          const g = f.geometry;
          if (!g) continue;
          const rings: number[][][] = g.type === "Polygon" ? g.coordinates : g.type === "MultiPolygon" ? g.coordinates.flat(1) : [];
          if (rings.some((ring: number[][]) => pointInPolygon(lng, lat, ring))) {
            features.push(f.properties || {});
          }
        }
      } else if (cfg.relation === "feature_in_parcel" && parcelRing) {
        for (const f of data.features) {
          if (features.length >= max) break;
          const g = f.geometry;
          if (!g) continue;
          // Get feature centroid [lat, lng]
          const fc = computeCentroid(g);
          if (!fc) continue;
          // fc = [lat, lng], parcelRing uses [lng, lat] order
          if (pointInPolygon(fc[1], fc[0], parcelRing)) {
            features.push(f.properties || {});
          }
        }
      } else if (cfg.relation === "proximity" && centroid && cfg.proximityM) {
        const [lng, lat] = centroid;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const candidates: Array<{ props: Record<string, unknown>; dist: number }> = [];
        for (const f of data.features) {
          const g = f.geometry;
          if (!g) continue;
          // Use representative point from geometry
          const fc = computeCentroid(g); // [lat, lng]
          if (!fc) continue;
          const dist = distanceMeters([lng, lat], [fc[1], fc[0]]);
          if (dist <= cfg.proximityM) candidates.push({ props: f.properties || {}, dist });
        }
        candidates.sort((a, b) => a.dist - b.dist);
        for (const c of candidates.slice(0, max)) features.push(c.props);
      }

      if (features.length > 0) {
        intersections.push({ id: cfg.id, label: cfg.label, relation: cfg.relationLabel, features });
      }
    }

    setReportData({
      parcelProps: props,
      layerLabel: selectedFeature.layerLabel,
      zonaName,
      normas,
      cotas,
      lat: centroid ? centroid[1] : null,
      lng: centroid ? centroid[0] : null,
      intersections,
    });
  }, [selectedFeature, fetchAndCacheLayer]);

  // ── Density data loading ─────────────────────────────────────────────────

  const loadDensidadData = useCallback(async () => {
    if (densidadDataRef.current) return densidadDataRef.current;
    const res = await fetch(`${BASE_PATH}/data/densidad_manzana.json`);
    const data: DensidadData = await res.json();
    densidadDataRef.current = data;
    const counts = Object.values(data).map(d => d.count);
    const areas = Object.values(data).map(d => d.area);
    setDensidadStats({
      totalEdif: counts.reduce((a, b) => a + b, 0),
      manzanasConEdif: counts.length,
      maxCount: Math.max(...counts),
      maxArea: Math.max(...areas),
    });
    return data;
  }, []);

  // ── Label visibility ─────────────────────────────────────────────────────

  const updateLabelVisibility = useCallback((map: L.Map) => {
    const zoom = map.getZoom();
    Object.entries(labelRefs.current).forEach(([layerId, labelGroup]) => {
      const layerDef = LAYERS.find(l => l.id === layerId);
      if (!layerDef?.labelZoom) return;
      const shouldShow = visibleLayers[layerId] && zoom >= layerDef.labelZoom;
      if (shouldShow) { if (!map.hasLayer(labelGroup)) labelGroup.addTo(map); }
      else { if (map.hasLayer(labelGroup)) map.removeLayer(labelGroup); }
    });
  }, [visibleLayers]);

  // ── Label layer creation ─────────────────────────────────────────────────

  const createLabelLayer = useCallback((layerDef: typeof LAYERS[number], data: FeatureCollection): L.LayerGroup | null => {
    if (!layerDef.labelZoom) return null;
    const group = L.layerGroup();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data.features.forEach((feature: any, index: number) => {
      if (!feature.geometry) return;
      const centroid = computeCentroid(feature.geometry);
      if (!centroid) return;
      const props = (feature.properties || {}) as Record<string, unknown>;
      const text = getLabelText(layerDef.id, props, index);
      if (!text) return;

      const rotation = layerDef.id === "calle" ? computeLineAngle(feature.geometry) : 0;

      // Use translate(-50%,-50%) BEFORE rotate so text centers on the point,
      // then rotates around its own center. transform-origin must be 0 0 since
      // the element is positioned at (0,0) of a zero-size container.
      const marker = L.marker(centroid as L.LatLngExpression, {
        icon: L.divIcon({
          className: "map-label",
          html: `<span class="map-label-text" style="transform:translate(-50%,-50%) rotate(${rotation}deg);">${text}</span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
        interactive: false,
        keyboard: false,
        zIndexOffset: -100,
      });
      marker.addTo(group);
    });
    return group;
  }, []);

  // ── GeoJSON layer creation ───────────────────────────────────────────────

  const createGeoJSONLayer = useCallback((layerDef: typeof LAYERS[number], rawData: FeatureCollection): LeafletLayer => {
    const layerId = layerDef.id;
    const isPoint = layerDef.type === "circle";
    const data = layerId === "zonas" ? preprocessZonas(rawData) : rawData;
    const baseStyle = getLayerStyle(layerId);

    const layer = L.geoJSON(data, {
      style: isPoint ? undefined : (feature) => {
        if (layerId === "zonas" && feature?.properties?.ZONA) {
          return getZonaStyle(feature.properties.ZONA as string);
        }
        if (layerId === "cota10") {
          const z = Number(feature?.properties?.Z ?? feature?.properties?.COTA ?? 0);
          if (z === 10) return { color: "#f97316", weight: 1.5, opacity: 0.85 };
          return { ...baseStyle, weight: z % 5 === 0 ? 1.2 : 0.7, opacity: z % 5 === 0 ? 0.75 : 0.45 };
        }
        return baseStyle;
      },
      pointToLayer: isPoint ? (_, latlng) => getPointLayer(layerId, latlng) : undefined,
      onEachFeature: (feature, featureLayer) => {
        if (!feature.properties) return;
        const rawProps = feature.properties as Record<string, unknown>;

        let displayProps = { ...rawProps };
        if (layerId === "edif" || layerId === "edif_palta") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const coords = (feature.geometry as any)?.coordinates?.[0];
          if (coords && (!rawProps.AREA || Number(rawProps.AREA) === 0)) {
            const area = computePolygonAreaM2(coords as number[][]);
            if (area > 0) displayProps = { ...displayProps, AREA: Math.round(area) };
          }
        }

        const hasInterest = Object.keys(rawProps).some(k => {
          const kl = k.toLowerCase();
          return !["fid","handle","block","etype","space","olinetype","linetype",
                   "color","ocolor","color24","transparency","lweight","linewidth",
                   "ltscale","visible","width","thickness","ext","layer"].includes(kl);
        });
        if (!hasInterest && layerId !== "edif") return;

        featureLayer.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          if (layerId === "zonas") {
            const zonaName = rawProps.ZONA as string || null;
            setSelectedZona(zonaName);
            setSelectedFeature(null);
          } else {
            // Compute centroid [lng, lat] for zone/elevation lookup
            const centroid = computeCentroid(feature.geometry);
            const centroidLngLat: [number, number] | null = centroid
              ? [centroid[1], centroid[0]]  // centroid is [lat, lng], convert to [lng, lat]
              : null;
            setSelectedFeature({ props: displayProps, layerLabel: layerDef.label, centroid: centroidLngLat, geometry: feature.geometry });
            setSelectedZona(null);
          }
        });

        if (featureLayer instanceof L.Path) {
          if (layerId === "zonas") {
            featureLayer.on("mouseover", () => {
              const z = rawProps.ZONA as string;
              featureLayer.setStyle({ ...getZonaStyle(z), fillOpacity: 0.35 });
            });
            featureLayer.on("mouseout", () => {
              featureLayer.setStyle(getZonaStyle(rawProps.ZONA as string));
            });
          } else {
            const hoverStyle = { ...baseStyle, weight: (baseStyle.weight || 1) + 1 };
            featureLayer.on("mouseover", () => featureLayer.setStyle(hoverStyle));
            featureLayer.on("mouseout", () => {
              // For manzana in density mode: restore density color instead of base color
              if (layerId === "manzana" && densidadActiveRef.current && densidadDataRef.current) {
                const data = densidadDataRef.current;
                const maxCount = Math.max(...Object.values(data).map(d => d.count));
                featureLayer.setStyle(getManzanaDensityStyle(feature, data, maxCount));
              } else {
                featureLayer.setStyle(baseStyle);
              }
            });
          }
        }
      },
    });

    return layer;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load & add layer ─────────────────────────────────────────────────────

  const loadAndAddLayer = useCallback(async (layerDef: typeof LAYERS[number]) => {
    const map = leafletMapRef.current;
    if (!map) return;
    if (loadingRef.current.has(layerDef.id)) return;
    if (loadedSources.has(layerDef.id)) return;

    loadingRef.current.add(layerDef.id);
    try {
      const response = await fetch(`${BASE_PATH}/data/${layerDef.file}`);
      const data: FeatureCollection = await response.json();
      // Cache raw data for intersection queries
      layerCacheRef.current[layerDef.id] = data;
      if (layerDef.id === "zonas") zonasRawDataRef.current = data;
      if (layerDef.id === "cota10") cNivelDataRef.current = data;
      const geoLayer = createGeoJSONLayer(layerDef, data);
      layerRefs.current[layerDef.id] = geoLayer;

      const labelGroup = createLabelLayer(layerDef, data);
      if (labelGroup) labelRefs.current[layerDef.id] = labelGroup;

      setLoadedSources(prev => new Set([...prev, layerDef.id]));

      if (visibleLayers[layerDef.id]) {
        geoLayer.addTo(map);
        if (labelGroup) {
          if (layerDef.labelZoom && map.getZoom() >= layerDef.labelZoom) labelGroup.addTo(map);
        }
      }
    } catch (err) {
      console.error(`Failed to load layer ${layerDef.id}:`, err);
    } finally {
      loadingRef.current.delete(layerDef.id);
    }
  }, [loadedSources, visibleLayers, createGeoJSONLayer, createLabelLayer]);

  // ── Map initialization ───────────────────────────────────────────────────

  useEffect(() => {
    if (!mapContainerRef.current || leafletMapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [COLON_CENTER[1], COLON_CENTER[0]],
      zoom: COLON_ZOOM,
      zoomControl: false,
      preferCanvas: true,
    });

    leafletMapRef.current = map;
    mapRef.current = map;

    const baseTile = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
      opacity: 0.9,
    }).addTo(map);
    tileLayerRef.current = baseTile;

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 20,
      opacity: 0.7,
      pane: "overlayPane",
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ metric: true, imperial: false, position: "bottomright" }).addTo(map);

    map.on("click", () => {
      setSelectedFeature(null);
      setSelectedZona(null);
    });

    setMapReady(true);

    return () => {
      map.remove();
      leafletMapRef.current = null;
      layerRefs.current = {};
      labelRefs.current = {};
      loadingRef.current.clear();
      setLoadedSources(new Set());
      setMapReady(false);
    };
  }, []);

  // ── Eager layer loading ──────────────────────────────────────────────────

  useEffect(() => {
    if (!mapReady) return;
    LAYERS.filter(l => !l.lazy && l.defaultVisible).forEach(layerDef => {
      if (!loadedSources.has(layerDef.id) && !loadingRef.current.has(layerDef.id))
        loadAndAddLayer(layerDef);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  // ── Layer visibility sync ────────────────────────────────────────────────

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !mapReady) return;

    LAYERS.forEach(layerDef => {
      const layer = layerRefs.current[layerDef.id];
      const labelGroup = labelRefs.current[layerDef.id];
      const shouldBeVisible = visibleLayers[layerDef.id];

      if (!layer) {
        if (shouldBeVisible && !loadedSources.has(layerDef.id) && !loadingRef.current.has(layerDef.id))
          loadAndAddLayer(layerDef);
        return;
      }

      if (shouldBeVisible) {
        if (!map.hasLayer(layer)) layer.addTo(map);
        if (labelGroup && layerDef.labelZoom && map.getZoom() >= layerDef.labelZoom)
          if (!map.hasLayer(labelGroup)) labelGroup.addTo(map);
      } else {
        if (map.hasLayer(layer)) map.removeLayer(layer);
        if (labelGroup && map.hasLayer(labelGroup)) map.removeLayer(labelGroup);
      }
    });
  }, [visibleLayers, mapReady, loadedSources, loadAndAddLayer]);

  // ── Zoom label sync ──────────────────────────────────────────────────────

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !mapReady) return;
    const onZoom = () => updateLabelVisibility(map);
    map.on("zoomend", onZoom);
    return () => { map.off("zoomend", onZoom); };
  }, [mapReady, updateLabelVisibility]);

  // ── Density mode ─────────────────────────────────────────────────────────

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !mapReady) return;

    const manzLayer = layerRefs.current["manzana"] as L.GeoJSON | undefined;
    if (!manzLayer || !(manzLayer instanceof L.GeoJSON)) return;

    if (densidadActive) {
      loadDensidadData().then(data => {
        const maxCount = Math.max(...Object.values(data).map(d => d.count));
        manzLayer.setStyle((feature) => getManzanaDensityStyle(feature, data, maxCount));
      });
    } else {
      manzLayer.setStyle(getLayerStyle("manzana"));
    }
  }, [densidadActive, mapReady, loadDensidadData]);

  // ── Cadastral search result ──────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleFeatureFound = useCallback((feature: any) => {
    const map = leafletMapRef.current;
    if (!map) return;

    if (highlightRef.current) {
      map.removeLayer(highlightRef.current);
      highlightRef.current = null;
    }

    const highlight = L.geoJSON(feature, { style: HIGHLIGHT_STYLE });
    highlightRef.current = highlight;
    highlight.addTo(map);

    const bounds = getFeatureBounds(feature.geometry);
    if (bounds) map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 19, duration: 1.2 });

    const props = feature.properties as Record<string, unknown>;
    const coords = feature.geometry?.coordinates?.[0];
    if (coords) {
      const area = computePolygonAreaM2(coords as number[][]);
      if (area > 0 && (!props.AREA || Number(props.AREA) === 0))
        props.AREA = Math.round(area);
    }
    const centroid = computeCentroid(feature.geometry);
    const centroidLngLat: [number, number] | null = centroid ? [centroid[1], centroid[0]] : null;
    setSelectedFeature({ props, layerLabel: "Parcela catastral", centroid: centroidLngLat, geometry: feature.geometry });
    setSelectedZona(null);
    setSearchPanelOpen(false);
  }, []);

  const handleToggleLayer = useCallback((layerId: string) => {
    const layerDef = LAYERS.find(l => l.id === layerId);
    if (!layerDef) return;
    const willBeVisible = !visibleLayers[layerId];
    if (willBeVisible && layerDef.lazy && !loadedSources.has(layerId) && !loadingRef.current.has(layerId) && mapReady)
      loadAndAddLayer(layerDef);
    setVisibleLayers(prev => ({ ...prev, [layerId]: willBeVisible }));
  }, [visibleLayers, mapReady, loadedSources, loadAndAddLayer]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-background">
      <Header
        onToggleLayers={() => setLayersPanelOpen(o => !o)}
        layersPanelOpen={layersPanelOpen}
        onToggleCadastral={() => setSearchPanelOpen(o => !o)}
        cadastralOpen={searchPanelOpen}
        onToggleDensidad={() => setDensidadPanelOpen(o => !o)}
        densidadActive={densidadActive}
        densidadPanelOpen={densidadPanelOpen}
        onToggleZonaLegend={() => setZonaLegendOpen(o => !o)}
        zonaLegendOpen={zonaLegendOpen}
        onToggleAnalysis={() => setAnalysisPanelOpen(o => !o)}
        analysisPanelOpen={analysisPanelOpen}
        onToggleUpload={() => setUploadPanelOpen(o => !o)}
        uploadPanelOpen={uploadPanelOpen}
        measureMode={measureMode}
        onChangeMeasureMode={setMeasureMode}
        mapRef={mapRef as React.RefObject<L.Map | null>}
        onAddressFound={handleAddressFound}
        onOpenAuthPanel={() => setAuthPanelOpen(true)}
      />

      <div
        ref={mapContainerRef}
        className="absolute inset-0 map-container"
        style={{ top: 52 }}
        data-testid="map-container"
      />

      {!mapReady && (
        <div className="absolute inset-0 flex items-center justify-center z-50" style={{ top: 52, background: "hsl(220 18% 11%)" }}>
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Cargando datos geoespaciales...</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Colón, Entre Ríos</p>
          </div>
        </div>
      )}

      {layersPanelOpen && (
        <LayersPanel
          visibleLayers={visibleLayers}
          onToggleLayer={handleToggleLayer}
          isOpen={layersPanelOpen}
          onClose={() => setLayersPanelOpen(false)}
        />
      )}

      {searchPanelOpen && (
        <CadastralSearch
          basePath={BASE_PATH}
          onFeatureFound={handleFeatureFound}
          onClose={() => setSearchPanelOpen(false)}
        />
      )}

      {selectedFeature && !selectedZona && (
        <FeatureInfo
          feature={selectedFeature.props}
          layerLabel={selectedFeature.layerLabel}
          onClose={() => setSelectedFeature(null)}
          onPrint={handlePrint}
        />
      )}

      {reportData && (
        <ParcelReport
          data={reportData}
          onClose={() => setReportData(null)}
        />
      )}

      {selectedZona && (
        <ZonaPanel
          zonaName={selectedZona}
          onClose={() => setSelectedZona(null)}
        />
      )}

      {densidadPanelOpen && (
        <DensidadPanel
          active={densidadActive}
          onToggle={() => setDensidadActive(v => !v)}
          onClose={() => setDensidadPanelOpen(false)}
          stats={densidadStats}
        />
      )}

      <ZonaLegend open={zonaLegendOpen} onClose={() => setZonaLegendOpen(false)} />

      {/* ── New panels ──────────────────────────────────────────────────── */}

      {analysisPanelOpen && (
        <AnalysisPanel
          onClose={() => setAnalysisPanelOpen(false)}
          onActivateDensidad={() => {
            setDensidadPanelOpen(true);
            setDensidadActive(v => !v);
          }}
          densidadActive={densidadActive}
          canRunAnalysis={user ? hasPermission(user.role, "canRunAnalysis") : false}
          basePath={BASE_PATH}
        />
      )}

      {uploadPanelOpen && (
        <LayerUpload
          mapRef={mapRef as React.RefObject<L.Map | null>}
          onClose={() => setUploadPanelOpen(false)}
          canUpload={user ? hasPermission(user.role, "canUploadLayers") : false}
        />
      )}

      {authPanelOpen && (
        <AuthPanel onClose={() => setAuthPanelOpen(false)} />
      )}

      {/* ── Measure tool (overlay + toolbar) ─────────────────────────── */}
      <MeasureTool
        mapRef={mapRef as React.RefObject<L.Map | null>}
        mode={measureMode}
        onChangeMode={setMeasureMode}
      />

      {/* ── Base map switcher ─────────────────────────────────────────── */}
      <BaseMapSelector
        mapRef={mapRef as React.RefObject<L.Map | null>}
        tileLayerRef={tileLayerRef}
      />

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none" style={{ zIndex: 500 }}>
        <div className="text-[10px] text-muted-foreground/50 bg-background/70 px-2 py-0.5 rounded-full">
          Datos: Municipalidad de Colón · IGN · OSM
        </div>
      </div>
    </div>
  );
}
