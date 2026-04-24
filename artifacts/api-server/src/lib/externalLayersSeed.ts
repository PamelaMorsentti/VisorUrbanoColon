import type { InsertLayerCatalog } from "@workspace/db/schema";

export const externalLayerSeed: InsertLayerCatalog[] = [
  {
    key: "ext_ign_satelital",
    label: "IGN — Mosaico satelital",
    description:
      "Imágenes aéreas/satelitales oficiales de Argentina (IGN/ArgenMap)",
    group: "Imágenes base",
    layerType: "tms",
    sourceUrl:
      "https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{-y}/{x}.png",
    sourceLayerName: null,
    attribution:
      '&copy; <a href="https://www.ign.gob.ar" target="_blank">IGN Argentina</a>',
    isExternal: true,
    isActive: true,
    supportsGetFeatureInfo: false,
    legend: [],
  },
  {
    key: "ext_esri_satelital",
    label: "Esri — World Imagery",
    description:
      "Imágenes satelitales globales de alta resolución (Esri/DigitalGlobe)",
    group: "Imágenes base",
    layerType: "tms",
    sourceUrl:
      "https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    sourceLayerName: null,
    attribution:
      '&copy; <a href="https://www.esri.com" target="_blank">Esri</a>, DigitalGlobe',
    isExternal: true,
    isActive: true,
    supportsGetFeatureInfo: false,
    legend: [],
  },
  {
    key: "ext_opentopomap",
    label: "OpenTopoMap — Relieve",
    description: "Mapa topográfico con relieve hillshade basado en datos SRTM",
    group: "Imágenes base",
    layerType: "tms",
    sourceUrl: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    sourceLayerName: null,
    attribution:
      '&copy; <a href="https://opentopomap.org" target="_blank">OpenTopoMap</a>, SRTM',
    isExternal: true,
    isActive: true,
    supportsGetFeatureInfo: false,
    legend: [
      { color: "#7EB87E", label: "Cotas bajas" },
      { color: "#C8B880", label: "Cotas medias" },
      { color: "#A0805A", label: "Cotas altas" },
      { color: "#E8E8E8", label: "Curvas de nivel" },
    ],
  },
  {
    key: "ext_ign_topo",
    label: "IGN — Carta topográfica",
    description: "Carta topográfica vectorial 1:100.000 del IGN Argentina",
    group: "Temáticas nacionales",
    layerType: "wms",
    sourceUrl: "https://wms.ign.gob.ar/geoserver/ows",
    sourceLayerName: "capabasewms",
    attribution:
      '&copy; <a href="https://www.ign.gob.ar" target="_blank">IGN Argentina</a>',
    isExternal: true,
    isActive: true,
    supportsGetFeatureInfo: true,
    legend: [
      { color: "#a8c8a0", label: "Cobertura vegetal" },
      { color: "#d4c080", label: "Zonas áridas" },
      { color: "#8080c8", label: "Hidrografía" },
      { color: "#e0e0e0", label: "Zonas urbanas" },
    ],
  },
  {
    key: "ext_inta_suelos",
    label: "INTA — Carta de suelos",
    description: "Mapa de suelos de Entre Ríos — GeoINTA INTA",
    group: "Temáticas nacionales",
    layerType: "wms",
    sourceUrl: "https://geointa.inta.gob.ar/geoserver/ows",
    sourceLayerName: "geointa:ig_suelos",
    attribution:
      '&copy; <a href="https://geointa.inta.gov.ar" target="_blank">INTA GeoINTA</a>',
    isExternal: true,
    isActive: true,
    supportsGetFeatureInfo: true,
    legend: [
      { color: "#8B4513", label: "Molisoles (alta fertilidad)" },
      { color: "#D2B48C", label: "Entisoles (poco desarrollados)" },
      { color: "#808000", label: "Vertisoles (arcillosos)" },
      { color: "#4682B4", label: "Áreas inundables" },
    ],
  },
  {
    key: "ext_segemar_geo",
    label: "SEGEMAR — Mapa geológico",
    description: "Carta geológica 1:250.000 de Entre Ríos (SEGEMAR)",
    group: "Temáticas nacionales",
    layerType: "wms",
    sourceUrl: "https://repositorio.segemar.gov.ar/geoserver/ows",
    sourceLayerName: "mapa_geologico_500",
    attribution:
      '&copy; <a href="https://www.segemar.gov.ar" target="_blank">SEGEMAR</a>',
    isExternal: true,
    isActive: true,
    supportsGetFeatureInfo: true,
    legend: [
      { color: "#FF6600", label: "Era Cenozoica" },
      { color: "#FFCC00", label: "Era Mesozoica" },
      { color: "#CC99FF", label: "Era Paleozoica" },
      { color: "#FF3333", label: "Rocas ígneas" },
      { color: "#99CCFF", label: "Depósitos cuaternarios" },
    ],
  },
  {
    key: "ext_apn_anp",
    label: "APN — Áreas naturales protegidas",
    description:
      "Áreas naturales protegidas nacionales (Administración Parques Nacionales)",
    group: "Temáticas nacionales",
    layerType: "wms",
    sourceUrl: "https://sig.ambiente.gob.ar/geoserver/ows",
    sourceLayerName: "anp_areas_protegidas",
    attribution:
      '&copy; <a href="https://www.parquesnacionales.gob.ar" target="_blank">APN Argentina</a>',
    isExternal: true,
    isActive: true,
    supportsGetFeatureInfo: true,
    legend: [
      { color: "#1a7a1a", label: "Parque Nacional" },
      { color: "#4db34d", label: "Reserva Nacional" },
      { color: "#80cc80", label: "Monumento Natural" },
      { color: "#b3e6b3", label: "Reserva Natural Estricta" },
    ],
  },
  {
    key: "ext_nasa_precip",
    label: "NASA GPM — Precipitación",
    description:
      "Tasa de precipitación global estimada por satélite (GPM/IMERG, NASA GIBS). Resolución 1 km, dato reciente disponible.",
    group: "Clima y riesgo",
    layerType: "tms",
    sourceUrl:
      "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate/default/{date}/1km/{z}/{y}/{x}.png",
    sourceLayerName: null,
    attribution:
      '&copy; <a href="https://gpm.nasa.gov" target="_blank">NASA GPM</a> vía GIBS/Earthdata',
    isExternal: true,
    isActive: true,
    supportsGetFeatureInfo: false,
    legend: [
      { color: "transparent", label: "Sin precipitación" },
      { color: "#aadaff", label: "< 1 mm/hr" },
      { color: "#48b0e0", label: "1–5 mm/hr" },
      { color: "#48c848", label: "5–20 mm/hr" },
      { color: "#ffcc00", label: "20–50 mm/hr" },
      { color: "#ff3300", label: "> 50 mm/hr" },
    ],
  },
  {
    key: "ext_esa_landcover",
    label: "ESA WorldCover — Cobertura del suelo",
    description:
      "Cobertura global del suelo 2021 a 10 m de resolución (ESA WorldCover via Terrascope). Incluye bosque, pastizal, agua, urbano, etc.",
    group: "Clima y riesgo",
    layerType: "wms",
    sourceUrl: "https://services.terrascope.be/wms/v2",
    sourceLayerName: "WORLDCOVER_2021_MAP",
    attribution:
      '&copy; <a href="https://esa-worldcover.org" target="_blank">ESA WorldCover</a>',
    isExternal: true,
    isActive: true,
    supportsGetFeatureInfo: true,
    legend: [
      { color: "#006400", label: "Árboles" },
      { color: "#FFBB22", label: "Matorral" },
      { color: "#FFFF4C", label: "Pastizal" },
      { color: "#F096FF", label: "Cultivos" },
      { color: "#FA0000", label: "Área urbana" },
      { color: "#B4B4B4", label: "Suelo desnudo" },
      { color: "#0064C8", label: "Agua permanente" },
      { color: "#0096A0", label: "Humedal herbáceo" },
      { color: "#F0F0F0", label: "Nieve / hielo" },
    ],
  },
  {
    key: "ext_jrc_surface_water",
    label: "JRC/Copernicus — Agua superficial",
    description:
      "Ocurrencia histórica de agua superficial (JRC Global Surface Water, 1984-2021). Muestra áreas con agua permanente o estacional — útil para riesgo de inundación.",
    group: "Clima y riesgo",
    layerType: "tms",
    sourceUrl:
      "https://storage.googleapis.com/global-surface-water/tiles2021/occurrence/{z}/{x}/{y}.png",
    sourceLayerName: null,
    attribution:
      '&copy; <a href="https://global-surface-water.appspot.com" target="_blank">JRC / Copernicus</a>',
    isExternal: true,
    isActive: true,
    supportsGetFeatureInfo: false,
    legend: [
      { color: "#d1edf9", label: "Agua estacional (< 25%)" },
      { color: "#7ec8e3", label: "Agua frecuente (25–75%)" },
      { color: "#0064c8", label: "Agua permanente (> 75%)" },
      { color: "#002070", label: "Agua permanente 100%" },
    ],
  },
];
