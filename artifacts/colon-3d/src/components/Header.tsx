import { useState, useRef } from "react";
import { Layers, Search, Navigation, MapPin, X, Loader2 } from "lucide-react";
import L from "leaflet";
import { COLON_CENTER, COLON_ZOOM } from "@/lib/layers";

interface HeaderProps {
  onToggleLayers: () => void;
  layersPanelOpen: boolean;
  onToggleCadastral: () => void;
  cadastralOpen: boolean;
  mapRef: React.RefObject<L.Map | null>;
}

export default function Header({
  onToggleLayers,
  layersPanelOpen,
  onToggleCadastral,
  cadastralOpen,
  mapRef,
}: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleReset = () => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo([COLON_CENTER[1], COLON_CENTER[0]], COLON_ZOOM, { duration: 1.2 });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setSearching(true);
    setSearchError(false);

    try {
      const encoded = encodeURIComponent(`${q}, Colón, Entre Ríos, Argentina`);
      const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=3&countrycodes=ar`;
      const res = await fetch(url, {
        signal: abortRef.current.signal,
        headers: { "Accept-Language": "es", "User-Agent": "ColoVisorUrbano/1.0" },
      });
      if (!res.ok) throw new Error("API error");
      const data: { lat: string; lon: string; display_name: string }[] = await res.json();

      if (data?.length) {
        const { lon, lat } = data[0];
        mapRef.current?.flyTo([parseFloat(lat), parseFloat(lon)], 17, { duration: 1.2 });
        setSearchQuery("");
      } else {
        setSearchError(true);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setSearchError(true);
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchError(false);
    if (abortRef.current) abortRef.current.abort();
  };

  return (
    <header
      className="absolute top-0 left-0 right-0 z-[1000] flex items-center gap-2 px-3 py-2 border-b border-border/50"
      style={{ background: "hsl(220 18% 9% / 0.96)", backdropFilter: "blur(8px)", height: "52px" }}
      data-testid="header"
    >
      {/* Logo */}
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

      {/* Address search */}
      <form onSubmit={handleSearch} className="flex-1 max-w-xs">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSearchError(false); }}
            placeholder="Buscar dirección…"
            disabled={searching}
            className={`w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 transition-all disabled:opacity-60 ${
              searchError ? "border-red-500/60 focus:ring-red-500/40" : "border-border focus:ring-primary/50"
            }`}
            data-testid="input-search"
          />
          {searching && (
            <Loader2 size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
          )}
          {!searching && (searchQuery || searchError) && (
            <button type="button" onClick={clearSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={11} />
            </button>
          )}
        </div>
        {searchError && (
          <div className="absolute top-full left-0 mt-1 text-[10px] text-red-400 px-1">
            No se encontró la dirección en Colón.
          </div>
        )}
      </form>

      {/* Toolbar buttons */}
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
          onClick={onToggleCadastral}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-all font-medium ${
            cadastralOpen
              ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
              : "bg-card border-border text-muted-foreground hover:text-foreground"
          }`}
          title="Búsqueda catastral"
          data-testid="button-toggle-cadastral"
        >
          <MapPin size={13} />
          <span className="hidden sm:inline">Catastro</span>
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
