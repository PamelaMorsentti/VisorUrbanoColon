import { X, BarChart3, Building2 } from "lucide-react";

interface DensidadPanelProps {
  active: boolean;
  onToggle: () => void;
  onClose: () => void;
  stats: { totalEdif: number; manzanasConEdif: number; maxCount: number; maxArea: number } | null;
}

const GRAD_STOPS = [
  { pct: 0, color: "#0f172a", label: "0" },
  { pct: 0.25, color: "#1e3a5f", label: "25%" },
  { pct: 0.5, color: "#1d4ed8", label: "50%" },
  { pct: 0.75, color: "#f59e0b", label: "75%" },
  { pct: 1, color: "#ef4444", label: "Máx" },
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

export function getDensityColor(value: number, max: number): string {
  if (max === 0) return "#0f172a";
  const t = Math.min(value / max, 1);
  for (let i = 1; i < GRAD_STOPS.length; i++) {
    const prev = GRAD_STOPS[i - 1];
    const curr = GRAD_STOPS[i];
    if (t <= curr.pct) {
      const segT = (t - prev.pct) / (curr.pct - prev.pct);
      const [r1, g1, b1] = hexToRgb(prev.color);
      const [r2, g2, b2] = hexToRgb(curr.color);
      const r = Math.round(lerp(r1, r2, segT));
      const g = Math.round(lerp(g1, g2, segT));
      const b = Math.round(lerp(b1, b2, segT));
      return `rgb(${r},${g},${b})`;
    }
  }
  return GRAD_STOPS[GRAD_STOPS.length - 1].color;
}

export default function DensidadPanel({ active, onToggle, onClose, stats }: DensidadPanelProps) {
  return (
    <div
      className="absolute bottom-32 left-3 w-60 rounded-xl overflow-hidden shadow-xl border border-border"
      style={{ background: "hsl(220 16% 12%)", zIndex: 1001 }}
      data-testid="densidad-panel"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Densidad edilicia</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X size={15} />
        </button>
      </div>

      <div className="p-3 space-y-3">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Cantidad de edificaciones por manzana según datos catastrales.
        </p>

        <button
          onClick={onToggle}
          className={`w-full flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg transition-colors ${
            active
              ? "bg-primary/20 border border-primary/40 text-primary"
              : "bg-card border border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <Building2 size={12} />
          {active ? "Desactivar mapa de calor" : "Activar mapa de calor"}
        </button>

        {active && (
          <>
            <div className="space-y-1.5">
              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                Edif. por manzana
              </div>
              <div
                className="h-3 rounded-full"
                style={{
                  background: `linear-gradient(to right, ${GRAD_STOPS.map(s => s.color).join(", ")})`
                }}
              />
              <div className="flex justify-between text-[9px] text-muted-foreground/70">
                <span>0</span>
                <span>Máx{stats ? ` (${stats.maxCount})` : ""}</span>
              </div>
            </div>

            {stats && (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-card rounded-lg px-3 py-2">
                  <div className="text-sm font-bold text-foreground">{stats.totalEdif.toLocaleString("es-AR")}</div>
                  <div className="text-[9px] text-muted-foreground">Edificaciones</div>
                </div>
                <div className="bg-card rounded-lg px-3 py-2">
                  <div className="text-sm font-bold text-foreground">{stats.manzanasConEdif}</div>
                  <div className="text-[9px] text-muted-foreground">Manzanas</div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
