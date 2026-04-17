import { useEffect, type ReactNode } from "react";
import { X, Printer, Building, MapPin, Layers, Mountain, Info, TreePine, Landmark, Droplets, AlertCircle } from "lucide-react";
import { ZonaNormas } from "@/lib/zonaData";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LayerIntersection {
  id: string;
  label: string;
  relation: string;
  features: Record<string, unknown>[];
}

export interface ReportData {
  parcelProps: Record<string, unknown>;
  layerLabel: string;
  zonaName: string | null;
  normas: ZonaNormas | null;
  cotas: Array<{ Z: number; COTA: number; NOMBRE: string }>;
  lat: number | null;
  lng: number | null;
  intersections: LayerIntersection[];
}

interface ParcelReportProps {
  data: ReportData;
  onClose: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  NCP: "Nomenclatura Catastral (NCP)",
  NCM: "Nomenclatura Manzana",
  SEC: "Sección",
  GRU: "Grupo",
  MANZ: "Manzana",
  NPARC: "Nº Parcela",
  OBJETO: "Objeto / Uso",
  NOMBRE: "Nombre",
  AREA: "Superficie (m²)",
  FRENTE: "Frente (m)",
  LARGO: "Fondo (m)",
  PERIMETRO: "Perímetro (m)",
  TIPO: "Tipo",
  ESPECIE: "Especie",
  BARRIO: "Barrio",
  ESTADO: "Estado",
  NRO: "Número",
  COTA: "Cota altimétrica",
  Z: "Z (m)",
};

const HIDDEN = new Set([
  "fid","handle","block","etype","space","olinetype","linetype","color","ocolor",
  "color24","transparency","lweight","linewidth","ltscale","visible","width",
  "thickness","ext","layer","nodo","mapkey","ncc","nmanz","curva_id","codigo",
  "objectid","shape_leng","shape_area","globalid","created_user","created_date",
  "last_edited_user","last_edited_date",
]);

function isHidden(k: string): boolean {
  const kl = k.toLowerCase();
  return HIDDEN.has(kl) || k.startsWith("_") || k.startsWith("Shape");
}

function fmt(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") {
    if (key === "AREA") return `${Math.round(v).toLocaleString("es-AR")} m²`;
    if (key === "FRENTE" || key === "LARGO" || key === "PERIMETRO" || key === "COTA")
      return `${Number(v).toFixed(2)} m`;
    return Number.isInteger(v) ? v.toLocaleString("es-AR") : v.toFixed(3);
  }
  return String(v);
}

function cleanProps(props: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(props).filter(([k, v]) =>
    !isHidden(k) && v !== null && v !== undefined && v !== "" && v !== 0
  );
}

// ─── Icon helper ─────────────────────────────────────────────────────────────

const LAYER_ICONS: Record<string, string> = {
  manzana: "🗺️",
  barrios: "🏘️",
  superp: "🏗️",
  edif: "🏢",
  edif_palta: "🏬",
  arbol: "🌳",
  calle: "🛣️",
  hidro: "💧",
  bocas: "🕳️",
};

// ─── CSS for print HTML ───────────────────────────────────────────────────────

const PRINT_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Arial', sans-serif; }
  body { background: #fff; color: #1a1a1a; font-size: 10.5px; padding: 20px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a3a6b; padding-bottom: 12px; margin-bottom: 16px; }
  .header-title h1 { font-size: 15px; font-weight: bold; color: #1a3a6b; }
  .header-title p { font-size: 9px; color: #555; margin-top: 3px; }
  .header-meta { text-align: right; font-size: 9.5px; color: #555; }
  .header-meta b { color: #1a3a6b; }
  .section { margin-bottom: 13px; border: 1px solid #dde; border-radius: 4px; overflow: hidden; }
  .section-title { background: #1a3a6b; color: #fff; padding: 5px 10px; font-size: 10px; font-weight: bold; letter-spacing: 0.3px; }
  .section-title.green { background: #14532d; }
  .section-title.teal { background: #134e4a; }
  .section-title.amber { background: #78350f; }
  .section-title.purple { background: #4c1d95; }
  table { width: 100%; border-collapse: collapse; }
  tr:nth-child(even) { background: #f4f6fb; }
  td, th { padding: 4px 9px; text-align: left; border-bottom: 1px solid #eee; }
  th { background: #e8ecf4; font-weight: bold; color: #1a3a6b; font-size: 9px; }
  td.label { color: #555; width: 180px; }
  td.value { font-weight: 500; }
  td.obs { font-style: italic; color: #555; font-size: 9.5px; }
  .fuente { font-size: 8.5px; color: #888; padding: 3px 9px; }
  .obs { padding: 7px 9px; color: #666; font-style: italic; }
  .feature-sub { border-top: 1px solid #dde; }
  .feature-num { background: #f0f4ff; padding: 3px 9px; font-size: 9px; color: #1a3a6b; font-weight: bold; }
  .footer { margin-top: 18px; border-top: 1px solid #ccc; padding-top: 9px; font-size: 8.5px; color: #888; display: flex; justify-content: space-between; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
  .two-col td.label { width: 120px; }
  @media print { body { padding: 10px; } }
`;

// ─── Build print HTML sections for intersections ─────────────────────────────

function buildIntersectionHtml(ints: LayerIntersection[]): string {
  if (!ints.length) return "";
  return ints.map(int => {
    if (!int.features.length) return "";
    const colorClass = ["edif","edif_palta","superp"].includes(int.id) ? "amber"
      : int.id === "arbol" ? "green"
      : int.id === "calle" ? ""
      : int.id === "hidro" || int.id === "bocas" ? "teal"
      : "purple";

    const icon = LAYER_ICONS[int.id] || "📌";

    if (int.features.length === 1) {
      const entries = cleanProps(int.features[0]);
      if (!entries.length) return "";
      const rows = entries.map(([k, v]) => {
        const label = FIELD_LABELS[k.toUpperCase()] || k;
        return `<tr><td class="label">${label}</td><td class="value">${fmt(k.toUpperCase(), v)}</td></tr>`;
      }).join("");
      return `
        <section class="section">
          <h2 class="section-title ${colorClass}">${icon} ${int.label} — ${int.relation}</h2>
          <table>${rows}</table>
        </section>`;
    }

    const featureBlocks = int.features.map((feat, idx) => {
      const entries = cleanProps(feat);
      if (!entries.length) return "";
      const rows = entries.map(([k, v]) => {
        const label = FIELD_LABELS[k.toUpperCase()] || k;
        return `<tr><td class="label">${label}</td><td class="value">${fmt(k.toUpperCase(), v)}</td></tr>`;
      }).join("");
      return `<div class="feature-sub"><div class="feature-num">#${idx + 1}</div><table class="two-col">${rows}</table></div>`;
    }).join("");

    return `
      <section class="section">
        <h2 class="section-title ${colorClass}">${icon} ${int.label} (${int.features.length}) — ${int.relation}</h2>
        ${featureBlocks}
      </section>`;
  }).join("\n");
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ParcelReport({ data, onClose }: ParcelReportProps) {
  const { parcelProps, layerLabel, zonaName, normas, cotas, lat, lng, intersections } = data;
  const today = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const parcelEntries = Object.entries(parcelProps).filter(
    ([k, v]) => !isHidden(k) && v !== null && v !== undefined && v !== ""
  );

  // ── Print action ────────────────────────────────────────────────────────────

  const handlePrint = () => {
    const title = parcelProps.NCP
      ? `Informe Parcela ${parcelProps.NCP}`
      : "Informe Catastral";

    const parcelRows = parcelEntries.map(([k, v]) =>
      `<tr><td class="label">${FIELD_LABELS[k.toUpperCase()] || k}</td><td class="value">${fmt(k.toUpperCase(), v)}</td></tr>`
    ).join("");
    const coordRow = lat && lng
      ? `<tr><td class="label">Coordenadas (WGS84)</td><td class="value">${lat.toFixed(6)}, ${lng.toFixed(6)}</td></tr>`
      : "";

    const zonaSection = zonaName && normas ? `
      <section class="section">
        <h2 class="section-title green">🗺 Zonificación Urbana (Ord. 130/22)</h2>
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
      </section>` :
      zonaName ? `
      <section class="section">
        <h2 class="section-title green">🗺 Zonificación Urbana</h2>
        <table><tr><td class="label">Zona</td><td class="value">${zonaName}</td></tr></table>
      </section>` : `
      <section class="section">
        <h2 class="section-title green">🗺 Zonificación Urbana</h2>
        <p class="obs">No se determinó zona normativa para esta parcela.</p>
      </section>`;

    const cotasSection = cotas.length > 0 ? `
      <section class="section">
        <h2 class="section-title teal">⛰ Curvas de Nivel Próximas</h2>
        <table>
          <tr><th>Cota (m)</th><th>Z (m)</th><th>Tipo</th></tr>
          ${cotas.map(c => `<tr><td>${c.COTA?.toFixed(3) ?? "—"}</td><td>${c.Z ?? "—"}</td><td>${c.NOMBRE ?? "—"}</td></tr>`).join("")}
        </table>
        <p class="fuente">Curvas de nivel interpoladas del relevamiento altimétrico municipal.</p>
      </section>` : "";

    const intersectionsHtml = buildIntersectionHtml(intersections);

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
<div class="header">
  <div class="header-title">
    <h1>Informe de Parcela Catastral</h1>
    <p>Visor Urbano Colón 3D — Municipalidad de Colón, Entre Ríos</p>
  </div>
  <div class="header-meta">
    <div>Fecha: <b>${today}</b></div>
    <div style="margin-top:3px">Capa: ${layerLabel}</div>
    ${lat && lng ? `<div style="margin-top:3px">${lat.toFixed(6)}, ${lng.toFixed(6)}</div>` : ""}
  </div>
</div>

<section class="section">
  <h2 class="section-title">📋 Datos Catastrales</h2>
  <table>${parcelRows}${coordRow}</table>
</section>

${zonaSection}
${cotasSection}
${intersectionsHtml}

<div class="footer">
  <span>Visor Urbano Colón 3D · GIS Municipal · Municipalidad de Colón, E.R. · Ord. 130/22</span>
  <span>Generado: ${today}</span>
</div>
</body>
</html>`;

    const win = window.open("", "_blank", "width=860,height=950");
    if (!win) { alert("Habilitá las ventanas emergentes para imprimir."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 450);
  };

  // ── Preview render ──────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-border"
        style={{ background: "hsl(220 16% 12%)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Printer size={16} className="text-primary" />
            <div>
              <div className="text-sm font-bold text-foreground">Informe de Parcela</div>
              <div className="text-[10px] text-muted-foreground">Datos de todas las capas intersectadas</div>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>

        {/* Scroll area */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Catastral */}
          <Section icon={<Building size={12} className="text-primary" />} title="Datos Catastrales" color="text-primary">
            <PropTable entries={parcelEntries} extra={
              lat && lng
                ? [["Coordenadas (WGS84)", `${lat.toFixed(6)}, ${lng.toFixed(6)}`]]
                : []
            } />
          </Section>

          {/* Zoning */}
          <Section icon={<Layers size={12} className="text-emerald-400" />} title="Zonificación (Ord. 130/22)" color="text-emerald-400">
            {normas ? (
              <PropTable entries={[
                ["Zona", zonaName || "—"],
                ["Nomenclatura", normas.nomenclatura],
                ["FOS (ocup. suelo)", normas.fos],
                ["FOT (ocup. total)", normas.fot],
                ["Altura máxima", normas.alturaMax],
                ["Retiro L.M.", normas.retiroLM],
                ["Retiro medianera", normas.retiroMedianera],
                ["Suelo absorbente", normas.sueloAbsorbente],
              ]} raw extra={normas.observaciones ? [["Obs.", normas.observaciones]] : []} />
            ) : zonaName ? (
              <p className="text-[10px] text-muted-foreground px-1">Zona: <b className="text-foreground">{zonaName}</b>. Sin parámetros normativos mapeados.</p>
            ) : (
              <EmptyNote>No se determinó zona. Activá la capa de Zonificación.</EmptyNote>
            )}
          </Section>

          {/* Elevation */}
          <Section icon={<Mountain size={12} className="text-teal-400" />} title="Curvas de Nivel Próximas" color="text-teal-400">
            {cotas.length > 0 ? (
              <div className="rounded-lg overflow-hidden border border-border/50">
                <div className="flex px-3 py-1.5 gap-3 bg-card/50">
                  <span className="text-[10px] text-muted-foreground w-24 flex-shrink-0 font-semibold">Cota (m)</span>
                  <span className="text-[10px] text-muted-foreground w-14 flex-shrink-0 font-semibold">Z</span>
                  <span className="text-[10px] text-muted-foreground font-semibold">Tipo</span>
                </div>
                {cotas.map((c, i) => (
                  <div key={i} className={`flex px-3 py-1.5 gap-3 ${i % 2 === 0 ? "bg-card/20" : ""}`}>
                    <span className="text-[10px] text-foreground font-medium w-24 flex-shrink-0">{c.COTA?.toFixed(3) ?? "—"} m</span>
                    <span className="text-[10px] text-foreground w-14 flex-shrink-0">{c.Z ?? "—"}</span>
                    <span className="text-[10px] text-muted-foreground">{c.NOMBRE ?? "—"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyNote>Sin curvas de nivel próximas encontradas.</EmptyNote>
            )}
          </Section>

          {/* Dynamic intersections */}
          {intersections.map(int => (
            <IntersectionSection key={int.id} int={int} />
          ))}

        </div>

        {/* Footer */}
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ icon, title, color, children }: {
  icon: ReactNode;
  title: string;
  color: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className={`text-[10px] font-bold uppercase tracking-wider ${color}`}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function PropTable({ entries, raw, extra }: {
  entries: Array<[string, unknown]>;
  raw?: boolean;
  extra?: Array<[string, string]>;
}) {
  const rows = raw
    ? entries as Array<[string, string]>
    : entries.map(([k, v]) => [FIELD_LABELS[k.toUpperCase()] || k, fmt(k.toUpperCase(), v)] as [string, string]);
  const all = [...rows, ...(extra || [])];
  if (!all.length) return <EmptyNote>Sin datos disponibles.</EmptyNote>;
  return (
    <div className="rounded-lg overflow-hidden border border-border/50">
      {all.map(([label, value], i) => (
        <div key={i} className={`flex px-3 py-1.5 gap-3 ${i % 2 === 0 ? "bg-card/30" : ""}`}>
          <span className="text-[10px] text-muted-foreground w-40 flex-shrink-0">{label}</span>
          <span className="text-[10px] text-foreground font-medium break-words">{value}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 px-1">
      <Info size={11} className="text-muted-foreground flex-shrink-0" />
      <p className="text-[10px] text-muted-foreground">{children}</p>
    </div>
  );
}

const INTERSECTION_COLORS: Record<string, string> = {
  manzana: "text-violet-400",
  barrios: "text-sky-400",
  superp: "text-amber-400",
  edif: "text-orange-400",
  edif_palta: "text-orange-300",
  arbol: "text-green-400",
  calle: "text-slate-300",
  hidro: "text-cyan-400",
  bocas: "text-blue-400",
};

function IntersectionSection({ int }: { int: LayerIntersection }) {
  if (!int.features.length) return null;
  const icon = LAYER_ICONS[int.id] || "📌";
  const color = INTERSECTION_COLORS[int.id] || "text-muted-foreground";

  const iconEl = int.id === "arbol" ? <TreePine size={12} className={color} /> :
    int.id === "hidro" || int.id === "bocas" ? <Droplets size={12} className={color} /> :
    int.id === "calle" ? <Landmark size={12} className={color} /> :
    int.id === "edif" || int.id === "edif_palta" || int.id === "superp" ? <Building size={12} className={color} /> :
    <MapPin size={12} className={color} />;

  const title = int.features.length > 1
    ? `${icon} ${int.label} (${int.features.length})`
    : `${icon} ${int.label}`;

  return (
    <Section icon={iconEl} title={title} color={color}>
      <div className="text-[9px] text-muted-foreground/70 mb-1.5 px-0.5">{int.relation}</div>
      {int.features.length === 1 ? (
        <FeatureCard props={int.features[0]} />
      ) : (
        <div className="space-y-1.5">
          {int.features.map((f, i) => (
            <FeatureCard key={i} props={f} index={i + 1} />
          ))}
        </div>
      )}
    </Section>
  );
}

function FeatureCard({ props, index }: { props: Record<string, unknown>; index?: number }) {
  const entries = cleanProps(props);
  if (!entries.length) return <EmptyNote>Sin atributos disponibles.</EmptyNote>;
  return (
    <div className="rounded-lg overflow-hidden border border-border/50">
      {index !== undefined && (
        <div className="px-3 py-1 bg-card/60 text-[9px] text-muted-foreground/70 font-semibold border-b border-border/40">
          #{index}
        </div>
      )}
      {entries.map(([k, v], i) => (
        <div key={k} className={`flex px-3 py-1.5 gap-3 ${i % 2 === 0 ? "bg-card/20" : ""}`}>
          <span className="text-[10px] text-muted-foreground w-36 flex-shrink-0">
            {FIELD_LABELS[k.toUpperCase()] || k}
          </span>
          <span className="text-[10px] text-foreground font-medium break-words">
            {fmt(k.toUpperCase(), v)}
          </span>
        </div>
      ))}
    </div>
  );
}

// Silence unused import warning
const _unused = AlertCircle;
void _unused;
