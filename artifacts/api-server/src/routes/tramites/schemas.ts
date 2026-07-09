import { z } from "zod";
import {
  estadoRegistroEnumValues,
  tipoProfesionalEnumValues,
  tipoRegistroEnumValues,
} from "@workspace/db/schema";

export const tipoRegistroSchema = z.enum(tipoRegistroEnumValues);
export const tipoProfesionalSchema = z.enum(tipoProfesionalEnumValues);
export const estadoRegistroSchema = z.enum(estadoRegistroEnumValues);

export const personaInputSchema = z.object({
  esJuridica: z.boolean().default(false),
  apellido: z.string().trim().optional(),
  nombres: z.string().trim().optional(),
  razonSocial: z.string().trim().optional(),
  dni: z.string().trim().optional(),
  cuitCuil: z.string().trim().optional(),
  domicilioCalle: z.string().trim().optional(),
  domicilioNumero: z.string().trim().optional(),
  domicilioLocalidad: z.string().trim().default("Colón"),
  domicilioProvincia: z.string().trim().default("Entre Ríos"),
  telefono: z.string().trim().optional(),
  email: z.string().trim().email("Email inválido").optional().or(z.literal("")),
});

export const avalInputSchema = z.object({
  personaAvalistaId: z.string().uuid().optional(),
  nombreAvalistaTexto: z.string().trim().optional(),
  fechaAval: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const createMatriculaSchema = z.object({
  persona: personaInputSchema,
  tipoRegistro: tipoRegistroSchema,
  tipoProfesional: tipoProfesionalSchema.optional(),
  especializacion: z.string().trim().optional(),
  matriculaMunicipal: z.string().trim().optional(),
  matriculaColegio: z.string().trim().optional(),
  colegioProfesional: z.string().trim().optional(),
  representanteTecnicoPersonaId: z.string().uuid().optional(),
  representanteTecnicoTitulo: z.string().trim().optional(),
  observaciones: z.string().trim().optional(),
  avales: z.array(avalInputSchema).optional(),
}).superRefine((data, ctx) => {
  if (data.tipoRegistro === "profesional" && !data.tipoProfesional) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "El tipo de profesional es obligatorio",
      path: ["tipoProfesional"],
    });
  }

  if (data.tipoRegistro === "empresa_constructora" && !data.persona.esJuridica) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Las empresas constructoras deben registrarse como persona jurídica",
      path: ["persona", "esJuridica"],
    });
  }

  if (data.tipoRegistro === "constructor") {
    const avales = data.avales ?? [];
    if (avales.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Los constructores requieren aval de dos profesionales matriculados",
        path: ["avales"],
      });
    }
  }

  if (!data.persona.esJuridica) {
    if (!data.persona.apellido?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El apellido es obligatorio",
        path: ["persona", "apellido"],
      });
    }
    if (!data.persona.nombres?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Los nombres son obligatorios",
        path: ["persona", "nombres"],
      });
    }
  } else if (!data.persona.razonSocial?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "La razón social es obligatoria",
      path: ["persona", "razonSocial"],
    });
  }
});

export const updateMatriculaEstadoSchema = z.object({
  estado: estadoRegistroSchema,
  motivoBaja: z.string().trim().optional(),
  ultimoPagoAnio: z.number().int().min(2000).max(2100).optional(),
});

export const listMatriculasQuerySchema = z.object({
  tipoRegistro: tipoRegistroSchema.optional(),
  estado: estadoRegistroSchema.optional(),
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateMatriculaInput = z.infer<typeof createMatriculaSchema>;
