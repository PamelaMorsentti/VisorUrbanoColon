/**
 * Publication Levels Module
 * Handles filtering and exporting data at 3 publication levels:
 * - public: Basic geocodification + tipo, destino, m², dates
 * - professional: + propietarios, profesionales, contractor, estructura
 * - admin: All fields unfiltered
 */

import fs from "node:fs";
import path from "node:path";
import { stringify as stringifyCsv } from "csv-stringify/sync";

export type PublicationLevel = "public" | "professional" | "admin";

export type PublicationOutput = {
  level: PublicationLevel;
  csvPath: string;
  jsonPath: string;
  geoJsonPath: string;
};

export type AnalyticsAggregation = {
  byZone: Record<string, { count: number; totalM2Construir: number; types: Record<string, number> }>;
  byType: Record<string, { count: number; totalM2Construir: number; destinies: Record<string, number> }>;
  byDestiny: Record<string, { count: number; totalM2Construir: number }>;
  totalWorks: number;
  totalM2Construir: number;
};

function fold(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s/+-]/g, " ")
    .replace(/\s+/g, " ");
}

function pickLabel(raw: unknown, fallback: string): string {
  const text = String(raw ?? "").trim();
  return text || fallback;
}

export function normalizeZoneLabel(raw: unknown): string {
  const value = fold(raw);
  if (!value) return "Sin zonificacion";
  if (value.includes("periurbana") || value.includes("peri urbana") || value.includes("periurbana -") || value.includes("periurbana-") || value.includes("periurbana ")) {
    if (value.includes("colonia hugues")) return "Periurbana - Colonia Hugues";
    return "Periurbana";
  }
  if (value.includes("periurb") || value.includes("periurna") || value.includes("periurbana") || value.includes("periurbana")) return "Periurbana";
  if (value === "urbana" || value.includes(" urbana")) return "Urbana";
  if (value.includes("centro")) return "Centro";
  if (value.includes("residencial sur")) return "Residencial Sur";
  if (value.includes("nucleo urbano ampliado")) return "Nucleo Urbano Ampliado";
  if (value.includes("quintas")) return "Quintas";
  if (value.includes("suburbana")) return "Suburbana";
  if (value.includes("chacras")) return "Chacras";
  return pickLabel(raw, "Sin zonificacion");
}

export function normalizeTipoLabel(raw: unknown): string {
  const source = pickLabel(raw, "sin tipo");
  const value = fold(source);
  if (!value || value === "sin tipo") return "Sin tipo";
  if (value.includes("moviviem") || value.includes("movimiento") || value.includes("pluvial")) return "Movimiento de suelo / pluviales";
  if (value.includes("estacion de servicio")) return "Estacion de servicios";
  if (value.includes("cochera")) return "Cocheras";
  if (value.includes("oficina")) return "Oficinas administrativas";
  if (value.includes("cancha") && value.includes("fut")) return "Cancha futbol 5";
  if (value.includes("viviemda") || value.includes("vviienda") || value.includes("multifamiliar")) {
    if (value.includes("local")) return "Vivienda multifamiliar + Local comercial";
    return "Vivienda multifamiliar";
  }
  if (value.includes("nunifamiliar") || value.includes("unifmailiar") || value.includes("unifamiliar")) {
    if (value.includes("local")) return "Vivienda unifamiliar + Local comercial";
    return "Vivienda unifamiliar";
  }
  if (value.includes("local comercial") || value.includes("comercial") || value.includes("comerciq")) {
    if (value.includes("vivienda")) return "Vivienda + Local comercial";
    return "Local comercial";
  }
  if (value.includes("hotel") || value.includes("cabana") || value.includes("cabanas") || value.includes("apart")) return "Turistico / alojamiento";
  if (value.includes("galpon") || value.includes("deposito") || value.includes("fabrica") || value.includes("industr")) return "Productivo / deposito";
  if (value.includes("templo") || value.includes("educativo") || value.includes("consultorio") || value.includes("clinica")) return "Equipamiento";
  if (value.includes("piscina") || value.includes("quincho")) return "Piscina / quincho";
  return source;
}

export function normalizeDestinoLabel(rawDestino: unknown, rawTipo?: unknown): string {
  const destino = fold(rawDestino);
  const tipo = fold(rawTipo);
  const value = `${destino} ${tipo}`.trim();
  if (!value) return "sin destino";
  if ((value.includes("vivienda") && value.includes("comercial")) || value.includes("mixto")) return "mixto";
  if (value.includes("vivienda")) return "vivienda";
  if (value.includes("comercial") || value.includes("local")) return "comercial";
  if (value.includes("hotel") || value.includes("cabana") || value.includes("turist")) return "turistico";
  if (value.includes("galpon") || value.includes("deposito") || value.includes("product")) return "productivo";
  if (value.includes("templo") || value.includes("educativo") || value.includes("consultorio") || value.includes("clinica")) return "equipamiento";
  if (value.includes("piscina") || value.includes("quincho")) return "recreativo";
  return "otros";
}

// Define which fields are visible at each level
const FIELD_VISIBILITY: Record<PublicationLevel, Set<string>> = {
  public: new Set([
    // Basic identification
    "source_row_number", "legajo_canonico", "row_kind",
    // Cadastral data
    "ncp", "ncp_formatted", "sec", "gru", "nmanz", "nparc",
    // Location
    "raw_ubicacion", "lon", "lat", "geolocation_source",
    // Geocoding quality
    "location_verification_status",
    // Original data: tipo, destino, m²
    "tipo", "destino_uso", "zonificacion",
    "m_a_construir_vivienda", "m_a_construir_local",
    "m_existentes_relevados_vivienda", "m_existentes_relevados_local",
    // Dates
    "fecha_de_visado",
    // States (relevamiento/construir/ampliación/proyectado)
    "relevamiento_o_existente", "a_contruir_obra_nueva", "ampliacion_de_obra_existente", "proyectado_no_iniciado"
  ]),
  professional: new Set([
    // All public fields +
    "source_row_number", "legajo_canonico", "row_kind",
    "ncp", "ncp_formatted", "sec", "gru", "nmanz", "nparc",
    "raw_ubicacion", "lon", "lat", "geolocation_source",
    "location_verification_status",
    "tipo", "destino_uso", "zonificacion",
    "m_a_construir_vivienda", "m_a_construir_local",
    "m_existentes_relevados_vivienda", "m_existentes_relevados_local",
    "fecha_de_visado",
    "relevamiento_o_existente", "a_contruir_obra_nueva", "ampliacion_de_obra_existente", "proyectado_no_iniciado",
    // Professional-level: propietarios, profesionales, constructor, estructura
    "propietario", "nombre_del_establecimiento_y_o_empresa",
    "profesional_proyecto", "direccion_de_obra", "estructura", "constructor",
    "categoria",
    "indicadores_f_o_s", "f_o_t",
    "ano", "expediente", "ingreso"
  ]),
  admin: new Set() // Admin gets all fields (empty set means no filtering)
};

/**
 * Filter a row by publication level, removing fields not allowed for this level
 */
export function filterRowByLevel(row: Record<string, unknown>, level: PublicationLevel): Record<string, unknown> {
  if (level === "admin") return row; // Admin gets everything unfiltered
  
  const allowedFields = FIELD_VISIBILITY[level];
  const filtered: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(row)) {
    if (allowedFields.has(key)) {
      filtered[key] = value;
    }
  }
  
  return filtered;
}

/**
 * Generate analytics aggregating data by zone, type, and destination
 */
export function generateAnalytics(rows: Array<Record<string, unknown>>): AnalyticsAggregation {
  const agg: AnalyticsAggregation = {
    byZone: {},
    byType: {},
    byDestiny: {},
    totalWorks: rows.length,
    totalM2Construir: 0
  };

  for (const row of rows) {
    const zone = normalizeZoneLabel(row.zonificacion);
    const tipo = normalizeTipoLabel(row.tipo);
    const destino = normalizeDestinoLabel(row.destino_uso, row.tipo);
    const m2Str = String(row.m_a_construir_vivienda || row.m_a_construir_local || "0").replace(",", ".");
    const m2 = parseFloat(m2Str) || 0;

    agg.totalM2Construir += m2;

    // By zone
    if (!agg.byZone[zone]) {
      agg.byZone[zone] = { count: 0, totalM2Construir: 0, types: {} };
    }
    agg.byZone[zone].count++;
    agg.byZone[zone].totalM2Construir += m2;
    agg.byZone[zone].types[tipo] = (agg.byZone[zone].types[tipo] || 0) + 1;

    // By type
    if (!agg.byType[tipo]) {
      agg.byType[tipo] = { count: 0, totalM2Construir: 0, destinies: {} };
    }
    agg.byType[tipo].count++;
    agg.byType[tipo].totalM2Construir += m2;
    agg.byType[tipo].destinies[destino] = (agg.byType[tipo].destinies[destino] || 0) + 1;

    // By destiny
    if (!agg.byDestiny[destino]) {
      agg.byDestiny[destino] = { count: 0, totalM2Construir: 0 };
    }
    agg.byDestiny[destino].count++;
    agg.byDestiny[destino].totalM2Construir += m2;
  }

  return agg;
}

/**
 * Export data at a specific publication level to CSV, JSON, and GeoJSON formats
 */
export function exportPublicationLevel(
  rows: Array<Record<string, unknown>>,
  level: PublicationLevel,
  baseName: string,
  cleaningDir: string
): PublicationOutput {
  const filteredRows = rows.map(row => filterRowByLevel(row, level));
  const suffix = level === "public" ? "-public" : level === "professional" ? "-profesionales" : "";

  const csvPath = path.join(cleaningDir, `${baseName}.geolocated${suffix}.csv`);
  const jsonPath = path.join(cleaningDir, `${baseName}.geolocated${suffix}.json`);
  const geoJsonPath = path.join(cleaningDir, `${baseName}.geolocated${suffix}.geojson`);

  // Determine CSV headers from first row
  const headers = filteredRows.length > 0 ? Object.keys(filteredRows[0]) : [];

  // Write CSV
  const csv = stringifyCsv(filteredRows, { header: true, columns: headers });
  fs.writeFileSync(csvPath, csv, "utf8");

  // Write JSON
  fs.writeFileSync(jsonPath, JSON.stringify(filteredRows, null, 2), "utf8");

  // Write GeoJSON
  const geoFeatures = filteredRows
    .filter(r => r.lon && r.lat)
    .map(r => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [parseFloat(String(r.lon)), parseFloat(String(r.lat))]
      },
      properties: r
    }));

  const geoJson = {
    type: "FeatureCollection" as const,
    features: geoFeatures
  };
  fs.writeFileSync(geoJsonPath, JSON.stringify(geoJson, null, 2), "utf8");

  return { level, csvPath, jsonPath, geoJsonPath };
}
