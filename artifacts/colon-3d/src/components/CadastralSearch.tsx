import { useState, useRef } from "react";
import { Search, X, MapPin, Loader2, ChevronDown, ChevronUp } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GeoFeature = any;

interface SearchParams {
  ncp: string;
  sec: string;
  gru: string;
  manz: string;
  nparc: string;
  objeto: string;
  nombre: string;
}

interface CadastralSearchProps {
  basePath: string;
  isAdmin: boolean;
  onFeatureFound: (feature: GeoFeature) => void;
  onClose: () => void;
}

type SearchMode = "ncp" | "partida" | "titular";

const EMPTY_PARAMS: SearchParams = {
  ncp: "", sec: "", gru: "", manz: "", nparc: "", objeto: "", nombre: ""
};

export default function CadastralSearch({ basePath, isAdmin, onFeatureFound, onClose }: CadastralSearchProps) {
  const [params, setParams] = useState<SearchParams>(EMPTY_PARAMS);
  const [searchMode, setSearchMode] = useState<SearchMode>("ncp");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GeoFeature[]>([]);
  const [searched, setSearched] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const dataRef = useRef<GeoFeature[] | null>(null);

  const loadData = async (): Promise<GeoFeature[]> => {
    if (dataRef.current) return dataRef.current;
    const res = await fetch(`${basePath}/data/Parcela.geojson`);
    const json = await res.json();
    dataRef.current = json.features;
    return json.features;
  };

  const normalize = (v: unknown) => String(v ?? "").trim().toLowerCase();

  const normalizePartidaNumber = (v: unknown) => {
    const clean = String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const noPrefix = clean.replace(/^[a-z]+/, "");
    return noPrefix.replace(/^0+/, "");
  };

  const matchesPartida = (partidaValue: unknown, query: string) => {
    const qRaw = normalize(query);
    const vRaw = normalize(partidaValue);
    const qNum = normalizePartidaNumber(query);
    const vNum = normalizePartidaNumber(partidaValue);
    const textMatch = vRaw.includes(qRaw);
    // Allows searching by short numeric form: "8178" -> "I008178"
    const numMatch = qNum.length > 0 && (vNum === qNum || vNum.includes(qNum));
    return textMatch || numMatch;
  };

  const matches = (feature: GeoFeature, p: SearchParams): boolean => {
    const pr = feature.properties || {};
    if (p.ncp && !normalize(pr.NCP).includes(normalize(p.ncp))) return false;
    if (p.sec && Number(pr.SEC) !== Number(p.sec)) return false;
    if (p.gru && Number(pr.GRU) !== Number(p.gru)) return false;
    if (p.manz) {
      const manzVal = Number(pr.NMANZ) || Number(pr.MANZ) || 0;
      if (manzVal !== Number(p.manz)) return false;
    }
    if (p.nparc && Number(pr.NPARC) !== Number(p.nparc)) return false;
    if (p.objeto) {
      if (!matchesPartida(pr.OBJETO, p.objeto)) return false;
    }
    if (p.nombre && isAdmin && !normalize(pr.NOMBRE).includes(normalize(p.nombre))) return false;
    return true;
  };

  const hasAnyParam = Object.values(params).some(v => v.trim() !== "");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasAnyParam) return;
    setLoading(true);
    setSearched(false);
    try {
      const features = await loadData();
      const effective: SearchParams = { ...params };
      if (searchMode === "ncp") {
        effective.objeto = "";
        effective.nombre = "";
      } else if (searchMode === "partida") {
        effective.ncp = "";
        effective.nombre = "";
      } else {
        effective.ncp = "";
        effective.objeto = "";
      }
      if (!isAdmin) effective.nombre = "";
      const found = features.filter(f => matches(f, effective));
      setResults(found.slice(0, 50));
      setSearched(true);
    } catch (err) {
      console.error("Cadastral search error:", err);
      setResults([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setParams(EMPTY_PARAMS);
    setResults([]);
    setSearched(false);
  };

  const getResultLabel = (f: GeoFeature): string => {
    const pr = f.properties || {};
    const parts: string[] = [];
    if (pr.NCP) parts.push(pr.NCP);
    if (pr.NOMBRE) parts.push(pr.NOMBRE);
    if (pr.OBJETO) parts.push(`Partida: ${pr.OBJETO}`);
    return parts.join(" — ") || "Parcela sin datos";
  };

  const getResultSub = (f: GeoFeature): string => {
    const pr = f.properties || {};
    const parts: string[] = [];
    if (pr.SEC) parts.push(`Sec ${pr.SEC}`);
    if (pr.GRU) parts.push(`Grp ${pr.GRU}`);
    const manz = pr.NMANZ || pr.MANZ;
    if (manz) parts.push(`Manz ${manz}`);
    if (pr.NPARC) parts.push(`Parc ${pr.NPARC}`);
    if (pr.CALLE) parts.push(pr.CALLE);
    return parts.join(" · ");
  };

  const field = (
    key: keyof SearchParams,
    label: string,
    placeholder: string,
    type = "text"
  ) => (
    <div>
      <label className="block text-[10px] text-muted-foreground mb-1 font-medium uppercase tracking-wider">{label}</label>
      <input
        type={type}
        value={params[key]}
        onChange={e => setParams(prev => ({ ...prev, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
      />
    </div>
  );

  const partidaHelp = (
    <p className="text-[10px] text-muted-foreground/80 -mt-1">
      Formatos validos: I008178 o solo 8178 (sin letra ni ceros iniciales).
    </p>
  );

  return (
    <div
      className="w-[88vw] sm:w-72 rounded-xl overflow-hidden shadow-xl border border-border"
      style={{ background: "hsl(220 16% 12%)" }}
      data-testid="cadastral-search-panel"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Búsqueda Catastral</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X size={15} />
        </button>
      </div>

      <form onSubmit={handleSearch} className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 180px)" }}>
        <div className="p-3 space-y-2.5">
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1 font-medium uppercase tracking-wider">Modo de búsqueda</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setSearchMode("ncp")}
                className={`px-2 py-1.5 text-[10px] rounded-lg border transition-colors ${searchMode === "ncp" ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                Nomenclatura (NCP)
              </button>
              <button
                type="button"
                onClick={() => setSearchMode("partida")}
                className={`px-2 py-1.5 text-[10px] rounded-lg border transition-colors ${searchMode === "partida" ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                Partida municipal
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setSearchMode("titular")}
                  className={`col-span-2 px-2 py-1.5 text-[10px] rounded-lg border transition-colors ${searchMode === "titular" ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  Titular / Nombre (solo admin)
                </button>
              )}
            </div>
          </div>

          {searchMode === "ncp" && field("ncp", "NCP (Nomenclatura)", "0100010000000295--011--")}
          {searchMode === "partida" && (
            <>
              {field("objeto", "Partida municipal (OBJETO)", "p. ej. I008178 o solo 8178")}
              {partidaHelp}
            </>
          )}
          {isAdmin && searchMode === "titular" && field("nombre", "Titular / Nombre", "apellido o nombre")}

          <div className="grid grid-cols-2 gap-2">
            {field("sec", "Sección", "p. ej. 1", "number")}
            {field("gru", "Grupo", "p. ej. 131", "number")}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {field("manz", "Manzana", "p. ej. 4", "number")}
            {field("nparc", "Parcela N°", "p. ej. 9", "number")}
          </div>

          <button
            type="button"
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowAdvanced(v => !v)}
          >
            {showAdvanced ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            Campos adicionales
          </button>

          {showAdvanced && (
            <div className="space-y-2.5 pt-1">
              {isAdmin && field("nombre", "Titular / Nombre", "apellido o nombre")}
            </div>
          )}
        </div>

        <div className="flex gap-2 px-3 pb-3">
          <button
            type="submit"
            disabled={loading || !hasAnyParam}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            {loading ? "Buscando…" : "Buscar parcela"}
          </button>
          {hasAnyParam && (
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-2 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>
      </form>

      {searched && (
        <div className="border-t border-border">
          {results.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
              <MapPin size={14} />
              <span className="text-xs">Sin resultados</span>
            </div>
          ) : (
            <div>
              <div className="px-4 py-2 bg-primary/5">
                <span className="text-[10px] text-primary font-medium">
                  {results.length === 50 ? "50+ coincidencias (mostrando primeras 50)" : `${results.length} parcela${results.length !== 1 ? "s" : ""} encontrada${results.length !== 1 ? "s" : ""}`}
                </span>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: "240px" }}>
                {results.map((f, i) => (
                  <button
                    key={i}
                    onClick={() => onFeatureFound(f)}
                    className="w-full text-left px-4 py-2.5 hover:bg-accent transition-colors border-b border-border/30 last:border-0"
                  >
                    <div className="flex items-start gap-2">
                      <MapPin size={11} className="text-primary flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-[10px] text-foreground font-medium truncate">{getResultLabel(f)}</div>
                        <div className="text-[9px] text-muted-foreground mt-0.5">{getResultSub(f)}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
