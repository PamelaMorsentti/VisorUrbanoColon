import { useEffect } from "react";
import { X, Printer, Building, MapPin, Layers, Mountain, Info } from "lucide-react";
import { ZonaNormas } from "@/lib/zonaData";

export interface ReportData {
  parcelProps: Record<string, unknown>;
  layerLabel: string;
  zonaName: string | null;
  normas: ZonaNormas | null;
  cotas: Array<{ Z: number; COTA: number; NOMBRE: string }>;
  lat: number | null;
  lng: number | null;
}

interface ParcelReportProps {
  data: ReportData;
  onClose: () => void;
}

const FIELD_LABELS: Record<string, string> = {
  NCP: "Nomenclatura Catastral (NCP)",
  NCM: "Nomenclatura Manzana",
  SEC: "Sección",
  GRU: "Grupo",
  MANZ: "Manzana",
  NPARC: "Nº Parcela",
  OBJETO: "Objeto / Uso",
  NOMBRE: "Nombre",
  AREA: "Superficie parcela",
  FRENTE: "Frente (m)",
  LARGO: "Fondo (m)",
  PERIMETRO: "Perímetro (m)",
};

const HIDDEN = new Set([
  "fid","handle","block","etype","space","olinetype","linetype","color","ocolor",
  "color24","transparency","lweight","linewidth","ltscale","visible","width",
  "thickness","ext","layer","nodo","mapkey","ncc","nmanz","curva_id","codigo"
]);

function fmt(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") {
    if (key === "AREA") return `${Math.round(v).toLocaleString("es-AR")} m²`;
    if (key === "FRENTE" || key === "LARGO" || key === "PERIMETRO")
      return `${Number(v).toFixed(2)} m`;
    return Number.isInteger(v) ? v.toLocaleString("es-AR") : v.toFixed(3);
  }
  return String(v);
}

export default function ParcelReport({ data, onClose }: ParcelReportProps) {
  const { parcelProps, layerLabel, zonaName, normas, cotas, lat, lng } = data;
  const today = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const parcelEntries = Object.entries(parcelProps).filter(
    ([k, v]) => !HIDDEN.has(k.toLowerCase()) && !k.startsWith("_") && v !== null && v !== undefined && v !== ""
  );

  const handlePrint = () => {
    const title = parcelProps.NCP
      ? `Informe Parcela ${parcelProps.NCP}`
      : "Informe Catastral";

    const zonaSection = zonaName && normas ? `
      <section class="section">
        <h2 class="section-title">Zonificación Urbana</h2>
        <table>
          <tr><td class="label">Zona</td><td class="value">${zonaName}</td></tr>
          <tr><td class="label">Nomenclatura</td><td class="value">${normas.nomenclatura}</td></tr>
          <tr><td class="label">FOS (Ocup. Suelo)</td><td class="value">${normas.fos}</td></tr>
          <tr><td class="label">FOT (Ocup. Total)</td><td class="value">${normas.fot}</td></tr>
          <tr><td class="label">Altura máxima</td><td class="value">${normas.alturaMax}</td></tr>
          <tr><td class="label">Retiro L.M.</td><td class="value">${normas.retiroLM}</td></tr>
          <tr><td class="label">Retiro medianera</td><td class="value">${normas.retiroMedianera}</td></tr>
          <tr><td class="label">Suelo absorbente</td><td class="value">${normas.sueloAbsorbente}</td></tr>
          ${normas.observaciones ? `<tr><td class="label">Observaciones</td><td class="value obs">${normas.observaciones}</td></tr>` : ""}
        </table>
        <p class="fuente">Fuente: Ordenanza 130/22 — Colón, Entre Ríos</p>
      </section>
    ` : zonaName ? `
      <section class="section">
        <h2 class="section-title">Zonificación Urbana</h2>
        <table><tr><td class="label">Zona</td><td class="value">${zonaName}</td></tr></table>
        <p class="obs">Ver Ordenanza 130/22 para parámetros detallados.</p>
      </section>
    ` : `
      <section class="section">
        <h2 class="section-title">Zonificación Urbana</h2>
        <p class="obs">No se determinó zona. Consulte la capa de Zonificación en el Visor Urbano.</p>
      </section>
    `;

    const cotasSection = cotas.length > 0 ? `
      <section class="section">
        <h2 class="section-title">Curvas de Nivel (c_nivel)</h2>
        <table>
          <tr><th>Cota (m)</th><th>Z (m)</th><th>Tipo</th></tr>
          ${cotas.map(c => `<tr><td>${c.COTA?.toFixed(3) ?? "—"}</td><td>${c.Z ?? "—"}</td><td>${c.NOMBRE ?? "—"}</td></tr>`).join("")}
        </table>
        <p class="fuente">Curvas de nivel interpoladas cercanas a la parcela.</p>
      </section>
    ` : `
      <section class="section">
        <h2 class="section-title">Curvas de Nivel</h2>
        <p class="obs">No se encontraron curvas de nivel próximas a esta parcela en el archivo c_nivel.</p>
      </section>
    `;

    const parcelRows = parcelEntries.map(([k, v]) => {
      const label = FIELD_LABELS[k.toUpperCase()] || k;
      return `<tr><td class="label">${label}</td><td class="value">${fmt(k.toUpperCase(), v)}</td></tr>`;
    }).join("");

    const coordSection = lat && lng ? `<tr><td class="label">Coordenadas (WGS84)</td><td class="value">${lat.toFixed(6)}, ${lng.toFixed(6)}</td></tr>` : "";

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Arial', sans-serif; }
  body { background: #fff; color: #1a1a1a; font-size: 11px; padding: 24px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a3a6b; padding-bottom: 12px; margin-bottom: 18px; }
  .header-title h1 { font-size: 16px; font-weight: bold; color: #1a3a6b; }
  .header-title p { font-size: 10px; color: #555; margin-top: 3px; }
  .header-meta { text-align: right; font-size: 10px; color: #555; }
  .header-meta b { color: #1a3a6b; }
  .section { margin-bottom: 16px; border: 1px solid #dde; border-radius: 4px; overflow: hidden; }
  .section-title { background: #1a3a6b; color: #fff; padding: 6px 12px; font-size: 11px; font-weight: bold; letter-spacing: 0.3px; }
  table { width: 100%; border-collapse: collapse; }
  tr:nth-child(even) { background: #f4f6fb; }
  td, th { padding: 5px 10px; text-align: left; border-bottom: 1px solid #eee; }
  th { background: #e8ecf4; font-weight: bold; color: #1a3a6b; font-size: 10px; }
  td.label { color: #555; width: 200px; }
  td.value { font-weight: 500; }
  td.obs { font-style: italic; color: #555; font-size: 10px; }
  .fuente { font-size: 9px; color: #888; padding: 4px 10px; }
  .obs { padding: 8px 10px; color: #666; font-style: italic; }
  .footer { margin-top: 20px; border-top: 1px solid #ccc; padding-top: 10px; font-size: 9px; color: #888; display: flex; justify-content: space-between; }
  @media print { body { padding: 12px; } }
</style>
</head>
<body>
<div class="header">
  <div class="header-title">
    <h1>Informe de Parcela Catastral</h1>
    <p>Visor Urbano Colón 3D — Municipalidad de Colón, Entre Ríos</p>
  </div>
  <div class="header-meta">
    <div>Fecha: <b>${today}</b></div>
    <div style="margin-top:4px">Capa: ${layerLabel}</div>
  </div>
</div>

<section class="section">
  <h2 class="section-title">Datos Catastrales</h2>
  <table>${parcelRows}${coordSection}</table>
</section>

${zonaSection}
${cotasSection}

<div class="footer">
  <span>Visor Urbano Colón 3D · GIS Municipal · Municipalidad de Colón, E.R. · Ord. 130/22</span>
  <span>Generado: ${today}</span>
</div>
</body>
</html>`;

    const win = window.open("", "_blank", "width=800,height=900");
    if (!win) { alert("No se pudo abrir la ventana de impresión. Habilitá ventanas emergentes."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-border"
        style={{ background: "hsl(220 16% 12%)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Printer size={16} className="text-primary" />
            <div>
              <div className="text-sm font-bold text-foreground">Informe de Parcela</div>
              <div className="text-[10px] text-muted-foreground">Visor Urbano Colón 3D</div>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>

        {/* Content scroll area */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Catastral data */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Building size={12} className="text-primary" />
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Datos Catastrales</span>
            </div>
            <div className="rounded-lg overflow-hidden border border-border/50">
              {parcelEntries.map(([k, v], i) => (
                <div key={k} className={`flex px-3 py-1.5 gap-3 ${i % 2 === 0 ? "bg-card/30" : ""}`}>
                  <span className="text-[10px] text-muted-foreground w-40 flex-shrink-0">
                    {FIELD_LABELS[k.toUpperCase()] || k}
                  </span>
                  <span className="text-[10px] text-foreground font-medium break-words">{fmt(k.toUpperCase(), v)}</span>
                </div>
              ))}
              {lat && lng && (
                <div className="flex px-3 py-1.5 gap-3">
                  <span className="text-[10px] text-muted-foreground w-40 flex-shrink-0">Coordenadas</span>
                  <span className="text-[10px] text-foreground font-medium">{lat.toFixed(6)}, {lng.toFixed(6)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Zoning */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Layers size={12} className="text-emerald-400" />
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Zonificación (Ord. 130/22)</span>
            </div>
            {normas ? (
              <div className="rounded-lg overflow-hidden border border-border/50">
                {[
                  ["Zona", zonaName || "—"],
                  ["Nomenclatura", normas.nomenclatura],
                  ["FOS (ocup. suelo)", normas.fos],
                  ["FOT (ocup. total)", normas.fot],
                  ["Altura máxima", normas.alturaMax],
                  ["Retiro línea municipal", normas.retiroLM],
                  ["Retiro medianera", normas.retiroMedianera],
                  ["Suelo absorbente", normas.sueloAbsorbente],
                ].map(([label, value], i) => (
                  <div key={label} className={`flex px-3 py-1.5 gap-3 ${i % 2 === 0 ? "bg-card/30" : ""}`}>
                    <span className="text-[10px] text-muted-foreground w-40 flex-shrink-0">{label}</span>
                    <span className="text-[10px] text-foreground font-medium break-words">{value}</span>
                  </div>
                ))}
                {normas.observaciones && (
                  <div className="px-3 py-2 bg-amber-500/5 border-t border-border/30">
                    <p className="text-[9px] text-amber-400/80 italic">{normas.observaciones}</p>
                  </div>
                )}
              </div>
            ) : zonaName ? (
              <p className="text-[10px] text-muted-foreground px-1">Zona: {zonaName}. Sin datos normativos disponibles.</p>
            ) : (
              <p className="text-[10px] text-muted-foreground px-1">No se determinó zona. Activá la capa de Zonificación para verla.</p>
            )}
          </div>

          {/* Elevation */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Mountain size={12} className="text-teal-400" />
              <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider">Curvas de Nivel Próximas</span>
            </div>
            {cotas.length > 0 ? (
              <div className="rounded-lg overflow-hidden border border-border/50">
                <div className="flex px-3 py-1.5 gap-3 bg-card/50">
                  <span className="text-[10px] text-muted-foreground w-24 flex-shrink-0 font-semibold">Cota (m)</span>
                  <span className="text-[10px] text-muted-foreground w-16 flex-shrink-0 font-semibold">Z</span>
                  <span className="text-[10px] text-muted-foreground font-semibold">Tipo</span>
                </div>
                {cotas.map((c, i) => (
                  <div key={i} className={`flex px-3 py-1.5 gap-3 ${i % 2 === 0 ? "bg-card/20" : ""}`}>
                    <span className="text-[10px] text-foreground font-medium w-24 flex-shrink-0">{c.COTA?.toFixed(3) ?? "—"} m</span>
                    <span className="text-[10px] text-foreground w-16 flex-shrink-0">{c.Z ?? "—"}</span>
                    <span className="text-[10px] text-muted-foreground">{c.NOMBRE ?? "—"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-1">
                <Info size={11} className="text-muted-foreground" />
                <p className="text-[10px] text-muted-foreground">Sin curvas de nivel próximas. Activá la capa para cargar datos.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border flex-shrink-0">
          <p className="text-[9px] text-muted-foreground/60">Ord. 130/22 · Municipalidad de Colón, E.R.</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition-colors">
              Cerrar
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
            >
              <Printer size={12} />
              Imprimir / PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
