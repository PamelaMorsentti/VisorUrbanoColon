import { useState, useEffect } from "react";
import L from "leaflet";
import { Layers } from "lucide-react";

export type BaseMapId =
  | "dark"
  | "streets"
  | "argenmap"
  | "satellite"
  | "satelliteHd2024"
  | "satelliteHd2023"
  | "satelliteHd2022"
  | "topo"
  | "earthEngine";

interface BaseMap {
  id: BaseMapId;
  label: string;
  emoji: string;
  url: string;
  attribution: string;
  maxZoom: number;
  maxNativeZoom?: number;
  subdomains?: string[];
  tms?: boolean;
  usesLabelOverlay?: boolean;
  isExternal?: boolean;
}

export const BASE_MAPS: BaseMap[] = [
  {
    id: "dark",
    label: "Oscuro",
    emoji: "🌑",
    url: "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 22,
    maxNativeZoom: 20,
    subdomains: ["a", "b", "c", "d"],
    usesLabelOverlay: true,
  },
  {
    id: "streets",
    label: "Calles",
    emoji: "🗺️",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 22,
    maxNativeZoom: 19,
    subdomains: ["a", "b", "c"],
  },
  {
    id: "argenmap",
    label: "Argenmap (IGN)",
    emoji: "🗺️",
    url: "https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{-y}.png",
    attribution: 'Base cartográfica &copy; <a href="https://www.ign.gob.ar/">Instituto Geográfico Nacional</a>',
    maxZoom: 22,
    maxNativeZoom: 20,
    tms: true,
  },
  {
    id: "satellite",
    label: "Satélite (Esri)",
    emoji: "🛰️",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri — USGS, NGA, NASA",
    // Esri: La opción con mejor resolución global de imágenes comerciales.
    // Limitamos el zoom nativo para evitar tiles con "Map data not yet available"
    // en áreas sin cobertura completa. El usuario puede hacer overzoom manualmente.
    maxZoom: 22,
    maxNativeZoom: 17,
  },
  {
    id: "satelliteHd2024",
    label: "Sentinel 2024",
    emoji: "🛰️",
    url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg",
    attribution: 'Imagery &copy; <a href="https://s2maps.eu/">Sentinel-2 cloudless (EOX)</a> · Data &copy; <a href="https://www.copernicus.eu/">Copernicus</a>',
    maxZoom: 22,
    maxNativeZoom: 18,
  },
  {
    id: "satelliteHd2023",
    label: "Sentinel 2023",
    emoji: "🛰️",
    url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/{z}/{y}/{x}.jpg",
    attribution: 'Imagery &copy; <a href="https://s2maps.eu/">Sentinel-2 cloudless (EOX)</a> · Data &copy; <a href="https://www.copernicus.eu/">Copernicus</a>',
    maxZoom: 22,
    maxNativeZoom: 18,
  },
  {
    id: "satelliteHd2022",
    label: "Sentinel 2022",
    emoji: "🛰️",
    url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2022_3857/default/g/{z}/{y}/{x}.jpg",
    attribution: 'Imagery &copy; <a href="https://s2maps.eu/">Sentinel-2 cloudless (EOX)</a> · Data &copy; <a href="https://www.copernicus.eu/">Copernicus</a>',
    maxZoom: 22,
    maxNativeZoom: 18,
  },
  {
    id: "topo",
    label: "Topográfico",
    emoji: "🏔️",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "Map data: &copy; OpenStreetMap contributors | Map style: &copy; OpenTopoMap (CC-BY-SA)",
    maxZoom: 20,
    maxNativeZoom: 17,
    subdomains: ["a", "b", "c"],
  },
  {
    id: "earthEngine",
    label: "Google Earth Engine (Análisis)",
    emoji: "🔬",
    url: "https://code.earthengine.google.com/",
    attribution: "Google Earth Engine · ESA Sentinel / USGS Landsat / NASA MODIS",
    maxZoom: 22,
    isExternal: true,
  },
];

const LS_KEY = "colon3d_basemap";

function getStoredBaseMapId(): BaseMapId {
  const stored = localStorage.getItem(LS_KEY);
  if (!stored) return "dark";
  const exists = BASE_MAPS.some((baseMap) => baseMap.id === stored);
  if (exists) return stored as BaseMapId;
  localStorage.removeItem(LS_KEY);
  return "dark";
}

interface BaseMapSelectorProps {
  mapRef: React.RefObject<L.Map | null>;
  tileLayerRef: React.RefObject<L.TileLayer | null>;
  labelLayerRef: React.RefObject<L.TileLayer | null>;
}

export default function BaseMapSelector({ mapRef, tileLayerRef, labelLayerRef }: BaseMapSelectorProps) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<BaseMapId>(getStoredBaseMapId);

  const switchBase = (bm: BaseMap) => {
    // Handle external resources (open in new tab)
    if (bm.isExternal) {
      window.open(bm.url, "_blank");
      setOpen(false);
      return;
    }

    const map = mapRef.current;
    if (!map) return;
    // Remove old tile layer
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    // Add new tile layer (below all other layers via pane)
    const newLayer = L.tileLayer(bm.url, {
      attribution: bm.attribution,
      maxZoom: bm.maxZoom,
      maxNativeZoom: bm.maxNativeZoom,
      subdomains: (bm.subdomains ?? []) as unknown as string,
      tms: bm.tms,
    });
    newLayer.addTo(map);

    if (labelLayerRef.current) {
      if (bm.usesLabelOverlay) {
        if (!map.hasLayer(labelLayerRef.current)) {
          labelLayerRef.current.addTo(map);
        }
      } else if (map.hasLayer(labelLayerRef.current)) {
        map.removeLayer(labelLayerRef.current);
      }
    }

    // Move to bottom of map panes
    if (newLayer.getPane()) {
      newLayer.getPane()!.style.zIndex = "200";
    }
    (tileLayerRef as React.MutableRefObject<L.TileLayer | null>).current = newLayer;
    setCurrent(bm.id);
    localStorage.setItem(LS_KEY, bm.id);
    setOpen(false);
  };

  useEffect(() => {
    // Initialize with stored preference on first render (map already has initial tile layer via mapRef)
    const stored = getStoredBaseMapId();
    if (stored !== "dark") {
      const bm = BASE_MAPS.find(b => b.id === stored);
      if (bm) setTimeout(() => switchBase(bm), 500); // slight delay for map init
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentBm = BASE_MAPS.find(b => b.id === current) || BASE_MAPS[0];

  return (
    <div className="absolute bottom-10 left-3 z-[900]">
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium shadow-lg transition-all ${
            open
              ? "bg-primary/20 border-primary/40 text-primary"
              : "bg-card/90 border-border text-muted-foreground hover:text-foreground"
          }`}
          title="Cambiar mapa base"
          style={{ backdropFilter: "blur(8px)" }}
        >
          <Layers size={13} />
          <span>{currentBm.emoji} {currentBm.label}</span>
        </button>

        {open && (
          <div
            className="absolute bottom-full mb-2 left-0 rounded-xl border border-border shadow-2xl overflow-hidden min-w-[200px]"
            style={{ background: "hsl(220 16% 12%)", backdropFilter: "blur(8px)" }}
          >
            <div className="px-3 py-2">
              <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider pb-1.5 border-b border-border mb-2">
                Mapa base
              </div>
              <div className="text-[8px] text-muted-foreground/70 mb-2 leading-tight">
                💡 <span className="text-yellow-600/80">Esri</span> tiene la mejor definición satelital disponible públicamente.
              </div>
            </div>
            {BASE_MAPS.filter(bm => !bm.isExternal).map(bm => (
              <button
                key={bm.id}
                onClick={() => switchBase(bm)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                  current === bm.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                }`}
              >
                <span className="text-sm">{bm.emoji}</span>
                {bm.label}
                {current === bm.id && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
              </button>
            ))}
            <div className="h-px bg-border my-1" />
            {BASE_MAPS.filter(bm => bm.isExternal).map(bm => (
              <button
                key={bm.id}
                onClick={() => switchBase(bm)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors text-muted-foreground hover:text-foreground hover:bg-card/50"
                title="Abre Google Earth Engine en una nueva ventana para procesamiento avanzado de datos satelitales"
              >
                <span className="text-sm">{bm.emoji}</span>
                <div className="flex-1 text-left">
                  <div>{bm.label}</div>
                  <div className="text-[7px] text-muted-foreground/60">↗ Abre en nueva ventana</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
