import { useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type ManualField = {
  key: string;
  label: string;
  required?: boolean;
  multiline?: boolean;
};

type ManualEntryPayload = {
  sourceYear: number;
  createdBy: string;
  data: Record<string, string>;
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const API_ADMIN_TOKEN = (import.meta.env.VITE_OBRAS_MANUAL_ADMIN_TOKEN as string | undefined)?.trim() ?? "";
const STORAGE_KEY = "colon3d.manual-obras.backup.v1";

const DEFAULT_FIELDS: ManualField[] = [
  { key: "mes", label: "Mes" },
  { key: "legajo", label: "Legajo" },
  { key: "expediente", label: "Expediente" },
  { key: "ingreso", label: "Ingreso", required: true },
  { key: "condicion_del_tramite", label: "Condicion del tramite" },
  { key: "plano_de_mensura", label: "Plano de mensura" },
  { key: "partida_provincial", label: "Partida provincial" },
  { key: "partida_municipal", label: "Partida municipal" },
  { key: "concesion", label: "Concesion" },
  { key: "ex_quinta", label: "Ex quinta" },
  { key: "manzana", label: "Manzana" },
  { key: "parcela", label: "Parcela" },
  { key: "zonificacion", label: "Zonificacion" },
  { key: "ubicacion", label: "Ubicacion", required: true },
  { key: "propietario", label: "Propietario", required: true },
  { key: "nombre_establecimiento_empresa", label: "Nombre establecimiento/empresa" },
  { key: "proyecto", label: "Proyecto" },
  { key: "direccion_de_obra", label: "Direccion de obra" },
  { key: "estructura", label: "Estructura" },
  { key: "constructor", label: "Constructor" },
  { key: "relevamiento_o_existente", label: "Relevamiento o existente" },
  { key: "a_construir_obra_nueva", label: "A construir / obra nueva" },
  { key: "ampliacion_obra_existente", label: "Ampliacion obra existente" },
  { key: "proyectado_no_iniciado", label: "Proyectado no iniciado" },
  { key: "uso", label: "Uso" },
  { key: "cantidad_habitaciones_existente", label: "Cant. habitaciones existente" },
  { key: "cantidad_habitaciones_nuevas", label: "Cant. habitaciones nuevas" },
  { key: "locales_habitables_existente", label: "Locales habitables existente" },
  { key: "locales_habitables_nuevos", label: "Locales habitables nuevos" },
  { key: "plazas_existente", label: "Plazas existente" },
  { key: "plazas_nuevas", label: "Plazas nuevas" },
  { key: "m2_existentes_antecedente_vivienda", label: "m2 antecedente vivienda" },
  { key: "m2_existentes_antecedente_local", label: "m2 antecedente local" },
  { key: "m2_existentes_relevados_vivienda", label: "m2 relevados vivienda" },
  { key: "m2_existentes_relevados_local", label: "m2 relevados local" },
  { key: "m2_a_construir_vivienda", label: "m2 a construir vivienda" },
  { key: "m2_a_construir_local", label: "m2 a construir local" },
  { key: "terreno", label: "Terreno" },
  { key: "fos", label: "FOS" },
  { key: "fot", label: "FOT" },
  { key: "categoria", label: "Categoria" },
  { key: "monto_inversion_estimado_declarado", label: "Monto inversion estimado/declarado" },
  { key: "derechos_edificacion", label: "Derechos edificacion" },
  { key: "titulo_profesional", label: "Titulo profesional" },
  { key: "observaciones", label: "Observaciones", multiline: true },
  { key: "visado", label: "Visado", required: true },
  { key: "final_obra", label: "Final obra" },
  { key: "avance_de_obra", label: "Avance de obra" },
  { key: "columna1", label: "Columna 1" },
  { key: "coordenada_lat", label: "Coordenada latitud (opcional)" },
  { key: "coordenada_lon", label: "Coordenada longitud (opcional)" },
];

function makeInitialValues(fields: ManualField[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.key, ""]));
}

function readLocalEntries(): Array<{ createdAt: string; sourceYear: number; createdBy: string; data: Record<string, string> }> {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalEntries(entries: Array<{ createdAt: string; sourceYear: number; createdBy: string; data: Record<string, string> }>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export default function AdminManualObraPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [fields] = useState<ManualField[]>(DEFAULT_FIELDS);
  const [values, setValues] = useState<Record<string, string>>(() => makeInitialValues(DEFAULT_FIELDS));
  const [sourceYear, setSourceYear] = useState("2025");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number>(() => readLocalEntries().length);

  const requiredMissing = useMemo(
    () => fields.filter((field) => field.required && !String(values[field.key] ?? "").trim()),
    [fields, values],
  );

  const setFieldValue = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setValues(makeInitialValues(fields));
    setError(null);
    setSuccess(null);
  };

  const submitToApi = async (payload: ManualEntryPayload): Promise<string> => {
    if (!API_BASE) {
      throw new Error("API_BASE_MISSING");
    }

    const response = await fetch(`${API_BASE}/api/obras/manual-entries`, {
      method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(API_ADMIN_TOKEN ? { "x-admin-token": API_ADMIN_TOKEN } : {}),
        },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "API_SAVE_FAILED");
    }

    const json = (await response.json()) as {
      message?: string;
      persistedToDb?: boolean;
      dbDetails?: string | null;
      sourceRowNumber?: string;
    };

    const dbStatus = json.persistedToDb
      ? "Subida a DB: OK"
      : `Subida a DB: pendiente${json.dbDetails ? ` (${json.dbDetails})` : ""}`;
    const rowRef = json.sourceRowNumber ? ` · ID ${json.sourceRowNumber}` : "";
    return `${json.message ?? "Obra guardada en API"} · ${dbStatus}${rowRef}`;
  };

  const submitLocalFallback = (payload: ManualEntryPayload): string => {
    const current = readLocalEntries();
    const next = [{ createdAt: new Date().toISOString(), ...payload }, ...current];
    saveLocalEntries(next);
    setSavedCount(next.length);
    return "Obra guardada localmente (fallback).";
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (requiredMissing.length > 0) {
      setError(`Faltan campos obligatorios: ${requiredMissing.map((f) => f.label).join(", ")}`);
      return;
    }

    const parsedYear = Number(sourceYear);
    if (!Number.isFinite(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
      setError("El año origen debe ser valido (ej. 2025).");
      return;
    }

    const payload: ManualEntryPayload = {
      sourceYear: Math.trunc(parsedYear),
      createdBy: user?.username ?? "admin",
      data: Object.fromEntries(
        Object.entries(values).map(([key, value]) => [key, String(value ?? "").trim()]),
      ),
    };

    setSubmitting(true);
    try {
      let message = "";
      try {
        message = await submitToApi(payload);
      } catch (apiError) {
        const fallbackMessage = submitLocalFallback(payload);
        if ((apiError as Error).message !== "API_BASE_MISSING") {
          message = `${fallbackMessage} API no disponible: ${(apiError as Error).message}`;
        } else {
          message = fallbackMessage;
        }
      }

      setSuccess(message);
      setValues(makeInitialValues(fields));
    } catch (submitError) {
      setError(`No se pudo guardar la obra: ${(submitError as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-xl border border-red-500/30 bg-red-500/10 p-6">
          <div className="flex items-center gap-2 text-red-300 font-semibold mb-2">
            <ShieldAlert size={18} />
            Acceso restringido
          </div>
          <p className="text-sm text-slate-200">Esta pagina es solo para administradores autenticados.</p>
          <Link href="/" className="inline-flex items-center gap-2 mt-4 text-sm text-sky-300 hover:text-sky-200">
            <ArrowLeft size={14} />
            Volver al visor
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl font-bold">Carga manual de obras (admin)</h1>
            <p className="text-sm text-slate-300">
              Formulario de respaldo para altas manuales cuando falle la carga desde archivo o base de datos.
            </p>
          </div>
          <Link href="/" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-sm">
            <ArrowLeft size={14} />
            Volver al visor
          </Link>
        </div>

        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
          Esquema usado: columnas canonicas del listado de obras 2025. Campos obligatorios: ingreso, ubicacion, propietario, visado.
          {!API_BASE && (
            <div className="mt-1 text-amber-200">No hay API configurada; se guarda en localStorage del navegador como fallback.</div>
          )}
          {API_BASE && <div className="mt-1 text-amber-200">API configurada en {API_BASE}.</div>}
          <div className="mt-1 text-amber-200">Entradas locales guardadas: {savedCount}</div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <label className="text-sm">
              <span className="block mb-1 text-slate-300">Año origen</span>
              <input
                value={sourceYear}
                onChange={(e) => setSourceYear(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                placeholder="2025"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {fields.map((field) => (
              <label key={field.key} className={field.multiline ? "md:col-span-2" : ""}>
                <span className="block mb-1 text-xs text-slate-300">
                  {field.label}{field.required ? " *" : ""}
                </span>
                {field.multiline ? (
                  <textarea
                    value={values[field.key] ?? ""}
                    onChange={(e) => setFieldValue(field.key, e.target.value)}
                    rows={4}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  />
                ) : (
                  <input
                    value={values[field.key] ?? ""}
                    onChange={(e) => setFieldValue(field.key, e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  />
                )}
              </label>
            ))}
          </div>

          {error && <div className="mt-4 text-sm text-red-300">{error}</div>}
          {success && (
            <div className="mt-4 text-sm text-emerald-300 inline-flex items-center gap-2">
              <CheckCircle2 size={14} />
              {success}
            </div>
          )}

          <div className="mt-5 flex items-center gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-sm font-semibold"
            >
              {submitting ? "Guardando..." : "Guardar obra manual"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 rounded-md border border-slate-700 hover:bg-slate-800 text-sm"
            >
              Limpiar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
