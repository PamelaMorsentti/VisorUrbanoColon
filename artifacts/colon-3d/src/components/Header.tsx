import { useState, useRef, useEffect } from "react";
import {
  Layers, Search, Navigation, MapPin, X, Loader2,
  BarChart2, Map, Upload, Ruler, Square, ChevronDown, Cloud,
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
  showZonaLegendButton: boolean;
  onToggleAnalysis: () => void;
  analysisPanelOpen: boolean;
  onToggleUpload: () => void;
  uploadPanelOpen: boolean;
  planosActive: boolean;
  onTogglePlanosVisibility: () => void;
  obrasYearOptions: number[];
  selectedObrasYears: number[];
  obrasYearPreset: "all" | "current" | "last3" | "last5" | "custom";
  onSelectObrasPreset: (preset: "all" | "current" | "last3" | "last5") => void;
  onToggleObrasYear: (year: number) => void;
  onSelectAllObrasYears: () => void;
  obrasSummary?: {
    count: number;
    totalM2Construir: number;
    totalM2Relevado: number;
    relevamientos: number;
    nuevas: number;
    ampliaciones: number;
    proyectadas: number;
  } | null;
  obrasRanking?: {
    destinos: Array<{ label: string; count: number }>;
    tipos: Array<{ label: string; count: number }>;
    zonas: Array<{ label: string; count: number }>;
  } | null;
  measureMode: MeasureMode;
  onChangeMeasureMode: (m: MeasureMode) => void;
  mapRef: React.RefObject<L.Map | null>;
  onAddressFound: (lat: number, lng: number, name: string) => void;
  onOpenAuthPanel: () => void;
  onToggleRegionalInfo: () => void;
  regionalInfoOpen: boolean;
  dashboardUrl?: string;
  adminEditorUrl?: string;
}

export default function Header({
  onToggleLayers, layersPanelOpen,
  onToggleCadastral, cadastralOpen,
  onToggleDensidad, densidadActive, densidadPanelOpen,
  onToggleZonaLegend, zonaLegendOpen,
  showZonaLegendButton,
  onToggleAnalysis, analysisPanelOpen,
  onToggleUpload, uploadPanelOpen,
  planosActive,
  onTogglePlanosVisibility,
  obrasYearOptions,
  selectedObrasYears,
  obrasYearPreset,
  onSelectObrasPreset,
  onToggleObrasYear,
  onSelectAllObrasYears,
  obrasSummary,
  obrasRanking,
  measureMode, onChangeMeasureMode,
  mapRef,
  onAddressFound,
  onOpenAuthPanel,
  onToggleRegionalInfo,
  regionalInfoOpen,
  dashboardUrl,
  adminEditorUrl,
}: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [obrasMenuOpen, setObrasMenuOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const obrasMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!obrasMenuRef.current) return;
      if (!obrasMenuRef.current.contains(event.target as Node)) {
        setObrasMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

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
  const fmt = (n: number) => n.toLocaleString("es-AR");

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
      <form onSubmit={handleSearch} className="hidden md:block flex-1 max-w-xs relative">
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
        <button onClick={handleReset} className={`hidden sm:flex ${BTN_BASE}`} title="Centrar en Colón" data-testid="button-reset-view">
          <Navigation size={13} />
        </button>

        {/* Measure distance */}
        <button
          onClick={() => toggleMeasure("distance")}
          className={`hidden lg:flex ${BTN_BASE} ${measureMode === "distance" ? BTN_ACTIVE("cyan") : ""}`}
          title="Medir distancia"
        >
          <Ruler size={13} />
          <span className="hidden xl:inline text-xs">Dist.</span>
        </button>

        {/* Measure area */}
        <button
          onClick={() => toggleMeasure("area")}
          className={`hidden lg:flex ${BTN_BASE} ${measureMode === "area" ? BTN_ACTIVE("cyan") : ""}`}
          title="Medir superficie"
        >
          <Square size={13} />
          <span className="hidden xl:inline text-xs">Sup.</span>
        </button>

        <div className="hidden lg:block w-px h-5 bg-border/50 mx-0.5 flex-shrink-0" />

        {/* Analysis */}
        <button
          onClick={onToggleAnalysis}
          className={`hidden lg:flex ${BTN_BASE} ${analysisPanelOpen ? BTN_ACTIVE("purple") : ""}`}
          title="Panel de análisis"
        >
          <BarChart2 size={13} />
          <span className="hidden lg:inline text-xs">Análisis</span>
        </button>

        {/* Upload layers */}
        <button
          onClick={onToggleUpload}
          className={`hidden lg:flex ${BTN_BASE} ${uploadPanelOpen ? BTN_ACTIVE("amber") : ""}`}
          title="Cargar capas GIS"
        >
          <Upload size={13} />
          <span className="hidden lg:inline text-xs">Cargá</span>
        </button>

        {/* Planos / obras */}
        <div className="hidden lg:block relative" ref={obrasMenuRef}>
          <button
            onClick={() => setObrasMenuOpen(v => !v)}
            className={`${BTN_BASE} ${(planosActive || obrasMenuOpen) ? BTN_ACTIVE("emerald") : ""}`}
            title="Filtros y analisis de obras"
          >
            <MapPin size={13} />
            <span className="hidden lg:inline text-xs">Obras</span>
            <ChevronDown size={12} className={`${obrasMenuOpen ? "rotate-180" : ""} transition-transform`} />
          </button>

          {obrasMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-[320px] max-h-[70vh] overflow-auto rounded-lg border border-border bg-card shadow-2xl p-3 z-[1200]">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-foreground">Obras por ano de visado</div>
                  <div className="text-[10px] text-muted-foreground">Seleccion individual o multianual</div>
                </div>
                <button
                  type="button"
                  onClick={onTogglePlanosVisibility}
                  className={`px-2 py-1 rounded text-[11px] border ${planosActive ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "border-border text-muted-foreground"}`}
                >
                  {planosActive ? "Visible" : "Oculta"}
                </button>
              </div>

              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Periodo predeterminado</div>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => onSelectObrasPreset("all")}
                    className={`px-2 py-1 rounded text-[11px] border ${obrasYearPreset === "all" ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "border-border text-muted-foreground"}`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectObrasPreset("current")}
                    className={`px-2 py-1 rounded text-[11px] border ${obrasYearPreset === "current" ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "border-border text-muted-foreground"}`}
                  >
                    Ano actual
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectObrasPreset("last3")}
                    className={`px-2 py-1 rounded text-[11px] border ${obrasYearPreset === "last3" ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "border-border text-muted-foreground"}`}
                  >
                    Ultimos 3
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectObrasPreset("last5")}
                    className={`px-2 py-1 rounded text-[11px] border ${obrasYearPreset === "last5" ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "border-border text-muted-foreground"}`}
                  >
                    Ultimos 5
                  </button>
                </div>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Anos disponibles</div>
                  <button
                    type="button"
                    onClick={onSelectAllObrasYears}
                    className="text-[10px] text-primary hover:underline"
                  >
                    Seleccionar todos
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {obrasYearOptions.map((year) => {
                    const checked = selectedObrasYears.includes(year);
                    return (
                      <button
                        key={year}
                        type="button"
                        onClick={() => onToggleObrasYear(year)}
                        className={`px-2 py-1 rounded text-[11px] border ${checked ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "border-border text-muted-foreground"}`}
                      >
                        {year}
                      </button>
                    );
                  })}
                </div>
              </div>

              {obrasSummary && (
                <div className="mt-3 rounded-md border border-border/60 bg-background/40 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Analisis de seleccion</div>
                  <div className="text-[11px] text-foreground">Obras: {fmt(obrasSummary.count)}</div>
                  <div className="text-[11px] text-foreground">m2 a construir: {fmt(Math.round(obrasSummary.totalM2Construir))}</div>
                  <div className="text-[11px] text-foreground">m2 relevados: {fmt(Math.round(obrasSummary.totalM2Relevado))}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Relevamientos: {fmt(obrasSummary.relevamientos)} | Nuevas: {fmt(obrasSummary.nuevas)} | Ampliaciones: {fmt(obrasSummary.ampliaciones)} | Proyectadas: {fmt(obrasSummary.proyectadas)}
                  </div>
                </div>
              )}

              {obrasRanking && (
                <div className="mt-2 rounded-md border border-border/60 bg-background/40 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Ranking rapido</div>

                  <div className="text-[10px] text-muted-foreground">Top destinos</div>
                  <div className="space-y-1 mt-1">
                    {obrasRanking.destinos.slice(0, 3).map((item) => (
                      <div key={`dest-${item.label}`} className="flex items-center justify-between text-[11px]">
                        <span className="text-foreground/90 truncate pr-2">{item.label}</span>
                        <span className="text-muted-foreground">{fmt(item.count)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="text-[10px] text-muted-foreground mt-2">Top tipos</div>
                  <div className="space-y-1 mt-1">
                    {obrasRanking.tipos.slice(0, 3).map((item) => (
                      <div key={`tipo-${item.label}`} className="flex items-center justify-between text-[11px]">
                        <span className="text-foreground/90 truncate pr-2">{item.label}</span>
                        <span className="text-muted-foreground">{fmt(item.count)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="text-[10px] text-muted-foreground mt-2">Top zonas</div>
                  <div className="space-y-1 mt-1">
                    {obrasRanking.zonas.slice(0, 3).map((item) => (
                      <div key={`zona-${item.label}`} className="flex items-center justify-between text-[11px]">
                        <span className="text-foreground/90 truncate pr-2">{item.label}</span>
                        <span className="text-muted-foreground">{fmt(item.count)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-2 rounded-md border border-border/60 bg-background/40 p-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Referencia de colores de puntos</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {OBRAS_COLOR_LEGEND.map((item) => (
                    <div key={item.label} className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-white/20 flex-shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-[10px] text-foreground/90 truncate">{item.label}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  Tamano del punto: proporcional a los m² declarados.
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  onToggleAnalysis();
                  setObrasMenuOpen(false);
                }}
                className={`mt-3 w-full px-2 py-1.5 rounded text-[11px] border ${analysisPanelOpen ? "bg-purple-500/15 border-purple-500/40 text-purple-300" : "border-border text-foreground"}`}
              >
                {analysisPanelOpen ? "Panel de analisis abierto" : "Abrir panel de analisis"}
              </button>
            </div>
          )}
        </div>

        <div className="hidden md:block w-px h-5 bg-border/50 mx-0.5 flex-shrink-0" />

        {/* Zona legend */}
        {showZonaLegendButton && (
          <button
            onClick={onToggleZonaLegend}
            className={`hidden md:flex ${BTN_BASE} ${zonaLegendOpen ? BTN_ACTIVE("emerald") : ""}`}
            title="Leyenda de zonificación"
            data-testid="button-toggle-zona-legend"
          >
            <Map size={13} />
            <span className="hidden xl:inline text-xs">Zonif.</span>
          </button>
        )}

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

        {/* Regional services */}
        <button
          onClick={onToggleRegionalInfo}
          className={`${BTN_BASE} ${regionalInfoOpen ? BTN_ACTIVE("emerald") : ""}`}
          title="Servicios regionales"
          data-testid="button-toggle-regional-info"
        >
          <Cloud size={13} />
          <span className="hidden sm:inline text-xs">Servicios</span>
        </button>

        <div className="w-px h-5 bg-border/50 mx-0.5 flex-shrink-0" />

        {/* Auth */}
        <AuthButton
          onOpenPanel={onOpenAuthPanel}
          dashboardUrl={dashboardUrl}
          adminEditorUrl={adminEditorUrl}
        />
      </div>
    </header>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const BTN_BASE = "flex items-center gap-1 px-1.5 sm:gap-1.5 sm:px-2 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition-all flex-shrink-0";

const OBRAS_COLOR_LEGEND: Array<{ label: string; color: string }> = [
  { label: "Vivienda", color: "#0f766e" },
  { label: "Comercial", color: "#d97706" },
  { label: "Productivo", color: "#0ea5e9" },
  { label: "Mixto", color: "#8b5cf6" },
  { label: "Otros / Sin destino", color: "#64748b" },
];

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
