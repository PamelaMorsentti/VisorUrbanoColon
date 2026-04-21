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
import RegionalInfoPanel from "@/components/RegionalInfoPanel";
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
type ZonaTransform = { rotateDeg: number; offsetLng: number; offsetLat: number };

type PublicationLevel = "public" | "professional" | "admin";
type ObrasYearPreset = "all" | "current" | "last3" | "last5" | "custom";
type WorksSummary = {
  count: number;
  totalM2Construir: number;
  totalM2Relevado: number;
  relevamientos: number;
  nuevas: number;
  ampliaciones: number;
  proyectadas: number;
};

type WorksRanking = {
  destinos: Array<{ label: string; count: number }>;
  tipos: Array<{ label: string; count: number }>;
  zonas: Array<{ label: string; count: number }>;
};

type ObrasHeatMetric = "count" | "m2";

type ObrasHeatStats = {
  barriosConObras: number;
  maxCount: number;
  maxM2: number;
};

const DEFAULT_ZONA_TRANSFORM: ZonaTransform = {
  rotateDeg: 0.79,
  offsetLng: 0,
  offsetLat: -0.00072,
};
const ZONA_TRANSFORM_STORAGE_KEY = "colon.zonasTransform";

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

function preprocessZonas(data: FeatureCollection, transform: ZonaTransform = DEFAULT_ZONA_TRANSFORM): FeatureCollection {
  const { rotateDeg, offsetLng, offsetLat } = transform;

  const toRadians = (deg: number) => (deg * Math.PI) / 180;
  const angle = toRadians(rotateDeg);
  const c = Math.cos(angle);
  const s = Math.sin(angle);

  const allCoords: Array<[number, number]> = [];
  const collectCoords = (coords: unknown): void => {
    if (!Array.isArray(coords) || coords.length === 0) return;
    if (typeof coords[0] === "number") {
      allCoords.push([Number(coords[0]), Number(coords[1])]);
      return;
    }
    (coords as unknown[]).forEach(collectCoords);
  };

  (data.features || []).forEach((f: FeatureCollection) => collectCoords(f?.geometry?.coordinates));
  const centerLng = allCoords.length
    ? allCoords.reduce((acc, p) => acc + p[0], 0) / allCoords.length
    : 0;
  const centerLat = allCoords.length
    ? allCoords.reduce((acc, p) => acc + p[1], 0) / allCoords.length
    : 0;

  const transformCoords = (coords: unknown): unknown => {
    if (!Array.isArray(coords) || coords.length === 0) return coords;
    if (typeof coords[0] === "number") {
      const x = Number(coords[0]);
      const y = Number(coords[1]);
      const dx = x - centerLng;
      const dy = y - centerLat;
      const rx = dx * c - dy * s + centerLng + offsetLng;
      const ry = dx * s + dy * c + centerLat + offsetLat;
      const z = (coords as number[])[2];
      return Number.isFinite(z) ? [rx, ry, z] : [rx, ry];
    }
    return (coords as unknown[]).map(transformCoords);
  };

  return {
    ...data,
    features: data.features.map((f: FeatureCollection) => {
      const transformedGeometry = f.geometry
        ? { ...f.geometry, coordinates: transformCoords(f.geometry.coordinates) }
        : f.geometry;

      if (f.geometry?.type === "LineString") {
        const coords = [...(transformedGeometry?.coordinates || [])];
        const first = coords[0], last = coords[coords.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) coords.push(coords[0]);
        return { ...f, geometry: { type: "Polygon", coordinates: [coords] } };
      }
      return { ...f, geometry: transformedGeometry };
    }),
  };
}

function filterOutlierFeatures(data: FeatureCollection): FeatureCollection {
  // Broad envelope around Colon/Entre Rios to drop corrupted geometries.
  // This catches malformed records (e.g., lon/lat far away) that can create
  // visual artifacts like apparent tilt/shift when rendered.
  const MIN_LNG = -59;
  const MAX_LNG = -57;
  const MIN_LAT = -33;
  const MAX_LAT = -31;

  const isInEnvelope = (x: number, y: number) =>
    x >= MIN_LNG && x <= MAX_LNG && y >= MIN_LAT && y <= MAX_LAT;

  const hasOnlyValidCoords = (coords: unknown): boolean => {
    if (!Array.isArray(coords) || coords.length === 0) return false;
    if (typeof coords[0] === "number") {
      const x = Number(coords[0]);
      const y = Number(coords[1]);
      return Number.isFinite(x) && Number.isFinite(y) && isInEnvelope(x, y);
    }
    return (coords as unknown[]).every(hasOnlyValidCoords);
  };

  return {
    ...data,
    features: (data.features || []).filter((f: FeatureCollection) =>
      hasOnlyValidCoords(f?.geometry?.coordinates),
    ),
  };
}

function getGeometryRings(geometry: Geometry): number[][][] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates || [];
  if (geometry.type === "MultiPolygon") return (geometry.coordinates || []).flat(1);
  return [];
}

function resolveZonaNameAtPoint(zonasData: FeatureCollection, lng: number, lat: number): string | null {
  let bestZona: string | null = null;
  let bestArea = Number.POSITIVE_INFINITY;

  for (const f of zonasData.features || []) {
    const zona = f?.properties?.ZONA;
    if (!zona) continue;

    const rings = getGeometryRings(f.geometry);
    for (const ring of rings) {
      if (!ring?.length) continue;
      if (!pointInPolygon(lng, lat, ring)) continue;

      const area = computePolygonAreaM2(ring);
      if (area > 0 && area < bestArea) {
        bestArea = area;
        bestZona = String(zona);
      }
    }
  }

  return bestZona;
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

function roleToPublicationLevel(role: string | undefined): PublicationLevel {
  if (role === "admin") return "admin";
  if (role === "registrado") return "professional";
  return "public";
}

function colorByDestiny(destino: unknown): string {
  const value = String(destino ?? "").toLowerCase();
  if (value.includes("mixto")) return "#8b5cf6";
  if (value.includes("vivienda")) return "#0f766e";
  if (value.includes("comercial")) return "#d97706";
  if (value.includes("product")) return "#0ea5e9";
  return "#64748b";
}

function isReasonablePoint(lat: number, lon: number): boolean {
  return Number.isFinite(lat)
    && Number.isFinite(lon)
    && lat > -33.5
    && lat < -31
    && lon > -59
    && lon < -57;
}

function extractVisadoYear(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const match = text.match(/(19|20)\d{2}/);
  if (!match) return null;
  const year = Number(match[0]);
  return Number.isFinite(year) ? year : null;
}

function isTruthyFlag(value: unknown): boolean {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "1" || v === "si" || v === "sí" || v === "true" || v === "x";
}

function getWorkM2Relevado(props: Record<string, unknown>): number {
  const vivienda = parseNumericValue(props.m_existentes_relevados_vivienda);
  const local = parseNumericValue(props.m_existentes_relevados_local);
  return vivienda + local;
}

function getWorkDeclaration(props: Record<string, unknown>): {
  relevamiento: boolean;
  nueva: boolean;
  ampliacion: boolean;
  proyectada: boolean;
} {
  return {
    relevamiento: isTruthyFlag(props.relevamiento_o_existente),
    nueva: isTruthyFlag(props.a_contruir_obra_nueva),
    ampliacion: isTruthyFlag(props.ampliacion_de_obra_existente),
    proyectada: isTruthyFlag(props.proyectado_no_iniciado),
  };
}

function getPresetYears(allYears: number[], preset: Exclude<ObrasYearPreset, "custom">): number[] {
  if (preset === "all") return [...allYears];
  const now = new Date().getFullYear();
  if (preset === "current") {
    if (allYears.includes(now)) return [now];
    return allYears.length ? [allYears[0]] : [];
  }
  if (preset === "last3") {
    return allYears.filter(y => y >= now - 2);
  }
  if (preset === "last5") {
    return allYears.filter(y => y >= now - 4);
  }
  return [...allYears];
}

function sameYearList(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function rankTop(values: Record<string, number>, top = 5): Array<{ label: string; count: number }> {
  return Object.entries(values)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, top);
}

function parseNumericValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.includes(",") && raw.includes(".")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function getWorkM2(props: Record<string, unknown>): number {
  const total = parseNumericValue(props.m2_construir_total ?? props.m2_a_construir_total);
  if (total > 0) return total;
  const vivienda = parseNumericValue(props.m_a_construir_vivienda);
  const local = parseNumericValue(props.m_a_construir_local);
  return vivienda + local;
}

function nonEmptyText(value: unknown, fallback = "-"): string {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : fallback;
}

function formatM2(value: number): string {
  return `${Math.round(Math.max(0, value)).toLocaleString("es-AR")} m²`;
}

function popupForWorkFeature(props: Record<string, unknown>, level: PublicationLevel): string {
  const title = nonEmptyText(props.raw_ubicacion ?? props.ubicacion ?? props.direccion_de_obra, "Obra");
  const tipo = nonEmptyText(props.tipo ?? props.tipo_obra);
  const destino = nonEmptyText(props.destino_uso ?? props.destino);
  const zona = nonEmptyText(props.zonificacion ?? props.zona, "Sin zonificacion");
  const m2Construir = getWorkM2(props);
  const m2Relevado = getWorkM2Relevado(props);
  const declaration = getWorkDeclaration(props);
  const status = nonEmptyText(props.location_verification_status ?? props.estado_verificacion);
  const legajo = nonEmptyText(props.legajo_canonico);
  const ncp = nonEmptyText(props.ncp_formatted ?? props.ncp);
  const fechaVisado = nonEmptyText(props.fecha_de_visado);
  const declarationItems: string[] = [];
  if (declaration.relevamiento) declarationItems.push("Relevamiento");
  if (declaration.nueva) declarationItems.push("Obra nueva");
  if (declaration.ampliacion) declarationItems.push("Ampliacion");
  if (declaration.proyectada) declarationItems.push("Proyectada no iniciada");

  let html = `<div style="min-width:220px">`
    + `<div style="font-weight:700;margin-bottom:4px">${title}</div>`
    + `<div><b>Tipo:</b> ${tipo}</div>`
    + `<div><b>Destino:</b> ${destino}</div>`
    + `<div><b>Zonificacion:</b> ${zona}</div>`
    + `<div><b>Declaracion:</b> ${declarationItems.length ? declarationItems.join(" / ") : "No especificada"}</div>`;

  if (m2Construir > 0) {
    html += `<div><b>m2 a construir:</b> ${formatM2(m2Construir)}</div>`;
  }
  if (m2Relevado > 0) {
    html += `<div><b>m2 relevados:</b> ${formatM2(m2Relevado)}</div>`;
  }
  if (m2Construir <= 0 && m2Relevado <= 0) {
    html += `<div><b>m2 declarados:</b> ${formatM2(0)}</div>`;
  }

  if (fechaVisado !== "-") {
    html += `<div><b>Fecha visado:</b> ${fechaVisado}</div>`;
  }

  if (level !== "public") {
    if (status !== "-") {
      html += `<div><b>Estado verificación:</b> ${status}</div>`;
    }
  }
  if (level === "admin") {
    if (legajo !== "-") {
      html += `<div><b>Legajo:</b> ${legajo}</div>`;
    }
    if (ncp !== "-") {
      html += `<div><b>NCP:</b> ${ncp}</div>`;
    }
  }
  html += `</div>`;
  return html;
}

const HIGHLIGHT_STYLE: L.PathOptions = {
  color: "#facc15", weight: 3, opacity: 1,
  fillColor: "#facc15", fillOpacity: 0.3,
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function MapViewer() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const publicationLevel = roleToPublicationLevel(user?.role);
  const dashboardUrl = `${BASE_PATH}/tools/analytics-dashboard.html`;
  const adminEditorUrl = `${BASE_PATH}/tools/admin-editor.html`;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const baseLabelLayerRef = useRef<L.TileLayer | null>(null);
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
  const worksLayerRef = useRef<L.GeoJSON | null>(null);
  const obrasHeatLayerRef = useRef<L.GeoJSON | null>(null);

  const [layersPanelOpen, setLayersPanelOpen] = useState(false);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [densidadPanelOpen, setDensidadPanelOpen] = useState(false);
  const [zonaLegendOpen, setZonaLegendOpen] = useState(false);
  const [densidadActive, setDensidadActive] = useState(false);
  const [measureMode, setMeasureMode] = useState<MeasureMode>("none");
  const [authPanelOpen, setAuthPanelOpen] = useState(false);
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false);
  const [analysisPanelOpen, setAnalysisPanelOpen] = useState(false);
  const [regionalInfoOpen, setRegionalInfoOpen] = useState(false);
  const [planosActive, setPlanosActive] = useState(true);
  const [worksMeta, setWorksMeta] = useState<{ level: PublicationLevel; count: number } | null>(null);
  const [obrasYearOptions, setObrasYearOptions] = useState<number[]>([]);
  const [selectedObrasYears, setSelectedObrasYears] = useState<number[]>([]);
  const [obrasYearPreset, setObrasYearPreset] = useState<ObrasYearPreset>("all");
  const [worksSummary, setWorksSummary] = useState<WorksSummary | null>(null);
  const [worksRanking, setWorksRanking] = useState<WorksRanking | null>(null);
  const [filteredWorksFeatures, setFilteredWorksFeatures] = useState<Array<{ geometry?: { coordinates?: unknown[] }; properties?: Record<string, unknown> }>>([]);
  const [obrasHeatmapActive, setObrasHeatmapActive] = useState(false);
  const [obrasHeatmapMetric, setObrasHeatmapMetric] = useState<ObrasHeatMetric>("count");
  const [obrasHeatStats, setObrasHeatStats] = useState<ObrasHeatStats | null>(null);
  const [obrasHeatBarrioData, setObrasHeatBarrioData] = useState<Array<{ barrio: string; count: number; m2: number }>>([]);
  const [densidadStats, setDensidadStats] = useState<{
    totalEdif: number; manzanasConEdif: number; maxCount: number; maxArea: number;
  } | null>(null);
  const [zonaTransform, setZonaTransform] = useState<ZonaTransform>(() => {
    if (user?.role !== "admin") return DEFAULT_ZONA_TRANSFORM;
    if (typeof window === "undefined") return DEFAULT_ZONA_TRANSFORM;
    try {
      const raw = window.localStorage.getItem(ZONA_TRANSFORM_STORAGE_KEY);
      if (!raw) return DEFAULT_ZONA_TRANSFORM;
      const parsed = JSON.parse(raw) as Partial<ZonaTransform>;
      const rotateDeg = Number(parsed.rotateDeg ?? 0);
      const offsetLng = Number(parsed.offsetLng ?? 0);
      const offsetLat = Number(parsed.offsetLat ?? 0);
      if (!Number.isFinite(rotateDeg) || !Number.isFinite(offsetLng) || !Number.isFinite(offsetLat))
        return DEFAULT_ZONA_TRANSFORM;
      return { rotateDeg, offsetLng, offsetLat };
    } catch {
      return DEFAULT_ZONA_TRANSFORM;
    }
  });

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

  const worksDatasetUrl = `${BASE_PATH}/data/planos/obras-${publicationLevel}.geojson`;

  // Keep ref in sync with state for use in closures
  useEffect(() => { densidadActiveRef.current = densidadActive; }, [densidadActive]);

  // ── On-demand layer data fetcher (with cache) ────────────────────────────

  const fetchAndCacheLayer = useCallback(async (layerId: string): Promise<FeatureCollection | null> => {
    if (layerCacheRef.current[layerId]) return layerCacheRef.current[layerId];
    const layerDef = LAYERS.find(l => l.id === layerId);
    if (!layerDef) return null;
    try {
      const r = await fetch(`${BASE_PATH}/data/${layerDef.file}`);
      const rawData: FeatureCollection = await r.json();
      const normalized = layerId === "zonas" ? preprocessZonas(rawData, zonaTransform) : rawData;
      const data = filterOutlierFeatures(normalized);
      layerCacheRef.current[layerId] = data;
      if (layerId === "zonas") zonasRawDataRef.current = data;
      if (layerId === "cota10") cNivelDataRef.current = data;
      return data;
    } catch { return null; }
  }, [zonaTransform]);

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
      zonaName = resolveZonaNameAtPoint(zonasData, lng, lat);
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
            const zonaName = resolveZonaNameAtPoint(data, e.latlng.lng, e.latlng.lat)
              ?? (rawProps.ZONA as string || null);
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
      const rawData: FeatureCollection = await response.json();
      const normalized = layerDef.id === "zonas" ? preprocessZonas(rawData, zonaTransform) : rawData;
      const data = filterOutlierFeatures(normalized);
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
  }, [loadedSources, visibleLayers, createGeoJSONLayer, createLabelLayer, zonaTransform]);

  // ── Persist + hot-reload zoning transform ───────────────────────────────

  useEffect(() => {
    if (typeof window !== "undefined" && isAdmin) {
      window.localStorage.setItem(ZONA_TRANSFORM_STORAGE_KEY, JSON.stringify(zonaTransform));
    }

    const map = leafletMapRef.current;
    if (!mapReady || !map) return;

    delete layerCacheRef.current.zonas;
    zonasRawDataRef.current = null;

    const zonasLayer = layerRefs.current.zonas;
    if (zonasLayer && map.hasLayer(zonasLayer)) map.removeLayer(zonasLayer);
    delete layerRefs.current.zonas;

    const zonasLabels = labelRefs.current.zonas;
    if (zonasLabels && map.hasLayer(zonasLabels)) map.removeLayer(zonasLabels);
    delete labelRefs.current.zonas;

    setLoadedSources(prev => {
      if (!prev.has("zonas")) return prev;
      const next = new Set(prev);
      next.delete("zonas");
      return next;
    });

    const zonasDef = LAYERS.find(l => l.id === "zonas");
    if (zonasDef && visibleLayers.zonas) {
      loadAndAddLayer(zonasDef);
    }
  }, [zonaTransform, mapReady, visibleLayers.zonas, loadAndAddLayer, isAdmin]);

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

    const baseLabels = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 20,
      opacity: 0.7,
      pane: "overlayPane",
    }).addTo(map);
    baseLabelLayerRef.current = baseLabels;

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
      baseLabelLayerRef.current = null;
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

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !mapReady) return;

    if (worksLayerRef.current) {
      if (map.hasLayer(worksLayerRef.current)) {
        map.removeLayer(worksLayerRef.current);
      }
      worksLayerRef.current = null;
    }

    let cancelled = false;
    void fetch(worksDatasetUrl)
      .then((res) => {
        if (!res.ok) throw new Error("No se pudo cargar capa de obras");
        return res.json() as Promise<FeatureCollection>;
      })
      .then((geojson) => {
        if (cancelled) return;

        const allValidFeatures = Array.isArray(geojson.features)
          ? geojson.features.filter((f: { geometry?: { coordinates?: unknown[] } }) => {
            const coords = f.geometry?.coordinates;
            if (!Array.isArray(coords) || coords.length < 2) return false;
            return isReasonablePoint(Number(coords[1]), Number(coords[0]));
          })
          : [];

        const yearSet = new Set<number>();
        allValidFeatures.forEach((f: { properties?: Record<string, unknown> }) => {
          const y = extractVisadoYear(f.properties?.fecha_de_visado);
          if (y) yearSet.add(y);
        });
        const yearsDesc = Array.from(yearSet).sort((a, b) => b - a);
        if (!sameYearList(yearsDesc, obrasYearOptions)) {
          setObrasYearOptions(yearsDesc);
        }

        const basePreset = obrasYearPreset === "custom" ? "all" : obrasYearPreset;
        const validSelectedYears = selectedObrasYears.filter(y => yearSet.has(y));
        const nextSelectedYears = validSelectedYears.length > 0
          ? validSelectedYears
          : getPresetYears(yearsDesc, basePreset);
        const ensuredSelection = nextSelectedYears.length > 0 ? nextSelectedYears : yearsDesc;

        if (!sameYearList(ensuredSelection, selectedObrasYears)) {
          setSelectedObrasYears(ensuredSelection);
        }

        const selectedSet = new Set(ensuredSelection);
        const includeNoYear = ensuredSelection.length === yearsDesc.length;
        const filteredFeatures = allValidFeatures.filter((f: { properties?: Record<string, unknown> }) => {
          const y = extractVisadoYear(f.properties?.fecha_de_visado);
          if (!y) return includeNoYear;
          return selectedSet.has(y);
        });
        setFilteredWorksFeatures(filteredFeatures as Array<{ geometry?: { coordinates?: unknown[] }; properties?: Record<string, unknown> }>);

        const summary: WorksSummary = {
          count: 0,
          totalM2Construir: 0,
          totalM2Relevado: 0,
          relevamientos: 0,
          nuevas: 0,
          ampliaciones: 0,
          proyectadas: 0,
        };

        const destinoCounts: Record<string, number> = {};
        const tipoCounts: Record<string, number> = {};
        const zonaCounts: Record<string, number> = {};

        filteredFeatures.forEach((f: { properties?: Record<string, unknown> }) => {
          const props = (f.properties ?? {}) as Record<string, unknown>;
          const m2Construir = getWorkM2(props);
          const m2Relevado = getWorkM2Relevado(props);
          const declaration = getWorkDeclaration(props);
          const destino = nonEmptyText(props.destino_uso ?? props.destino, "Sin destino");
          const tipo = nonEmptyText(props.tipo ?? props.tipo_obra, "Sin tipo");
          const zona = nonEmptyText(props.zonificacion ?? props.zona, "Sin zonificacion");
          summary.count += 1;
          summary.totalM2Construir += m2Construir;
          summary.totalM2Relevado += m2Relevado;
          if (declaration.relevamiento) summary.relevamientos += 1;
          if (declaration.nueva) summary.nuevas += 1;
          if (declaration.ampliacion) summary.ampliaciones += 1;
          if (declaration.proyectada) summary.proyectadas += 1;
          destinoCounts[destino] = (destinoCounts[destino] || 0) + 1;
          tipoCounts[tipo] = (tipoCounts[tipo] || 0) + 1;
          zonaCounts[zona] = (zonaCounts[zona] || 0) + 1;
        });
        setWorksSummary(summary);
        setWorksRanking({
          destinos: rankTop(destinoCounts, 5),
          tipos: rankTop(tipoCounts, 5),
          zonas: rankTop(zonaCounts, 5),
        });

        setWorksMeta({ level: publicationLevel, count: filteredFeatures.length });

        if (!planosActive) {
          return;
        }

        const layer = L.geoJSON({ ...geojson, features: filteredFeatures }, {
          pointToLayer: (feature, latlng) => {
            const props = (feature.properties ?? {}) as Record<string, unknown>;
            const m2 = Math.max(getWorkM2(props), getWorkM2Relevado(props));
            const r = Math.max(4, Math.min(12, 4 + Math.sqrt(Math.max(0, m2)) / 4));
            const color = colorByDestiny(props.destino_uso ?? props.destino);
            return L.circleMarker(latlng, {
              radius: r,
              color,
              fillColor: color,
              fillOpacity: 0.82,
              weight: 1.3,
              opacity: 0.95,
            });
          },
          filter: (feature) => {
            const coords = (feature.geometry as { coordinates?: unknown[] } | null | undefined)?.coordinates;
            if (!Array.isArray(coords) || coords.length < 2) return false;
            const lon = Number(coords[0]);
            const lat = Number(coords[1]);
            return isReasonablePoint(lat, lon);
          },
          onEachFeature: (feature, featureLayer) => {
            const props = (feature.properties ?? {}) as Record<string, unknown>;
            featureLayer.bindPopup(popupForWorkFeature(props, publicationLevel));
          },
        });

        layer.addTo(map);
        worksLayerRef.current = layer;
      })
      .catch(() => {
        if (!cancelled) {
          setWorksMeta(null);
          setWorksSummary(null);
          setWorksRanking(null);
          setFilteredWorksFeatures([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mapReady, planosActive, publicationLevel, worksDatasetUrl, obrasYearOptions, selectedObrasYears, obrasYearPreset]);

  // ── Obras temporal heatmap (barrios) ─────────────────────────────────────

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !mapReady) return;

    if (obrasHeatLayerRef.current) {
      if (map.hasLayer(obrasHeatLayerRef.current)) map.removeLayer(obrasHeatLayerRef.current);
      obrasHeatLayerRef.current = null;
    }

    if (!obrasHeatmapActive) {
      setObrasHeatStats(null);
      return;
    }

    let cancelled = false;
    void fetch(`${BASE_PATH}/data/barrios.geojson`)
      .then((res) => {
        if (!res.ok) throw new Error("No se pudo cargar barrios.geojson");
        return res.json() as Promise<FeatureCollection>;
      })
      .then((barriosGeojson) => {
        if (cancelled) return;

        const barrios = Array.isArray(barriosGeojson.features) ? barriosGeojson.features : [];

        type BarrioAgg = { count: number; m2: number };
        const aggs: BarrioAgg[] = barrios.map(() => ({ count: 0, m2: 0 }));

        filteredWorksFeatures.forEach((work) => {
          const coords = work.geometry?.coordinates;
          if (!Array.isArray(coords) || coords.length < 2) return;
          const lng = Number(coords[0]);
          const lat = Number(coords[1]);
          if (!isReasonablePoint(lat, lng)) return;

          const props = (work.properties ?? {}) as Record<string, unknown>;
          const m2 = getWorkM2(props) + getWorkM2Relevado(props);

          for (let i = 0; i < barrios.length; i++) {
            const rings = getGeometryRings(barrios[i].geometry);
            if (rings.some((ring) => pointInPolygon(lng, lat, ring))) {
              aggs[i].count += 1;
              aggs[i].m2 += m2;
              break;
            }
          }
        });

        const maxCount = Math.max(0, ...aggs.map(a => a.count));
        const maxM2 = Math.max(0, ...aggs.map(a => a.m2));
        const maxValue = obrasHeatmapMetric === "count" ? maxCount : maxM2;

        const barrioRows = barrios.map((feature: { properties?: Record<string, unknown> }, i: number) => ({
          barrio: String(feature.properties?.NOMBRE ?? feature.properties?.BARRIO ?? `Barrio ${i + 1}`),
          count: aggs[i].count,
          m2: aggs[i].m2,
        })).sort((a, b) => b.count - a.count);
        setObrasHeatBarrioData(barrioRows);

        setObrasHeatStats({
          barriosConObras: aggs.filter(a => a.count > 0).length,
          maxCount,
          maxM2,
        });

        const thematic = {
          ...barriosGeojson,
          features: barrios.map((feature: { properties?: Record<string, unknown> }, i: number) => ({
            ...feature,
            properties: {
              ...(feature.properties ?? {}),
              __obras_count: aggs[i].count,
              __obras_m2: aggs[i].m2,
            },
          })),
        } as FeatureCollection;

        const layer = L.geoJSON(thematic, {
          style: (feature) => {
            const props = (feature?.properties ?? {}) as Record<string, unknown>;
            const value = obrasHeatmapMetric === "count"
              ? Number(props.__obras_count ?? 0)
              : Number(props.__obras_m2 ?? 0);
            const fillColor = value > 0 ? getDensityColor(value, Math.max(maxValue, 1)) : "#0f172a";
            return {
              color: "#93c5fd",
              weight: value > 0 ? 1.4 : 0.8,
              opacity: 0.85,
              fillColor,
              fillOpacity: value > 0 ? 0.55 : 0.08,
            } as L.PathOptions;
          },
          onEachFeature: (feature, featureLayer) => {
            const props = (feature.properties ?? {}) as Record<string, unknown>;
            const barrio = String(props.NOMBRE ?? props.BARRIO ?? "Barrio");
            const count = Number(props.__obras_count ?? 0);
            const m2 = Number(props.__obras_m2 ?? 0);
            featureLayer.bindPopup(
              `<div style="min-width:220px">`
              + `<div style="font-weight:700;margin-bottom:4px">${barrio}</div>`
              + `<div><b>Obras:</b> ${count.toLocaleString("es-AR")}</div>`
              + `<div><b>m2 declarados:</b> ${Math.round(m2).toLocaleString("es-AR")} m²</div>`
              + `</div>`,
            );
          },
        });

        layer.addTo(map);
        layer.bringToFront();
        obrasHeatLayerRef.current = layer;
      })
      .catch(() => {
        if (!cancelled) setObrasHeatStats(null);
      });

    return () => {
      cancelled = true;
    };
  }, [mapReady, obrasHeatmapActive, obrasHeatmapMetric, filteredWorksFeatures]);

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

  const handleSelectObrasPreset = useCallback((preset: "all" | "current" | "last3" | "last5") => {
    setObrasYearPreset(preset);
    const nextYears = getPresetYears(obrasYearOptions, preset);
    if (nextYears.length > 0) {
      setSelectedObrasYears(nextYears);
    }
    setPlanosActive(true);
  }, [obrasYearOptions]);

  const handleToggleObrasYear = useCallback((year: number) => {
    setObrasYearPreset("custom");
    setSelectedObrasYears((prev) => {
      const has = prev.includes(year);
      const next = has ? prev.filter(y => y !== year) : [...prev, year].sort((a, b) => b - a);
      if (next.length === 0) return prev;
      return next;
    });
    setPlanosActive(true);
  }, []);

  const handleSelectAllObrasYears = useCallback(() => {
    setObrasYearPreset("all");
    setSelectedObrasYears(obrasYearOptions);
    setPlanosActive(true);
  }, [obrasYearOptions]);

  const handleToggleObrasHeatmap = useCallback(() => {
    setObrasHeatmapActive(v => !v);
  }, []);

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
        planosActive={planosActive}
        onTogglePlanosVisibility={() => setPlanosActive(v => !v)}
        obrasYearOptions={obrasYearOptions}
        selectedObrasYears={selectedObrasYears}
        obrasYearPreset={obrasYearPreset}
        onSelectObrasPreset={handleSelectObrasPreset}
        onToggleObrasYear={handleToggleObrasYear}
        onSelectAllObrasYears={handleSelectAllObrasYears}
        obrasSummary={worksSummary}
        obrasRanking={worksRanking}
        measureMode={measureMode}
        onChangeMeasureMode={setMeasureMode}
        mapRef={mapRef as React.RefObject<L.Map | null>}
        onAddressFound={handleAddressFound}
        onOpenAuthPanel={() => setAuthPanelOpen(true)}
        onToggleRegionalInfo={() => setRegionalInfoOpen(o => !o)}
        regionalInfoOpen={regionalInfoOpen}
        dashboardUrl={dashboardUrl}
        adminEditorUrl={adminEditorUrl}
      />

      <div
        ref={mapContainerRef}
        className="absolute inset-0 map-container"
        style={{ top: 52 }}
        data-testid="map-container"
      />

      {visibleLayers.zonas && isAdmin && (
        <div className="absolute z-[900] right-4 top-16 bg-black/75 text-white rounded-md border border-white/15 p-3 w-72 backdrop-blur-sm">
          <p className="text-xs font-semibold tracking-wide uppercase text-white/85">Calibracion zonificacion</p>
          <p className="text-[11px] text-white/65 mt-1">Ajuste visual temporal. Se guarda en este navegador.</p>

          <div className="mt-3 space-y-2">
            <label className="block text-[11px] text-white/80">Rotacion ({zonaTransform.rotateDeg.toFixed(2)}°)</label>
            <input
              type="range"
              min={-3}
              max={3}
              step={0.01}
              value={zonaTransform.rotateDeg}
              onChange={(e) => setZonaTransform(prev => ({ ...prev, rotateDeg: Number(e.target.value) }))}
              className="w-full"
            />

            <label className="block text-[11px] text-white/80">Offset Este/Oeste ({zonaTransform.offsetLng.toFixed(5)})</label>
            <input
              type="range"
              min={-0.003}
              max={0.003}
              step={0.00002}
              value={zonaTransform.offsetLng}
              onChange={(e) => setZonaTransform(prev => ({ ...prev, offsetLng: Number(e.target.value) }))}
              className="w-full"
            />

            <label className="block text-[11px] text-white/80">Offset Norte/Sur ({zonaTransform.offsetLat.toFixed(5)})</label>
            <input
              type="range"
              min={-0.003}
              max={0.003}
              step={0.00002}
              value={zonaTransform.offsetLat}
              onChange={(e) => setZonaTransform(prev => ({ ...prev, offsetLat: Number(e.target.value) }))}
              className="w-full"
            />
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setZonaTransform(DEFAULT_ZONA_TRANSFORM)}
              className="px-2 py-1 text-[11px] rounded bg-white/10 hover:bg-white/20 border border-white/20"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {worksMeta && planosActive && (
        <div className="absolute z-[900] left-3 bottom-24 bg-black/70 text-white rounded-md border border-white/10 px-3 py-2 backdrop-blur-sm">
          <div className="text-[10px] uppercase tracking-wide text-white/70">Obras geolocalizadas</div>
          <div className="text-xs font-semibold">Nivel: {worksMeta.level} · {worksMeta.count} puntos</div>
          {selectedObrasYears.length > 0 && (
            <div className="text-[11px] text-white/75">Anos: {selectedObrasYears.join(", ")}</div>
          )}
        </div>
      )}

      {obrasHeatmapActive && obrasHeatStats && (
        <div className="absolute z-[900] left-3 bottom-40 bg-black/80 text-white rounded-xl border border-white/15 px-3 py-2.5 backdrop-blur-sm" style={{ minWidth: 180 }}>
          <div className="text-[10px] uppercase tracking-wide text-white/60 mb-1.5">
            {obrasHeatmapMetric === "count" ? "Obras por barrio" : "m² por barrio"}
          </div>
          <div
            className="h-2.5 rounded-full w-full mb-1"
            style={{ background: "linear-gradient(to right, #0f172a, #1e3a5f, #1d4ed8, #f59e0b, #ef4444)" }}
          />
          <div className="flex justify-between text-[9px] text-white/60">
            <span>0</span>
            <span>
              {obrasHeatmapMetric === "count"
                ? obrasHeatStats.maxCount.toLocaleString("es-AR")
                : `${Math.round(obrasHeatStats.maxM2).toLocaleString("es-AR")} m²`}
            </span>
          </div>
          {selectedObrasYears.length > 0 && (
            <div className="text-[9px] text-white/45 mt-1 truncate" style={{ maxWidth: 170 }}>
              {selectedObrasYears.length <= 4
                ? selectedObrasYears.join(", ")
                : `${selectedObrasYears.length} años seleccionados`}
            </div>
          )}
        </div>
      )}

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
          onToggleObrasHeatmap={handleToggleObrasHeatmap}
          obrasHeatmapActive={obrasHeatmapActive}
          obrasHeatmapMetric={obrasHeatmapMetric}
          onSetObrasHeatmapMetric={setObrasHeatmapMetric}
          obrasHeatStats={obrasHeatStats}
          obrasHeatBarrioData={obrasHeatBarrioData}
          obrasYearOptions={obrasYearOptions}
          selectedObrasYears={selectedObrasYears}
          obrasYearPreset={obrasYearPreset}
          onSelectObrasPreset={handleSelectObrasPreset}
          onToggleObrasYear={handleToggleObrasYear}
          onSelectAllObrasYears={handleSelectAllObrasYears}
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
        labelLayerRef={baseLabelLayerRef}
        />

      {/* ── Regional information (weather & alerts) ──────────────────── */}
      <RegionalInfoPanel
        latitude={-32.4667}
        longitude={-58.3167}
        open={regionalInfoOpen}
        onToggle={() => setRegionalInfoOpen(o => !o)}
        hideTrigger
      />

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none" style={{ zIndex: 500 }}>
        <div className="text-[10px] text-muted-foreground/50 bg-background/70 px-2 py-0.5 rounded-full">
          Datos: Municipalidad de Colón · IGN · OSM
        </div>
      </div>
    </div>
  );
}
