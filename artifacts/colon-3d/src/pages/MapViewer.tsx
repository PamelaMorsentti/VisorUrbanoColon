import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Header from "@/components/Header";
import LayersPanel from "@/components/LayersPanel";
import FeatureInfo from "@/components/FeatureInfo";
import ZonaLegend from "@/components/ZonaLegend";
import { LAYERS, COLON_CENTER, COLON_ZOOM } from "@/lib/layers";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");

type LeafletLayer = L.GeoJSON | L.LayerGroup;

function getLayerStyle(layerId: string): L.PathOptions {
  switch (layerId) {
    case "manzana":
      return { fillColor: "#1e2432", fillOpacity: 0.95, color: "#374151", weight: 1, opacity: 0.8 };
    case "parcela":
      return { fillColor: "transparent", fillOpacity: 0, color: "#4b5563", weight: 0.5, opacity: 0.7 };
    case "calle":
      return { color: "#525861", weight: 1.5, opacity: 0.9 };
    case "municipio":
      return { fillColor: "transparent", fillOpacity: 0, color: "#60a5fa", weight: 2, opacity: 0.9, dashArray: "6 4" };
    case "seccion":
      return { fillColor: "transparent", fillOpacity: 0, color: "#a78bfa", weight: 1, opacity: 0.7, dashArray: "4 4" };
    case "barrios":
      return { fillColor: "#3b82f6", fillOpacity: 0.1, color: "#60a5fa", weight: 1.5, opacity: 0.8 };
    case "edif":
      return { fillColor: "#293040", fillOpacity: 0.95, color: "#1a2033", weight: 0.5, opacity: 0.8 };
    case "edif_palta":
      return { fillColor: "#5c3d1e", fillOpacity: 0.95, color: "#3d2810", weight: 0.5, opacity: 0.9 };
    case "ph":
      return { fillColor: "#374151", fillOpacity: 0.85, color: "#2d3748", weight: 0.5, opacity: 0.8 };
    case "superp":
      return { fillColor: "#d97706", fillOpacity: 0.5, color: "#b45309", weight: 0.5, opacity: 0.8 };
    case "cota10":
      return { color: "#1a5c3a", weight: 0.8, opacity: 0.65 };
    case "grupo":
      return { fillColor: "#7c3aed", fillOpacity: 0.12, color: "#7c3aed", weight: 1, opacity: 0.6 };
    case "superp_outline":
      return { fillColor: "#d97706", fillOpacity: 0.4, color: "#b45309", weight: 1 };
    default:
      return { fillColor: "#4b5563", fillOpacity: 0.5, color: "#6b7280", weight: 1 };
  }
}

function getPointLayer(layerId: string, latlng: L.LatLng): L.Layer {
  let color = "#6b7280";
  let radius = 3;
  if (layerId === "arbol") { color = "#16a34a"; radius = 3; }
  else if (layerId === "postes") { color = "#fbbf24"; radius = 2.5; }
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

export default function MapViewer() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const layerRefs = useRef<Record<string, LeafletLayer>>({});
  const [layersPanelOpen, setLayersPanelOpen] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<{
    props: Record<string, unknown>;
    layerLabel: string;
  } | null>(null);
  const [loadedSources, setLoadedSources] = useState<Set<string>>(new Set());
  const [mapReady, setMapReady] = useState(false);
  const [is3D] = useState(false);

  const [visibleLayers, setVisibleLayers] = useState<Record<string, boolean>>(
    Object.fromEntries(LAYERS.map(l => [l.id, l.defaultVisible]))
  );

  const createGeoJSONLayer = useCallback((layerDef: typeof LAYERS[number], data: GeoJSON.FeatureCollection): LeafletLayer => {
    const layerId = layerDef.id;
    const isPoint = layerDef.type === "circle";
    const style = getLayerStyle(layerId);

    const layer = L.geoJSON(data, {
      style: isPoint ? undefined : style,
      pointToLayer: isPoint
        ? (_, latlng) => getPointLayer(layerId, latlng)
        : undefined,
      onEachFeature: (feature, featureLayer) => {
        if (!feature.properties) return;
        const hasInterest = Object.keys(feature.properties).some(
          k => !["fid","handle","block","etype","space","olinetype","linetype",
                 "color","ocolor","color24","transparency","lweight","linewidth",
                 "ltscale","visible","width","thickness","ext","layer"].includes(k.toLowerCase())
        );
        if (!hasInterest) return;

        featureLayer.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          setSelectedFeature({ props: feature.properties as Record<string, unknown>, layerLabel: layerDef.label });
        });

        if (featureLayer instanceof L.Path) {
          featureLayer.on("mouseover", () => {
            featureLayer.setStyle({ weight: style.weight ? style.weight + 1 : 2, fillOpacity: Math.min((style.fillOpacity || 0) + 0.2, 1) });
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
    if (!map || loadedSources.has(layerDef.id)) return;

    try {
      const response = await fetch(`${BASE_PATH}/data/${layerDef.file}`);
      const data: GeoJSON.FeatureCollection = await response.json();
      const geoLayer = createGeoJSONLayer(layerDef, data);
      layerRefs.current[layerDef.id] = geoLayer;
      setLoadedSources(prev => new Set([...prev, layerDef.id]));

      if (visibleLayers[layerDef.id]) {
        geoLayer.addTo(map);
      }
    } catch (err) {
      console.error(`Failed to load layer ${layerDef.id}:`, err);
    }
  }, [loadedSources, visibleLayers, createGeoJSONLayer]);

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
      setLoadedSources(new Set());
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    const eagerLayers = LAYERS.filter(l => !l.lazy && l.defaultVisible);
    eagerLayers.forEach(layerDef => {
      if (!loadedSources.has(layerDef.id)) {
        loadAndAddLayer(layerDef);
      }
    });
  }, [mapReady]);

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !mapReady) return;

    LAYERS.forEach(layerDef => {
      const layer = layerRefs.current[layerDef.id];
      const shouldBeVisible = visibleLayers[layerDef.id];

      if (!layer) {
        if (shouldBeVisible && !loadedSources.has(layerDef.id)) {
          loadAndAddLayer(layerDef);
        }
        return;
      }

      if (shouldBeVisible) {
        if (!map.hasLayer(layer)) layer.addTo(map);
      } else {
        if (map.hasLayer(layer)) map.removeLayer(layer);
      }
    });
  }, [visibleLayers, mapReady, loadedSources]);

  const handleToggleLayer = useCallback((layerId: string) => {
    const layerDef = LAYERS.find(l => l.id === layerId);
    if (!layerDef) return;

    const willBeVisible = !visibleLayers[layerId];

    if (willBeVisible && layerDef.lazy && !loadedSources.has(layerId) && mapReady) {
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
        is3D={is3D}
        onToggle3D={() => {}}
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

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 pointer-events-none" style={{ zIndex: 500 }}>
        <div className="text-[10px] text-muted-foreground/50 bg-background/70 px-2 py-0.5 rounded-full">
          Datos: Municipalidad de Colón · IGN · OSM
        </div>
      </div>
    </div>
  );
}
