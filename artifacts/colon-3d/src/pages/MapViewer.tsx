import { useEffect, useRef, useState, useCallback } from "react";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FeatureCollection = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Geometry = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type _Feature = any; // unused
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Header from "@/components/Header";
import LayersPanel from "@/components/LayersPanel";
import FeatureInfo from "@/components/FeatureInfo";
import ZonaLegend from "@/components/ZonaLegend";
import { LAYERS, COLON_CENTER, COLON_ZOOM, ZONA_COLORS } from "@/lib/layers";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");

type LeafletLayer = L.GeoJSON | L.LayerGroup;

function getLayerStyle(layerId: string): L.PathOptions {
  switch (layerId) {
    case "manzana":
      return { fillColor: "#1e2432", fillOpacity: 0.75, color: "#3a4255", weight: 1, opacity: 0.9 };
    case "parcela":
      return { fillColor: "transparent", fillOpacity: 0, color: "#5b6882", weight: 0.6, opacity: 0.8 };
    case "calle":
      return { color: "#525861", weight: 1.5, opacity: 0.9 };
    case "vias":
      return { color: "#d97706", weight: 2.5, opacity: 0.9 };
    case "municipio":
      return { fillColor: "transparent", fillOpacity: 0, color: "#60a5fa", weight: 2, opacity: 0.9, dashArray: "6 4" };
    case "seccion":
      return { fillColor: "transparent", fillOpacity: 0, color: "#a78bfa", weight: 1.5, opacity: 0.8, dashArray: "5 3" };
    case "barrios":
      return { fillColor: "#3b82f6", fillOpacity: 0.08, color: "#60a5fa", weight: 1.5, opacity: 0.8 };
    case "edif":
      return { fillColor: "#4a6080", fillOpacity: 1, color: "#364d68", weight: 0.5, opacity: 1 };
    case "edif_palta":
      return { fillColor: "#a05a20", fillOpacity: 1, color: "#7c4015", weight: 0.5, opacity: 1 };
    case "ph":
      return { fillColor: "#4b5563", fillOpacity: 0.85, color: "#374151", weight: 0.5, opacity: 0.8 };
    case "superp":
      return { fillColor: "#d97706", fillOpacity: 0.5, color: "#b45309", weight: 0.5, opacity: 0.8 };
    case "cota10":
      return { color: "#1a5c3a", weight: 0.8, opacity: 0.65 };
    case "hidro":
      return { color: "#38bdf8", weight: 1.5, opacity: 0.75 };
    case "arbol":
      return { fillColor: "#16a34a", fillOpacity: 0.35, color: "#22c55e", weight: 1, opacity: 0.9 };
    case "grupo":
      return { fillColor: "#7c3aed", fillOpacity: 0.12, color: "#7c3aed", weight: 1, opacity: 0.6 };
    case "zonas":
      return { color: "#ff5522", weight: 2, opacity: 0.85 };
    default:
      return { fillColor: "#4b5563", fillOpacity: 0.5, color: "#6b7280", weight: 1 };
  }
}

function getZonaStyle(zonaName: string | null): L.PathOptions {
  const color = ZONA_COLORS[zonaName || ""] || ZONA_COLORS[""];
  return { color, weight: 2, opacity: 0.85 };
}

function getPointLayer(layerId: string, latlng: L.LatLng): L.Layer {
  let color = "#6b7280";
  let radius = 3;
  if (layerId === "postes") { color = "#fbbf24"; radius = 2.5; }
  else if (layerId === "bocas") { color = "#38bdf8"; radius = 4.5; }

  return L.circleMarker(latlng, {
    radius,
    fillColor: color,
    fillOpacity: 0.85,
    color: color,
    weight: 1,
    opacity: 0.9,
  });
}

function computeCentroid(geometry: Geometry): [number, number] | null {
  if (!geometry) return null;
  if (geometry.type === "Point") {
    return [geometry.coordinates[1], geometry.coordinates[0]];
  }
  if (geometry.type === "Polygon" || geometry.type === "LineString") {
    const ring = geometry.type === "Polygon"
      ? geometry.coordinates[0]
      : geometry.coordinates;
    if (!ring || ring.length === 0) return null;
    let sumX = 0, sumY = 0;
    for (const c of ring) { sumX += c[0]; sumY += c[1]; }
    return [sumY / ring.length, sumX / ring.length];
  }
  if (geometry.type === "MultiPolygon") {
    const ring = geometry.coordinates[0]?.[0];
    if (!ring) return null;
    let sumX = 0, sumY = 0;
    for (const c of ring) { sumX += c[0]; sumY += c[1]; }
    return [sumY / ring.length, sumX / ring.length];
  }
  return null;
}

function getLabelText(layerId: string, properties: Record<string, unknown>, index: number): string {
  if (layerId === "zonas") {
    return String(properties.ZONA || "");
  }
  if (layerId === "seccion") {
    const v = properties.SECCION;
    return v != null ? String(v) : `S${index + 1}`;
  }
  if (layerId === "manzana") {
    const manz = properties.MANZ;
    if (manz && Number(manz) > 0) return String(manz);
    const gru = properties.GRU;
    if (gru != null && Number(gru) > 0) return String(gru);
    return "";
  }
  if (layerId === "parcela") {
    const v = properties.NPARC;
    return v != null ? String(v) : "";
  }
  if (layerId === "barrios") {
    const v = properties.NOMBRE;
    return v ? String(v) : `B${index + 1}`;
  }
  if (layerId === "grupo") {
    const v = properties.GRUPO;
    return v != null ? String(v) : `G${index + 1}`;
  }
  if (layerId === "calle") {
    const v = properties.CALLE;
    return v ? String(v).replace(/^CALLE\s+/, "") : "";
  }
  return "";
}

export default function MapViewer() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const layerRefs = useRef<Record<string, LeafletLayer>>({});
  const labelRefs = useRef<Record<string, L.LayerGroup>>({});
  const loadingRef = useRef<Set<string>>(new Set());
  const [layersPanelOpen, setLayersPanelOpen] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<{
    props: Record<string, unknown>;
    layerLabel: string;
  } | null>(null);
  const [loadedSources, setLoadedSources] = useState<Set<string>>(new Set());
  const [mapReady, setMapReady] = useState(false);

  const [visibleLayers, setVisibleLayers] = useState<Record<string, boolean>>(
    Object.fromEntries(LAYERS.map(l => [l.id, l.defaultVisible]))
  );

  const updateLabelVisibility = useCallback((map: L.Map) => {
    const zoom = map.getZoom();
    Object.entries(labelRefs.current).forEach(([layerId, labelGroup]) => {
      const layerDef = LAYERS.find(l => l.id === layerId);
      if (!layerDef?.labelZoom) return;
      const shouldShow = visibleLayers[layerId] && zoom >= layerDef.labelZoom;
      if (shouldShow) {
        if (!map.hasLayer(labelGroup)) labelGroup.addTo(map);
      } else {
        if (map.hasLayer(labelGroup)) map.removeLayer(labelGroup);
      }
    });
  }, [visibleLayers]);

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

      const marker = L.marker(centroid as L.LatLngExpression, {
        icon: L.divIcon({
          className: "map-label",
          html: `<span class="map-label-text">${text}</span>`,
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

  const createGeoJSONLayer = useCallback((layerDef: typeof LAYERS[number], data: FeatureCollection): LeafletLayer => {
    const layerId = layerDef.id;
    const isPoint = layerDef.type === "circle";
    const style = layerId === "zonas"
      ? getLayerStyle(layerId)
      : getLayerStyle(layerId);

    const layer = L.geoJSON(data, {
      style: isPoint ? undefined : (feature) => {
        if (layerId === "zonas" && feature?.properties?.ZONA) {
          return getZonaStyle(feature.properties.ZONA as string);
        }
        return style;
      },
      pointToLayer: isPoint
        ? (_, latlng) => getPointLayer(layerId, latlng)
        : undefined,
      onEachFeature: (feature, featureLayer) => {
        if (!feature.properties) return;
        const props = feature.properties as Record<string, unknown>;
        const hasInterest = Object.keys(props).some(k => {
          const kl = k.toLowerCase();
          return !["fid","handle","block","etype","space","olinetype","linetype",
                   "color","ocolor","color24","transparency","lweight","linewidth",
                   "ltscale","visible","width","thickness","ext","layer"].includes(kl);
        });
        if (!hasInterest) return;

        featureLayer.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          setSelectedFeature({ props, layerLabel: layerDef.label });
        });

        if (featureLayer instanceof L.Path) {
          featureLayer.on("mouseover", () => {
            featureLayer.setStyle({ weight: (style.weight || 1) + 1, fillOpacity: Math.min((style.fillOpacity || 0) + 0.2, 1) });
          });
          featureLayer.on("mouseout", () => {
            featureLayer.setStyle(style);
          });
        }
      },
    });

    return layer;
  }, []);

  const loadAndAddLayer = useCallback(async (layerDef: typeof LAYERS[number]) => {
    const map = leafletMapRef.current;
    if (!map) return;
    if (loadingRef.current.has(layerDef.id)) return;
    if (loadedSources.has(layerDef.id)) return;

    loadingRef.current.add(layerDef.id);

    try {
      const response = await fetch(`${BASE_PATH}/data/${layerDef.file}`);
      const data: FeatureCollection = await response.json();
      const geoLayer = createGeoJSONLayer(layerDef, data);
      layerRefs.current[layerDef.id] = geoLayer;

      const labelGroup = createLabelLayer(layerDef, data);
      if (labelGroup) {
        labelRefs.current[layerDef.id] = labelGroup;
      }

      setLoadedSources(prev => new Set([...prev, layerDef.id]));

      if (visibleLayers[layerDef.id]) {
        geoLayer.addTo(map);
        if (labelGroup) {
          const zoom = map.getZoom();
          if (layerDef.labelZoom && zoom >= layerDef.labelZoom) {
            labelGroup.addTo(map);
          }
        }
      }
    } catch (err) {
      console.error(`Failed to load layer ${layerDef.id}:`, err);
    } finally {
      loadingRef.current.delete(layerDef.id);
    }
  }, [loadedSources, visibleLayers, createGeoJSONLayer, createLabelLayer]);

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

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
      {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 20,
        opacity: 0.9,
      }
    ).addTo(map);

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png",
      {
        subdomains: "abcd",
        maxZoom: 20,
        opacity: 0.7,
        pane: "overlayPane",
      }
    ).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ metric: true, imperial: false, position: "bottomright" }).addTo(map);

    map.on("click", () => setSelectedFeature(null));

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

  useEffect(() => {
    if (!mapReady) return;
    const eagerLayers = LAYERS.filter(l => !l.lazy && l.defaultVisible);
    eagerLayers.forEach(layerDef => {
      if (!loadedSources.has(layerDef.id) && !loadingRef.current.has(layerDef.id)) {
        loadAndAddLayer(layerDef);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !mapReady) return;

    LAYERS.forEach(layerDef => {
      const layer = layerRefs.current[layerDef.id];
      const labelGroup = labelRefs.current[layerDef.id];
      const shouldBeVisible = visibleLayers[layerDef.id];

      if (!layer) {
        if (shouldBeVisible && !loadedSources.has(layerDef.id) && !loadingRef.current.has(layerDef.id)) {
          loadAndAddLayer(layerDef);
        }
        return;
      }

      if (shouldBeVisible) {
        if (!map.hasLayer(layer)) layer.addTo(map);
        if (labelGroup) {
          const zoom = map.getZoom();
          if (layerDef.labelZoom && zoom >= layerDef.labelZoom) {
            if (!map.hasLayer(labelGroup)) labelGroup.addTo(map);
          }
        }
      } else {
        if (map.hasLayer(layer)) map.removeLayer(layer);
        if (labelGroup && map.hasLayer(labelGroup)) map.removeLayer(labelGroup);
      }
    });
  }, [visibleLayers, mapReady, loadedSources, loadAndAddLayer]);

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !mapReady) return;

    const onZoom = () => updateLabelVisibility(map);
    map.on("zoomend", onZoom);
    return () => { map.off("zoomend", onZoom); };
  }, [mapReady, updateLabelVisibility]);

  const handleToggleLayer = useCallback((layerId: string) => {
    const layerDef = LAYERS.find(l => l.id === layerId);
    if (!layerDef) return;

    const willBeVisible = !visibleLayers[layerId];

    if (willBeVisible && layerDef.lazy && !loadedSources.has(layerId) && !loadingRef.current.has(layerId) && mapReady) {
      loadAndAddLayer(layerDef);
    }

    setVisibleLayers(prev => ({ ...prev, [layerId]: willBeVisible }));
  }, [visibleLayers, mapReady, loadedSources, loadAndAddLayer]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-background">
      <Header
        onToggleLayers={() => setLayersPanelOpen(o => !o)}
        layersPanelOpen={layersPanelOpen}
        mapRef={mapRef as React.RefObject<L.Map | null>}
      />

      <div
        ref={mapContainerRef}
        className="absolute inset-0"
        style={{ top: 52 }}
        data-testid="map-container"
      />

      {!mapReady && (
        <div
          className="absolute inset-0 flex items-center justify-center z-50"
          style={{ top: 52, background: "hsl(220 18% 11%)" }}
        >
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

      {selectedFeature && (
        <FeatureInfo
          feature={selectedFeature.props}
          layerLabel={selectedFeature.layerLabel}
          onClose={() => setSelectedFeature(null)}
        />
      )}

      <ZonaLegend />

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none" style={{ zIndex: 500 }}>
        <div className="text-[10px] text-muted-foreground/50 bg-background/70 px-2 py-0.5 rounded-full">
          Datos: Municipalidad de Colón · IGN · OSM
        </div>
      </div>
    </div>
  );
}
