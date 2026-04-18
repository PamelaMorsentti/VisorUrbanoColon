import { useState, useCallback } from "react";
import { X, BarChart2, PieChart, TrendingUp, Map, FileSpreadsheet, ChevronRight, Loader2 } from "lucide-react";

interface AnalysisPanelProps {
  onClose: () => void;
  onActivateDensidad: () => void;
  densidadActive: boolean;
  canRunAnalysis: boolean;
  basePath: string;
}

type AnalysisType = "densidad" | "zonas" | "superficie" | "pendiente" | null;

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

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-3 gap-2">
      <Loader2 size={14} className="animate-spin text-primary" />
      <span className="text-[10px] text-muted-foreground">Calculando...</span>
    </div>
  );
}
