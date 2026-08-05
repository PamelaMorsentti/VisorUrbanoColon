import fs from "node:fs";
import path from "node:path";
import {
  type AnalyticsAggregation,
  normalizeDestinoLabel,
  normalizeTipoLabel,
  normalizeZoneLabel,
} from "./publication-levels";

type AnyRow = Record<string, unknown>;

type HeatPoint = {
  lat: number;
  lon: number;
  weight: number;
  intensity: number;
  tipo: string;
  destino: string;
  zonificacion: string;
  status: string;
};

type ZoneSummary = {
  zone: string;
  count: number;
  totalM2Construir: number;
  avgM2Construir: number;
  verifiedCloseCount: number;
  viviendaCount: number;
  comercialCount: number;
  mixedCount: number;
  topTypes: Array<{ label: string; value: number }>;
};

type TimelineBucket = {
  period: string;
  count: number;
  totalM2Construir: number;
};

type MapPrepArtifacts = {
  generatedAt: string;
  totalRows: number;
  pointsGeoJson: {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      geometry: { type: "Point"; coordinates: [number, number] };
      properties: Record<string, unknown>;
    }>;
  };
  barrioChoropleth?: {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      geometry: { type: string; coordinates: unknown };
      properties: Record<string, unknown>;
    }>;
  };
  heatmapPoints: HeatPoint[];
  zones: ZoneSummary[];
  byType: AnalyticsAggregation["byType"];
  byDestiny: AnalyticsAggregation["byDestiny"];
  timelineByYear: TimelineBucket[];
  timelineByMonth: TimelineBucket[];
  recommendedVisualizations: Array<{
    id: string;
    title: string;
    dataset: string;
    style: string;
    notes: string;
  }>;
};

function parseNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const text = String(value ?? "").trim();
  if (!text) {
    return 0;
  }
  const normalized = text.replace(/\./g, "").replace(/,/g, ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown, fallback = ""): string {
  const out = String(value ?? "").trim();
  return out || fallback;
}

function m2ConstruirTotal(row: AnyRow): number {
  return parseNumber(row.m_a_construir_vivienda) + parseNumber(row.m_a_construir_local);
}

function m2ExistenteTotal(row: AnyRow): number {
  return parseNumber(row.m_existentes_relevados_vivienda) + parseNumber(row.m_existentes_relevados_local);
}

function destinationBucket(destiny: string): "vivienda" | "comercial" | "mixed" | "other" {
  const value = destiny.toLowerCase();
  if (value.includes("vivienda") && value.includes("comercial")) {
    return "mixed";
  }
  if (value.includes("vivienda")) {
    return "vivienda";
  }
  if (value.includes("comercial")) {
    return "comercial";
  }
  return "other";
}

function topEntries(input: Record<string, number>, limit: number): Array<{ label: string; value: number }> {
  return Object.entries(input)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

function buildTimeline(rows: AnyRow[], mode: "year" | "month"): TimelineBucket[] {
  const buckets = new Map<string, TimelineBucket>();
  for (const row of rows) {
    const ingreso = text(row.ingreso);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ingreso)) {
      continue;
    }
    const period = mode === "year" ? ingreso.slice(0, 4) : ingreso.slice(0, 7);
    const current = buckets.get(period) ?? { period, count: 0, totalM2Construir: 0 };
    current.count += 1;
    current.totalM2Construir += m2ConstruirTotal(row);
    buckets.set(period, current);
  }
  return Array.from(buckets.values()).sort((a, b) => a.period.localeCompare(b.period));
}

function pointInRing(lon: number, lat: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > lat !== yj > lat
      && lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygonGeometry(lon: number, lat: number, geometry: { type: string; coordinates: unknown } | null | undefined): boolean {
  if (!geometry || !Array.isArray(geometry.coordinates)) {
    return false;
  }
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as unknown[];
    if (!Array.isArray(rings[0])) return false;
    const shell = rings[0] as Array<[number, number]>;
    if (!pointInRing(lon, lat, shell)) return false;
    for (let i = 1; i < rings.length; i += 1) {
      if (pointInRing(lon, lat, rings[i] as Array<[number, number]>)) return false;
    }
    return true;
  }
  if (geometry.type === "MultiPolygon") {
    const polygons = geometry.coordinates as unknown[];
    for (const polygon of polygons) {
      const poly = { type: "Polygon", coordinates: polygon };
      if (pointInPolygonGeometry(lon, lat, poly)) return true;
    }
  }
  return false;
}

function neighborhoodName(properties: Record<string, unknown>): string {
  const keys = ["BARRIO", "barrio", "NOMBRE", "nombre", "Name", "NAME"];
  for (const key of keys) {
    const value = String(properties[key] ?? "").trim();
    if (value) return value;
  }
  return "Sin barrio";
}

function buildBarriosChoropleth(
  barriosData: {
    type: string;
    features: Array<{ type: string; properties?: Record<string, unknown>; geometry?: { type: string; coordinates: unknown } }>;
  },
  pointFeatures: Array<{ type: "Feature"; geometry: { type: "Point"; coordinates: [number, number] }; properties: Record<string, unknown> }>,
): MapPrepArtifacts["barrioChoropleth"] {
  const outFeatures = barriosData.features.map((feature) => {
    const properties = feature.properties ?? {};
    const barrio = neighborhoodName(properties);
    const stats = {
      barrio,
      count_obras: 0,
      m2_construir_total: 0,
      vivienda_count: 0,
      comercial_count: 0,
      mixto_count: 0,
      verified_close_count: 0,
    };

    for (const point of pointFeatures) {
      const [lon, lat] = point.geometry.coordinates;
      if (!pointInPolygonGeometry(lon, lat, feature.geometry)) {
        continue;
      }
      stats.count_obras += 1;
      const m2 = parseNumber(point.properties.m2_construir_total);
      stats.m2_construir_total += m2;
      const destino = normalizeDestinoLabel(point.properties.destino_uso, point.properties.tipo);
      if (destino === "vivienda") stats.vivienda_count += 1;
      if (destino === "comercial") stats.comercial_count += 1;
      if (destino === "mixto") stats.mixto_count += 1;
      if (String(point.properties.location_verification_status) === "verified_close") stats.verified_close_count += 1;
    }

    return {
      type: "Feature" as const,
      geometry: {
        type: feature.geometry?.type ?? "Polygon",
        coordinates: feature.geometry?.coordinates ?? [],
      },
      properties: {
        ...properties,
        ...stats,
      },
    };
  });

  return {
    type: "FeatureCollection",
    features: outFeatures,
  };
}

export function buildMapPrepArtifacts(
  rows: AnyRow[],
  analytics: AnalyticsAggregation,
  barriosGeoJsonPath?: string,
): MapPrepArtifacts {
  const features: MapPrepArtifacts["pointsGeoJson"]["features"] = [];
  const heatmapPoints: HeatPoint[] = [];
  const zonesMap = new Map<string, ZoneSummary>();

  for (const row of rows) {
    const lat = Number(row.lat);
    const lon = Number(row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }

    const tipo = normalizeTipoLabel(row.tipo);
    const destino = normalizeDestinoLabel(row.destino_uso, row.tipo);
    const zonificacion = normalizeZoneLabel(row.zonificacion);
    const status = text(row.location_verification_status, "unknown");
    const totalConstruir = m2ConstruirTotal(row);
    const totalExistente = m2ExistenteTotal(row);
    const intensity = Math.max(1, totalConstruir > 0 ? Math.min(8, Math.log10(totalConstruir + 10) * 3) : 1);

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        source_row_number: row.source_row_number,
        legajo_canonico: row.legajo_canonico,
        ubicacion: row.ubicacion ?? row.raw_ubicacion,
        ncp_formatted: row.ncp_formatted,
        tipo,
        destino_uso: destino,
        zonificacion,
        geolocation_source: row.geolocation_source,
        location_verification_status: status,
        fecha_de_visado: row.fecha_de_visado,
        ingreso: row.ingreso,
        m2_construir_total: totalConstruir,
        m2_existente_total: totalExistente,
        relevamiento_o_existente: row.relevamiento_o_existente,
        a_contruir_obra_nueva: row.a_contruir_obra_nueva,
        ampliacion_de_obra_existente: row.ampliacion_de_obra_existente,
        proyectado_no_iniciado: row.proyectado_no_iniciado,
      },
    });

    heatmapPoints.push({
      lat,
      lon,
      weight: Math.max(1, totalConstruir),
      intensity,
      tipo,
      destino,
      zonificacion,
      status,
    });

    const zone = zonesMap.get(zonificacion) ?? {
      zone: zonificacion,
      count: 0,
      totalM2Construir: 0,
      avgM2Construir: 0,
      verifiedCloseCount: 0,
      viviendaCount: 0,
      comercialCount: 0,
      mixedCount: 0,
      topTypes: [],
    };
    zone.count += 1;
    zone.totalM2Construir += totalConstruir;
    if (status === "verified_close") {
      zone.verifiedCloseCount += 1;
    }
    const destinyKind = destinationBucket(destino);
    if (destinyKind === "vivienda") zone.viviendaCount += 1;
    if (destinyKind === "comercial") zone.comercialCount += 1;
    if (destinyKind === "mixed") zone.mixedCount += 1;
    zonesMap.set(zonificacion, zone);
  }

  for (const [zoneName, zone] of zonesMap.entries()) {
    const analyticsZone = analytics.byZone[zoneName];
    zone.avgM2Construir = zone.count > 0 ? zone.totalM2Construir / zone.count : 0;
    zone.topTypes = analyticsZone ? topEntries(analyticsZone.types, 3) : [];
  }

  let barrioChoropleth: MapPrepArtifacts["barrioChoropleth"] | undefined;
  if (barriosGeoJsonPath && fs.existsSync(barriosGeoJsonPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(barriosGeoJsonPath, "utf8")) as {
        type: string;
        features: Array<{ type: string; properties?: Record<string, unknown>; geometry?: { type: string; coordinates: unknown } }>;
      };
      if (raw.type === "FeatureCollection" && Array.isArray(raw.features)) {
        barrioChoropleth = buildBarriosChoropleth(raw, features);
      }
    } catch {
      barrioChoropleth = undefined;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    totalRows: rows.length,
    pointsGeoJson: {
      type: "FeatureCollection",
      features,
    },
    barrioChoropleth,
    heatmapPoints,
    zones: Array.from(zonesMap.values()).sort((a, b) => b.count - a.count || a.zone.localeCompare(b.zone)),
    byType: analytics.byType,
    byDestiny: analytics.byDestiny,
    timelineByYear: buildTimeline(rows, "year"),
    timelineByMonth: buildTimeline(rows, "month"),
    recommendedVisualizations: [
      {
        id: "heatmap-growth",
        title: "Mapa de calor de crecimiento",
        dataset: "heatmapPoints",
        style: "leaflet.heat o kernel density",
        notes: "Usar weight/intensity para priorizar m2 a construir y densidad de obras.",
      },
      {
        id: "point-cloud-status",
        title: "Nube de puntos por estado",
        dataset: "pointsGeoJson",
        style: "circle markers categorizados por location_verification_status",
        notes: "Sirve para ver dispersion, precision y focos de actividad.",
      },
      {
        id: "weighted-bubbles",
        title: "Burbujas por superficie",
        dataset: "pointsGeoJson",
        style: "radio proporcional a m2_construir_total y color por destino_uso",
        notes: "Adecuado para comunicar tipo y magnitud de crecimiento.",
      },
      {
        id: "choropleth-zone",
        title: "Coropleta por zonificacion",
        dataset: "zones",
        style: "join con poligonos de zonificacion o barrios",
        notes: "Comparar cantidad de obras, m2 y predominio de usos por zona.",
      },
    ],
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: value >= 100 ? 0 : 1 }).format(value);
}

function buildBars(title: string, items: Array<{ label: string; value: number }>, color: string): string {
  const max = Math.max(1, ...items.map((item) => item.value));
  return `
    <section class="card chart-card">
      <div class="card-title">${escapeHtml(title)}</div>
      <div class="bars">
        ${items.map((item) => `
          <div class="bar-row">
            <div class="bar-label">${escapeHtml(item.label)}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${(item.value / max) * 100}%;background:${color}"></div></div>
            <div class="bar-value">${formatCompactNumber(item.value)}</div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

export function buildAnalyticsDashboardHtml(
  rows: AnyRow[],
  analytics: AnalyticsAggregation,
  prep: MapPrepArtifacts,
  title: string,
): string {
  const topZones = prep.zones.slice(0, 8).map((zone) => ({ label: zone.zone, value: zone.count }));
  const topTypes = topEntries(Object.fromEntries(Object.entries(analytics.byType).map(([key, value]) => [key, value.count])), 10);
  const topDestinies = topEntries(Object.fromEntries(Object.entries(analytics.byDestiny).map(([key, value]) => [key, value.count])), 8);
  const totalVerifiedClose = rows.filter((row) => String(row.location_verification_status) === "verified_close").length;
  const totalWithCoords = prep.pointsGeoJson.features.length;
  const publicRows = rows.map((row) => ({
    source_row_number: row.source_row_number,
    legajo_canonico: row.legajo_canonico,
    ubicacion: row.ubicacion ?? row.raw_ubicacion,
    lat: row.lat,
    lon: row.lon,
    tipo: normalizeTipoLabel(row.tipo),
    destino_uso: normalizeDestinoLabel(row.destino_uso, row.tipo),
    zonificacion: normalizeZoneLabel(row.zonificacion),
    status: row.location_verification_status,
    m2_construir_total: m2ConstruirTotal(row),
    fecha_de_visado: row.fecha_de_visado,
  }));

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    :root {
      --bg: #f3efe6;
      --paper: rgba(255,255,255,0.82);
      --panel: #fbf8f2;
      --ink: #18202a;
      --muted: #637081;
      --line: rgba(24, 32, 42, 0.12);
      --accent: #0f766e;
      --accent-2: #d97706;
      --accent-3: #b91c1c;
      --accent-4: #1d4ed8;
      --shadow: 0 12px 32px rgba(34, 39, 46, 0.12);
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background:
      radial-gradient(circle at top left, rgba(15,118,110,0.12), transparent 28%),
      radial-gradient(circle at top right, rgba(217,119,6,0.12), transparent 24%),
      linear-gradient(180deg, #f7f2e8 0%, #efe7d7 100%);
      color: var(--ink); font: 13px/1.45 Georgia, "Times New Roman", serif; }
    .shell { display: grid; grid-template-columns: 430px 1fr; min-height: 100vh; }
    .sidebar { padding: 18px; border-right: 1px solid var(--line); background: linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0.55)); backdrop-filter: blur(10px); }
    .main { padding: 18px; }
    .hero { margin-bottom: 16px; }
    .eyebrow { letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); font-size: 10px; margin-bottom: 6px; }
    h1 { margin: 0; font-size: 28px; line-height: 1.05; }
    .lead { margin: 10px 0 0; color: var(--muted); }
    .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
    .card { background: var(--paper); border: 1px solid var(--line); border-radius: 18px; box-shadow: var(--shadow); }
    .metric { padding: 14px 16px; }
    .metric-label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
    .metric-value { margin-top: 6px; font-size: 26px; font-weight: 700; }
    .metric-sub { margin-top: 4px; color: var(--muted); font-size: 12px; }
    .filters, .chart-card, .table-card, .legend-card { padding: 14px 16px; margin-top: 12px; }
    .card-title { font-size: 15px; font-weight: 700; margin-bottom: 10px; }
    .grid { display: grid; gap: 10px; }
    .grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    label { display: block; font-size: 11px; color: var(--muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.06em; }
    select, input { width: 100%; border: 1px solid var(--line); background: #fffdf8; color: var(--ink); border-radius: 10px; padding: 8px 10px; }
    .layout-main { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(340px, 0.85fr); gap: 14px; }
    #map { height: 64vh; min-height: 540px; border-radius: 22px; overflow: hidden; border: 1px solid var(--line); box-shadow: var(--shadow); }
    .bars { display: grid; gap: 8px; }
    .bar-row { display: grid; grid-template-columns: 132px 1fr auto; gap: 8px; align-items: center; }
    .bar-label { font-size: 12px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar-track { height: 10px; background: rgba(24, 32, 42, 0.07); border-radius: 999px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 999px; }
    .bar-value { color: var(--muted); font-size: 12px; }
    .table { width: 100%; border-collapse: collapse; }
    .table th, .table td { text-align: left; padding: 8px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
    .table th { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 999px; margin-right: 6px; }
    .legend-item { margin-bottom: 6px; color: var(--muted); }
    .pill { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); padding: 6px 10px; border-radius: 999px; background: rgba(255,255,255,0.75); margin: 0 6px 6px 0; }
    .small-note { color: var(--muted); font-size: 12px; }
    .mini-table-note { color: var(--muted); font-size: 11px; margin-top: 8px; }
    .kv-list { display: grid; gap: 8px; }
    .kv-item { display: flex; justify-content: space-between; gap: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }
    .muted-chip { color: var(--muted); font-size: 11px; }
    @media (max-width: 1200px) {
      .shell, .layout-main { grid-template-columns: 1fr; }
      #map { height: 56vh; min-height: 420px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside class="sidebar">
      <div class="hero">
        <div class="eyebrow">Analitica Urbana</div>
        <h1>${escapeHtml(title)}</h1>
        <p class="lead">Lectura territorial de obras privadas geolocalizadas para detectar crecimiento, usos dominantes y magnitud de superficie declarada.</p>
      </div>

      <div class="cards">
        <section class="card metric">
          <div class="metric-label">Obras consideradas</div>
          <div class="metric-value">${formatCompactNumber(rows.length)}</div>
          <div class="metric-sub">${formatCompactNumber(totalWithCoords)} con coordenadas utilizables</div>
        </section>
        <section class="card metric">
          <div class="metric-label">m2 a construir</div>
          <div class="metric-value">${formatCompactNumber(analytics.totalM2Construir)}</div>
          <div class="metric-sub">suma vivienda + local</div>
        </section>
        <section class="card metric">
          <div class="metric-label">Verificacion close</div>
          <div class="metric-value">${formatCompactNumber(totalVerifiedClose)}</div>
          <div class="metric-sub">base de mayor confianza espacial</div>
        </section>
        <section class="card metric">
          <div class="metric-label">Zonas activas</div>
          <div class="metric-value">${formatCompactNumber(prep.zones.length)}</div>
          <div class="metric-sub">agrupaciones por zonificacion detectadas</div>
        </section>
      </div>

      <section class="card filters">
        <div class="card-title">Filtros del mapa</div>
        <div class="grid two">
          <div>
            <label for="zone-filter">Zonificacion</label>
            <select id="zone-filter"><option value="all">Todas</option></select>
          </div>
          <div>
            <label for="destiny-filter">Destino</label>
            <select id="destiny-filter"><option value="all">Todos</option></select>
          </div>
          <div>
            <label for="type-filter">Tipo</label>
            <select id="type-filter"><option value="all">Todos</option></select>
          </div>
          <div>
            <label for="status-filter">Estado</label>
            <select id="status-filter"><option value="all">Todos</option></select>
          </div>
        </div>
        <div style="margin-top:10px">
          <span class="pill"><input type="checkbox" id="toggle-points" checked /> puntos</span>
          <span class="pill"><input type="checkbox" id="toggle-bubbles" checked /> burbujas por m2</span>
          <span class="pill"><input type="checkbox" id="toggle-heat" checked /> mapa de calor</span>
          <span class="pill"><input type="checkbox" id="toggle-choropleth" checked /> coropleta barrios</span>
        </div>
      </section>

      <section class="card table-card">
        <div class="card-title">Estado de georeferenciacion</div>
        <table class="table">
          <thead><tr><th>Estado</th><th>Obras</th></tr></thead>
          <tbody id="georef-table"></tbody>
        </table>
        <div class="mini-table-note">Se toma del mismo origen de datos que alimenta el visor y el panel de capas de obras.</div>
      </section>

      <section class="card table-card">
        <div class="card-title">Integraciones nuevas del visor</div>
        <div class="kv-list" id="integration-list">
          <div class="kv-item"><span>Hidrologia sincronizada</span><span class="muted-chip">servicios + crecida</span></div>
          <div class="kv-item"><span>Linea/curva de crecida</span><span class="muted-chip">referencia por cota</span></div>
          <div class="kv-item"><span>Busqueda por domicilio</span><span class="muted-chip">autocompletado activo</span></div>
          <div class="kv-item"><span>Datos por rol</span><span class="muted-chip">publico/profesional/admin</span></div>
        </div>
      </section>

      ${buildBars("Zonas con mas obras", topZones, "linear-gradient(90deg, #0f766e, #14b8a6)")}
      ${buildBars("Tipos predominantes", topTypes, "linear-gradient(90deg, #d97706, #f59e0b)")}
      ${buildBars("Destinos predominantes", topDestinies, "linear-gradient(90deg, #1d4ed8, #60a5fa)")}

      <section class="card legend-card">
        <div class="card-title">Capas preparadas para mapas posteriores</div>
        ${prep.recommendedVisualizations.map((item) => `<div class="legend-item"><b>${escapeHtml(item.title)}</b><br>${escapeHtml(item.notes)}</div>`).join("")}
      </section>
    </aside>

    <main class="main">
      <div class="layout-main">
        <section>
          <div id="map"></div>
          <div class="small-note" style="margin-top:10px">El dashboard usa solo datos de nivel publico. Puede reutilizarse luego en Leaflet, el visor React y QGIS mediante los artefactos de salida.</div>
        </section>
        <section>
          <section class="card table-card">
            <div class="card-title">Zonas prioritarias</div>
            <table class="table">
              <thead><tr><th>Zona</th><th>Obras</th><th>m2</th><th>Top tipo</th></tr></thead>
              <tbody id="zones-table"></tbody>
            </table>
          </section>
          <section class="card table-card">
            <div class="card-title">Serie mensual</div>
            <table class="table">
              <thead><tr><th>Periodo</th><th>Obras</th><th>m2</th></tr></thead>
              <tbody id="timeline-table"></tbody>
            </table>
          </section>
          <section class="card table-card">
            <div class="card-title">Resumen de uso</div>
            <div id="usage-pills"></div>
          </section>
          <section class="card table-card">
            <div class="card-title">Modalidad de declaracion</div>
            <table class="table">
              <thead><tr><th>Modalidad</th><th>Obras</th></tr></thead>
              <tbody id="declaration-table"></tbody>
            </table>
          </section>
          <section class="card table-card">
            <div class="card-title">Cobertura de datos por rol</div>
            <div id="role-coverage" class="kv-list"></div>
          </section>
        </section>
      </div>
    </main>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.heat/dist/leaflet-heat.js"></script>
  <script>
    const rows = ${JSON.stringify(publicRows)};
    const prep = ${JSON.stringify(prep)};
    const analytics = ${JSON.stringify(analytics)};

    function escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    const map = L.map('map', { zoomControl: true }).setView([-32.2236, -58.1436], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const zoneFilterEl = document.getElementById('zone-filter');
    const destinyFilterEl = document.getElementById('destiny-filter');
    const typeFilterEl = document.getElementById('type-filter');
    const statusFilterEl = document.getElementById('status-filter');
    const togglePointsEl = document.getElementById('toggle-points');
    const toggleBubblesEl = document.getElementById('toggle-bubbles');
    const toggleHeatEl = document.getElementById('toggle-heat');
    const toggleChoroplethEl = document.getElementById('toggle-choropleth');
    const zonesTableEl = document.getElementById('zones-table');
    const timelineTableEl = document.getElementById('timeline-table');
    const usagePillsEl = document.getElementById('usage-pills');
    const georefTableEl = document.getElementById('georef-table');
    const declarationTableEl = document.getElementById('declaration-table');
    const roleCoverageEl = document.getElementById('role-coverage');

    const markerLayer = L.layerGroup().addTo(map);
    const bubbleLayer = L.layerGroup().addTo(map);
    const choroplethLayer = L.layerGroup().addTo(map);
    let heatLayer = null;

    function uniqueValues(key) {
      return Array.from(new Set(rows.map((row) => String(row[key] || '')).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    }

    function fillSelect(el, values) {
      values.forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        el.appendChild(option);
      });
    }

    fillSelect(zoneFilterEl, uniqueValues('zonificacion'));
    fillSelect(destinyFilterEl, uniqueValues('destino_uso'));
    fillSelect(typeFilterEl, uniqueValues('tipo'));
    fillSelect(statusFilterEl, uniqueValues('status'));

    function colorByDestiny(destiny) {
      const value = String(destiny || '').toLowerCase();
      if (value.includes('vivienda') && value.includes('comercial')) return '#8b5cf6';
      if (value.includes('vivienda')) return '#0f766e';
      if (value.includes('comercial')) return '#d97706';
      if (value.includes('tur')) return '#0284c7';
      return '#475569';
    }

    function passes(row) {
      if (zoneFilterEl.value !== 'all' && String(row.zonificacion || '') !== zoneFilterEl.value) return false;
      if (destinyFilterEl.value !== 'all' && String(row.destino_uso || '') !== destinyFilterEl.value) return false;
      if (typeFilterEl.value !== 'all' && String(row.tipo || '') !== typeFilterEl.value) return false;
      if (statusFilterEl.value !== 'all' && String(row.status || '') !== statusFilterEl.value) return false;
      return true;
    }

    function renderMap() {
      markerLayer.clearLayers();
      bubbleLayer.clearLayers();
      choroplethLayer.clearLayers();
      if (heatLayer) {
        map.removeLayer(heatLayer);
        heatLayer = null;
      }

      if (toggleChoroplethEl.checked && prep.barrioChoropleth && prep.barrioChoropleth.features) {
        const maxCount = Math.max(1, ...prep.barrioChoropleth.features.map((f) => Number(f.properties.count_obras || 0)));
        L.geoJSON(prep.barrioChoropleth, {
          style: (feature) => {
            const count = Number(feature.properties.count_obras || 0);
            const ratio = count / maxCount;
            const fill = ratio > 0.7 ? '#b91c1c' : ratio > 0.45 ? '#d97706' : ratio > 0.2 ? '#0f766e' : '#94a3b8';
            return {
              color: '#334155',
              weight: 1,
              fillColor: fill,
              fillOpacity: 0.24,
            };
          },
          onEachFeature: (feature, layer) => {
            const props = feature.properties || {};
            layer.bindPopup(
              '<b>Barrio:</b> ' + escapeHtml(props.barrio || props.BARRIO || props.nombre || 'Sin barrio') + '<br>' +
              '<b>Obras:</b> ' + (props.count_obras || 0) + '<br>' +
              '<b>m2 construir:</b> ' + Math.round(Number(props.m2_construir_total || 0)) + '<br>' +
              '<b>Vivienda:</b> ' + (props.vivienda_count || 0) + ' · <b>Comercial:</b> ' + (props.comercial_count || 0)
            );
          }
        }).addTo(choroplethLayer);
      }

      const filteredRows = rows.filter(passes);
      const bounds = [];
      const heatData = [];

      filteredRows.forEach((row) => {
        const lat = Number(row.lat);
        const lon = Number(row.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        const color = colorByDestiny(row.destino_uso);
        const m2 = Number(row.m2_construir_total || 0);
        bounds.push([lat, lon]);
        heatData.push([lat, lon, Math.max(0.15, Math.min(1, (m2 || 10) / 500))]);

        if (togglePointsEl.checked) {
          L.circleMarker([lat, lon], {
            radius: 5,
            color,
            fillColor: color,
            fillOpacity: 0.85,
            weight: 1.5,
          }).bindPopup(
            '<b>Fila ' + row.source_row_number + '</b><br>' +
            escapeHtml(row.ubicacion || '-') + '<br>' +
            'Tipo: <b>' + escapeHtml(row.tipo || '-') + '</b><br>' +
            'Destino: <b>' + escapeHtml(row.destino_uso || '-') + '</b><br>' +
            'Zona: <b>' + escapeHtml(row.zonificacion || '-') + '</b><br>' +
            'm2 construir: <b>' + (row.m2_construir_total || 0) + '</b>'
          ).addTo(markerLayer);
        }

        if (toggleBubblesEl.checked) {
          L.circle([lat, lon], {
            radius: Math.max(18, Math.sqrt(Math.max(1, m2)) * 8),
            color,
            fillColor: color,
            fillOpacity: 0.12,
            weight: 1,
          }).addTo(bubbleLayer);
        }
      });

      if (toggleHeatEl.checked && heatData.length > 0 && window.L.heatLayer) {
        heatLayer = L.heatLayer(heatData, {
          radius: 28,
          blur: 22,
          maxZoom: 17,
          gradient: { 0.15: '#60a5fa', 0.4: '#14b8a6', 0.7: '#f59e0b', 1: '#b91c1c' }
        }).addTo(map);
      }

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
      }
    }

    function renderTables() {
      zonesTableEl.innerHTML = prep.zones.slice(0, 10).map((zone) =>
        '<tr><td>' + escapeHtml(zone.zone) + '</td><td>' + zone.count + '</td><td>' + Math.round(zone.totalM2Construir) + '</td><td>' + escapeHtml((zone.topTypes[0] && zone.topTypes[0].label) || '-') + '</td></tr>'
      ).join('');

      timelineTableEl.innerHTML = prep.timelineByMonth.slice(-12).map((bucket) =>
        '<tr><td>' + escapeHtml(bucket.period) + '</td><td>' + bucket.count + '</td><td>' + Math.round(bucket.totalM2Construir) + '</td></tr>'
      ).join('');

      usagePillsEl.innerHTML = Object.entries(analytics.byDestiny)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([label, item]) => '<span class="pill"><span class="dot" style="background:' + colorByDestiny(label) + '"></span>' + escapeHtml(label) + ' · ' + item.count + '</span>')
        .join('');

      const statusCounts = rows.reduce((acc, row) => {
        const key = String(row.status || 'sin_estado');
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      georefTableEl.innerHTML = Object.entries(statusCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([status, count]) => '<tr><td>' + escapeHtml(status) + '</td><td>' + count + '</td></tr>')
        .join('');

      const featureProps = (prep.pointsGeoJson && prep.pointsGeoJson.features ? prep.pointsGeoJson.features : [])
        .map((feature) => feature && feature.properties ? feature.properties : {});

      function isDeclared(value) {
        const text = String(value == null ? '' : value).trim().toLowerCase();
        if (!text) return false;
        return text !== '0' && text !== 'false' && text !== 'no';
      }

      const declarationSummary = [
        {
          label: 'Relevamiento/existente',
          count: featureProps.filter((p) => isDeclared((p as Record<string, unknown>).relevamiento_o_existente)).length,
        },
        {
          label: 'Obra nueva',
          count: featureProps.filter((p) => isDeclared((p as Record<string, unknown>).a_contruir_obra_nueva) || isDeclared((p as Record<string, unknown>).a_construir_obra_nueva)).length,
        },
        {
          label: 'Ampliacion',
          count: featureProps.filter((p) => isDeclared((p as Record<string, unknown>).ampliacion_de_obra_existente) || isDeclared((p as Record<string, unknown>).ampliacion_obra_existente)).length,
        },
        {
          label: 'Proyectado no iniciado',
          count: featureProps.filter((p) => isDeclared((p as Record<string, unknown>).proyectado_no_iniciado)).length,
        },
      ];

      declarationTableEl.innerHTML = declarationSummary
        .map((item) => '<tr><td>' + escapeHtml(item.label) + '</td><td>' + item.count + '</td></tr>')
        .join('');

      const totalFeatures = featureProps.length;
      const roleCoverageRows = [
        {
          label: 'Nivel publico',
          detail: 'Tipo, destino, estado de georef., m2 y fecha de visado',
        },
        {
          label: 'Nivel profesional',
          detail: 'Suma propietario, profesional y constructor en el visor autenticado',
        },
        {
          label: 'Nivel admin',
          detail: 'Incluye avance de obra y condicion de visado para gestion interna',
        },
      ];

      roleCoverageEl.innerHTML = roleCoverageRows
        .map((item) => '<div class="kv-item"><span>' + escapeHtml(item.label) + '</span><span class="muted-chip">' + escapeHtml(item.detail) + '</span></div>')
        .join('') +
        '<div class="mini-table-note">Registros geolocalizados en este dashboard: ' + totalFeatures + '</div>';
    }

    [zoneFilterEl, destinyFilterEl, typeFilterEl, statusFilterEl, togglePointsEl, toggleBubblesEl, toggleHeatEl, toggleChoroplethEl].forEach((el) => {
      el.addEventListener('change', renderMap);
    });

    renderTables();
    renderMap();
  </script>
</body>
</html>`;
}

export function writeAnalyticsArtifacts(
  rows: AnyRow[],
  analytics: AnalyticsAggregation,
  cleaningDir: string,
  baseName: string,
  barriosGeoJsonPath?: string,
): {
  analyticsDashboardHtml: string;
  analysisMapPrepJson: string;
  analysisPointsGeoJson: string;
  analysisZonesChoroplethGeoJson?: string;
} {
  const prep = buildMapPrepArtifacts(rows, analytics, barriosGeoJsonPath);
  const dashboardPath = path.join(cleaningDir, `${baseName}.analytics-dashboard.html`);
  const prepPath = path.join(cleaningDir, `${baseName}.analysis-map-prep.json`);
  const pointsPath = path.join(cleaningDir, `${baseName}.analysis-points.geojson`);
  const choroplethPath = path.join(cleaningDir, `${baseName}.analysis-zones-choropleth.geojson`);

  fs.writeFileSync(dashboardPath, buildAnalyticsDashboardHtml(rows, analytics, prep, `Dashboard de Obras · ${baseName}`), "utf8");
  fs.writeFileSync(prepPath, JSON.stringify(prep, null, 2), "utf8");
  fs.writeFileSync(pointsPath, JSON.stringify(prep.pointsGeoJson, null, 2), "utf8");
  if (prep.barrioChoropleth) {
    fs.writeFileSync(choroplethPath, JSON.stringify(prep.barrioChoropleth, null, 2), "utf8");
  }

  return {
    analyticsDashboardHtml: dashboardPath,
    analysisMapPrepJson: prepPath,
    analysisPointsGeoJson: pointsPath,
    analysisZonesChoroplethGeoJson: prep.barrioChoropleth ? choroplethPath : undefined,
  };
}
