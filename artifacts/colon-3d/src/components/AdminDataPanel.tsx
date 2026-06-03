import { useEffect, useMemo, useState } from "react";
import { Database, Download, Filter, Loader2, Save, Upload, X } from "lucide-react";

type Geometry = { type: string; coordinates?: unknown[] };
type FeatureProps = Record<string, string>;
type GeoFeature = {
  type: "Feature";
  geometry: Geometry;
  properties: FeatureProps;
};

type GeoCollection = {
  type: "FeatureCollection";
  features: GeoFeature[];
};

type SortMode = "visado_desc" | "visado_asc" | "m2_desc" | "m2_asc" | "profesional" | "propietario";

type Filters = {
  year: string;
  minM2: string;
  maxM2: string;
  profesional: string;
  constructor: string;
  propietario: string;
  destino: string;
  ubicacion: string;
};

type AdminDataPanelProps = {
  basePath: string;
  open: boolean;
  onClose: () => void;
};

const OVERRIDES_KEY = "colon3d.adminDataOverrides.v1";

const EDITABLE_FIELDS = [
  "propietario",
  "profesional_proyecto",
  "constructor",
  "destino_uso",
  "tipo",
  "raw_ubicacion",
  "direccion_de_obra",
  "zonificacion",
  "fecha_de_visado",
  "m_a_construir_vivienda",
  "m_a_construir_local",
  "m_existentes_relevados_vivienda",
  "m_existentes_relevados_local",
] as const;

const EMPTY_FILTERS: Filters = {
  year: "",
  minM2: "",
  maxM2: "",
  profesional: "",
  constructor: "",
  propietario: "",
  destino: "",
  ubicacion: "",
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function parseM2(raw: unknown): number {
  const value = String(raw ?? "").trim().replace(".", "").replace(",", ".");
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getFeatureM2(props: FeatureProps): number {
  return parseM2(props.m_a_construir_vivienda)
    + parseM2(props.m_a_construir_local)
    + parseM2(props.m_existentes_relevados_vivienda)
    + parseM2(props.m_existentes_relevados_local);
}

function extractYear(isoDate: string): string {
  const match = String(isoDate ?? "").match(/(19|20)\d{2}/);
  return match ? match[0] : "";
}

function getFeatureId(feature: GeoFeature): string {
  const p = feature.properties || {};
  return [p.legajo_canonico || "", p.source_row_number || "", p.ncp || "", p.raw_ubicacion || ""].join("::");
}

function safeReadOverrides(): Record<string, Partial<FeatureProps>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, Partial<FeatureProps>>;
  } catch {
    return {};
  }
}

function applyOverrides(
  features: GeoFeature[],
  overrides: Record<string, Partial<FeatureProps>>,
): GeoFeature[] {
  return features.map((feature) => {
    const id = getFeatureId(feature);
    const patch = overrides[id];
    if (!patch) return feature;
    return {
      ...feature,
      properties: {
        ...feature.properties,
        ...patch,
      },
    };
  });
}

function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AdminDataPanel({ basePath, open, onClose }: AdminDataPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allFeatures, setAllFeatures] = useState<GeoFeature[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortMode, setSortMode] = useState<SortMode>("visado_desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<FeatureProps>>({});
  const [overrides, setOverrides] = useState<Record<string, Partial<FeatureProps>>>({});

  useEffect(() => {
    setOverrides(safeReadOverrides());
  }, []);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const adminPath = `${basePath}/data/planos/obras-admin.geojson`;
        const professionalPath = `${basePath}/data/planos/obras-professional.geojson`;

        const adminRes = await fetch(adminPath);
        const selectedRes = adminRes.ok ? adminRes : await fetch(professionalPath);

        if (!selectedRes.ok) throw new Error("No se pudo cargar el dataset de obras.");
        const raw = await selectedRes.json() as GeoCollection;
        const features = Array.isArray(raw.features) ? raw.features : [];

        if (!cancelled) {
          setAllFeatures(applyOverrides(features, overrides));
        }
      } catch {
        if (!cancelled) setError("No se pudo abrir el panel de datos. Verifica archivos de obras.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [open, basePath, overrides]);

  const filtered = useMemo(() => {
    const list = allFeatures.filter((feature) => {
      const p = feature.properties || {};
      const m2 = getFeatureM2(p);
      const year = extractYear(p.fecha_de_visado);

      if (filters.year && year !== filters.year) return false;
      if (filters.minM2 && m2 < Number(filters.minM2)) return false;
      if (filters.maxM2 && m2 > Number(filters.maxM2)) return false;
      if (filters.profesional && !normalizeText(p.profesional_proyecto).includes(normalizeText(filters.profesional))) return false;
      if (filters.constructor && !normalizeText(p.constructor).includes(normalizeText(filters.constructor))) return false;
      if (filters.propietario && !normalizeText(p.propietario).includes(normalizeText(filters.propietario))) return false;
      if (filters.destino && !normalizeText(p.destino_uso).includes(normalizeText(filters.destino))) return false;

      if (filters.ubicacion) {
        const locationText = [p.raw_ubicacion, p.direccion_de_obra, p.zonificacion, p.ncp, p.ncp_formatted]
          .map(normalizeText)
          .join(" ");
        if (!locationText.includes(normalizeText(filters.ubicacion))) return false;
      }

      return true;
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      const pa = a.properties || {};
      const pb = b.properties || {};
      const yearA = String(pa.fecha_de_visado || "");
      const yearB = String(pb.fecha_de_visado || "");
      const m2A = getFeatureM2(pa);
      const m2B = getFeatureM2(pb);

      if (sortMode === "visado_desc") return yearB.localeCompare(yearA);
      if (sortMode === "visado_asc") return yearA.localeCompare(yearB);
      if (sortMode === "m2_desc") return m2B - m2A;
      if (sortMode === "m2_asc") return m2A - m2B;
      if (sortMode === "profesional") return String(pa.profesional_proyecto || "").localeCompare(String(pb.profesional_proyecto || ""));
      return String(pa.propietario || "").localeCompare(String(pb.propietario || ""));
    });

    return sorted;
  }, [allFeatures, filters, sortMode]);

  const selectedFeature = useMemo(() => {
    if (!selectedId) return null;
    return filtered.find((feature) => getFeatureId(feature) === selectedId) ?? null;
  }, [filtered, selectedId]);

  useEffect(() => {
    if (!selectedFeature) {
      setDraft({});
      return;
    }
    const id = getFeatureId(selectedFeature);
    setDraft({ ...(selectedFeature.properties || {}), ...(overrides[id] || {}) });
  }, [selectedFeature, overrides]);

  const totalCount = allFeatures.length;

  const handleSave = () => {
    if (!selectedFeature) return;
    const id = getFeatureId(selectedFeature);

    const patch: Partial<FeatureProps> = {};
    for (const field of EDITABLE_FIELDS) {
      const nextValue = String(draft[field] ?? "");
      const originalValue = String(selectedFeature.properties?.[field] ?? "");
      if (nextValue !== originalValue) patch[field] = nextValue;
    }

    const nextOverrides = { ...overrides };
    if (Object.keys(patch).length === 0) {
      delete nextOverrides[id];
    } else {
      nextOverrides[id] = patch;
    }

    setOverrides(nextOverrides);
    if (typeof window !== "undefined") {
      localStorage.setItem(OVERRIDES_KEY, JSON.stringify(nextOverrides));
    }
  };

  const handleExportOverrides = () => {
    downloadJson("admin-data-overrides.json", {
      exportedAt: new Date().toISOString(),
      count: Object.keys(overrides).length,
      overrides,
    });
  };

  const handleImportOverrides = async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text) as { overrides?: Record<string, Partial<FeatureProps>> };
      const imported = json.overrides ?? {};
      const next = { ...overrides, ...imported };
      setOverrides(next);
      if (typeof window !== "undefined") {
        localStorage.setItem(OVERRIDES_KEY, JSON.stringify(next));
      }
    } catch {
      setError("No se pudo importar el archivo de overrides.");
    }
  };

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-[1600] bg-black/55 backdrop-blur-[2px] flex items-start justify-center p-3 sm:p-6 overflow-auto">
      <div className="w-full max-w-7xl rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/70 bg-background/40">
          <div>
            <div className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Database size={16} />
              Panel admin de datos de obras
            </div>
            <div className="text-xs text-muted-foreground">Listado, filtros y edicion local con exportacion de cambios</div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar panel admin">
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] min-h-[70vh]">
          <div className="border-r border-border/60 p-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <Input label="Ano" value={filters.year} onChange={(v) => setFilters((p) => ({ ...p, year: v }))} placeholder="2024" />
              <Input label="Min m2" value={filters.minM2} onChange={(v) => setFilters((p) => ({ ...p, minM2: v }))} placeholder="0" />
              <Input label="Max m2" value={filters.maxM2} onChange={(v) => setFilters((p) => ({ ...p, maxM2: v }))} placeholder="500" />
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Orden</label>
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs"
                >
                  <option value="visado_desc">Visado mas reciente</option>
                  <option value="visado_asc">Visado mas antiguo</option>
                  <option value="m2_desc">Mayor m2</option>
                  <option value="m2_asc">Menor m2</option>
                  <option value="profesional">Profesional A-Z</option>
                  <option value="propietario">Propietario A-Z</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
              <Input label="Profesional" value={filters.profesional} onChange={(v) => setFilters((p) => ({ ...p, profesional: v }))} placeholder="Apellido" />
              <Input label="Constructor" value={filters.constructor} onChange={(v) => setFilters((p) => ({ ...p, constructor: v }))} placeholder="Apellido" />
              <Input label="Propietario" value={filters.propietario} onChange={(v) => setFilters((p) => ({ ...p, propietario: v }))} placeholder="Apellido" />
              <Input label="Uso / destino" value={filters.destino} onChange={(v) => setFilters((p) => ({ ...p, destino: v }))} placeholder="vivienda" />
            </div>

            <Input
              label="Ubicacion (calle, barrio/zona, NCP)"
              value={filters.ubicacion}
              onChange={(v) => setFilters((p) => ({ ...p, ubicacion: v }))}
              placeholder="San Martin, urbana, 0100..."
            />

            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Filter size={12} />
                Total dataset: {totalCount.toLocaleString("es-AR")} · Filtrado: {filtered.length.toLocaleString("es-AR")}
              </div>
              <button
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="px-2 py-1 rounded border border-border hover:bg-background/50"
              >
                Limpiar filtros
              </button>
            </div>

            <div className="mt-3 rounded border border-border/60 overflow-auto max-h-[45vh]">
              {loading && (
                <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin" /> Cargando datos...
                </div>
              )}
              {error && !loading && <div className="p-3 text-xs text-red-400">{error}</div>}

              {!loading && !error && (
                <table className="w-full text-xs">
                  <thead className="bg-background/60 sticky top-0">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-2 py-1.5">Legajo</th>
                      <th className="px-2 py-1.5">Visado</th>
                      <th className="px-2 py-1.5">m2</th>
                      <th className="px-2 py-1.5">Profesional</th>
                      <th className="px-2 py-1.5">Ubicacion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 500).map((feature, index) => {
                      const p = feature.properties || {};
                      const rowId = getFeatureId(feature);
                      const m2 = getFeatureM2(p);
                      const isSelected = rowId === selectedId;
                      return (
                        <tr
                          key={rowId}
                          onClick={() => setSelectedId(rowId)}
                          className={`cursor-pointer border-t border-border/30 ${isSelected ? "bg-primary/10" : "hover:bg-background/50"}`}
                        >
                          <td className="px-2 py-1.5">{p.legajo_canonico || "-"}</td>
                          <td className="px-2 py-1.5">{p.fecha_de_visado || "-"}</td>
                          <td className="px-2 py-1.5">{Math.round(m2).toLocaleString("es-AR")}</td>
                          <td className="px-2 py-1.5 max-w-[220px] truncate" title={p.profesional_proyecto || ""}>{p.profesional_proyecto || "-"}</td>
                          <td className="px-2 py-1.5 max-w-[220px] truncate" title={p.raw_ubicacion || ""}>{p.raw_ubicacion || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-foreground">Edicion de registro</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportOverrides}
                  className="px-2 py-1.5 rounded border border-border text-xs hover:bg-background/50 inline-flex items-center gap-1"
                >
                  <Download size={12} /> Exportar
                </button>
                <label className="px-2 py-1.5 rounded border border-border text-xs hover:bg-background/50 inline-flex items-center gap-1 cursor-pointer">
                  <Upload size={12} /> Importar
                  <input
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleImportOverrides(file);
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!selectedFeature}
                  className="px-2 py-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <Save size={12} /> Guardar cambio
                </button>
              </div>
            </div>

            {!selectedFeature && (
              <div className="text-xs text-muted-foreground rounded border border-border/60 p-3">
                Selecciona una obra de la lista para editar sus campos.
              </div>
            )}

            {selectedFeature && (
              <div className="space-y-2 max-h-[58vh] overflow-auto pr-1">
                <div className="text-xs text-muted-foreground pb-1 border-b border-border/50">
                  Legajo: {selectedFeature.properties?.legajo_canonico || "-"} · Fila origen: {selectedFeature.properties?.source_row_number || "-"}
                </div>

                {EDITABLE_FIELDS.map((field) => (
                  <div key={field}>
                    <label className="text-[11px] text-muted-foreground block mb-1">{field}</label>
                    <input
                      value={String(draft[field] ?? "")}
                      onChange={(e) => setDraft((prev) => ({ ...prev, [field]: e.target.value }))}
                      className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-[11px] text-muted-foreground block mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs"
      />
    </div>
  );
}
