import { ZONA_COLORS } from "@/lib/layers";

interface ZonaLegendProps {
  open: boolean;
  onClose: () => void;
}

export default function ZonaLegend({ open, onClose }: ZonaLegendProps) {
  if (!open) return null;

  const entries = Object.entries(ZONA_COLORS).filter(([k]) => k !== "");

  return (
    <div
      className="w-[88vw] sm:w-72 rounded-xl overflow-hidden shadow-xl border border-border"
      style={{ background: "hsl(220 16% 12%)" }}
      data-testid="zona-legend"
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-xs font-semibold text-foreground">Leyenda de zonificación</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div className="py-1.5 max-h-72 overflow-y-auto">
        {entries.map(([zona, color]) => (
          <div key={zona} className="flex items-center gap-2.5 px-3 py-1.5">
            <div className="w-3 h-3 rounded-sm flex-shrink-0 ring-1 ring-white/10" style={{ background: color }} />
            <span className="text-[10px] text-muted-foreground leading-tight">{zona}</span>
          </div>
        ))}
        <div className="px-3 pt-1.5 pb-1">
          <span className="text-[9px] text-muted-foreground/50">Ord. 130/22 — Colón, E.R.</span>
        </div>
      </div>
    </div>
  );
}
