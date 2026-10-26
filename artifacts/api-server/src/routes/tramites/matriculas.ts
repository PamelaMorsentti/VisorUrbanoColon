import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  avalesTable,
  matriculasTable,
  personasTable,
  type TipoRegistro,
} from "@workspace/db/schema";
import {
  buildNombreCompleto,
  ESTADO_REGISTRO_LABELS,
  formatMatriculaMunicipal,
  matriculaPrefix,
  parseMatriculaSequence,
  TIPO_PROFESIONAL_LABELS,
  TIPO_REGISTRO_LABELS,
} from "./helpers.ts";
import {
  createMatriculaSchema,
  listMatriculasQuerySchema,
  updateMatriculaEstadoSchema,
} from "./schemas.ts";

const router: IRouter = Router();

function isMissingTramitesTableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("tramites") && message.includes("does not exist");
}

async function suggestNextMatricula(tipoRegistro: TipoRegistro): Promise<string> {
  const prefix = matriculaPrefix(tipoRegistro);
  const rows = await db
    .select({ matriculaMunicipal: matriculasTable.matriculaMunicipal })
    .from(matriculasTable)
    .where(eq(matriculasTable.tipoRegistro, tipoRegistro));

  let max = 0;
  for (const row of rows) {
    const seq = parseMatriculaSequence(row.matriculaMunicipal, prefix);
    if (seq && seq > max) max = seq;
  }

  return formatMatriculaMunicipal(prefix, max + 1);
}

router.get("/tramites/catalogos", (_req, res) => {
  return res.json({
    tipoRegistro: TIPO_REGISTRO_LABELS,
    tipoProfesional: TIPO_PROFESIONAL_LABELS,
    estadoRegistro: ESTADO_REGISTRO_LABELS,
  });
});

router.get("/tramites/matriculas/suggest", async (req, res) => {
  try {
    const tipoRegistro = req.query.tipoRegistro;
    if (
      tipoRegistro !== "profesional"
      && tipoRegistro !== "constructor"
      && tipoRegistro !== "empresa_constructora"
      && tipoRegistro !== "gestor_administrativo"
    ) {
      return res.status(400).json({ error: "tipoRegistro inválido" });
    }

    const matriculaMunicipal = await suggestNextMatricula(tipoRegistro);
    return res.json({ matriculaMunicipal, prefix: matriculaPrefix(tipoRegistro) });
  } catch (error) {
    if (isMissingTramitesTableError(error)) {
      return res.status(503).json({
        error: "Esquema tramites no disponible",
        details: "Ejecutá lib/db/sql/tramites_registro_schema.sql o pnpm --filter @workspace/db run push",
      });
    }
    return res.status(500).json({
      error: "No se pudo sugerir matrícula",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.get("/tramites/matriculas", async (req, res) => {
  try {
    const parsed = listMatriculasQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Parámetros inválidos", details: parsed.error.flatten() });
    }

    const { tipoRegistro, estado, q, limit, offset } = parsed.data;
    const filters = [];

    if (tipoRegistro) filters.push(eq(matriculasTable.tipoRegistro, tipoRegistro));
    if (estado) filters.push(eq(matriculasTable.estado, estado));
    if (q) {
      const pattern = `%${q}%`;
      filters.push(or(
        ilike(personasTable.nombreCompleto, pattern),
        ilike(matriculasTable.matriculaMunicipal, pattern),
        ilike(personasTable.dni, pattern),
        ilike(personasTable.cuitCuil, pattern),
      )!);
    }

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const [rows, countRows] = await Promise.all([
      db
        .select({
          matricula: matriculasTable,
          persona: personasTable,
        })
        .from(matriculasTable)
        .innerJoin(personasTable, eq(matriculasTable.personaId, personasTable.id))
        .where(whereClause)
        .orderBy(desc(matriculasTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(matriculasTable)
        .innerJoin(personasTable, eq(matriculasTable.personaId, personasTable.id))
        .where(whereClause),
    ]);

    return res.json({
      items: rows.map((row) => ({
        ...row.matricula,
        persona: row.persona,
      })),
      total: countRows[0]?.count ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    if (isMissingTramitesTableError(error)) {
      return res.status(503).json({
        error: "Esquema tramites no disponible",
        details: "Ejecutá lib/db/sql/tramites_registro_schema.sql o pnpm --filter @workspace/db run push",
      });
    }
    return res.status(500).json({
      error: "No se pudo listar matrículas",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.get("/tramites/matriculas/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const rows = await db
      .select({
        matricula: matriculasTable,
        persona: personasTable,
      })
      .from(matriculasTable)
      .innerJoin(personasTable, eq(matriculasTable.personaId, personasTable.id))
      .where(eq(matriculasTable.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return res.status(404).json({ error: "Matrícula no encontrada" });
    }

    const avales = await db
      .select()
      .from(avalesTable)
      .where(eq(avalesTable.matriculaAvaladaId, id));

    return res.json({
      ...row.matricula,
      persona: row.persona,
      avales,
    });
  } catch (error) {
    if (isMissingTramitesTableError(error)) {
      return res.status(503).json({
        error: "Esquema tramites no disponible",
        details: "Ejecutá lib/db/sql/tramites_registro_schema.sql",
      });
    }
    return res.status(500).json({
      error: "No se pudo obtener la matrícula",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.post("/tramites/matriculas", async (req, res) => {
  try {
    const parsed = createMatriculaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });
    }

    const input = parsed.data;
    const nombreCompleto = buildNombreCompleto({
      esJuridica: input.persona.esJuridica,
      apellido: input.persona.apellido,
      nombres: input.persona.nombres,
      razonSocial: input.persona.razonSocial,
    });

    if (!nombreCompleto) {
      return res.status(400).json({ error: "No se pudo determinar el nombre completo" });
    }

    const matriculaMunicipal = input.matriculaMunicipal?.trim()
      || await suggestNextMatricula(input.tipoRegistro);

    const result = await db.transaction(async (tx) => {
      const [persona] = await tx
        .insert(personasTable)
        .values({
          esJuridica: input.persona.esJuridica,
          apellido: input.persona.apellido ?? null,
          nombres: input.persona.nombres ?? null,
          razonSocial: input.persona.razonSocial ?? null,
          nombreCompleto,
          dni: input.persona.dni ?? null,
          cuitCuil: input.persona.cuitCuil ?? null,
          dniPendiente: !input.persona.dni,
          domicilioCalle: input.persona.domicilioCalle ?? null,
          domicilioNumero: input.persona.domicilioNumero ?? null,
          domicilioLocalidad: input.persona.domicilioLocalidad ?? "Colón",
          domicilioProvincia: input.persona.domicilioProvincia ?? "Entre Ríos",
          telefono: input.persona.telefono ?? null,
          email: input.persona.email || null,
          origen: "alta_sistema",
        })
        .returning();

      const [matricula] = await tx
        .insert(matriculasTable)
        .values({
          personaId: persona.id,
          tipoRegistro: input.tipoRegistro,
          tipoProfesional: input.tipoProfesional ?? null,
          especializacion: input.especializacion ?? null,
          matriculaMunicipal,
          matriculaColegio: input.matriculaColegio ?? null,
          colegioProfesional: input.colegioProfesional ?? null,
          representanteTecnicoPersonaId: input.representanteTecnicoPersonaId ?? null,
          representanteTecnicoTitulo: input.representanteTecnicoTitulo ?? null,
          observaciones: input.observaciones ?? null,
          estado: "pendiente_documentacion",
          fechaInscripcion: new Date().toISOString().slice(0, 10),
        })
        .returning();

      const avales = [];
      if (input.avales?.length) {
        for (const aval of input.avales) {
          const [created] = await tx
            .insert(avalesTable)
            .values({
              matriculaAvaladaId: matricula.id,
              personaAvalistaId: aval.personaAvalistaId ?? null,
              nombreAvalistaTexto: aval.nombreAvalistaTexto ?? null,
              fechaAval: aval.fechaAval ?? null,
            })
            .returning();
          avales.push(created);
        }
      }

      return { persona, matricula, avales };
    });

    return res.status(201).json({
      message: "Inscripción registrada correctamente",
      ...result.matricula,
      persona: result.persona,
      avales: result.avales,
    });
  } catch (error) {
    if (isMissingTramitesTableError(error)) {
      return res.status(503).json({
        error: "Esquema tramites no disponible",
        details: "Ejecutá lib/db/sql/tramites_registro_schema.sql",
      });
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.toLowerCase().includes("unique") || message.toLowerCase().includes("duplicate")) {
      return res.status(409).json({
        error: "La matrícula municipal ya existe",
        details: message,
      });
    }

    return res.status(500).json({
      error: "No se pudo registrar la inscripción",
      details: message,
    });
  }
});

router.patch("/tramites/matriculas/:id/estado", async (req, res) => {
  try {
    const parsed = updateMatriculaEstadoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });
    }

    const { estado, motivoBaja, ultimoPagoAnio } = parsed.data;
    const [updated] = await db
      .update(matriculasTable)
      .set({
        estado,
        motivoBaja: estado === "baja" ? (motivoBaja ?? null) : null,
        fechaBaja: estado === "baja" ? new Date().toISOString().slice(0, 10) : null,
        ultimoPagoAnio: ultimoPagoAnio ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(matriculasTable.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Matrícula no encontrada" });
    }

    return res.json(updated);
  } catch (error) {
    if (isMissingTramitesTableError(error)) {
      return res.status(503).json({ error: "Esquema tramites no disponible" });
    }
    return res.status(500).json({
      error: "No se pudo actualizar el estado",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
