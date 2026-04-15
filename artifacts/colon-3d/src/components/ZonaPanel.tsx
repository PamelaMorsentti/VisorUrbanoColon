import { X, BookOpen, AlertTriangle } from "lucide-react";
import { ZONA_NORMAS } from "@/lib/zonaData";
import { ZONA_COLORS } from "@/lib/layers";

interface ZonaPanelProps {
  zonaName: string | null;
  onClose: () => void;
}

export default function ZonaPanel({ zonaName, onClose }: ZonaPanelProps) {
  if (!zonaName) return null;

  const normas = ZONA_NORMAS[zonaName] || ZONA_NORMAS[""];
  const color = ZONA_COLORS[zonaName] || "#888888";

  const rows: [string, string][] = [
    ["FOS", normas.fos],
    ["FOT", normas.fot],
    ["Altura máx.", normas.alturaMax],
    ["Retiro frente", normas.retiroFrente],
    ["Retiro lateral", normas.retiroLateral],
    ["Retiro posterior", normas.retiroPosterior],
    ["Usos permitidos", normas.usos],
  ];

  return (
    <div
      className="absolute bottom-8 right-3 w-80 rounded-xl overflow-hidden shadow-xl border border-border"
      style={{ background: "hsl(220 16% 12%)", zIndex: 1001 }}
      data-testid="zona-panel"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color, opacity: 0.9 }} />
          <div className="min-w-0">
            <div className="text-xs font-bold text-foreground truncate">{normas.zona || zonaName}</div>
            <div className="text-[10px] text-muted-foreground leading-tight">Ord. 130/22 — Colón, E.R.</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors ml-2 flex-shrink-0"
          data-testid="button-close-zona-panel"
        >
          <X size={15} />
        </button>
      </div>

      <div className="max-h-80 overflow-y-auto">
        <div className="flex items-center gap-1.5 px-4 py-2 bg-primary/5 border-b border-border/50">
          <BookOpen size={12} className="text-primary flex-shrink-0" />
          <span className="text-[10px] text-primary font-medium">Parámetros normativos</span>
        </div>

        <div className="divide-y divide-border/50">
          {rows.map(([label, value]) => (
            <div key={label} className="flex px-4 py-2 gap-2">
              <span className="text-xs text-muted-foreground w-28 flex-shrink-0 pt-0.5">{label}</span>
              <span className="text-xs text-foreground break-words font-medium leading-relaxed">{value}</span>
            </div>
          ))}
        </div>

        {normas.nota && (
          <div className="flex items-start gap-2 px-4 py-3 bg-amber-500/5 border-t border-amber-500/20">
            <AlertTriangle size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-400/90 leading-relaxed">{normas.nota}</p>
          </div>
        )}

        <div className="px-4 py-2.5 border-t border-border/30">
          <p className="text-[9px] text-muted-foreground/50 leading-relaxed">
            Valores indicativos según Ordenanza 130/22. Verificar con la Dirección de Planeamiento Municipal.
          </p>
        </div>
      </div>
    </div>
  );
}
