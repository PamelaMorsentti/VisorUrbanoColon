import fs from "node:fs";
import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import { stringify as stringifyCsv } from "csv-stringify/sync";
import {
  type PublicationOutput,
  generateAnalytics,
  exportPublicationLevel
} from "./publication-levels";
import { writeAnalyticsArtifacts } from "./planos-analytics";

type NormalizedRow = Record<string, string>;

type AddressMatch = {
  lat: number;
  lon: number;
  name: string;
  query: string;
};

type Geometry = {
  type: string;
  coordinates: unknown;
};

type ParcelProperties = {
  ID?: number;
  NCP?: string;
  SEC?: number;
  GRU?: number;
  NMANZ?: number;
  NPARC?: number;
  [key: string]: unknown;
};

type ParcelFeature = {
  type: string;
  properties: ParcelProperties;
  geometry: Geometry;
};

type ParcelGeoJson = {
  type: string;
  features: ParcelFeature[];
};

type MatchMethod = "gru_manz_parc" | "manz_parc" | "gru_parc" | "none";
type Confidence = "high" | "medium" | "low";

type MatchResult = {
  method: MatchMethod;
  confidence: Confidence;
  matches: ParcelFeature[];
  reason: string;
};

type GeolocatedRow = {
  source_row_number: string;
  legajo_canonico: string;
  row_kind: string;
  raw_ubicacion: string;
  raw_concesion: string;
  raw_manzana: string;
  raw_parcela: string;
  source_component_profile: string;
  source_component_count: number;
  source_ncp_derived: string;
  source_ncp_derivation_status: string;
  match_method: MatchMethod;
  match_count: number;
  confidence: Confidence;
  reason: string;
  parcela_id: string;
  ncp: string;
  ncp_formatted: string;
  ncp_format_status: string;
  sec: string;
  gru: string;
  nmanz: string;
  nparc: string;
  lon: string;
  lat: string;
  auto_lon: string;
  auto_lat: string;
  geolocation_source: string;
  admin_override_reason: string;
  admin_override_updated_at: string;
  postal_address_available: string;
  cadastral_reference_available: string;
  dual_verification_ready: string;
  address_query: string;
  address_geocode_status: string;
  address_match_name: string;
  address_lon: string;
  address_lat: string;
  address_vs_auto_cadastral_distance_m: string;
  address_vs_cadastral_distance_m: string;
  auto_location_verification_status: string;
  location_verification_status: string;
};

type AdminOverride = {
  source_row_number: string;
  lon: number;
  lat: number;
  reason?: string;
  updated_at?: string;
};

type AdminChangesPayload = {
  overrides?: AdminOverride[];
  addedRows?: Array<Record<string, unknown>>;
  editedRows?: Array<Record<string, unknown>>;
  deletedRows?: string[];
};

type Summary = {
  totalRows: number;
  consideredRows: number;
  matchedRows: number;
  uniqueMatches: number;
  ambiguousMatches: number;
  unmatchedRows: number;
  byMethod: Record<MatchMethod, number>;
  byConfidence: Record<Confidence, number>;
  addressGeocodedRows: number;
  addressVerificationComparableRows: number;
  byVerificationStatus: Record<string, number>;
  outputs: {
    geolocatedCsv: string;
    geolocatedJson: string;
    summaryJson: string;
    visualHtml: string;
    adminEditorHtml: string;
    overridesJson: string;
    adminChangesJson: string;
    analyticsDashboardHtml?: string;
    analysisMapPrepJson?: string;
    analysisPointsGeoJson?: string;
    analysisZonesChoroplethGeoJson?: string;
    appDashboardHtml?: string;
    appAdminEditorHtml?: string;
    appRoleData?: {
      publicGeoJson: string;
      professionalGeoJson: string;
      adminGeoJson: string;
    };
    publicationLevels?: {
      public: PublicationOutput;
      professional: PublicationOutput;
      admin: PublicationOutput;
    };
    analytics?: {
      byZone: Record<string, { count: number; totalM2Construir: number; types: Record<string, number> }>;
      byType: Record<string, { count: number; totalM2Construir: number; destinies: Record<string, number> }>;
      byDestiny: Record<string, { count: number; totalM2Construir: number }>;
      totalWorks: number;
      totalM2Construir: number;
    };
  };
};

const IGN_PROVINCIA = "entre rios";
const IGN_LOCALIDAD = "colon";
const IGN_TIMEOUT_MS = 12000;
const ADMIN_EDITOR_PASSWORD = process.env.COLON3D_ADMIN_PASSWORD ?? "colon2024";

function findRepoRoot(startDir: string): string {
  let current = startDir;

  for (;;) {
    const workspaceFile = path.join(current, "pnpm-workspace.yaml");
    if (fs.existsSync(workspaceFile)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

function copyIfExists(sourcePath: string, targetPath: string): boolean {
  if (!fs.existsSync(sourcePath)) return false;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  return true;
}

function parseIntLike(value: string | undefined): number | null {
  const normalized = (value ?? "").trim().replace(",", ".");
  if (!normalized) {
    return null;
  }

  const asNumber = Number(normalized);
  if (Number.isFinite(asNumber)) {
    return Math.trunc(asNumber);
  }

  const digits = normalized.match(/\d+/g);
  if (!digits || digits.length === 0) {
    return null;
  }

  const joined = digits.join("");
  const parsed = Number(joined);
  return Number.isFinite(parsed) ? parsed : null;
}

function walkCoordinates(value: unknown, out: [number, number][]): void {
  if (!Array.isArray(value) || value.length === 0) {
    return;
  }

  if (typeof value[0] === "number" && typeof value[1] === "number") {
    out.push([value[0], value[1]]);
    return;
  }

  for (const item of value) {
    walkCoordinates(item, out);
  }
}

function bboxCenter(geometry: Geometry): { lon: number; lat: number } | null {
  const points: [number, number][] = [];
  walkCoordinates(geometry.coordinates, points);

  if (points.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [x, y] of points) {
    if (x < minX) {
      minX = x;
    }
    if (x > maxX) {
      maxX = x;
    }
    if (y < minY) {
      minY = y;
    }
    if (y > maxY) {
      maxY = y;
    }
  }

  return {
    lon: (minX + maxX) / 2,
    lat: (minY + maxY) / 2,
  };
}

function formatCoord(value: number | null): string {
  return value === null ? "" : value.toFixed(8);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeAddressForQuery(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/[“”„'`´]/g, "")
      .replace(/[|·…]/g, " ")
      // Normalize non-standard Unicode variants used in local records
      .replace(/û/g, "ü")
      // Expand Boulevard abbreviations (consume trailing dot)
      .replace(/\b(Bv|Bvd|Bvard|Bvrd)\.?(?=[\s,]|$)/gi, "Boulevard")
      // Expand Avenida abbreviations (consume trailing dot to avoid "Avenida. Urquiza")
      .replace(/\b(Av|Avda|Avenida)\.?(?=[\s,]|$)/gi, "Avenida")
      .replace(/\bPte\.?\s*/gi, "Presidente ")
      .replace(/\bGral\.?(?=[\s,]|$)/gi, "General")
      // Expand common local abbreviations
      .replace(/\bL\.?\s*N\.?\s*Alem\b/gi, "Leandro N. Alem")
      .replace(/\bM\.?\s*Moreno\b/gi, "Mariano Moreno")
      .replace(/\bJ\.?\s*J\.?\s*Paso\b/gi, "Juan José Paso")
      .replace(/(?:^|\s)s\/?n[°ºªo]?\b/gi, " ")
      .replace(/(?:^|\s)N(?:RO\.?|[°ºª])\s*/gi, " ")
      .replace(/(?:^|\s)e\/(\S)/gi, " esq $1")
      .replace(/[()]/g, " ")
      .replace(/\bantes\b.*$/i, "")
      .replace(/\s+,/g, ",")
      .replace(/,{2,}/g, ",")
      .replace(/\.{2,}/g, ".")
      .replace(/\s+-\s+/g, " - "),
  );
}
function uniqueQueries(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

function buildAddressQueries(rawAddress: string): string[] {
  const cleaned = normalizeAddressForQuery(rawAddress)
    .replace(/\s+-\s+.*$/g, "")
    .replace(/\s{2,}/g, " ");

  const numbers = cleaned.match(/\d{1,5}/g) ?? [];

  const mainPart = normalizeWhitespace(cleaned.split(",")[0] ?? cleaned);
  const cornerMatch = mainPart.match(/^(.*?)(?:\besq\.?\b)(.*)$/i);
  // Also try stripping leading "Calle " for streets like "Calle 12 de Abril"
  const mainPartNoCalle = mainPart.replace(/^Calle\s+/i, "");
  const numberedStreetPrefixNoCalle =
    mainPartNoCalle !== mainPart
      ? (mainPartNoCalle.match(/^(\d{1,2}\s+de\s+[A-Za-zÀ-ɏ]+)/i)?.[1] ?? "")
      : "";

  const numberedStreetPrefix = mainPart.match(/^(\d{1,2}\s+de\s+[A-Za-zÁÉÍÓÚáéíóúÑñ]+)/i)?.[1] ?? "";

  let firstNumber = numbers[0] ?? "";
  let secondNumber = numbers[1] ?? "";

  if (numberedStreetPrefix) {
    const streetDay = numberedStreetPrefix.match(/^\d{1,2}/)?.[0] ?? "";
    if (streetDay && firstNumber === streetDay) {
      firstNumber = numbers[1] ?? "";
      secondNumber = numbers[2] ?? "";
    }
  }

  const streetWithoutNumbers = (() => {
    if (!numberedStreetPrefix) {
      return normalizeWhitespace(
        mainPart
          .replace(/\d+/g, " ")
          .replace(/\by\b/gi, " ")
          .replace(/[-,]/g, " "),
      );
    }

    const tail = mainPart.slice(numberedStreetPrefix.length);
    const tailClean = normalizeWhitespace(
      tail
        .replace(/\d+/g, " ")
        .replace(/\by\b/gi, " ")
        .replace(/[-,]/g, " "),
    );

    return normalizeWhitespace(`${numberedStreetPrefix} ${tailClean}`);
  })();

  const queryCandidates: string[] = [];

  queryCandidates.push(`${cleaned}, Colón`);

  if (cornerMatch) {
    const primary = normalizeWhitespace(cornerMatch[1]);
    // Strip numbers from primary street to avoid "Cabo Pereyra 155 y 157" polluting queries
    const primaryStreet = normalizeWhitespace(primary.replace(/\d+/g, " ").replace(/\by\b/gi, " ").replace(/[-,]/g, " "));
    const crossing = normalizeWhitespace(cornerMatch[2]).replace(/^\.?\s*/, "");
    const crossingStreet = normalizeWhitespace(crossing.replace(/\d+/g, " ").replace(/[-,]/g, " "));
    // Numbers belonging to the crossing (not borrowed from primary)
    const crossingNumbers = crossing.match(/\d{1,5}/g) ?? [];
    const crossingFirstNum = crossingNumbers[0] ?? "";
    if (primaryStreet && crossingStreet) {
      queryCandidates.push(`${primaryStreet} y ${crossingStreet}, Colón`);
    }
    if (primaryStreet && firstNumber) {
      queryCandidates.push(`${primaryStreet} ${firstNumber}, Colón`);
    }
    // Only use crossing+number when the crossing ITSELF carries the number
    if (crossingStreet && crossingFirstNum) {
      queryCandidates.push(`${crossingStreet} ${crossingFirstNum}, Colón`);
    }
    if (primaryStreet) {
      queryCandidates.push(`${primaryStreet}, Colón`);
    }
  } else {
    if (streetWithoutNumbers && firstNumber) {
      queryCandidates.push(`${streetWithoutNumbers} ${firstNumber}, Colón`);
    }
    if (streetWithoutNumbers && secondNumber) {
      queryCandidates.push(`${streetWithoutNumbers} ${secondNumber}, Colón`);
    }
    if (streetWithoutNumbers) {
      queryCandidates.push(`${streetWithoutNumbers}, Colón`);
    }
  }

  
  // Fallback queries when street starts with "Calle N de Mes" (e.g., "Calle 12 de Abril 229")
  if (numberedStreetPrefixNoCalle) {
    const tailNoCalle = mainPartNoCalle.slice(numberedStreetPrefixNoCalle.length);
    const tailNums = tailNoCalle.match(/\d{1,5}/g) ?? [];
    const houseNum = tailNums[0] ?? "";
    if (houseNum) queryCandidates.push(`${numberedStreetPrefixNoCalle} ${houseNum}, Colón`);
    queryCandidates.push(`${numberedStreetPrefixNoCalle}, Colón`);
  }

  // Extra fallbacks for IGN partial-name matching
  {
    // a) Strip long street-type prefixes: "Boulevard Güemes 168" → also try "Güemes 168"
    const STRIP_PFXS = /^(?:Boulevard|Avenida|Pasaje|Diagonal|Acceso|Camino)\s+/i;
    const baseStreet = cornerMatch
      ? normalizeWhitespace(cornerMatch[1].replace(/\d+/g, " ").replace(/\by\b/gi, " ").replace(/[-,]/g, " "))
      : streetWithoutNumbers;
    const strippedBase = baseStreet.replace(STRIP_PFXS, "").trim();
    if (strippedBase && strippedBase !== baseStreet) {
      if (firstNumber) queryCandidates.push(`${strippedBase} ${firstNumber}, Colón`);
      queryCandidates.push(`${strippedBase}, Colón`);
    }
    // b) Surname-only: last significant word (≥4 chars)
    const lastWord = (strippedBase || baseStreet).split(/\s+/).filter((w: string) => w.length >= 4).pop() ?? "";
    if (lastWord && lastWord !== strippedBase && lastWord !== baseStreet) {
      if (firstNumber) queryCandidates.push(`${lastWord} ${firstNumber}, Colón`);
    }
  }

  return uniqueQueries(queryCandidates);
}

function padNumber(value: number, width: number): string {
  return String(Math.max(0, Math.trunc(value))).padStart(width, "0");
}

function formatParcelNcp(sec: number | null, gru: number | null, manz: number | null, parc: number | null): string {
  if (sec === null || gru === null || manz === null || parc === null) {
    return "";
  }

  return `010001${padNumber(sec, 3)}${padNumber(gru, 3)}${padNumber(manz, 4)}--${padNumber(parc, 3)}--`;
}

function buildSourceComponentProfile(concesion: number | null, manzana: number | null, parcela: number | null): {
  profile: string;
  count: number;
} {
  const labels: string[] = [];

  if (concesion !== null) {
    labels.push("gru");
  }
  if (manzana !== null) {
    labels.push("manz");
  }
  if (parcela !== null) {
    labels.push("parc");
  }

  return {
    profile: labels.length === 0 ? "none" : labels.join("+"),
    count: labels.length,
  };
}

function deriveSourceNcp(match: MatchResult, feature: ParcelFeature | undefined): {
  value: string;
  status: string;
} {
  if (!feature) {
    return {
      value: "",
      status: match.method === "none" ? "no_unique_parcel_inference" : "missing_top_feature",
    };
  }

  if (match.matches.length !== 1) {
    return {
      value: "",
      status: match.matches.length > 1 ? "ambiguous_source_components" : "no_unique_parcel_inference",
    };
  }

  const sec = typeof feature.properties.SEC === "number" ? feature.properties.SEC : null;
  const gru = typeof feature.properties.GRU === "number" ? feature.properties.GRU : null;
  const manz = typeof feature.properties.NMANZ === "number" ? feature.properties.NMANZ : null;
  const parc = typeof feature.properties.NPARC === "number" ? feature.properties.NPARC : null;
  const formatted = formatParcelNcp(sec, gru, manz, parc);

  return {
    value: formatted,
    status: formatted ? `derived_from_source_${match.method}` : "missing_components_after_inference",
  };
}

function isGeolocatableRow(rowKind: string): boolean {
  return rowKind === "detail" || rowKind === "detail_continuation" || rowKind === "detail_unassigned";
}

function findMatches(features: ParcelFeature[], concesion: number | null, manzana: number | null, parcela: number | null): MatchResult {
  if (concesion !== null && manzana !== null && parcela !== null) {
    const matches = features.filter(
      (feature) =>
        feature.properties.GRU === concesion &&
        feature.properties.NMANZ === manzana &&
        feature.properties.NPARC === parcela,
    );
    if (matches.length === 1) {
      return {
        method: "gru_manz_parc",
        confidence: "high",
        matches,
        reason: "unique_match_by_gru_manz_parc",
      };
    }
    if (matches.length > 1) {
      return {
        method: "gru_manz_parc",
        confidence: "low",
        matches,
        reason: "ambiguous_match_by_gru_manz_parc",
      };
    }
  }

  if (manzana !== null && parcela !== null) {
    const matches = features.filter(
      (feature) => feature.properties.NMANZ === manzana && feature.properties.NPARC === parcela,
    );
    if (matches.length === 1) {
      return {
        method: "manz_parc",
        confidence: "medium",
        matches,
        reason: "unique_match_by_manz_parc",
      };
    }
    if (matches.length > 1) {
      return {
        method: "manz_parc",
        confidence: "low",
        matches,
        reason: "ambiguous_match_by_manz_parc",
      };
    }
  }

  if (concesion !== null && parcela !== null) {
    const matches = features.filter(
      (feature) => feature.properties.GRU === concesion && feature.properties.NPARC === parcela,
    );
    if (matches.length === 1) {
      return {
        method: "gru_parc",
        confidence: "medium",
        matches,
        reason: "unique_match_by_gru_parc",
      };
    }
    if (matches.length > 1) {
      return {
        method: "gru_parc",
        confidence: "low",
        matches,
        reason: "ambiguous_match_by_gru_parc",
      };
    }
  }

  return {
    method: "none",
    confidence: "low",
    matches: [],
    reason: "no_cadastral_match",
  };
}

async function searchIgnAddress(query: string): Promise<AddressMatch | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IGN_TIMEOUT_MS);

  try {
    const url = `https://apis.datos.gob.ar/georef/api/direcciones?direccion=${encodeURIComponent(query)}&provincia=${encodeURIComponent(IGN_PROVINCIA)}&localidad=${encodeURIComponent(IGN_LOCALIDAD)}&max=5`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      direcciones?: Array<{
        nomenclatura?: string;
        ubicacion?: { lat?: number; lon?: number };
        lat?: number;
        lon?: number;
      }>;
    };

    const best = data.direcciones?.[0];
    const lat = best?.ubicacion?.lat ?? best?.lat;
    const lon = best?.ubicacion?.lon ?? best?.lon;

    if (typeof lat !== "number" || typeof lon !== "number") {
      return null;
    }

    return {
      lat,
      lon,
      name: best?.nomenclatura ?? query,
      query,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Strip accents for loose word matching (IGN stores names without accents)
function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u00fc/g, "u").replace(/\u00f1/g, "n");
}

// Returns true if the IGN matchName has at least one significant word in common with the query.
// Prevents accepting "JOSE HERNANDEZ 90" for query "Fernández 90".
function matchedStreetIsPlausible(query: string, matchName: string): boolean {
  const STOP = new Set(["de", "del", "la", "el", "los", "las", "y", "e", "en", "av", "grl", "bvd", "bv", "san", "juan"]);
  const stripCity = (s: string) => stripAccents(s).replace(/,?\s*(col[oó]n|entre\s+r[ií]os|provincia[^,]*).*$/gi, "");
  const toWords = (s: string) =>
    stripCity(s).toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP.has(w));
  const queryWords = toWords(query);
  const matchWords = new Set(toWords(matchName));
  for (const word of queryWords) {
    if (matchWords.has(word)) return true;
    for (const matchWord of matchWords) {
      if (matchWord.startsWith(word) || word.startsWith(matchWord)) return true;
    }
  }
  return false;
}

async function geocodeAddressVariants(rawAddress: string, cache: Map<string, AddressMatch | null>): Promise<AddressMatch | null> {
  const queries = buildAddressQueries(rawAddress);

  for (const query of queries) {
    if (!cache.has(query)) {
      cache.set(query, await searchIgnAddress(query));
    }

    const hit = cache.get(query) ?? null;
    if (hit) {
      if (!matchedStreetIsPlausible(query, hit.name)) {
        continue;
      }
      return hit;
    }
  }

  return null;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusM = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusM * c;
}

function classifyVerification(
  distanceMeters: number | null,
  hasCadastralPoint: boolean,
  hasAddressPoint: boolean,
): string {
  if (!hasCadastralPoint && !hasAddressPoint) {
    return "missing_both_points";
  }
  if (!hasCadastralPoint) {
    return "missing_cadastral_point";
  }
  if (!hasAddressPoint) {
    return "missing_address_point";
  }
  if (distanceMeters === null) {
    return "no_comparison_points";
  }
  if (distanceMeters <= 60) {
    return "verified_close";
  }
  if (distanceMeters <= 150) {
    return "verified_nearby";
  }
  if (distanceMeters <= 400) {
    return "review_medium_gap";
  }
  return "review_large_gap";
}

function loadAdminOverrides(overridesPath: string): Map<string, AdminOverride> {
  if (!fs.existsSync(overridesPath)) {
    return new Map<string, AdminOverride>();
  }

  try {
    const raw = JSON.parse(fs.readFileSync(overridesPath, "utf8")) as {
      overrides?: AdminOverride[];
    };
    const list = Array.isArray(raw.overrides) ? raw.overrides : [];
    const out = new Map<string, AdminOverride>();

    for (const item of list) {
      const key = String(item.source_row_number ?? "").trim();
      if (!key) {
        continue;
      }
      if (!Number.isFinite(item.lon) || !Number.isFinite(item.lat)) {
        continue;
      }

      out.set(key, {
        source_row_number: key,
        lon: Number(item.lon),
        lat: Number(item.lat),
        reason: item.reason ?? "",
        updated_at: item.updated_at ?? "",
      });
    }

    return out;
  } catch {
    return new Map<string, AdminOverride>();
  }
}

function loadAdminChanges(adminChangesPath: string): AdminChangesPayload {
  if (!fs.existsSync(adminChangesPath)) {
    return {};
  }

  try {
    const raw = JSON.parse(fs.readFileSync(adminChangesPath, "utf8")) as AdminChangesPayload;
    return {
      overrides: Array.isArray(raw.overrides) ? raw.overrides : [],
      addedRows: Array.isArray(raw.addedRows) ? raw.addedRows : [],
      editedRows: Array.isArray(raw.editedRows) ? raw.editedRows : [],
      deletedRows: Array.isArray(raw.deletedRows) ? raw.deletedRows.map((v) => String(v)) : [],
    };
  } catch {
    return {};
  }
}

function asMatchMethod(value: unknown): MatchMethod {
  const v = String(value ?? "").trim();
  if (v === "gru_manz_parc" || v === "manz_parc" || v === "gru_parc" || v === "none") {
    return v;
  }
  return "none";
}

function asConfidence(value: unknown): Confidence {
  const v = String(value ?? "").trim();
  if (v === "high" || v === "medium" || v === "low") {
    return v;
  }
  return "low";
}

function toCoordString(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(8) : "";
}

function toStringValue(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function toNumberValue(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function deriveDestinationFromTipo(tipo: string): string {
  const value = String(tipo || "").trim().toLowerCase();
  if (!value) {
    return "sin destino";
  }
  if (value.includes("vivienda")) {
    return "vivienda";
  }
  if (value.includes("comercial") || value.includes("local")) {
    return "comercial";
  }
  if (value.includes("hotel") || value.includes("tur") || value.includes("caba")) {
    return "turistico";
  }
  if (value.includes("industrial") || value.includes("taller") || value.includes("deposit")) {
    return "productivo";
  }
  return value;
}

function defaultGeolocatedRow(sourceRow: string): GeolocatedRow {
  return {
    source_row_number: sourceRow,
    legajo_canonico: "",
    row_kind: "detail",
    raw_ubicacion: "",
    raw_concesion: "",
    raw_manzana: "",
    raw_parcela: "",
    source_component_profile: "none",
    source_component_count: 0,
    source_ncp_derived: "",
    source_ncp_derivation_status: "missing",
    match_method: "none",
    match_count: 0,
    confidence: "low",
    reason: "admin_input",
    parcela_id: "",
    ncp: "",
    ncp_formatted: "",
    ncp_format_status: "missing_components",
    sec: "",
    gru: "",
    nmanz: "",
    nparc: "",
    lon: "",
    lat: "",
    auto_lon: "",
    auto_lat: "",
    geolocation_source: "admin_new",
    admin_override_reason: "",
    admin_override_updated_at: "",
    postal_address_available: "no",
    cadastral_reference_available: "no",
    dual_verification_ready: "no",
    address_query: "",
    address_geocode_status: "missing_address",
    address_match_name: "",
    address_lon: "",
    address_lat: "",
    address_vs_auto_cadastral_distance_m: "",
    address_vs_cadastral_distance_m: "",
    auto_location_verification_status: "no_comparison_points",
    location_verification_status: "missing_address_point",
  };
}

function normalizeAdminRow(input: Record<string, unknown>, fallback: GeolocatedRow): GeolocatedRow {
  const sourceRow = toStringValue(input.source_row_number || fallback.source_row_number).trim();
  const lat = toCoordString(input.lat ?? input.final_lat ?? fallback.lat);
  const lon = toCoordString(input.lon ?? input.final_lon ?? fallback.lon);
  const rawUbic = toStringValue(input.raw_ubicacion ?? fallback.raw_ubicacion);

  return {
    ...fallback,
    source_row_number: sourceRow || fallback.source_row_number,
    legajo_canonico: toStringValue(input.legajo_canonico ?? fallback.legajo_canonico),
    row_kind: toStringValue(input.row_kind ?? (fallback.row_kind || "detail")),
    raw_ubicacion: rawUbic,
    source_component_profile: toStringValue(input.source_component_profile ?? fallback.source_component_profile),
    source_component_count: toNumberValue(input.source_component_count ?? fallback.source_component_count),
    source_ncp_derived: toStringValue(input.source_ncp_derived ?? fallback.source_ncp_derived),
    source_ncp_derivation_status: toStringValue(input.source_ncp_derivation_status ?? fallback.source_ncp_derivation_status),
    match_method: asMatchMethod(input.match_method ?? fallback.match_method),
    match_count: toNumberValue(input.match_count ?? fallback.match_count),
    confidence: asConfidence(input.confidence ?? fallback.confidence),
    reason: toStringValue(input.reason ?? fallback.reason),
    ncp: toStringValue(input.ncp ?? fallback.ncp),
    ncp_formatted: toStringValue(input.ncp_formatted ?? fallback.ncp_formatted),
    ncp_format_status: toStringValue(input.ncp_format_status ?? fallback.ncp_format_status),
    lon,
    lat,
    geolocation_source: toStringValue(input.geolocation_source ?? (fallback.geolocation_source || "admin_new")),
    admin_override_reason: toStringValue(input.admin_override_reason ?? input.reason ?? fallback.admin_override_reason),
    admin_override_updated_at: toStringValue(input.admin_override_updated_at ?? fallback.admin_override_updated_at),
    postal_address_available: rawUbic.trim() ? "yes" : toStringValue(input.postal_address_available ?? fallback.postal_address_available),
    address_query: toStringValue(input.address_query ?? fallback.address_query),
    address_geocode_status: toStringValue(input.address_geocode_status ?? fallback.address_geocode_status),
    address_match_name: toStringValue(input.address_match_name ?? fallback.address_match_name),
    address_lon: toCoordString(input.address_lon ?? fallback.address_lon),
    address_lat: toCoordString(input.address_lat ?? fallback.address_lat),
    location_verification_status: toStringValue(input.location_verification_status ?? fallback.location_verification_status),
  };
}

function applyAdminChanges(rows: GeolocatedRow[], changes: AdminChangesPayload): GeolocatedRow[] {
  const byId = new Map<string, GeolocatedRow>();
  for (const row of rows) {
    byId.set(String(row.source_row_number), { ...row });
  }

  const editedRows = Array.isArray(changes.editedRows) ? changes.editedRows : [];
  for (const input of editedRows) {
    const id = toStringValue(input.source_row_number).trim();
    if (!id) {
      continue;
    }
    const base = byId.get(id) ?? defaultGeolocatedRow(id);
    byId.set(id, normalizeAdminRow(input, base));
  }

  const addedRows = Array.isArray(changes.addedRows) ? changes.addedRows : [];
  for (const input of addedRows) {
    const id = toStringValue(input.source_row_number).trim();
    if (!id) {
      continue;
    }
    const base = defaultGeolocatedRow(id);
    byId.set(id, normalizeAdminRow(input, base));
  }

  const deletedRows = Array.isArray(changes.deletedRows) ? changes.deletedRows : [];
  for (const id of deletedRows) {
    byId.delete(String(id));
  }

  return Array.from(byId.values()).sort((a, b) => Number(a.source_row_number) - Number(b.source_row_number));
}

function buildVisualHtml(sampleRows: GeolocatedRow[]): string {
  const payload = sampleRows.map((row) => ({
    row: row.source_row_number,
    legajo: row.legajo_canonico,
    address: row.raw_ubicacion,
    cadastralLat: Number(row.lat),
    cadastralLon: Number(row.lon),
    addressLat: Number(row.address_lat),
    addressLon: Number(row.address_lon),
    verification: row.location_verification_status,
    distanceMeters: row.address_vs_cadastral_distance_m,
    ncp: row.ncp_formatted || row.ncp || row.source_ncp_derived,
  }));

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Comparación Catastro vs Dirección</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; }
    .panel {
      position: absolute; top: 12px; right: 12px; z-index: 1000; width: 320px;
      background: rgba(19, 26, 33, 0.92); color: #e5eef6; padding: 14px; border-radius: 12px;
      font: 12px/1.45 Georgia, "Times New Roman", serif; box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      max-height: calc(100% - 24px); overflow: auto;
    }
    .swatch { display:inline-block; width:10px; height:10px; border-radius:999px; margin-right:6px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="panel">
    <div style="font-size:16px;font-weight:700;margin-bottom:8px">Chequeo Visual</div>
    <div style="margin-bottom:10px">Azul: punto catastral. Naranja: geocodificación IGN. Línea: distancia entre ambos.</div>
    <div id="rows"></div>
  </div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const rows = ${JSON.stringify(payload)};
    const map = L.map('map');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const bounds = [];
    const rowsEl = document.getElementById('rows');
    rows.forEach((row) => {
      if (!Number.isFinite(row.cadastralLat) || !Number.isFinite(row.cadastralLon) || !Number.isFinite(row.addressLat) || !Number.isFinite(row.addressLon)) {
        return;
      }

      const cadastral = [row.cadastralLat, row.cadastralLon];
      const address = [row.addressLat, row.addressLon];
      bounds.push(cadastral, address);

      L.circleMarker(cadastral, { radius: 7, color: '#2563eb', fillColor: '#60a5fa', fillOpacity: 0.95, weight: 2 })
        .addTo(map)
        .bindPopup('<b>Catastro</b><br>Fila ' + row.row + '<br>NCP: ' + (row.ncp || '-') + '<br>' + row.address);

      L.circleMarker(address, { radius: 7, color: '#c2410c', fillColor: '#fb923c', fillOpacity: 0.95, weight: 2 })
        .addTo(map)
        .bindPopup('<b>Dirección IGN</b><br>Fila ' + row.row + '<br>' + row.address);

      L.polyline([cadastral, address], { color: '#facc15', weight: 3, dashArray: '8 6' }).addTo(map);

      const block = document.createElement('div');
      block.style.marginBottom = '10px';
      block.innerHTML = '<div><b>Fila ' + row.row + '</b> · legajo ' + row.legajo + '</div>' +
        '<div>' + row.address + '</div>' +
        '<div><span class="swatch" style="background:#2563eb"></span>catastro · <span class="swatch" style="background:#fb923c"></span>dirección</div>' +
        '<div>estado: <b>' + row.verification + '</b></div>' +
        '<div>distancia: <b>' + row.distanceMeters + ' m</b></div>';
      rowsEl.appendChild(block);
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40] });
    } else {
      map.setView([-32.2236, -58.1436], 13);
    }
  </script>
</body>
</html>`;
}

function buildAdminEditorHtml(rows: GeolocatedRow[], overridesPath: string): string {
  const payload = rows
    .filter((row) => row.row_kind === "detail" || row.row_kind === "detail_continuation" || row.row_kind === "detail_unassigned")
    .map((row) => ({
      source_row_number: row.source_row_number,
      legajo_canonico: row.legajo_canonico,
      row_kind: row.row_kind,
      raw_ubicacion: row.raw_ubicacion,
      ncp_formatted: row.ncp_formatted,
      match_method: row.match_method,
      confidence: row.confidence,
      address_query: row.address_query,
      address_match_name: row.address_match_name,
      address_geocode_status: row.address_geocode_status,
      auto_lat: row.auto_lat ? Number(row.auto_lat) : null,
      auto_lon: row.auto_lon ? Number(row.auto_lon) : null,
      address_lat: row.address_lat ? Number(row.address_lat) : null,
      address_lon: row.address_lon ? Number(row.address_lon) : null,
      final_lat: row.lat ? Number(row.lat) : null,
      final_lon: row.lon ? Number(row.lon) : null,
      location_verification_status: row.location_verification_status,
      geolocation_source: row.geolocation_source,
      address_vs_cadastral_distance_m: row.address_vs_cadastral_distance_m,
      admin_override_reason: row.admin_override_reason,
      admin_override_updated_at: row.admin_override_updated_at,
    }));

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Editor Admin · Publicacion de Obras</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    :root {
      --bg: #0b1220;
      --bg-2: #101a2d;
      --panel: #0f172a;
      --text: #e2e8f0;
      --muted: #94a3b8;
      --border: #334155;
      --chip: #1e293b;
      --accent: #22d3ee;
      --danger: #dc2626;
      --ok: #16a34a;
      --warn: #d97706;
    }
    html, body { margin: 0; height: 100%; font: 12px/1.45 "Segoe UI", Tahoma, Arial, sans-serif; background: var(--bg); }
    .layout { display: grid; grid-template-columns: 420px 1fr; height: 100%; }
    .panel { background: linear-gradient(180deg, var(--panel), var(--bg-2)); color: var(--text); overflow: auto; border-right: 1px solid var(--border); }
    .panel h1 { margin: 0; font-size: 15px; padding: 10px 12px; border-bottom: 1px solid var(--border); }
    .block { padding: 10px 12px; border-bottom: 1px solid var(--border); }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .panel input, .panel select, .panel textarea {
      width: 100%;
      box-sizing: border-box;
      margin-top: 4px;
      margin-bottom: 8px;
      padding: 6px;
      border-radius: 6px;
      border: 1px solid #475569;
      background: #0b1220;
      color: var(--text);
    }
    .panel button {
      margin-right: 6px;
      margin-bottom: 6px;
      padding: 6px 8px;
      border-radius: 6px;
      border: 1px solid #475569;
      background: var(--chip);
      color: var(--text);
      cursor: pointer;
    }
    .panel button:hover { background: #334155; }
    .btn-danger { border-color: #7f1d1d; background: #450a0a; }
    .btn-success { border-color: #14532d; background: #052e16; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
    .chip { display: inline-block; border-radius: 999px; padding: 2px 8px; border: 1px solid #475569; background: #0b1220; }
    .rows { padding: 8px; }
    .row { border: 1px solid var(--border); border-radius: 8px; padding: 8px; margin-bottom: 8px; cursor: pointer; background: rgba(2, 6, 23, 0.45); }
    .row.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
    .badge { display: inline-block; border-radius: 999px; padding: 1px 8px; border: 1px solid #475569; margin-right: 4px; }
    .row.deleted { opacity: 0.45; }
    #map { height: 100%; }
    .hint { color: var(--muted); font-size: 11px; }
    .tiny { font-size: 10px; }
    .divider { border-color: var(--border); border-style: solid; border-width: 1px 0 0 0; margin: 8px 0; }
    .form-mode { display: inline-flex; gap: 6px; margin-bottom: 8px; }
    .form-extra { display: none; }
    .form-extra.visible { display: block; }
    @media (max-width: 1100px) {
      .layout { grid-template-columns: 1fr; grid-template-rows: 58% 42%; }
      .panel { border-right: none; border-bottom: 1px solid var(--border); }
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="panel">
      <h1>Panel Admin de Publicacion</h1>
      <div class="block">
        <label>Clave administrador</label>
        <input id="admin-pass" type="password" placeholder="Ingresar clave" />
        <button id="unlock-btn">Desbloquear edición</button>
        <div id="lock-state" class="hint">Modo solo lectura.</div>
      </div>

      <div class="block">
        <div><b>Resumen de resultados</b></div>
        <div id="summary-chips" class="chips"></div>
        <div class="hint tiny">Esta vista permite consultar, corregir ubicacion, modificar datos, agregar obra y borrar logico.</div>
      </div>

      <div class="block">
        <div><b>Consulta y filtros</b></div>
        <label>Buscar por fila / legajo / texto</label>
        <input id="search" type="text" placeholder="Ej: 134, legajo 125, castelli" />
        <label>Estado</label>
        <select id="status-filter">
          <option value="all">Todos</option>
          <option value="missing_address_point">missing_address_point</option>
          <option value="missing_cadastral_point">missing_cadastral_point</option>
          <option value="no_comparison_points">no_comparison_points</option>
          <option value="verified_nearby">verified_nearby</option>
          <option value="verified_close">verified_close</option>
        </select>
        <label>Origen</label>
        <select id="source-filter">
          <option value="all">Todos</option>
          <option value="automatic">automatic</option>
          <option value="admin_override">admin_override</option>
          <option value="admin_new">admin_new</option>
        </select>
      </div>

      <div class="block">
        <div><b>Formulario de obra (ejemplos)</b></div>
        <div class="form-mode">
          <button id="form-simple-btn" type="button">Formulario simple</button>
          <button id="form-full-btn" type="button">Formulario completo</button>
        </div>

        <div class="grid2">
          <div>
            <label>Fila</label>
            <input id="row-input" type="text" placeholder="Ej: 245" />
          </div>
          <div>
            <label>Legajo</label>
            <input id="legajo-input" type="text" placeholder="Ej: 220" />
          </div>
        </div>

        <label>Direccion / ubicacion</label>
        <textarea id="ubicacion-input" rows="2" placeholder="Ej: Alberdi 123 esq Mitre"></textarea>

        <div class="grid2">
          <div>
            <label>Lat final</label>
            <input id="lat-input" type="number" step="0.00000001" />
          </div>
          <div>
            <label>Lon final</label>
            <input id="lon-input" type="number" step="0.00000001" />
          </div>
        </div>

        <label>Motivo / observacion admin</label>
        <textarea id="reason-input" rows="2" placeholder="Por que se corrige o agrega"></textarea>

        <div id="extra-form-fields" class="form-extra">
          <div class="grid2">
            <div>
              <label>Estado</label>
              <select id="status-input">
                <option value="missing_address_point">missing_address_point</option>
                <option value="missing_cadastral_point">missing_cadastral_point</option>
                <option value="no_comparison_points">no_comparison_points</option>
                <option value="verified_nearby">verified_nearby</option>
                <option value="verified_close">verified_close</option>
              </select>
            </div>
            <div>
              <label>NCP formateado</label>
              <input id="ncp-input" type="text" placeholder="Ej: 010001..." />
            </div>
          </div>

          <div class="grid2">
            <div>
              <label>Metodo match</label>
              <input id="method-input" type="text" placeholder="manz_parc" />
            </div>
            <div>
              <label>Confidence</label>
              <input id="confidence-input" type="text" placeholder="high/medium/low" />
            </div>
          </div>

          <label>Address query</label>
          <input id="query-input" type="text" placeholder="Query usada o sugerida" />
        </div>

        <button id="new-btn" type="button">Nueva obra</button>
        <button id="save-record-btn" class="btn-success" type="button">Guardar alta/modificacion</button>
        <button id="delete-btn" class="btn-danger" type="button">Borrar (logico)</button>
        <button id="undelete-btn" type="button">Restaurar borrado</button>
        <button id="save-btn" type="button">Guardar override punto</button>
        <button id="reset-btn" type="button">Revertir a automatico</button>

        <div class="divider"></div>
        <button id="export-btn" type="button">Exportar JSON overrides</button>
        <button id="export-admin-btn" type="button">Exportar JSON admin cambios</button>
        <button id="import-admin-btn" type="button">Importar JSON admin cambios</button>
        <input id="import-admin-file" type="file" accept="application/json" style="display:none" />

        <div class="hint">Guardar el archivo descargado en:</div>
        <div class="hint">${overridesPath.replace(/\\/g, "\\\\")}</div>
        <div class="hint">Archivo sugerido para cambios CRUD: <b>cadastral-admin-changes.json</b></div>
        <div class="hint">Tip: tambien podes clickear el mapa para fijar lat/lon del punto final.</div>
        <div class="hint" id="selected-meta"></div>
      </div>

      <div id="rows" class="rows"></div>
    </aside>
    <div id="map"></div>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const ADMIN_PASSWORD = ${JSON.stringify(ADMIN_EDITOR_PASSWORD)};
    const baseRows = ${JSON.stringify(payload)};
    let adminUnlocked = false;
    let selectedRow = null;

    const rowsById = new Map(baseRows.map((r) => [String(r.source_row_number), { ...r }]));
    const addedRows = new Map();
    const editedRows = new Map();
    const deletedRows = new Set();

    const overrides = new Map(
      baseRows
        .filter(r => r.geolocation_source === 'admin_override' && Number.isFinite(r.final_lat) && Number.isFinite(r.final_lon))
        .map(r => [String(r.source_row_number), {
          source_row_number: String(r.source_row_number),
          lat: r.final_lat,
          lon: r.final_lon,
          reason: r.admin_override_reason || '',
          updated_at: r.admin_override_updated_at || ''
        }])
    );

    const map = L.map('map').setView([-32.2292, -58.1417], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    let autoMarker = null;
    let addressMarker = null;
    let finalMarker = null;
    let joinLine = null;

    const rowsEl = document.getElementById('rows');
    const summaryChipsEl = document.getElementById('summary-chips');
    const searchEl = document.getElementById('search');
    const statusFilterEl = document.getElementById('status-filter');
    const sourceFilterEl = document.getElementById('source-filter');
    const rowEl = document.getElementById('row-input');
    const legajoEl = document.getElementById('legajo-input');
    const ubicacionEl = document.getElementById('ubicacion-input');
    const latEl = document.getElementById('lat-input');
    const lonEl = document.getElementById('lon-input');
    const reasonEl = document.getElementById('reason-input');
    const statusEl = document.getElementById('status-input');
    const ncpEl = document.getElementById('ncp-input');
    const methodEl = document.getElementById('method-input');
    const confidenceEl = document.getElementById('confidence-input');
    const queryEl = document.getElementById('query-input');
    const extraFormEl = document.getElementById('extra-form-fields');
    const selectedMetaEl = document.getElementById('selected-meta');
    const lockStateEl = document.getElementById('lock-state');

    function getEffectiveRows() {
      const merged = [];
      for (const [id, row] of rowsById.entries()) {
        if (deletedRows.has(id)) continue;
        const edited = editedRows.get(id);
        merged.push(edited ? { ...row, ...edited } : { ...row });
      }
      for (const row of addedRows.values()) {
        if (!deletedRows.has(String(row.source_row_number))) {
          merged.push({ ...row });
        }
      }
      merged.sort((a, b) => Number(a.source_row_number) - Number(b.source_row_number));
      return merged;
    }

    function updateSummary() {
      const currentRows = getEffectiveRows();
      const byStatus = new Map();
      let withOverride = 0;
      for (const row of currentRows) {
        byStatus.set(row.location_verification_status, (byStatus.get(row.location_verification_status) || 0) + 1);
        if (row.geolocation_source === 'admin_override' || overrides.has(String(row.source_row_number))) {
          withOverride += 1;
        }
      }
      const pieces = [];
      pieces.push('<span class="chip">total: ' + currentRows.length + '</span>');
      pieces.push('<span class="chip">override: ' + withOverride + '</span>');
      pieces.push('<span class="chip">altas: ' + addedRows.size + '</span>');
      pieces.push('<span class="chip">mods: ' + editedRows.size + '</span>');
      pieces.push('<span class="chip">bajas: ' + deletedRows.size + '</span>');
      for (const [k, v] of byStatus.entries()) {
        pieces.push('<span class="chip">' + k + ': ' + v + '</span>');
      }
      summaryChipsEl.innerHTML = pieces.join('');
    }

    function statusColor(status) {
      if (status === 'verified_close') return '#16a34a';
      if (status === 'verified_nearby') return '#65a30d';
      if (status === 'review_medium_gap') return '#d97706';
      if (status === 'review_large_gap') return '#dc2626';
      return '#64748b';
    }

    function clearMap() {
      for (const layer of [autoMarker, addressMarker, finalMarker, joinLine]) {
        if (layer) map.removeLayer(layer);
      }
      autoMarker = addressMarker = finalMarker = joinLine = null;
    }

    function renderRows() {
      const q = (searchEl.value || '').toLowerCase().trim();
      const statusFilter = statusFilterEl.value;
      const sourceFilter = sourceFilterEl.value;
      rowsEl.innerHTML = '';

      getEffectiveRows()
        .filter(r => {
          if (!q) return true;
          return String(r.source_row_number).includes(q)
            || String(r.legajo_canonico).toLowerCase().includes(q)
            || String(r.raw_ubicacion || '').toLowerCase().includes(q);
        })
        .filter(r => statusFilter === 'all' ? true : r.location_verification_status === statusFilter)
        .filter(r => sourceFilter === 'all' ? true : r.geolocation_source === sourceFilter)
        .forEach(r => {
          const div = document.createElement('div');
          const id = String(r.source_row_number);
          div.className = 'row' + (selectedRow && selectedRow.source_row_number === r.source_row_number ? ' active' : '');
          if (deletedRows.has(id)) {
            div.className += ' deleted';
          }
          div.innerHTML =
            '<div><b>Fila ' + r.source_row_number + '</b> · legajo ' + (r.legajo_canonico || '-') + '</div>' +
            '<div>' + (r.raw_ubicacion || '-') + '</div>' +
            '<div><span class="badge" style="border-color:' + statusColor(r.location_verification_status) + '">' + r.location_verification_status + '</span>' +
            '<span class="badge">dist: ' + (r.address_vs_cadastral_distance_m || '-') + ' m</span>' +
            '<span class="badge">' + r.geolocation_source + '</span>' +
            '<span class="badge">ncp: ' + (r.ncp_formatted || '-') + '</span></div>';
          div.onclick = () => selectRow(r);
          rowsEl.appendChild(div);
        });

      updateSummary();
    }

    function selectRow(r) {
      selectedRow = r;
      renderRows();
      clearMap();

      const ovr = overrides.get(String(r.source_row_number));
      const finalLat = ovr ? ovr.lat : r.final_lat;
      const finalLon = ovr ? ovr.lon : r.final_lon;

      rowEl.value = String(r.source_row_number || '');
      legajoEl.value = String(r.legajo_canonico || '');
      ubicacionEl.value = String(r.raw_ubicacion || '');
      statusEl.value = String(r.location_verification_status || 'missing_address_point');
      ncpEl.value = String(r.ncp_formatted || '');
      methodEl.value = String(r.match_method || '');
      confidenceEl.value = String(r.confidence || '');
      queryEl.value = String(r.address_query || '');

      if (Number.isFinite(r.auto_lat) && Number.isFinite(r.auto_lon)) {
        autoMarker = L.circleMarker([r.auto_lat, r.auto_lon], { radius: 7, color: '#2563eb', fillColor: '#60a5fa', fillOpacity: 0.95, weight: 2 })
          .bindPopup('Automático (catastro)')
          .addTo(map);
      }

      if (Number.isFinite(r.address_lat) && Number.isFinite(r.address_lon)) {
        addressMarker = L.circleMarker([r.address_lat, r.address_lon], { radius: 7, color: '#c2410c', fillColor: '#fb923c', fillOpacity: 0.95, weight: 2 })
          .bindPopup('Dirección IGN')
          .addTo(map);
      }

      if (Number.isFinite(finalLat) && Number.isFinite(finalLon)) {
        finalMarker = L.marker([finalLat, finalLon], { draggable: adminUnlocked }).addTo(map).bindPopup('Punto final editable');
        finalMarker.on('dragend', () => {
          const p = finalMarker.getLatLng();
          latEl.value = String(p.lat.toFixed(8));
          lonEl.value = String(p.lng.toFixed(8));
        });
      }

      if (Number.isFinite(finalLat) && Number.isFinite(finalLon) && Number.isFinite(r.address_lat) && Number.isFinite(r.address_lon)) {
        joinLine = L.polyline([[finalLat, finalLon], [r.address_lat, r.address_lon]], { color: '#facc15', weight: 3, dashArray: '8 6' }).addTo(map);
      }

      latEl.value = Number.isFinite(finalLat) ? String(finalLat) : '';
      lonEl.value = Number.isFinite(finalLon) ? String(finalLon) : '';
      reasonEl.value = ovr?.reason || r.admin_override_reason || '';
      selectedMetaEl.textContent = 'Fila ' + r.source_row_number + ' · estado: ' + r.location_verification_status + ' · origen: ' + r.geolocation_source;

      const pts = [];
      if (Number.isFinite(r.auto_lat) && Number.isFinite(r.auto_lon)) pts.push([r.auto_lat, r.auto_lon]);
      if (Number.isFinite(r.address_lat) && Number.isFinite(r.address_lon)) pts.push([r.address_lat, r.address_lon]);
      if (Number.isFinite(finalLat) && Number.isFinite(finalLon)) pts.push([finalLat, finalLon]);
      if (pts.length > 0) map.fitBounds(pts, { padding: [40, 40] });
    }

    function createCurrentFormRecord() {
      const id = String(rowEl.value || '').trim();
      const lat = latEl.value === '' ? null : Number(latEl.value);
      const lon = lonEl.value === '' ? null : Number(lonEl.value);
      if (!id) {
        throw new Error('Fila requerida');
      }
      if ((latEl.value !== '' && !Number.isFinite(lat)) || (lonEl.value !== '' && !Number.isFinite(lon))) {
        throw new Error('Lat/Lon invalidas');
      }

      const geolocationSource = overrides.has(id) ? 'admin_override' : (rowsById.has(id) ? 'automatic' : 'admin_new');
      return {
        source_row_number: id,
        legajo_canonico: String(legajoEl.value || '').trim(),
        row_kind: 'detail',
        raw_ubicacion: String(ubicacionEl.value || '').trim(),
        ncp_formatted: String(ncpEl.value || '').trim(),
        match_method: String(methodEl.value || '').trim(),
        confidence: String(confidenceEl.value || '').trim(),
        address_query: String(queryEl.value || '').trim(),
        address_match_name: selectedRow?.address_match_name || '',
        address_geocode_status: selectedRow?.address_geocode_status || '',
        auto_lat: selectedRow?.auto_lat ?? null,
        auto_lon: selectedRow?.auto_lon ?? null,
        address_lat: selectedRow?.address_lat ?? null,
        address_lon: selectedRow?.address_lon ?? null,
        final_lat: lat,
        final_lon: lon,
        location_verification_status: String(statusEl.value || 'missing_address_point'),
        geolocation_source: geolocationSource,
        address_vs_cadastral_distance_m: selectedRow?.address_vs_cadastral_distance_m || '',
        admin_override_reason: String(reasonEl.value || '').trim(),
        admin_override_updated_at: selectedRow?.admin_override_updated_at || '',
      };
    }

    document.getElementById('unlock-btn').onclick = () => {
      const pass = document.getElementById('admin-pass').value;
      adminUnlocked = pass === ADMIN_PASSWORD;
      lockStateEl.textContent = adminUnlocked ? 'Modo administrador activo. Arrastrar marcador final habilitado.' : 'Clave incorrecta. Modo solo lectura.';
      if (finalMarker) {
        if (adminUnlocked) {
          finalMarker.dragging.enable();
        } else {
          finalMarker.dragging.disable();
        }
      }
    };

    document.getElementById('form-simple-btn').onclick = () => {
      extraFormEl.classList.remove('visible');
    };
    document.getElementById('form-full-btn').onclick = () => {
      extraFormEl.classList.add('visible');
    };

    document.getElementById('new-btn').onclick = () => {
      if (!adminUnlocked) return;
      selectedRow = null;
      rowEl.value = '';
      legajoEl.value = '';
      ubicacionEl.value = '';
      latEl.value = '';
      lonEl.value = '';
      reasonEl.value = '';
      statusEl.value = 'missing_address_point';
      ncpEl.value = '';
      methodEl.value = '';
      confidenceEl.value = '';
      queryEl.value = '';
      selectedMetaEl.textContent = 'Alta nueva: completar formulario y guardar.';
      clearMap();
    };

    document.getElementById('save-record-btn').onclick = () => {
      if (!adminUnlocked) return;
      try {
        const rec = createCurrentFormRecord();
        const id = String(rec.source_row_number);
        if (rowsById.has(id)) {
          editedRows.set(id, rec);
        } else {
          addedRows.set(id, rec);
        }
        deletedRows.delete(id);
        selectedRow = rec;
        selectedMetaEl.textContent = 'Registro guardado en borrador admin: fila ' + id;
        renderRows();
        selectRow(rec);
      } catch (err) {
        selectedMetaEl.textContent = 'Error al guardar: ' + (err && err.message ? err.message : 'dato invalido');
      }
    };

    document.getElementById('delete-btn').onclick = () => {
      if (!adminUnlocked) return;
      const id = String(rowEl.value || '').trim();
      if (!id) return;
      deletedRows.add(id);
      overrides.delete(id);
      addedRows.delete(id);
      selectedMetaEl.textContent = 'Fila ' + id + ' marcada para baja logica.';
      selectedRow = null;
      renderRows();
      clearMap();
    };

    document.getElementById('undelete-btn').onclick = () => {
      if (!adminUnlocked) return;
      const id = String(rowEl.value || '').trim();
      if (!id) return;
      deletedRows.delete(id);
      selectedMetaEl.textContent = 'Fila ' + id + ' restaurada.';
      renderRows();
    };

    document.getElementById('save-btn').onclick = () => {
      if (!adminUnlocked) return;
      const id = String(rowEl.value || '').trim();
      if (!id) return;
      const lat = Number(latEl.value);
      const lon = Number(lonEl.value);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      overrides.set(id, {
        source_row_number: id,
        lat,
        lon,
        reason: reasonEl.value || '',
        updated_at: new Date().toISOString(),
      });
      if (selectedRow) {
        selectedRow.final_lat = lat;
        selectedRow.final_lon = lon;
        selectedRow.geolocation_source = 'admin_override';
      }
      renderRows();
      if (selectedRow) {
        selectRow(selectedRow);
      }
    };

    document.getElementById('reset-btn').onclick = () => {
      if (!adminUnlocked) return;
      const id = String(rowEl.value || '').trim();
      if (!id) return;
      overrides.delete(id);
      if (selectedRow) {
        selectedRow.geolocation_source = rowsById.has(id) ? 'automatic' : 'admin_new';
        selectRow(selectedRow);
      }
      renderRows();
    };

    document.getElementById('export-btn').onclick = () => {
      const payload = {
        updatedAt: new Date().toISOString(),
        overrides: Array.from(overrides.values()).sort((a, b) => Number(a.source_row_number) - Number(b.source_row_number)),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'cadastral-overrides.json';
      a.click();
      URL.revokeObjectURL(a.href);
    };

    function exportAdminChanges() {
      const payload = {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        notes: 'Cambios admin para alta, baja, modificacion y correccion de ubicacion.',
        overrides: Array.from(overrides.values()).sort((a, b) => Number(a.source_row_number) - Number(b.source_row_number)),
        addedRows: Array.from(addedRows.values()).sort((a, b) => Number(a.source_row_number) - Number(b.source_row_number)),
        editedRows: Array.from(editedRows.values()).sort((a, b) => Number(a.source_row_number) - Number(b.source_row_number)),
        deletedRows: Array.from(deletedRows.values()).sort((a, b) => Number(a) - Number(b)),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'cadastral-admin-changes.json';
      a.click();
      URL.revokeObjectURL(a.href);
    }

    document.getElementById('export-admin-btn').onclick = () => exportAdminChanges();
    document.getElementById('import-admin-btn').onclick = () => document.getElementById('import-admin-file').click();

    document.getElementById('import-admin-file').onchange = async (ev) => {
      const f = ev.target && ev.target.files ? ev.target.files[0] : null;
      if (!f) return;
      const txt = await f.text();
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed.overrides)) {
        for (const o of parsed.overrides) {
          if (!o || !o.source_row_number) continue;
          overrides.set(String(o.source_row_number), {
            source_row_number: String(o.source_row_number),
            lat: Number(o.lat),
            lon: Number(o.lon),
            reason: String(o.reason || ''),
            updated_at: String(o.updated_at || new Date().toISOString()),
          });
        }
      }
      if (Array.isArray(parsed.addedRows)) {
        for (const r of parsed.addedRows) {
          if (!r || !r.source_row_number) continue;
          addedRows.set(String(r.source_row_number), r);
        }
      }
      if (Array.isArray(parsed.editedRows)) {
        for (const r of parsed.editedRows) {
          if (!r || !r.source_row_number) continue;
          editedRows.set(String(r.source_row_number), r);
        }
      }
      if (Array.isArray(parsed.deletedRows)) {
        for (const id of parsed.deletedRows) {
          deletedRows.add(String(id));
        }
      }

      renderRows();
      selectedMetaEl.textContent = 'Cambios admin importados: ' + f.name;
      ev.target.value = '';
    };

    map.on('click', (ev) => {
      if (!adminUnlocked) return;
      latEl.value = String(ev.latlng.lat.toFixed(8));
      lonEl.value = String(ev.latlng.lng.toFixed(8));
      if (selectedRow) {
        selectedRow.final_lat = Number(latEl.value);
        selectedRow.final_lon = Number(lonEl.value);
        if (finalMarker) {
          finalMarker.setLatLng([selectedRow.final_lat, selectedRow.final_lon]);
        }
      }
    });

    searchEl.oninput = () => renderRows();
    statusFilterEl.onchange = () => renderRows();
    sourceFilterEl.onchange = () => renderRows();

    renderRows();
    const initialRows = getEffectiveRows();
    if (initialRows.length > 0) selectRow(initialRows[0]);
  </script>
</body>
</html>`;
}

async function main(): Promise<void> {
  const repoRoot = findRepoRoot(path.resolve(process.cwd()));
  const baseName = "LISTADO PLANOS-hasta-2026.xlsx - 2025(1)";
  const cleaningDir = path.join(repoRoot, "artifacts", "planos-cleaning");
  const normalizedCsvPath = path.join(cleaningDir, `${baseName}.normalized.csv`);
  const parcelaGeoJsonPath = path.join(repoRoot, "artifacts", "colon-3d", "public", "data", "Parcela.geojson");
  const barriosGeoJsonPath = path.join(repoRoot, "attached_assets", "geojson", "barrios.geojson");
  const appPlanosDataDir = path.join(repoRoot, "artifacts", "colon-3d", "public", "data", "planos");
  const appToolsDir = path.join(repoRoot, "artifacts", "colon-3d", "public", "tools");

  if (!fs.existsSync(normalizedCsvPath)) {
    throw new Error(`Missing normalized CSV: ${normalizedCsvPath}`);
  }

  if (!fs.existsSync(parcelaGeoJsonPath)) {
    throw new Error(`Missing parcel geojson: ${parcelaGeoJsonPath}`);
  }

  const normalizedRaw = fs.readFileSync(normalizedCsvPath, "utf8");
  const rows = parseCsv(normalizedRaw, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as NormalizedRow[];

  const parcelRaw = fs.readFileSync(parcelaGeoJsonPath, "utf8");
  const parcelaData = JSON.parse(parcelRaw) as ParcelGeoJson;
  const parcelFeatures = Array.isArray(parcelaData.features) ? parcelaData.features : [];

  const byMethod: Record<MatchMethod, number> = {
    gru_manz_parc: 0,
    manz_parc: 0,
    gru_parc: 0,
    none: 0,
  };

  const byConfidence: Record<Confidence, number> = {
    high: 0,
    medium: 0,
    low: 0,
  };

  const byVerificationStatus: Record<string, number> = {};
  const geocodeCache = new Map<string, AddressMatch | null>();
  const overridesJsonPath = path.join(cleaningDir, `${baseName}.cadastral-overrides.json`);
  const adminChangesJsonPath = path.join(cleaningDir, `${baseName}.cadastral-admin-changes.json`);
  const overrides = loadAdminOverrides(overridesJsonPath);
  const adminChanges = loadAdminChanges(adminChangesJsonPath);
  const extraOverrides = Array.isArray(adminChanges.overrides) ? adminChanges.overrides : [];
  for (const override of extraOverrides) {
    const key = String(override.source_row_number ?? "").trim();
    if (!key || !Number.isFinite(override.lat) || !Number.isFinite(override.lon)) {
      continue;
    }
    overrides.set(key, {
      source_row_number: key,
      lat: Number(override.lat),
      lon: Number(override.lon),
      reason: override.reason ?? "",
      updated_at: override.updated_at ?? "",
    });
  }

  let consideredRows = 0;
  let matchedRows = 0;
  let uniqueMatches = 0;
  let ambiguousMatches = 0;
  let addressGeocodedRows = 0;
  let addressVerificationComparableRows = 0;

  const geolocatedRows: GeolocatedRow[] = [];

  for (const row of rows) {
    const rowKind = (row.row_kind ?? "").trim();
    if (!isGeolocatableRow(rowKind)) {
      continue;
    }

    consideredRows += 1;

    const concesionRaw = row.raw__nomenclatura_catastral_concesion ?? "";
    const manzanaRaw = row.raw__manzana ?? "";
    const parcelaRawValue = row.raw__parcela ?? "";

    const concesion = parseIntLike(concesionRaw);
    const manzana = parseIntLike(manzanaRaw);
    const parcela = parseIntLike(parcelaRawValue);
    const sourceProfile = buildSourceComponentProfile(concesion, manzana, parcela);

    const match = findMatches(parcelFeatures, concesion, manzana, parcela);

    byMethod[match.method] += 1;
    byConfidence[match.confidence] += 1;

    if (match.matches.length > 0) {
      matchedRows += 1;
    }
    if (match.matches.length === 1) {
      uniqueMatches += 1;
    }
    if (match.matches.length > 1) {
      ambiguousMatches += 1;
    }

    const top = match.matches[0];
    const center = top ? bboxCenter(top.geometry) : null;
    const topSec = typeof top?.properties.SEC === "number" ? top.properties.SEC : null;
    const topGru = typeof top?.properties.GRU === "number" ? top.properties.GRU : null;
    const topManz = typeof top?.properties.NMANZ === "number" ? top.properties.NMANZ : null;
    const topParc = typeof top?.properties.NPARC === "number" ? top.properties.NPARC : null;
    const ncpFormatted = formatParcelNcp(topSec, topGru, topManz, topParc);
    const ncpRaw = typeof top?.properties.NCP === "string" ? top.properties.NCP : "";
    const sourceNcp = deriveSourceNcp(match, top);
    const postalAddressAvailable = (row.raw__ubicacion ?? "").trim() ? "yes" : "no";
    const cadastralReferenceAvailable = sourceProfile.count > 0 ? "yes" : "no";
    const rawAddress = normalizeWhitespace(row.raw__ubicacion ?? "");
    let addressMatch: AddressMatch | null = null;

    if (rawAddress) {
      addressMatch = await geocodeAddressVariants(rawAddress, geocodeCache);
    }

    if (addressMatch) {
      addressGeocodedRows += 1;
    }

    const override = overrides.get(String(row.source_row_number ?? "").trim());
    const finalCenter = override && Number.isFinite(override.lat) && Number.isFinite(override.lon)
      ? { lat: override.lat, lon: override.lon }
      : center;

    const hasAutoCadastralPoint = center !== null;
    const hasCadastralPoint = finalCenter !== null;
    const hasAddressPoint = addressMatch !== null;
    const autoDistanceMeters = hasAutoCadastralPoint && hasAddressPoint && center && addressMatch
      ? haversineDistanceMeters(center.lat, center.lon, addressMatch.lat, addressMatch.lon)
      : null;
    const distanceMeters = hasCadastralPoint && hasAddressPoint && finalCenter && addressMatch
      ? haversineDistanceMeters(finalCenter.lat, finalCenter.lon, addressMatch.lat, addressMatch.lon)
      : null;
    if (distanceMeters !== null) {
      addressVerificationComparableRows += 1;
    }
    const autoVerificationStatus = classifyVerification(autoDistanceMeters, hasAutoCadastralPoint, hasAddressPoint);
    const verificationStatus = classifyVerification(distanceMeters, hasCadastralPoint, hasAddressPoint);
    byVerificationStatus[verificationStatus] = (byVerificationStatus[verificationStatus] ?? 0) + 1;

    const dualVerificationReady = postalAddressAvailable === "yes" && sourceNcp.value && hasAddressPoint ? "yes" : "no";

    geolocatedRows.push({
      source_row_number: row.source_row_number ?? "",
      legajo_canonico: row.legajo_canonico ?? "",
      row_kind: rowKind,
      raw_ubicacion: row.raw__ubicacion ?? "",
      raw_concesion: concesionRaw,
      raw_manzana: manzanaRaw,
      raw_parcela: parcelaRawValue,
      source_component_profile: sourceProfile.profile,
      source_component_count: sourceProfile.count,
      source_ncp_derived: sourceNcp.value,
      source_ncp_derivation_status: sourceNcp.status,
      match_method: match.method,
      match_count: match.matches.length,
      confidence: match.confidence,
      reason: match.reason,
      parcela_id: top?.properties.ID ? String(top.properties.ID) : "",
      ncp: ncpRaw,
      ncp_formatted: ncpFormatted,
      ncp_format_status: ncpFormatted ? (ncpRaw === ncpFormatted ? "matches_source_ncp" : "normalized_from_components") : "missing_components",
      sec: topSec === null ? "" : String(topSec),
      gru: topGru === null ? "" : String(topGru),
      nmanz: topManz === null ? "" : String(topManz),
      nparc: topParc === null ? "" : String(topParc),
      lon: formatCoord(finalCenter?.lon ?? null),
      lat: formatCoord(finalCenter?.lat ?? null),
      auto_lon: formatCoord(center?.lon ?? null),
      auto_lat: formatCoord(center?.lat ?? null),
      geolocation_source: override ? "admin_override" : "automatic",
      admin_override_reason: override?.reason ?? "",
      admin_override_updated_at: override?.updated_at ?? "",
      postal_address_available: postalAddressAvailable,
      cadastral_reference_available: cadastralReferenceAvailable,
      dual_verification_ready: dualVerificationReady,
      address_query: addressMatch?.query ?? buildAddressQueries(rawAddress)[0] ?? "",
      address_geocode_status: rawAddress ? (addressMatch ? "matched_ign" : "no_ign_match") : "missing_address",
      address_match_name: addressMatch?.name ?? "",
      address_lon: formatCoord(addressMatch?.lon ?? null),
      address_lat: formatCoord(addressMatch?.lat ?? null),
      address_vs_auto_cadastral_distance_m: autoDistanceMeters === null ? "" : autoDistanceMeters.toFixed(2),
      address_vs_cadastral_distance_m: distanceMeters === null ? "" : distanceMeters.toFixed(2),
      auto_location_verification_status: autoVerificationStatus,
      location_verification_status: verificationStatus,
    });
  }

  const unmatchedRows = consideredRows - matchedRows;

  const geolocatedCsvPath = path.join(cleaningDir, `${baseName}.cadastral-geolocated.csv`);
  const geolocatedJsonPath = path.join(cleaningDir, `${baseName}.cadastral-geolocated.json`);
  const summaryPath = path.join(cleaningDir, `${baseName}.cadastral-geolocated.summary.json`);
  const visualHtmlPath = path.join(cleaningDir, `${baseName}.cadastral-vs-address.samples.html`);
  const adminEditorHtmlPath = path.join(cleaningDir, `${baseName}.cadastral-admin-editor.html`);
  const finalRows = applyAdminChanges(geolocatedRows, adminChanges);

  const byVerificationStatusFinal: Record<string, number> = {};
  for (const row of finalRows) {
    const status = row.location_verification_status || "unknown";
    byVerificationStatusFinal[status] = (byVerificationStatusFinal[status] ?? 0) + 1;
  }
  const addressGeocodedRowsFinal = finalRows.filter((row) => row.address_geocode_status === "matched_ign").length;
  const addressVerificationComparableRowsFinal = finalRows.filter((row) => !!row.address_vs_cadastral_distance_m).length;

  fs.writeFileSync(geolocatedCsvPath, stringifyCsv(finalRows, { header: true }), "utf8");
  fs.writeFileSync(geolocatedJsonPath, JSON.stringify(finalRows, null, 2), "utf8");

    // Merge geolocated data with original normalized data
    const normalizedRowsMap = new Map<string, NormalizedRow>();
    for (const row of rows) {
      const key = String(row.source_row_number ?? "").trim();
      if (key) normalizedRowsMap.set(key, row);
    }

    const enrichedRows: Array<Record<string, unknown>> = [];
    for (const geoRow of finalRows) {
      const origRow = normalizedRowsMap.get(geoRow.source_row_number);
      const tipo = String(origRow?.raw__tipo ?? "").trim();
      const merged: Record<string, unknown> = {
        ...geoRow,
        ...(origRow || {}),
        ano: origRow?.raw__ano ?? "",
        expediente: origRow?.raw__expediente ?? origRow?.expediente_raw ?? "",
        ingreso: origRow?.ingreso_iso ?? origRow?.ingreso_raw ?? "",
        zonificacion: origRow?.raw__zonificacion ?? "",
        ubicacion: origRow?.raw__ubicacion ?? geoRow.raw_ubicacion,
        propietario: origRow?.raw__propietario ?? "",
        nombre_del_establecimiento_y_o_empresa: origRow?.raw__nombre_del_establecimiento_y_o_empresa ?? "",
        profesional_proyecto: origRow?.raw__profesional_proyecto ?? "",
        direccion_de_obra: origRow?.raw__direccion_de_obra ?? "",
        estructura: origRow?.raw__estructura ?? "",
        constructor: origRow?.raw__constructor ?? "",
        categoria: origRow?.raw__categoria ?? "",
        indicadores_f_o_s: origRow?.raw__indicadores_f_o_s ?? "",
        f_o_t: origRow?.raw__f_o_t ?? "",
        fecha_de_visado: origRow?.fecha_visado_iso ?? origRow?.raw__fecha_de_visado ?? "",
        final_de_obra: origRow?.final_obra_iso ?? origRow?.raw__final_de_obra ?? "",
        tipo,
        destino_uso: deriveDestinationFromTipo(tipo),
        relevamiento_o_existente: origRow?.raw__relevamiento_o_existente ?? "",
        a_contruir_obra_nueva: origRow?.raw__a_contruir_obra_nueva ?? "",
        ampliacion_de_obra_existente: origRow?.raw__ampliacion_de_obra_existente ?? "",
        proyectado_no_iniciado: origRow?.raw__proyectado_no_iniciado ?? "",
        m_existentes_relevados_vivienda: origRow?.raw__m_existentes_relevados_vivienda ?? "",
        m_existentes_relevados_local: origRow?.raw__local__2 ?? "",
        m_a_construir_vivienda: origRow?.raw__m_a_construir_vivienda ?? "",
        m_a_construir_local: origRow?.raw__local__3 ?? "",
      };
      enrichedRows.push(merged);
    }

    // Generate publication levels
    const pubOutputs = {
      public: exportPublicationLevel(enrichedRows, "public", baseName, cleaningDir),
      professional: exportPublicationLevel(enrichedRows, "professional", baseName, cleaningDir),
      admin: exportPublicationLevel(enrichedRows, "admin", baseName, cleaningDir)
    };

    // Generate analytics
    const analytics = generateAnalytics(enrichedRows);
    const analyticsPath = path.join(cleaningDir, `${baseName}.analytics.json`);
    fs.writeFileSync(analyticsPath, JSON.stringify(analytics, null, 2), "utf8");
    const analyticsOutputs = writeAnalyticsArtifacts(
      enrichedRows,
      analytics,
      cleaningDir,
      baseName,
      fs.existsSync(barriosGeoJsonPath) ? barriosGeoJsonPath : undefined,
    );

  const visualSampleRows = finalRows
    .filter((row) => row.address_lat && row.address_lon && row.lat && row.lon)
    .filter((row) => row.location_verification_status === "verified_close" || row.location_verification_status === "verified_nearby" || row.location_verification_status === "review_medium_gap" || row.location_verification_status === "review_large_gap")
    .slice(0, 8);
  fs.writeFileSync(visualHtmlPath, buildVisualHtml(visualSampleRows), "utf8");
  fs.writeFileSync(adminEditorHtmlPath, buildAdminEditorHtml(finalRows, overridesJsonPath), "utf8");

  const appPublicGeoJson = path.join(appPlanosDataDir, "obras-public.geojson");
  const appProfessionalGeoJson = path.join(appPlanosDataDir, "obras-professional.geojson");
  const appAdminGeoJson = path.join(appPlanosDataDir, "obras-admin.geojson");
  const appDashboardHtml = path.join(appToolsDir, "analytics-dashboard.html");
  const appAdminEditorHtml = path.join(appToolsDir, "admin-editor.html");

  copyIfExists(pubOutputs.public.geoJsonPath, appPublicGeoJson);
  copyIfExists(pubOutputs.professional.geoJsonPath, appProfessionalGeoJson);
  copyIfExists(pubOutputs.admin.geoJsonPath, appAdminGeoJson);
  copyIfExists(analyticsOutputs.analyticsDashboardHtml, appDashboardHtml);
  copyIfExists(adminEditorHtmlPath, appAdminEditorHtml);

  if (!fs.existsSync(overridesJsonPath)) {
    fs.writeFileSync(
      overridesJsonPath,
      JSON.stringify({ updatedAt: new Date().toISOString(), overrides: [] }, null, 2),
      "utf8",
    );
  }

  const summary: Summary = {
    totalRows: rows.length,
    consideredRows,
    matchedRows,
    uniqueMatches,
    ambiguousMatches,
    unmatchedRows,
    byMethod,
    byConfidence,
    addressGeocodedRows: addressGeocodedRowsFinal,
    addressVerificationComparableRows: addressVerificationComparableRowsFinal,
    byVerificationStatus: byVerificationStatusFinal,
    outputs: {
      geolocatedCsv: geolocatedCsvPath,
      geolocatedJson: geolocatedJsonPath,
      summaryJson: summaryPath,
      visualHtml: visualHtmlPath,
      adminEditorHtml: adminEditorHtmlPath,
      overridesJson: overridesJsonPath,
      adminChangesJson: adminChangesJsonPath,
      analyticsDashboardHtml: analyticsOutputs.analyticsDashboardHtml,
      analysisMapPrepJson: analyticsOutputs.analysisMapPrepJson,
      analysisPointsGeoJson: analyticsOutputs.analysisPointsGeoJson,
      analysisZonesChoroplethGeoJson: analyticsOutputs.analysisZonesChoroplethGeoJson,
      appDashboardHtml,
      appAdminEditorHtml,
      appRoleData: {
        publicGeoJson: appPublicGeoJson,
        professionalGeoJson: appProfessionalGeoJson,
        adminGeoJson: appAdminGeoJson,
      },
      publicationLevels: pubOutputs,
      analytics,
    },
  };

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

void main();
