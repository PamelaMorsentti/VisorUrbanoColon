import { useState } from "react";
import { Layers, Search, Navigation } from "lucide-react";
import L from "leaflet";
import { COLON_CENTER, COLON_ZOOM } from "@/lib/layers";

interface HeaderProps {
  onToggleLayers: () => void;
  layersPanelOpen: boolean;
  mapRef: React.RefObject<L.Map | null>;
}

export default function Header({ onToggleLayers, layersPanelOpen, mapRef }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const handleReset = () => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo([COLON_CENTER[1], COLON_CENTER[0]], COLON_ZOOM, { duration: 1.2 });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const q = encodeURIComponent(`${searchQuery}, Colón, Entre Ríos, Argentina`);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`);
      const data = await res.json();
      if (data && data[0]) {
        const { lon, lat } = data[0];
        mapRef.current?.flyTo([parseFloat(lat), parseFloat(lon)], 17, { duration: 1.2 });
      }
    } catch {
    } finally {
      setSearching(false);
    }
  };

  return (
    <header
      className="absolute top-0 left-0 right-0 z-[1000] flex items-center gap-3 px-3 py-2 border-b border-border/50"
      style={{ background: "hsl(220 18% 9% / 0.96)", backdropFilter: "blur(8px)", height: "52px" }}
      data-testid="header"
    >
      <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
        <img
          src="/logo-municipalidad.png"
          alt="Municipalidad de Colón"
          className="w-8 h-8 object-contain flex-shrink-0"
          style={{ filter: "brightness(0) invert(1)", opacity: 0.85 }}
        />
        <div className="hidden sm:block min-w-0">
          <div className="text-sm font-bold text-foreground leading-tight whitespace-nowrap">Colón 3D</div>
          <div className="text-[10px] text-muted-foreground leading-tight">Entre Ríos · Visor Urbano</div>
        </div>
      </div>

      <form onSubmit={handleSearch} className="flex-1 max-w-xs">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar dirección..."
            disabled={searching}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all disabled:opacity-60"
            data-testid="input-search"
          />
        </div>
      </form>

      <div className="flex items-center gap-1.5 ml-auto">
        <button
          onClick={handleReset}
          className="p-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
          title="Centrar en Colón"
          data-testid="button-reset-view"
        >
          <Navigation size={13} />
        </button>

        <button
          onClick={onToggleLayers}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-all font-medium ${
            layersPanelOpen
              ? "bg-primary/20 border-primary/40 text-primary"
              : "bg-card border-border text-muted-foreground hover:text-foreground"
          }`}
          title="Capas"
          data-testid="button-toggle-layers"
        >
          <Layers size={13} />
          <span className="hidden sm:inline">Capas</span>
        </button>
      </div>
    </header>
  );
}
