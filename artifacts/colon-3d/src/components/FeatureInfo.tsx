import { X, MapPin, Info } from "lucide-react";

interface FeatureInfoProps {
  feature: Record<string, unknown> | null;
  layerLabel: string;
  onClose: () => void;
}

const FIELD_LABELS: Record<string, string> = {
  ID: "ID",
  NCM: "Nomenclatura Manzana",
  NCP: "Nomenclatura Parcela",
  NCC: "Nomenclatura Calle",
  SEC: "Sección",
  SECCION: "Nº Sección",
  GRU: "Grupo",
  GRUPO: "Nº Grupo",
  MANZ: "Nº Manzana",
  NPARC: "Nº Parcela",
  CALLE: "Nombre Calle",
  CODIGO: "Código",
  NOMBRE: "Nombre",
  TIPO: "Tipo",
  NIVEL: "Nivel",
  ORIGEN: "Origen",
  AREA: "Área (m²)",
  LARGO: "Largo (m)",
  FRENTE: "Frente (m)",
  PERIMETRO: "Perímetro (m)",
  OBJETO: "Objeto",
  NODO: "Nodo",
  MAPKEY: "Clave",
  ZONA: "Zona",
  ARBOL_ID: "ID Árbol",
  HIDRO_ID: "ID Hidrografía",
  BOCAS_ID: "ID Boca",
  POSTES_ID: "ID Poste",
  VIAS_ID: "ID Vía",
  ESPVERD_ID: "ID Esp. Verde",
};

const HIDDEN_PROPS = new Set([
  "fid", "handle", "block", "etype", "space", "olinetype", "linetype",
  "color", "ocolor", "color24", "transparency", "lweight", "linewidth",
  "ltscale", "visible", "width", "thickness", "ext", "layer", "nodo",
  "mapkey", "ncc", "nmanz"
]);

function formatValue(key: string, val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "number") {
    if (key === "AREA" || key === "LARGO" || key === "FRENTE" || key === "PERIMETRO") {
      return `${val.toLocaleString("es-AR", { maximumFractionDigits: 2 })} m${key === "AREA" ? "²" : ""}`;
    }
    if (Number.isInteger(val)) return val.toLocaleString("es-AR");
    return val.toFixed(2);
  }
  return String(val);
}

function getLabel(key: string): string {
  return FIELD_LABELS[key.toUpperCase()] || key;
}

export default function FeatureInfo({ feature, layerLabel, onClose }: FeatureInfoProps) {
  if (!feature) return null;

  const entries = Object.entries(feature).filter(
    ([key, val]) =>
      !HIDDEN_PROPS.has(key.toLowerCase()) &&
      !key.startsWith("_") &&
      val !== null &&
      val !== undefined &&
      val !== ""
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
                <span className="text-xs text-muted-foreground w-32 flex-shrink-0 pt-0.5">
                  {getLabel(key)}
                </span>
                <span className="text-xs text-foreground break-words font-medium">{formatValue(key, val)}</span>
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
