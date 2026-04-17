import { useState, useRef } from "react";
import { Layers, Search, Navigation, MapPin, X, Loader2, BarChart2, Map } from "lucide-react";
import L from "leaflet";
import { COLON_CENTER, COLON_ZOOM } from "@/lib/layers";

interface HeaderProps {
  onToggleLayers: () => void;
  layersPanelOpen: boolean;
  onToggleCadastral: () => void;
  cadastralOpen: boolean;
  onToggleDensidad: () => void;
  densidadActive: boolean;
  densidadPanelOpen: boolean;
  onToggleZonaLegend: () => void;
  zonaLegendOpen: boolean;
  mapRef: React.RefObject<L.Map | null>;
  onAddressFound: (lat: number, lng: number, name: string) => void;
}

export default function Header({
  onToggleLayers,
  layersPanelOpen,
  onToggleCadastral,
  cadastralOpen,
  onToggleDensidad,
  densidadActive,
  densidadPanelOpen,
  onToggleZonaLegend,
  zonaLegendOpen,
  mapRef,
  onAddressFound,
}: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
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
    setSearchError(null);

    try {
      // Colón, Entre Ríos bounding box (lon_min, lat_min, lon_max, lat_max)
      const viewbox = "-58.22,-32.28,-58.05,-32.18";
      // Try first with bounded=1 inside Colón, then without if no results
      const base = "https://nominatim.openstreetmap.org/search";
      const params = new URLSearchParams({
        q: `${q}, Colón, Entre Ríos, Argentina`,
        format: "json",
        limit: "5",
        countrycodes: "ar",
        viewbox,
        bounded: "1",
        addressdetails: "1",
      });

      let res = await fetch(`${base}?${params}`, {
        signal: abortRef.current.signal,
        headers: { "Accept-Language": "es-AR,es;q=0.9" },
      });
      if (!res.ok) throw new Error("API error");
      let data: { lat: string; lon: string; display_name: string }[] = await res.json();

      // Fallback: try without bounded restriction
      if (!data?.length) {
        const params2 = new URLSearchParams({
          q: `${q}, Colón, Entre Ríos, Argentina`,
          format: "json",
          limit: "3",
          countrycodes: "ar",
          addressdetails: "1",
        });
        abortRef.current = new AbortController();
        res = await fetch(`${base}?${params2}`, {
          signal: abortRef.current.signal,
          headers: { "Accept-Language": "es-AR,es;q=0.9" },
        });
        if (!res.ok) throw new Error("API error");
        data = await res.json();
      }

      if (data?.length) {
        const best = data[0];
        const lat = parseFloat(best.lat);
        const lng = parseFloat(best.lon);
        mapRef.current?.flyTo([lat, lng], 17, { duration: 1.2 });
        onAddressFound(lat, lng, best.display_name);
        setSearchQuery("");
      } else {
        setSearchError("No se encontró la dirección. Probá solo el nombre de la calle, sin número.");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError")
        setSearchError("Error de conexión. Verificá tu red e intentá de nuevo.");
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchError(null);
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
      <form onSubmit={handleSearch} className="flex-1 max-w-xs relative">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSearchError(null); }}
            placeholder="Ej: Urquiza 150 (sin tildes, en español)"
            disabled={searching}
            className={`w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border bg-card text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 transition-all disabled:opacity-60 ${
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
          <div className="absolute top-full left-0 mt-1 text-[10px] text-red-400 px-1 whitespace-nowrap bg-background/90 rounded py-0.5">
            {searchError}
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
          onClick={onToggleDensidad}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-all font-medium ${
            densidadActive || densidadPanelOpen
              ? "bg-purple-500/20 border-purple-500/40 text-purple-400"
              : "bg-card border-border text-muted-foreground hover:text-foreground"
          }`}
          title="Mapa de calor edilicio"
          data-testid="button-toggle-densidad"
        >
          <BarChart2 size={13} />
          <span className="hidden md:inline">Densidad</span>
        </button>

        <button
          onClick={onToggleZonaLegend}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-all font-medium ${
            zonaLegendOpen
              ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
              : "bg-card border-border text-muted-foreground hover:text-foreground"
          }`}
          title="Leyenda de zonificación"
          data-testid="button-toggle-zona-legend"
        >
          <Map size={13} />
          <span className="hidden md:inline">Zonif.</span>
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
