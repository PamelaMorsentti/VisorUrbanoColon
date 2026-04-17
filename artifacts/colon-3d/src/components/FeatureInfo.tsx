import { X, MapPin, Info, Printer } from "lucide-react";

interface FeatureInfoProps {
  feature: Record<string, unknown> | null;
  layerLabel: string;
  onClose: () => void;
  onPrint?: () => void;
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
  Z: "Altitud (m)",
  COTA: "Cota (m)",
  CURVA_ID: "ID Curva",
};

const HIDDEN_PROPS = new Set([
  "fid", "handle", "block", "etype", "space", "olinetype", "linetype",
  "color", "ocolor", "color24", "transparency", "lweight", "linewidth",
  "ltscale", "visible", "width", "thickness", "ext", "layer", "nodo",
  "mapkey", "ncc", "nmanz"
]);

const PRINTABLE_LAYERS = new Set(["parcela catastral", "parcelas", "edificios (pb)", "edif. planta alta"]);

function formatValue(key: string, val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "number") {
    if (key === "AREA") return `${Math.round(val).toLocaleString("es-AR")} m²`;
    if (key === "LARGO" || key === "FRENTE" || key === "PERIMETRO")
      return `${val.toLocaleString("es-AR", { maximumFractionDigits: 2 })} m`;
    if (key === "COTA" || key === "Z") return `${val.toFixed(3)} m`;
    if (Number.isInteger(val)) return val.toLocaleString("es-AR");
    return val.toFixed(2);
  }
  return String(val);
}

function getLabel(key: string): string {
  return FIELD_LABELS[key.toUpperCase()] || key;
}

export default function FeatureInfo({ feature, layerLabel, onClose, onPrint }: FeatureInfoProps) {
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
  const canPrint = PRINTABLE_LAYERS.has(layerLabel.toLowerCase()) && !!onPrint;

  return (
    <div
      className="absolute bottom-8 right-3 w-72 rounded-xl overflow-hidden shadow-xl border border-border"
      style={{ background: "hsl(220 16% 12%)", zIndex: 1001 }}
      data-testid="feature-info-panel"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin size={14} className="text-primary flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground truncate">{layerLabel}</span>
        </div>
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          {canPrint && (
            <button
              onClick={onPrint}
              className="p-1 rounded text-muted-foreground hover:text-primary transition-colors"
              title="Imprimir informe de parcela"
            >
              <Printer size={14} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-close-feature-info"
          >
            <X size={14} />
          </button>
        </div>
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

      {canPrint && (
        <div className="px-4 py-2.5 border-t border-border/50">
          <button
            onClick={onPrint}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors font-medium"
          >
            <Printer size={12} />
            Generar informe de parcela
          </button>
        </div>
      )}
    </div>
  );
}
