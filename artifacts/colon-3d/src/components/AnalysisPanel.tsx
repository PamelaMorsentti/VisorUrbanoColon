import { useState, useCallback } from "react";
import { X, BarChart2, PieChart, TrendingUp, Map, FileSpreadsheet, ChevronRight, Loader2, Download } from "lucide-react";

interface AnalysisPanelProps {
  onClose: () => void;
  onActivateDensidad: () => void;
  densidadActive: boolean;
  onToggleObrasHeatmap: () => void;
  obrasHeatmapActive: boolean;
  obrasHeatmapMetric: "count" | "m2";
  onSetObrasHeatmapMetric: (metric: "count" | "m2") => void;
  obrasHeatStats: { barriosConObras: number; maxCount: number; maxM2: number } | null;
  obrasHeatBarrioData: Array<{ barrio: string; count: number; m2: number }>;
  obrasYearOptions: number[];
  selectedObrasYears: number[];
  obrasYearPreset: "all" | "current" | "last3" | "last5" | "custom";
  onSelectObrasPreset: (preset: "all" | "current" | "last3" | "last5") => void;
  onToggleObrasYear: (year: number) => void;
  onSelectAllObrasYears: () => void;
  canRunAnalysis: boolean;
  basePath: string;
}

type AnalysisType = "densidad" | "obrasHeat" | "zonas" | "superficie" | "pendiente" | null;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ZonaStats {
  zona: string;
  count: number;
  area: number;
}

interface SurpStats {
  totalParcelas: number;
  totalEdif: number;
  totalArea: number;
  avgAreaParcela: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AnalysisPanel({
  onClose,
  onActivateDensidad,
  densidadActive,
  onToggleObrasHeatmap,
  obrasHeatmapActive,
  obrasHeatmapMetric,
  onSetObrasHeatmapMetric,
  obrasHeatStats,
  obrasHeatBarrioData,
  obrasYearOptions,
  selectedObrasYears,
  obrasYearPreset,
  onSelectObrasPreset,
  onToggleObrasYear,
  onSelectAllObrasYears,
  canRunAnalysis,
  basePath,
}: AnalysisPanelProps) {
  const [active, setActive] = useState<AnalysisType>(null);
  const [loading, setLoading] = useState(false);
  const [zonaStats, setZonaStats] = useState<ZonaStats[] | null>(null);
  const [surpStats, setSurpStats] = useState<SurpStats | null>(null);

  const runZonaAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${basePath}/data/zonas.geojson`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await r.json() as { features: Array<{ properties: Record<string, any>; geometry: any }> };
      const counts: Record<string, { count: number; area: number }> = {};
      for (const f of data.features) {
        const zona = f.properties?.ZONA || "Sin zona";
        if (!counts[zona]) counts[zona] = { count: 0, area: 0 };
        counts[zona].count++;
        // Estimate area from bounding box (rough)
        if (f.geometry?.coordinates?.[0]) {
          const ring = f.geometry.coordinates[0] as number[][];
          let area = 0;
          for (let i = 0; i < ring.length; i++) {
            const j = (i + 1) % ring.length;
            area += ring[i][0] * ring[j][1];
            area -= ring[j][0] * ring[i][1];
          }
          const degArea = Math.abs(area / 2);
          // Convert to approx m² (1 deg lat ≈ 111,000 m, lon ≈ 84,000 m at lat -32)
          counts[zona].area += degArea * 111000 * 84000;
        }
      }
      const stats: ZonaStats[] = Object.entries(counts)
        .map(([zona, { count, area }]) => ({ zona, count, area }))
        .sort((a, b) => b.area - a.area);
      setZonaStats(stats);
    } catch { setZonaStats([]); }
    setLoading(false);
  }, [basePath]);

  const runSurpAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const [parcelaRes, edifRes] = await Promise.all([
        fetch(`${basePath}/data/Parcela.geojson`),
        fetch(`${basePath}/data/Edif.geojson`),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parcelData = await parcelaRes.json() as { features: Array<{ properties: any }> };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const edifData = await edifRes.json() as { features: Array<{ properties: any }> };

      const areas = parcelData.features.map(f => Number(f.properties?.AREA) || 0).filter(a => a > 0);
      const edifAreas = edifData.features.map(f => Number(f.properties?.AREA) || 0);

      setSurpStats({
        totalParcelas: parcelData.features.length,
        totalEdif: edifData.features.length,
        totalArea: edifAreas.reduce((a, b) => a + b, 0),
        avgAreaParcela: areas.length ? areas.reduce((a, b) => a + b, 0) / areas.length : 0,
      });
    } catch { setSurpStats(null); }
    setLoading(false);
  }, [basePath]);

  const handleActivate = (type: AnalysisType) => {
    if (type === active) { setActive(null); return; }
    setActive(type);
    setZonaStats(null);
    setSurpStats(null);
    if (type === "zonas") runZonaAnalysis();
    if (type === "superficie") runSurpAnalysis();
  };

  const fmtArea = (m2: number) => m2 < 10000 ? `${m2.toFixed(0)} m²` : `${(m2 / 10000).toFixed(1)} ha`;

  return (
    <div className="fixed inset-y-0 right-0 z-[1400] flex flex-col w-80 border-l border-border shadow-2xl"
      style={{ background: "hsl(220 16% 11%)", top: "52px" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <BarChart2 size={14} className="text-purple-400" />
          <div>
            <div className="text-sm font-bold text-foreground">Análisis Urbano</div>
            <div className="text-[10px] text-muted-foreground">Estadísticas y mapas temáticos</div>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

        {/* Densidad edilicia */}
        <AnalysisCard
          icon={<Map size={14} className="text-purple-400" />}
          title="Densidad Edilicia"
          desc="Mapa de calor de edificaciones por manzana"
          active={densidadActive}
          onClick={() => { onActivateDensidad(); }}
          badge={densidadActive ? "Activo" : undefined}
          badgeColor="text-purple-400"
        />

        {/* Obras temporal heatmap */}
        <AnalysisCard
          icon={<BarChart2 size={14} className="text-cyan-400" />}
          title="Calor de Obras por Periodo"
          desc="Mapa de calor por barrios segun anos seleccionados"
          active={obrasHeatmapActive}
          onClick={() => { onToggleObrasHeatmap(); if (!obrasHeatmapActive) setActive("obrasHeat"); }}
          badge={obrasHeatmapActive ? "Activo" : undefined}
          badgeColor="text-cyan-400"
        >
          {obrasHeatmapActive && (
            <div className="mt-2 space-y-2">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Periodo</div>
                <div className="grid grid-cols-2 gap-1">
                  <MiniButton label="Todos" active={obrasYearPreset === "all"} onClick={() => onSelectObrasPreset("all")} />
                  <MiniButton label="Ano actual" active={obrasYearPreset === "current"} onClick={() => onSelectObrasPreset("current")} />
                  <MiniButton label="Ultimos 3" active={obrasYearPreset === "last3"} onClick={() => onSelectObrasPreset("last3")} />
                  <MiniButton label="Ultimos 5" active={obrasYearPreset === "last5"} onClick={() => onSelectObrasPreset("last5")} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Anos</div>
                  <button type="button" onClick={onSelectAllObrasYears} className="text-[10px] text-primary hover:underline">Todos</button>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {obrasYearOptions.map((year) => (
                    <MiniButton
                      key={year}
                      label={String(year)}
                      active={selectedObrasYears.includes(year)}
                      onClick={() => onToggleObrasYear(year)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Metrica</div>
                <div className="grid grid-cols-2 gap-1">
                  <MiniButton label="Cantidad" active={obrasHeatmapMetric === "count"} onClick={() => onSetObrasHeatmapMetric("count")} />
                  <MiniButton label="m2" active={obrasHeatmapMetric === "m2"} onClick={() => onSetObrasHeatmapMetric("m2")} />
                </div>
              </div>

              {obrasHeatStats && (
                <div className="text-[10px] text-muted-foreground pt-1 space-y-1">
                  <div>Barrios con obras: <span className="text-foreground">{obrasHeatStats.barriosConObras}</span></div>
                  <div>Max. obras en un barrio: <span className="text-foreground">{obrasHeatStats.maxCount.toLocaleString("es-AR")}</span></div>
                  <div>Max. m2 declarados: <span className="text-foreground">{Math.round(obrasHeatStats.maxM2).toLocaleString("es-AR")} m²</span></div>
                </div>
              )}

              {obrasHeatBarrioData.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const period = selectedObrasYears.length > 0 ? selectedObrasYears.join("-") : "todos";
                    const header = "Barrio,Obras,m2_declarados";
                    const rows = obrasHeatBarrioData
                      .map(r => `"${r.barrio}",${r.count},${Math.round(r.m2)}`)
                      .join("\n");
                    const meta = `# Calor de obras por barrio - Periodo: ${period}\n`;
                    const blob = new Blob([meta + header + "\n" + rows], { type: "text/csv;charset=utf-8;" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `obras-barrios-${period}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="mt-2 flex items-center gap-1.5 w-full justify-center px-2 py-1.5 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-[10px] font-semibold hover:bg-cyan-500/20 transition-colors"
                >
                  <Download size={11} />
                  Exportar CSV ({obrasHeatBarrioData.length} barrios)
                </button>
              )}
            </div>
          )}
        </AnalysisCard>

        {/* Zonificación */}
        <AnalysisCard
          icon={<PieChart size={14} className="text-emerald-400" />}
          title="Distribución por Zonas"
          desc="Superficie y cantidad de polígonos por zona normativa"
          active={active === "zonas"}
          onClick={() => { if (canRunAnalysis) handleActivate("zonas"); }}
          locked={!canRunAnalysis}
        >
          {active === "zonas" && (
            loading ? <LoadingSpinner /> :
            zonaStats ? (
              <div className="mt-2 space-y-1.5">
                {zonaStats.slice(0, 8).map(z => (
                  <div key={z.zona} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-foreground/80 truncate">{z.zona || "Sin clasificar"}</div>
                      <div className="h-1 rounded-full bg-emerald-500/15 mt-0.5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-400/60"
                          style={{ width: `${Math.min(100, (z.area / (zonaStats[0]?.area || 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground flex-shrink-0">{fmtArea(z.area)}</div>
                  </div>
                ))}
                <p className="text-[9px] text-muted-foreground/50 pt-1">* Área aproximada. Datos: Ord. 130/22</p>
              </div>
            ) : <p className="text-[10px] text-muted-foreground mt-1">Sin datos de zonificación cargados.</p>
          )}
        </AnalysisCard>

        {/* Superficie construida */}
        <AnalysisCard
          icon={<TrendingUp size={14} className="text-amber-400" />}
          title="Superficie Construida"
          desc="Área edificada total y promedio por parcela"
          active={active === "superficie"}
          onClick={() => { if (canRunAnalysis) handleActivate("superficie"); }}
          locked={!canRunAnalysis}
        >
          {active === "superficie" && (
            loading ? <LoadingSpinner /> :
            surpStats ? (
              <div className="mt-2 space-y-1.5">
                <StatRow label="Total parcelas" value={surpStats.totalParcelas.toLocaleString("es-AR")} />
                <StatRow label="Edificios PB" value={surpStats.totalEdif.toLocaleString("es-AR")} />
                <StatRow label="Sup. total edificada" value={fmtArea(surpStats.totalArea)} />
                <StatRow label="Sup. prom. parcela" value={fmtArea(surpStats.avgAreaParcela)} />
                <p className="text-[9px] text-muted-foreground/50 pt-1">* Solo edificios de PB incluidos.</p>
              </div>
            ) : <p className="text-[10px] text-muted-foreground mt-1">No se pudieron cargar las capas.</p>
          )}
        </AnalysisCard>

        {/* Future: Pendiente topográfica */}
        <AnalysisCard
          icon={<BarChart2 size={14} className="text-sky-400" />}
          title="Análisis Topográfico"
          desc="Pendientes y cuencas hidrográficas a partir de curvas de nivel"
          active={false}
          onClick={() => {}}
          comingSoon
        />

        {/* Future: Excel/CSV */}
        <AnalysisCard
          icon={<FileSpreadsheet size={14} className="text-teal-400" />}
          title="Análisis desde Planilla"
          desc="Cargá un Excel o CSV para generar mapas temáticos automáticos"
          active={false}
          onClick={() => {}}
          comingSoon
        />

        <div className="text-[9px] text-muted-foreground/50 pt-2 text-center">
          Los análisis "próximamente" se habilitarán a medida que se carguen los datos GIS.
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AnalysisCard({
  icon, title, desc, active, onClick, badge, badgeColor, children, locked, comingSoon,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  active: boolean;
  onClick: () => void;
  badge?: string;
  badgeColor?: string;
  children?: React.ReactNode;
  locked?: boolean;
  comingSoon?: boolean;
}) {
  return (
    <div className={`rounded-xl border transition-all overflow-hidden ${
      active ? "border-primary/30 bg-primary/5" : "border-border bg-card/20"
    } ${locked || comingSoon ? "opacity-50" : ""}`}>
      <button
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
        onClick={onClick}
        disabled={locked || comingSoon}
      >
        <div className="flex-shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">{title}</span>
            {badge && <span className={`text-[9px] font-bold ${badgeColor}`}>{badge}</span>}
            {locked && <span className="text-[9px] text-amber-400/70">🔒 Requiere login</span>}
            {comingSoon && <span className="text-[9px] text-muted-foreground/50">Próximamente</span>}
          </div>
          <div className="text-[10px] text-muted-foreground truncate">{desc}</div>
        </div>
        <ChevronRight size={13} className={`flex-shrink-0 text-muted-foreground transition-transform ${active ? "rotate-90" : ""}`} />
      </button>
      {children && (
        <div className="px-3 pb-3 border-t border-border/30">{children}</div>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-[10px] font-semibold text-foreground">{value}</span>
    </div>
  );
}

function MiniButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 rounded text-[10px] border ${active ? "bg-primary/20 border-primary/40 text-primary" : "border-border text-muted-foreground"}`}
    >
      {label}
    </button>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-3 gap-2">
      <Loader2 size={14} className="animate-spin text-primary" />
      <span className="text-[10px] text-muted-foreground">Calculando...</span>
    </div>
  );
}
