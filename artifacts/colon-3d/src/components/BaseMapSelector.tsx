import { useState, useEffect } from "react";
import L from "leaflet";
import { Layers } from "lucide-react";

export type BaseMapId = "dark" | "streets" | "satellite" | "topo";

interface BaseMap {
  id: BaseMapId;
  label: string;
  emoji: string;
  url: string;
  attribution: string;
  maxZoom: number;
}

export const BASE_MAPS: BaseMap[] = [
  {
    id: "dark",
    label: "Oscuro",
    emoji: "🌑",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
  },
  {
    id: "streets",
    label: "Calles",
    emoji: "🗺️",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  {
    id: "satellite",
    label: "Satélite",
    emoji: "🛰️",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri — USGS, NGA, NASA",
    maxZoom: 19,
  },
  {
    id: "topo",
    label: "Topográfico",
    emoji: "🏔️",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "Map data: &copy; OpenStreetMap contributors | Map style: &copy; OpenTopoMap (CC-BY-SA)",
    maxZoom: 17,
  },
];

const LS_KEY = "colon3d_basemap";

interface BaseMapSelectorProps {
  mapRef: React.RefObject<L.Map | null>;
  tileLayerRef: React.RefObject<L.TileLayer | null>;
}

export default function BaseMapSelector({ mapRef, tileLayerRef }: BaseMapSelectorProps) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<BaseMapId>(
    () => (localStorage.getItem(LS_KEY) as BaseMapId) || "dark"
  );

  const switchBase = (bm: BaseMap) => {
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
      subdomains: bm.id === "satellite" ? [] : ["a", "b", "c"] as unknown as string,
    });
    newLayer.addTo(map);
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
    const stored = localStorage.getItem(LS_KEY) as BaseMapId | null;
    if (stored && stored !== "dark") {
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
            className="absolute bottom-full mb-2 left-0 rounded-xl border border-border shadow-2xl overflow-hidden min-w-[150px]"
            style={{ background: "hsl(220 16% 12%)", backdropFilter: "blur(8px)" }}
          >
            <div className="px-3 py-1.5 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
              Mapa base
            </div>
            {BASE_MAPS.map(bm => (
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
          </div>
        )}
      </div>
    </div>
  );
}
