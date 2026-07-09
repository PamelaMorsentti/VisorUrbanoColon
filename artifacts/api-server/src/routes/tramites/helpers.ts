import type { TipoRegistro } from "@workspace/db/schema";

const MATRICULA_PREFIX: Record<TipoRegistro, string> = {
  profesional: "PRO",
  constructor: "C",
  empresa_constructora: "EC",
  gestor_administrativo: "G",
};

export function buildNombreCompleto(input: {
  esJuridica: boolean;
  apellido?: string;
  nombres?: string;
  razonSocial?: string;
}): string {
  if (input.esJuridica) {
    return (input.razonSocial ?? "").trim();
  }
  const apellido = (input.apellido ?? "").trim();
  const nombres = (input.nombres ?? "").trim();
  return [apellido, nombres].filter(Boolean).join(", ");
}

export function matriculaPrefix(tipoRegistro: TipoRegistro): string {
  return MATRICULA_PREFIX[tipoRegistro];
}

export function parseMatriculaSequence(matriculaMunicipal: string, prefix: string): number | null {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`, "i");
  const match = pattern.exec(matriculaMunicipal.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function formatMatriculaMunicipal(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(3, "0")}`;
}

export const TIPO_REGISTRO_LABELS: Record<TipoRegistro, string> = {
  profesional: "Profesional",
  constructor: "Constructor",
  empresa_constructora: "Empresa constructora",
  gestor_administrativo: "Gestor administrativo",
};

export const TIPO_PROFESIONAL_LABELS = {
  arquitecto: "Arquitecto",
  ingeniero_civil: "Ingeniero Civil",
  ingeniero_electrico: "Ingeniero Eléctrico",
  ingeniero_mecanico: "Ingeniero Mecánico",
  tecnico_constructor: "Técnico Constructor",
  maestro_mayor_obras: "Maestro Mayor de Obras",
  especialista: "Especialista",
} as const;

export const ESTADO_REGISTRO_LABELS = {
  activo: "Activo",
  suspendido: "Suspendido",
  baja: "Baja",
  pendiente_documentacion: "Pendiente de documentación",
} as const;
