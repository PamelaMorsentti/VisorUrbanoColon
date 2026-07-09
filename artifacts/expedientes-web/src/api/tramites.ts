export type TipoRegistro =
  | "profesional"
  | "constructor"
  | "empresa_constructora"
  | "gestor_administrativo";

export type TipoProfesional =
  | "arquitecto"
  | "ingeniero_civil"
  | "ingeniero_electrico"
  | "ingeniero_mecanico"
  | "tecnico_constructor"
  | "maestro_mayor_obras"
  | "especialista";

export type EstadoRegistro =
  | "activo"
  | "suspendido"
  | "baja"
  | "pendiente_documentacion";

export interface Persona {
  id: string;
  esJuridica: boolean;
  apellido: string | null;
  nombres: string | null;
  razonSocial: string | null;
  nombreCompleto: string;
  dni: string | null;
  cuitCuil: string | null;
  domicilioCalle: string | null;
  domicilioNumero: string | null;
  domicilioLocalidad: string | null;
  domicilioProvincia: string | null;
  telefono: string | null;
  email: string | null;
}

export interface Matricula {
  id: string;
  personaId: string;
  tipoRegistro: TipoRegistro;
  tipoProfesional: TipoProfesional | null;
  especializacion: string | null;
  matriculaMunicipal: string;
  matriculaColegio: string | null;
  colegioProfesional: string | null;
  estado: EstadoRegistro;
  fechaInscripcion: string | null;
  observaciones: string | null;
  persona?: Persona;
}

export interface Catalogos {
  tipoRegistro: Record<TipoRegistro, string>;
  tipoProfesional: Record<TipoProfesional, string>;
  estadoRegistro: Record<EstadoRegistro, string>;
}

export interface AvalInput {
  nombreAvalistaTexto?: string;
  fechaAval?: string;
}

export interface CreateMatriculaInput {
  persona: {
    esJuridica: boolean;
    apellido?: string;
    nombres?: string;
    razonSocial?: string;
    dni?: string;
    cuitCuil?: string;
    domicilioCalle?: string;
    domicilioNumero?: string;
    domicilioLocalidad?: string;
    domicilioProvincia?: string;
    telefono?: string;
    email?: string;
  };
  tipoRegistro: TipoRegistro;
  tipoProfesional?: TipoProfesional;
  especializacion?: string;
  matriculaMunicipal?: string;
  matriculaColegio?: string;
  colegioProfesional?: string;
  representanteTecnicoTitulo?: string;
  observaciones?: string;
  avales?: AvalInput[];
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload.error === "string"
      ? payload.error
      : `Error ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export function fetchCatalogos() {
  return apiFetch<Catalogos>("/api/tramites/catalogos");
}

export function fetchMatriculaSuggest(tipoRegistro: TipoRegistro) {
  return apiFetch<{ matriculaMunicipal: string; prefix: string }>(
    `/api/tramites/matriculas/suggest?tipoRegistro=${tipoRegistro}`,
  );
}

export function fetchMatriculas(params?: {
  tipoRegistro?: TipoRegistro;
  estado?: EstadoRegistro;
  q?: string;
  limit?: number;
  offset?: number;
}) {
  const search = new URLSearchParams();
  if (params?.tipoRegistro) search.set("tipoRegistro", params.tipoRegistro);
  if (params?.estado) search.set("estado", params.estado);
  if (params?.q) search.set("q", params.q);
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.offset) search.set("offset", String(params.offset));
  const query = search.toString();
  return apiFetch<{ items: Matricula[]; total: number; limit: number; offset: number }>(
    `/api/tramites/matriculas${query ? `?${query}` : ""}`,
  );
}

export function createMatricula(input: CreateMatriculaInput) {
  return apiFetch<Matricula>("/api/tramites/matriculas", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateMatriculaEstado(
  id: string,
  body: { estado: EstadoRegistro; motivoBaja?: string; ultimoPagoAnio?: number },
) {
  return apiFetch<Matricula>(`/api/tramites/matriculas/${id}/estado`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
