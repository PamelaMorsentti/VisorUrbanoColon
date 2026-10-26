import { useState, useRef, useEffect, type ReactNode } from "react";
import {
  Layers, Search, Navigation, MapPin, X, Loader2,
  BarChart2, Map, Upload, Ruler, Square, ChevronDown, Cloud, MoreHorizontal, Droplets,
} from "lucide-react";
import L from "leaflet";
import { COLON_CENTER, COLON_ZOOM } from "@/lib/layers";
import { AuthButton } from "@/components/AuthGate";
import type { MeasureMode } from "@/components/MeasureTool";

const MENU_TUTORIAL_STORAGE_KEY = "colon3d.menuTutorial.hidden";

// ─── IGN Argentina geocoder ───────────────────────────────────────────────────

interface IGNResult {
  nomenclatura: string;
  ubicacion?: { lat: number; lon: number };
  lat?: number;
  lon?: number;
}

type AddressCandidate = {
  lat: number;
  lng: number;
  name: string;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeAddressForQuery(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/[“”„'`´]/g, "")
      .replace(/[|·…]/g, " ")
      .replace(/û/g, "ü")
      .replace(/\b(Bv|Bvd|Bvard|Bvrd)\.?(?=[\s,]|$)/gi, "Boulevard")
      .replace(/\b(Av|Avda|Avenida)\.?(?=[\s,]|$)/gi, "Avenida")
      .replace(/\bPte\.?\s*/gi, "Presidente ")
      .replace(/\bGral\.?(?=[\s,]|$)/gi, "General")
      .replace(/\bL\.?\s*N\.?\s*Alem\b/gi, "Leandro N. Alem")
      .replace(/\bM\.?\s*Moreno\b/gi, "Mariano Moreno")
      .replace(/\bJ\.?\s*J\.?\s*Paso\b/gi, "Juan José Paso")
      .replace(/(?:^|\s)s\/?n[°ºªo]?\b/gi, " ")
      .replace(/(?:^|\s)N(?:RO\.?|[°ºª])\s*/gi, " ")
      .replace(/(?:^|\s)e\/(\S)/gi, " esq $1")
      .replace(/[()]/g, " ")
      .replace(/\bantes\b.*$/i, "")
      .replace(/\s+,/g, ",")
      .replace(/,{2,}/g, ",")
      .replace(/\.{2,}/g, "."),
  );
}

function uniqueQueries(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function buildAddressQueries(rawAddress: string): string[] {
  const cleaned = normalizeAddressForQuery(rawAddress)
    .replace(/\s+-\s+.*$/g, "")
    .replace(/\s{2,}/g, " ");

  const numbers = cleaned.match(/\d{1,5}/g) ?? [];
  const mainPart = normalizeWhitespace(cleaned.split(",")[0] ?? cleaned);
  const cornerMatch = mainPart.match(/^(.*?)(?:\besq\.?\b)(.*)$/i);
  const streetWithoutNumbers = normalizeWhitespace(
    mainPart.replace(/\d+/g, " ").replace(/\by\b/gi, " ").replace(/[-,]/g, " "),
  );
  const firstNumber = numbers[0] ?? "";

  const queryCandidates: string[] = [];
  queryCandidates.push(`${cleaned}, Colón`);

  if (cornerMatch) {
    const primary = normalizeWhitespace(cornerMatch[1].replace(/\d+/g, " ").replace(/\by\b/gi, " ").replace(/[-,]/g, " "));
    const crossing = normalizeWhitespace(cornerMatch[2].replace(/\d+/g, " ").replace(/[-,]/g, " "));
    if (primary && crossing) queryCandidates.push(`${primary} y ${crossing}, Colón`);
    if (primary && firstNumber) queryCandidates.push(`${primary} ${firstNumber}, Colón`);
    if (primary) queryCandidates.push(`${primary}, Colón`);
  } else {
    if (streetWithoutNumbers && firstNumber) queryCandidates.push(`${streetWithoutNumbers} ${firstNumber}, Colón`);
    if (streetWithoutNumbers) queryCandidates.push(`${streetWithoutNumbers}, Colón`);
  }

  return uniqueQueries(queryCandidates);
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function matchedStreetIsPlausible(query: string, matchName: string): boolean {
  const STOP = new Set(["de", "del", "la", "el", "los", "las", "y", "e", "en", "av", "grl", "bvd", "bv", "san", "juan"]);
  const stripCity = (s: string) => stripAccents(s).replace(/,?\s*(col[oó]n|entre\s+r[ií]os|provincia[^,]*).*$/gi, "");
  const toWords = (s: string) => stripCity(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));

  const queryWords = toWords(query);
  const matchWords = new Set(toWords(matchName));

  for (const word of queryWords) {
    if (matchWords.has(word)) return true;
    for (const matchWord of matchWords) {
      if (matchWord.startsWith(word) || word.startsWith(matchWord)) return true;
    }
  }

  return false;
}

async function searchIGN(rawQuery: string, signal: AbortSignal): Promise<{ lat: number; lng: number; name: string } | null> {
  const queries = buildAddressQueries(rawQuery);
  let fallback: { lat: number; lng: number; name: string } | null = null;

  for (const query of queries) {
    const url = `https://apis.datos.gob.ar/georef/api/direcciones?direccion=${encodeURIComponent(query)}&provincia=entre%20rios&localidad=colon&max=5`;
    const res = await fetch(url, { signal });
    if (!res.ok) continue;

    const data = await res.json() as { direcciones?: IGNResult[] };
    const direcciones = data.direcciones ?? [];

    for (const match of direcciones) {
      const lat = match.ubicacion?.lat ?? match.lat;
      const lon = match.ubicacion?.lon ?? match.lon;
      if (typeof lat !== "number" || typeof lon !== "number") continue;

      const name = match.nomenclatura ?? query;
      const candidate = { lat, lng: lon, name };
      if (!fallback) fallback = candidate;

      if (matchedStreetIsPlausible(query, name)) {
        return candidate;
      }
    }
  }

  return fallback;
}

async function fetchIGNSuggestions(rawQuery: string, signal: AbortSignal): Promise<AddressCandidate[]> {
  const queries = buildAddressQueries(rawQuery);
  type RankedCandidate = AddressCandidate & { rank: number };
  const ranked: RankedCandidate[] = [];
  const seen = new Set<string>();

  for (const query of queries) {
    const url = `https://apis.datos.gob.ar/georef/api/direcciones?direccion=${encodeURIComponent(query)}&provincia=entre%20rios&localidad=colon&max=6`;
    const res = await fetch(url, { signal });
    if (!res.ok) continue;

    const data = await res.json() as { direcciones?: IGNResult[] };
    const direcciones = data.direcciones ?? [];

    direcciones.forEach((match, idx) => {
      const lat = match.ubicacion?.lat ?? match.lat;
      const lon = match.ubicacion?.lon ?? match.lon;
      if (typeof lat !== "number" || typeof lon !== "number") return;

      const name = (match.nomenclatura ?? query).trim();
      const key = `${lat.toFixed(6)}:${lon.toFixed(6)}:${name.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);

      const plausible = matchedStreetIsPlausible(query, name);
      const rank = (plausible ? 0 : 100) + idx;
      ranked.push({ lat, lng: lon, name, rank });
    });
  }

  return ranked
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 6)
    .map(({ lat, lng, name }) => ({ lat, lng, name }));
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
  onToggleFloodSimulationPanel: () => void;
  floodSimulationPanelOpen: boolean;
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
  onToggleFloodSimulationPanel,
  floodSimulationPanelOpen,
  dashboardUrl,
  adminEditorUrl,
}: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchSuggestions, setSearchSuggestions] = useState<AddressCandidate[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const [layersMenuOpen, setLayersMenuOpen] = useState(false);
  const [analysisMenuOpen, setAnalysisMenuOpen] = useState(false);
  const [riskMenuOpen, setRiskMenuOpen] = useState(false);
  const [menuTutorialEnabled, setMenuTutorialEnabled] = useState(true);
  const [activeTutorialHintId, setActiveTutorialHintId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const suggestAbortRef = useRef<AbortController | null>(null);
  const navMenuRef = useRef<HTMLDivElement | null>(null);
  const layersMenuRef = useRef<HTMLDivElement | null>(null);
  const analysisMenuRef = useRef<HTMLDivElement | null>(null);
  const riskMenuRef = useRef<HTMLDivElement | null>(null);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const hidden = window.localStorage.getItem(MENU_TUTORIAL_STORAGE_KEY) === "1";
      setMenuTutorialEnabled(!hidden);
    } catch {
      setMenuTutorialEnabled(true);
    }
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (navMenuRef.current && !navMenuRef.current.contains(target)) setNavMenuOpen(false);
      if (layersMenuRef.current && !layersMenuRef.current.contains(target)) setLayersMenuOpen(false);
      if (analysisMenuRef.current && !analysisMenuRef.current.contains(target)) setAnalysisMenuOpen(false);
      if (riskMenuRef.current && !riskMenuRef.current.contains(target)) setRiskMenuOpen(false);
      setActiveTutorialHintId(null);
      if (searchBoxRef.current && !searchBoxRef.current.contains(target)) {
        setSuggestionsOpen(false);
        setActiveSuggestionIndex(-1);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 3) {
      setSearchSuggestions([]);
      setSuggestionsOpen(false);
      setActiveSuggestionIndex(-1);
      suggestAbortRef.current?.abort();
      return;
    }

    const timer = window.setTimeout(async () => {
      suggestAbortRef.current?.abort();
      const ctrl = new AbortController();
      suggestAbortRef.current = ctrl;
      setSuggestionsLoading(true);
      try {
        const next = await fetchIGNSuggestions(q, ctrl.signal);
        setSearchSuggestions(next);
        setSuggestionsOpen(next.length > 0);
        setActiveSuggestionIndex(-1);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setSearchSuggestions([]);
          setSuggestionsOpen(false);
          setActiveSuggestionIndex(-1);
        }
      } finally {
        setSuggestionsLoading(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  const applyAddressCandidate = (candidate: AddressCandidate) => {
    mapRef.current?.flyTo([candidate.lat, candidate.lng], 17, { duration: 1.2 });
    onAddressFound(candidate.lat, candidate.lng, candidate.name);
    setSearchQuery(candidate.name);
    setSearchError(null);
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(-1);
  };

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
        applyAddressCandidate(result);
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
    setSearchSuggestions([]);
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(-1);
    abortRef.current?.abort();
    suggestAbortRef.current?.abort();
  };

  const handleSearchInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestionsOpen || searchSuggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => Math.min(prev + 1, searchSuggestions.length - 1));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (e.key === "Enter" && activeSuggestionIndex >= 0) {
      e.preventDefault();
      const selected = searchSuggestions[activeSuggestionIndex];
      if (selected) applyAddressCandidate(selected);
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setSuggestionsOpen(false);
      setActiveSuggestionIndex(-1);
    }
  };

  const toggleMeasure = (m: MeasureMode) => onChangeMeasureMode(measureMode === m ? "none" : m);
  const fmt = (n: number) => n.toLocaleString("es-AR");
  const disableMenuTutorial = () => {
    setMenuTutorialEnabled(false);
    setActiveTutorialHintId(null);
    try {
      window.localStorage.setItem(MENU_TUTORIAL_STORAGE_KEY, "1");
    } catch {
      // Ignore storage restrictions.
    }
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
        <div className="hidden md:block min-w-0">
          <div className="text-sm font-bold text-foreground leading-tight whitespace-nowrap">Colón 3D</div>
          <div className="text-[10px] text-muted-foreground leading-tight">Entre Ríos · Visor Urbano</div>
        </div>
      </div>

      {/* Address search – IGN Argentina */}
      <form onSubmit={handleSearch} className="hidden md:block flex-1 max-w-xs relative">
        <div className="relative" ref={searchBoxRef}>
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setSearchError(null);
            }}
            onFocus={() => {
              if (searchSuggestions.length > 0) setSuggestionsOpen(true);
            }}
            onKeyDown={handleSearchInputKeyDown}
            placeholder="Buscar dirección en Colón…"
            disabled={searching}
            className={`w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border bg-card text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 transition-all disabled:opacity-60 ${
              searchError ? "border-red-500/60 focus:ring-red-500/40" : "border-border focus:ring-primary/50"
            }`}
            data-testid="input-search"
          />
          {(searching || suggestionsLoading) && <Loader2 size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />}
          {!searching && (searchQuery || searchError) && (
            <button type="button" onClick={clearSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={11} />
            </button>
          )}

          {suggestionsOpen && searchSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 z-20 rounded-lg border border-border bg-card shadow-xl overflow-hidden">
              {searchSuggestions.map((candidate, idx) => (
                <button
                  key={`${candidate.lat}-${candidate.lng}-${idx}`}
                  type="button"
                  onClick={() => applyAddressCandidate(candidate)}
                  className={`w-full text-left px-3 py-2 text-[11px] border-b border-border/40 last:border-b-0 transition-colors ${activeSuggestionIndex === idx ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                >
                  {candidate.name}
                </button>
              ))}
            </div>
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
        <div className="relative" ref={navMenuRef}>
          <MenuTutorialHint
            title="Navegacion"
            description="Busca direcciones, recentra el mapa y mide distancias o superficies."
            tutorialEnabled={menuTutorialEnabled}
            onDisableTutorial={disableMenuTutorial}
            hintId="nav"
            activeHintId={activeTutorialHintId}
            onShowHint={setActiveTutorialHintId}
            onHideHint={() => setActiveTutorialHintId(null)}
          >
            <button
              onClick={() => {
                setNavMenuOpen(v => !v);
                setLayersMenuOpen(false);
                setAnalysisMenuOpen(false);
                setRiskMenuOpen(false);
                setActiveTutorialHintId(null);
              }}
              className={`${BTN_BASE} ${navMenuOpen ? BTN_ACTIVE("sky") : ""}`}
              title="Navegacion"
            >
              <Navigation size={13} />
              <span className="hidden sm:inline text-xs">Navegacion</span>
              <ChevronDown size={12} className={`${navMenuOpen ? "rotate-180" : ""} transition-transform`} />
            </button>
          </MenuTutorialHint>

          {navMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-border bg-card shadow-2xl p-2 z-[1200]">
              <button onClick={() => { handleReset(); setNavMenuOpen(false); }} className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-background/60">
                <span>Centrar en Colon</span>
                <Navigation size={12} />
              </button>
              <button onClick={() => { toggleMeasure("distance"); setNavMenuOpen(false); }} className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-background/60">
                <span>{measureMode === "distance" ? "Desactivar distancia" : "Medir distancia"}</span>
                <Ruler size={12} />
              </button>
              <button onClick={() => { toggleMeasure("area"); setNavMenuOpen(false); }} className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-background/60">
                <span>{measureMode === "area" ? "Desactivar superficie" : "Medir superficie"}</span>
                <Square size={12} />
              </button>
            </div>
          )}
        </div>

        <div className="relative" ref={layersMenuRef}>
          <MenuTutorialHint
            title="Capas"
            description="Activa o desactiva informacion del mapa y herramientas de capas."
            tutorialEnabled={menuTutorialEnabled}
            onDisableTutorial={disableMenuTutorial}
            hintId="layers"
            activeHintId={activeTutorialHintId}
            onShowHint={setActiveTutorialHintId}
            onHideHint={() => setActiveTutorialHintId(null)}
          >
            <button
              onClick={() => {
                setLayersMenuOpen(v => !v);
                setNavMenuOpen(false);
                setAnalysisMenuOpen(false);
                setRiskMenuOpen(false);
                setActiveTutorialHintId(null);
              }}
              className={`${BTN_BASE} ${(layersPanelOpen || cadastralOpen || zonaLegendOpen || planosActive || layersMenuOpen) ? BTN_ACTIVE("amber") : ""}`}
              title="Capas"
              data-testid="button-toggle-layers"
            >
              <Layers size={13} />
              <span className="hidden sm:inline text-xs">Capas</span>
              <ChevronDown size={12} className={`${layersMenuOpen ? "rotate-180" : ""} transition-transform`} />
            </button>
          </MenuTutorialHint>

          {layersMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-60 rounded-lg border border-border bg-card shadow-2xl p-2 z-[1200]">
              <button onClick={() => { onToggleLayers(); }} className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-background/60">
                <span>{layersPanelOpen ? "Ocultar selector de capas" : "Abrir selector de capas"}</span>
                <Layers size={12} />
              </button>
              <button onClick={() => { onToggleCadastral(); }} className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-background/60" data-testid="button-toggle-cadastral">
                <span>{cadastralOpen ? "Ocultar catastro" : "Abrir catastro"}</span>
                <MapPin size={12} />
              </button>
              {showZonaLegendButton && (
                <button onClick={() => { onToggleZonaLegend(); }} className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-background/60" data-testid="button-toggle-zona-legend">
                  <span>{zonaLegendOpen ? "Ocultar zonificacion" : "Ver zonificacion"}</span>
                  <Map size={12} />
                </button>
              )}
              <button onClick={() => { onTogglePlanosVisibility(); }} className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-background/60">
                <span>{planosActive ? "Ocultar obras" : "Mostrar obras"}</span>
                <MapPin size={12} />
              </button>
            </div>
          )}
        </div>

        <div className="relative" ref={analysisMenuRef}>
          <MenuTutorialHint
            title="Analisis"
            description="Paneles de analisis, carga GIS y filtros avanzados de obras."
            tutorialEnabled={menuTutorialEnabled}
            onDisableTutorial={disableMenuTutorial}
            hintId="analysis"
            activeHintId={activeTutorialHintId}
            onShowHint={setActiveTutorialHintId}
            onHideHint={() => setActiveTutorialHintId(null)}
          >
            <button
              onClick={() => {
                setAnalysisMenuOpen(v => !v);
                setNavMenuOpen(false);
                setLayersMenuOpen(false);
                setRiskMenuOpen(false);
                setActiveTutorialHintId(null);
              }}
              className={`${BTN_BASE} ${(analysisPanelOpen || uploadPanelOpen || analysisMenuOpen) ? BTN_ACTIVE("purple") : ""}`}
              title="Analisis"
            >
              <BarChart2 size={13} />
              <span className="hidden sm:inline text-xs">Analisis</span>
              <ChevronDown size={12} className={`${analysisMenuOpen ? "rotate-180" : ""} transition-transform`} />
            </button>
          </MenuTutorialHint>

          {analysisMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-[320px] max-h-[70vh] overflow-auto rounded-lg border border-border bg-card shadow-2xl p-3 z-[1200]">
              <button
                type="button"
                onClick={onToggleAnalysis}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-[11px] border ${analysisPanelOpen ? "bg-purple-500/15 border-purple-500/40 text-purple-300" : "border-border text-foreground"}`}
              >
                <span>{analysisPanelOpen ? "Ocultar panel de analisis" : "Abrir panel de analisis"}</span>
                <BarChart2 size={12} />
              </button>

              <button
                type="button"
                onClick={onToggleUpload}
                className={`mt-2 w-full flex items-center justify-between px-2 py-1.5 rounded text-[11px] border ${uploadPanelOpen ? "bg-amber-500/15 border-amber-500/40 text-amber-300" : "border-border text-foreground"}`}
              >
                <span>{uploadPanelOpen ? "Ocultar carga GIS" : "Abrir carga GIS"}</span>
                <Upload size={12} />
              </button>

              <div className="mt-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-foreground">Obras por ano de visado</div>
                  <div className="text-[10px] text-muted-foreground">Seleccion individual o multianual</div>
                  <div className="text-[10px] text-emerald-300/90 mt-0.5">
                    Años activos: {selectedObrasYears.length > 0
                      ? (selectedObrasYears.length <= 4 ? selectedObrasYears.join(", ") : `${selectedObrasYears.length} años seleccionados`)
                      : "sin selección"}
                  </div>
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
                      <span className="w-2.5 h-2.5 rounded-full border border-white/20 flex-shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-[10px] text-foreground/90 truncate">{item.label}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">Tamano del punto: proporcional a los m² declarados.</div>
              </div>
            </div>
          )}
        </div>

        <div className="relative" ref={riskMenuRef}>
          <MenuTutorialHint
            title="Riesgo y servicios"
            description="Simula crecidas y consulta servicios regionales en un mismo menu."
            tutorialEnabled={menuTutorialEnabled}
            onDisableTutorial={disableMenuTutorial}
            hintId="risk"
            activeHintId={activeTutorialHintId}
            onShowHint={setActiveTutorialHintId}
            onHideHint={() => setActiveTutorialHintId(null)}
          >
            <button
              onClick={() => {
                setRiskMenuOpen(v => !v);
                setNavMenuOpen(false);
                setLayersMenuOpen(false);
                setAnalysisMenuOpen(false);
                setActiveTutorialHintId(null);
              }}
              className={`${BTN_BASE} ${(floodSimulationPanelOpen || regionalInfoOpen || riskMenuOpen) ? BTN_ACTIVE("emerald") : ""}`}
              title="Riesgo y servicios"
            >
              <Cloud size={13} />
              <span className="hidden sm:inline text-xs">Riesgo</span>
              <ChevronDown size={12} className={`${riskMenuOpen ? "rotate-180" : ""} transition-transform`} />
            </button>
          </MenuTutorialHint>

          {riskMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-border bg-card shadow-2xl p-2 z-[1200]">
              <button onClick={() => { onToggleFloodSimulationPanel(); }} className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-background/60" data-testid="button-toggle-flood-simulation">
                <span>{floodSimulationPanelOpen ? "Ocultar simulacion crecida" : "Abrir simulacion crecida"}</span>
                <Droplets size={12} />
              </button>
              <button onClick={() => { onToggleRegionalInfo(); }} className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-background/60" data-testid="button-toggle-regional-info">
                <span>{regionalInfoOpen ? "Ocultar servicios" : "Abrir servicios regionales"}</span>
                <Cloud size={12} />
              </button>
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-border/50 mx-0.5 flex-shrink-0" />

        <MenuTutorialHint
          title="Acceso"
          description="Ingresa con tu perfil para habilitar funciones segun tu rol."
          tutorialEnabled={menuTutorialEnabled}
          onDisableTutorial={disableMenuTutorial}
          hintId="access"
          activeHintId={activeTutorialHintId}
          onShowHint={setActiveTutorialHintId}
          onHideHint={() => setActiveTutorialHintId(null)}
        >
          <AuthButton
            onOpenPanel={onOpenAuthPanel}
            dashboardUrl={dashboardUrl}
            adminEditorUrl={adminEditorUrl}
          />
        </MenuTutorialHint>
      </div>
    </header>
  );
}

function MenuTutorialHint({
  title,
  description,
  tutorialEnabled,
  onDisableTutorial,
  hintId,
  activeHintId,
  onShowHint,
  onHideHint,
  children,
}: {
  title: string;
  description: string;
  tutorialEnabled: boolean;
  onDisableTutorial: () => void;
  hintId: string;
  activeHintId: string | null;
  onShowHint: (id: string | null) => void;
  onHideHint: () => void;
  children: ReactNode;
}) {
  if (!tutorialEnabled) return <>{children}</>;

  const isOpen = activeHintId === hintId;

  return (
    <div
      className="relative"
      onMouseEnter={() => onShowHint(hintId)}
      onMouseLeave={onHideHint}
      onFocusCapture={() => onShowHint(hintId)}
      onBlurCapture={onHideHint}
    >
      {children}
      <div className={`absolute left-1/2 top-full z-[1600] mt-2 w-56 -translate-x-1/2 rounded-md border border-border bg-card/95 px-2.5 py-2 shadow-2xl backdrop-blur-sm ${isOpen ? "block" : "hidden"}`}>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-primary">{title}</div>
        <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{description}</div>
        <button
          type="button"
          onClick={onDisableTutorial}
          className="mt-2 text-[10px] font-medium text-amber-300 hover:text-amber-200"
        >
          No volver a mostrar ayuda
        </button>
      </div>
    </div>
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
