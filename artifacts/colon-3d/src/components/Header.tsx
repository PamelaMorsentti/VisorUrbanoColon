import { useState, useRef } from "react";
import {
  Layers, Search, Navigation, MapPin, X, Loader2,
  BarChart2, Map, Upload, Ruler, Square, ChevronDown,
} from "lucide-react";
import L from "leaflet";
import { COLON_CENTER, COLON_ZOOM } from "@/lib/layers";
import { AuthButton } from "@/components/AuthGate";
import type { MeasureMode } from "@/components/MeasureTool";

// ─── IGN Argentina geocoder ───────────────────────────────────────────────────

interface IGNResult {
  nomenclatura: string;
  ubicacion?: { lat: number; lon: number };
  lat?: number;
  lon?: number;
}

async function searchIGN(query: string, signal: AbortSignal): Promise<{ lat: number; lng: number; name: string } | null> {
  const url = `https://apis.datos.gob.ar/georef/api/direcciones?direccion=${encodeURIComponent(query)}&provincia=entre%20rios&localidad=colon&max=5`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("IGN API error");
  const data = await res.json() as { direcciones?: IGNResult[] };
  const direcciones = data.direcciones ?? [];
  if (!direcciones.length) return null;
  const best = direcciones[0];
  const lat = best.ubicacion?.lat ?? best.lat;
  const lon = best.ubicacion?.lon ?? best.lon;
  if (!lat || !lon) return null;
  return { lat, lng: lon, name: best.nomenclatura ?? query };
}

// ─── Props ────────────────────────────────────────────────────────────────────

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
  onToggleAnalysis: () => void;
  analysisPanelOpen: boolean;
  onToggleUpload: () => void;
  uploadPanelOpen: boolean;
  measureMode: MeasureMode;
  onChangeMeasureMode: (m: MeasureMode) => void;
  mapRef: React.RefObject<L.Map | null>;
  onAddressFound: (lat: number, lng: number, name: string) => void;
  onOpenAuthPanel: () => void;
}

export default function Header({
  onToggleLayers, layersPanelOpen,
  onToggleCadastral, cadastralOpen,
  onToggleDensidad, densidadActive, densidadPanelOpen,
  onToggleZonaLegend, zonaLegendOpen,
  onToggleAnalysis, analysisPanelOpen,
  onToggleUpload, uploadPanelOpen,
  measureMode, onChangeMeasureMode,
  mapRef,
  onAddressFound,
  onOpenAuthPanel,
}: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleReset = () => {
    mapRef.current?.flyTo([COLON_CENTER[1], COLON_CENTER[0]], COLON_ZOOM, { duration: 1.2 });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSearching(true);
    setSearchError(null);
    try {
      const result = await searchIGN(q, ctrl.signal);
      if (result) {
        mapRef.current?.flyTo([result.lat, result.lng], 17, { duration: 1.2 });
        onAddressFound(result.lat, result.lng, result.name);
        setSearchQuery("");
      } else {
        setSearchError("No encontrado. Probá: 'Urquiza 250' o solo el nombre de la calle.");
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
    abortRef.current?.abort();
  };

  const toggleMeasure = (m: MeasureMode) => onChangeMeasureMode(measureMode === m ? "none" : m);

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
        <div className="hidden md:block min-w-0">
          <div className="text-sm font-bold text-foreground leading-tight whitespace-nowrap">Colón 3D</div>
          <div className="text-[10px] text-muted-foreground leading-tight">Entre Ríos · Visor Urbano</div>
        </div>
      </div>

      {/* Address search – IGN Argentina */}
      <form onSubmit={handleSearch} className="flex-1 max-w-xs relative">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSearchError(null); }}
            placeholder="Buscar dirección en Colón…"
            disabled={searching}
            className={`w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border bg-card text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 transition-all disabled:opacity-60 ${
              searchError ? "border-red-500/60 focus:ring-red-500/40" : "border-border focus:ring-primary/50"
            }`}
            data-testid="input-search"
          />
          {searching && <Loader2 size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />}
          {!searching && (searchQuery || searchError) && (
            <button type="button" onClick={clearSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={11} />
            </button>
          )}
        </div>
        {searchError && (
          <div className="absolute top-full left-0 mt-1 text-[10px] text-red-400 px-1 whitespace-nowrap bg-background/90 rounded py-0.5 z-10">
            {searchError}
          </div>
        )}
      </form>

      {/* Toolbar buttons */}
      <div className="flex items-center gap-1 ml-auto">
        {/* Reset view */}
        <button onClick={handleReset} className={BTN_BASE} title="Centrar en Colón" data-testid="button-reset-view">
          <Navigation size={13} />
        </button>

        {/* Measure distance */}
        <button
          onClick={() => toggleMeasure("distance")}
          className={`${BTN_BASE} ${measureMode === "distance" ? BTN_ACTIVE("cyan") : ""}`}
          title="Medir distancia"
        >
          <Ruler size={13} />
          <span className="hidden xl:inline text-xs">Dist.</span>
        </button>

        {/* Measure area */}
        <button
          onClick={() => toggleMeasure("area")}
          className={`${BTN_BASE} ${measureMode === "area" ? BTN_ACTIVE("cyan") : ""}`}
          title="Medir superficie"
        >
          <Square size={13} />
          <span className="hidden xl:inline text-xs">Sup.</span>
        </button>

        <div className="w-px h-5 bg-border/50 mx-0.5 flex-shrink-0" />

        {/* Analysis */}
        <button
          onClick={onToggleAnalysis}
          className={`${BTN_BASE} ${analysisPanelOpen ? BTN_ACTIVE("purple") : ""}`}
          title="Panel de análisis"
        >
          <BarChart2 size={13} />
          <span className="hidden lg:inline text-xs">Análisis</span>
        </button>

        {/* Upload layers */}
        <button
          onClick={onToggleUpload}
          className={`${BTN_BASE} ${uploadPanelOpen ? BTN_ACTIVE("amber") : ""}`}
          title="Cargar capas GIS"
        >
          <Upload size={13} />
          <span className="hidden lg:inline text-xs">Cargá</span>
        </button>

        <div className="w-px h-5 bg-border/50 mx-0.5 flex-shrink-0" />

        {/* Densidad */}
        <button
          onClick={onToggleDensidad}
          className={`${BTN_BASE} ${(densidadActive || densidadPanelOpen) ? BTN_ACTIVE("purple") : ""}`}
          title="Mapa de calor edilicio"
          data-testid="button-toggle-densidad"
        >
          <BarChart2 size={13} />
          <span className="hidden xl:inline text-xs">Dens.</span>
        </button>

        {/* Zona legend */}
        <button
          onClick={onToggleZonaLegend}
          className={`${BTN_BASE} ${zonaLegendOpen ? BTN_ACTIVE("emerald") : ""}`}
          title="Leyenda de zonificación"
          data-testid="button-toggle-zona-legend"
        >
          <Map size={13} />
          <span className="hidden xl:inline text-xs">Zonif.</span>
        </button>

        {/* Cadastral search */}
        <button
          onClick={onToggleCadastral}
          className={`${BTN_BASE} ${cadastralOpen ? BTN_ACTIVE("amber") : ""}`}
          title="Búsqueda catastral"
          data-testid="button-toggle-cadastral"
        >
          <MapPin size={13} />
          <span className="hidden sm:inline text-xs">Catastro</span>
        </button>

        {/* Layers */}
        <button
          onClick={onToggleLayers}
          className={`${BTN_BASE} ${layersPanelOpen ? BTN_ACTIVE("sky") : ""}`}
          title="Capas"
          data-testid="button-toggle-layers"
        >
          <Layers size={13} />
          <span className="hidden sm:inline text-xs">Capas</span>
        </button>

        <div className="w-px h-5 bg-border/50 mx-0.5 flex-shrink-0" />

        {/* Auth */}
        <AuthButton onOpenPanel={onOpenAuthPanel} />
      </div>
    </header>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const BTN_BASE = "flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition-all flex-shrink-0";

function BTN_ACTIVE(color: string) {
  const map: Record<string, string> = {
    sky:    "!bg-sky-500/20 !border-sky-500/40 !text-sky-400",
    purple: "!bg-purple-500/20 !border-purple-500/40 !text-purple-400",
    amber:  "!bg-amber-500/20 !border-amber-500/40 !text-amber-400",
    emerald:"!bg-emerald-500/20 !border-emerald-500/40 !text-emerald-400",
    cyan:   "!bg-cyan-500/20 !border-cyan-500/40 !text-cyan-400",
  };
  return map[color] ?? "";
}

// Unused export kept for type reference
export type { HeaderProps };
