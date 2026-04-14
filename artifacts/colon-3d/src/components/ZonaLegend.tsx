import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ZONA_COLORS } from "@/lib/layers";

export default function ZonaLegend() {
  const [open, setOpen] = useState(false);

  const entries = Object.entries(ZONA_COLORS).filter(([k]) => k !== "");

  return (
    <div
      className="absolute bottom-8 left-3 rounded-xl overflow-hidden shadow-xl border border-border"
      style={{ background: "hsl(220 16% 12%)", minWidth: "190px", zIndex: 1001 }}
      data-testid="zona-legend"
    >
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-accent/50 transition-colors"
        onClick={() => setOpen(o => !o)}
        data-testid="button-toggle-legend"
      >
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Zonificación</span>
        {open ? <ChevronUp size={13} className="text-muted-foreground" /> : <ChevronDown size={13} className="text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border pb-2 max-h-64 overflow-y-auto">
          {entries.map(([zona, color]) => (
            <div key={zona} className="flex items-center gap-2.5 px-4 py-1.5">
              <div
                className="w-3 h-3 rounded-sm flex-shrink-0 ring-1 ring-white/10"
                style={{ background: color }}
              />
              <span className="text-xs text-muted-foreground leading-tight">{zona}</span>
            </div>
          ))}
          <div className="px-4 pt-2 pb-1">
            <span className="text-[10px] text-muted-foreground/60">Ord. 130-2022</span>
          </div>
        </div>
      )}
    </div>
  );
}
