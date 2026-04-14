import { X, MapPin, Info } from "lucide-react";

interface FeatureInfoProps {
  feature: Record<string, unknown> | null;
  layerLabel: string;
  onClose: () => void;
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "number") {
    if (Number.isInteger(val)) return val.toLocaleString("es-AR");
    return val.toFixed(4);
  }
  return String(val);
}

const HIDDEN_PROPS = new Set([
  "fid", "handle", "block", "etype", "space", "olinetype", "linetype",
  "color", "ocolor", "color24", "transparency", "lweight", "linewidth",
  "ltscale", "visible", "width", "thickness", "ext", "layer"
]);

export default function FeatureInfo({ feature, layerLabel, onClose }: FeatureInfoProps) {
  if (!feature) return null;

  const entries = Object.entries(feature).filter(
    ([key]) => !HIDDEN_PROPS.has(key.toLowerCase()) && !key.startsWith("_")
  );

  const hasProps = entries.length > 0;

  return (
    <div
      className="absolute bottom-8 right-3 w-72 rounded-xl overflow-hidden shadow-xl border border-border"
      style={{ background: "hsl(220 16% 12%)", zIndex: 1001 }}
      data-testid="feature-info-panel"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-primary flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground truncate">{layerLabel}</span>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors ml-2 flex-shrink-0"
          data-testid="button-close-feature-info"
        >
          <X size={15} />
        </button>
      </div>

      <div className="max-h-72 overflow-y-auto">
        {hasProps ? (
          <div className="divide-y divide-border/50">
            {entries.map(([key, val]) => (
              <div key={key} className="flex px-4 py-2 gap-2">
                <span className="text-xs text-muted-foreground w-28 flex-shrink-0 pt-0.5 font-medium uppercase tracking-wide">
                  {key}
                </span>
                <span className="text-xs text-foreground break-words">{formatValue(val)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Info size={14} />
            <span className="text-xs">Sin datos disponibles</span>
          </div>
        )}
      </div>
    </div>
  );
}
