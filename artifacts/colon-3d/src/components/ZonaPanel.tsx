import { useState } from "react";
import { X, BookOpen, AlertTriangle } from "lucide-react";
import { ZONA_NORMAS, ZonaNormas } from "@/lib/zonaData";
import { ZONA_COLORS } from "@/lib/layers";

interface ZonaPanelProps {
  zonaName: string | null;
  onClose: () => void;
}

function NormasTable({ n }: { n: ZonaNormas }) {
  const rows: [string, string][] = [
    ["Nomenclatura", n.nomenclatura],
    ["FOS", n.fos],
    ["FOT", n.fot],
    ["Altura máxima", n.alturaMax],
    ["Retiro línea municipal", n.retiroLM],
    ["Retiro medianera", n.retiroMedianera],
    ["Suelo absorbente", n.sueloAbsorbente],
  ];

  return (
    <div className="divide-y divide-border/40">
      {rows.map(([label, value]) => (
        <div key={label} className="flex px-4 py-2 gap-2">
          <span className="text-[10px] text-muted-foreground w-32 flex-shrink-0 pt-0.5 leading-relaxed">{label}</span>
          <span className="text-[10px] text-foreground break-words font-semibold leading-relaxed">{value}</span>
        </div>
      ))}
      {n.observaciones && (
        <div className="flex items-start gap-2 px-4 py-2.5 bg-amber-500/5">
          <AlertTriangle size={11} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-[9px] text-amber-400/90 leading-relaxed">{n.observaciones}</p>
        </div>
      )}
    </div>
  );
}

export default function ZonaPanel({ zonaName, onClose }: ZonaPanelProps) {
  const [tabIdx, setTabIdx] = useState(0);
  if (!zonaName) return null;

  const normasList = ZONA_NORMAS[zonaName] || [];
  const color = ZONA_COLORS[zonaName] || "#888888";
  const hasMultiple = normasList.length > 1;
  const current = normasList[Math.min(tabIdx, normasList.length - 1)];

  if (normasList.length === 0) return (
    <div
      className="absolute bottom-8 right-3 w-72 rounded-xl shadow-xl border border-border overflow-hidden"
      style={{ background: "hsl(220 16% 12%)", zIndex: 1001 }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-foreground">{zonaName}</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={15} /></button>
      </div>
      <div className="px-4 py-4 text-xs text-muted-foreground">Sin parámetros normativos disponibles. Ver Ord. 130/22.</div>
    </div>
  );

  return (
    <div
      className="absolute bottom-8 right-3 w-80 rounded-xl overflow-hidden shadow-xl border border-border"
      style={{ background: "hsl(220 16% 12%)", zIndex: 1001 }}
      data-testid="zona-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color, opacity: 0.9 }} />
          <div className="min-w-0">
            <div className="text-xs font-bold text-foreground truncate">{current.nombre}</div>
            <div className="text-[10px] text-muted-foreground leading-tight">Ord. 130/22 — Colón, E.R.</div>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-2 flex-shrink-0">
          <X size={15} />
        </button>
      </div>

      {/* Sub-category tabs (for Centro A/B/C and Urbana A/B/C) */}
      {hasMultiple && (
        <div className="flex border-b border-border bg-card/30">
          {normasList.map((n, i) => (
            <button
              key={n.nomenclatura}
              onClick={() => setTabIdx(i)}
              className={`flex-1 py-2 text-[10px] font-semibold transition-colors ${
                tabIdx === i
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Cat. {n.categoria} — {n.nomenclatura}
            </button>
          ))}
        </div>
      )}

      {/* Label */}
      <div className="flex items-center gap-1.5 px-4 py-2 bg-primary/5 border-b border-border/50">
        <BookOpen size={11} className="text-primary flex-shrink-0" />
        <span className="text-[10px] text-primary font-medium">Parámetros normativos urbanísticos</span>
      </div>

      {/* Data */}
      <div className="max-h-72 overflow-y-auto">
        {current && <NormasTable n={current} />}

        <div className="px-4 py-2.5 border-t border-border/30">
          <p className="text-[9px] text-muted-foreground/50 leading-relaxed">
            Fuente: Ordenanza 130/22. Verificar vigencia con la Dirección de Planeamiento.
          </p>
        </div>
      </div>
    </div>
  );
}
