import { X, Globe, AlertCircle, Loader2 } from "lucide-react";

export type ExternalFeatureInfoState =
  | { status: "loading" }
  | { status: "result"; layerLabel: string; props: Record<string, unknown> }
  | { status: "empty"; layerLabel: string }
  | { status: "error"; message: string };

interface ExternalFeatureInfoProps {
  state: ExternalFeatureInfoState | null;
  onClose: () => void;
}

const HIDDEN_KEYS = new Set([
  "fid", "geometry", "gid", "objectid", "shape", "shape_area", "shape_len",
  "st_area(shape)", "st_length(shape)",
]);

function formatPropValue(val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "number") {
    if (Number.isInteger(val)) return val.toLocaleString("es-AR");
    return val.toLocaleString("es-AR", { maximumFractionDigits: 4 });
  }
  return String(val);
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, c => c.toUpperCase());
}

export default function ExternalFeatureInfo({ state, onClose }: ExternalFeatureInfoProps) {
  if (!state) return null;

  return (
    <div
      className="w-[88vw] sm:w-72 rounded-xl overflow-hidden shadow-xl border border-border"
      style={{ background: "hsl(220 16% 12%)" }}
      data-testid="external-feature-info"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Globe size={14} className="text-sky-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground truncate">
            {state.status === "loading"
              ? "Consultando capa…"
              : state.status === "error"
              ? "Error de consulta"
              : state.layerLabel}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 ml-2 flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-close-external-feature-info"
        >
          <X size={14} />
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto">
        {state.status === "loading" && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs">Obteniendo información…</span>
          </div>
        )}

        {state.status === "error" && (
          <div className="flex items-start gap-2 px-4 py-4 text-muted-foreground">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-amber-400" />
            <span className="text-xs">{state.message}</span>
          </div>
        )}

        {state.status === "empty" && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <span className="text-xs">Sin datos en este punto.</span>
          </div>
        )}

        {state.status === "result" && (
          <div className="divide-y divide-border/50">
            {Object.entries(state.props)
              .filter(([k]) => !HIDDEN_KEYS.has(k.toLowerCase()))
              .map(([key, val]) => (
                <div key={key} className="flex px-4 py-2 gap-2">
                  <span className="text-xs text-muted-foreground w-32 flex-shrink-0 pt-0.5">
                    {humanizeKey(key)}
                  </span>
                  <span className="text-xs text-foreground break-words font-medium">
                    {formatPropValue(val)}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="px-4 py-1.5 border-t border-border/30">
        <span className="text-[9px] text-muted-foreground/40">Capa externa WMS · clic en el mapa</span>
      </div>
    </div>
  );
}
