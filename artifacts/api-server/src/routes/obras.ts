import { promises as fs } from "node:fs";
import path from "node:path";
import { Router, type IRouter } from "express";

const router: IRouter = Router();

type PublicationLevel = "public" | "professional" | "admin";

function parseLevel(value: unknown): PublicationLevel {
  if (value === "professional" || value === "admin") return value;
  return "public";
}

function candidatePlanosDirs(): string[] {
  const cwd = process.cwd();
  return [
    path.resolve(cwd, "..", "colon-3d", "public", "data", "planos"),
    path.resolve(cwd, "artifacts", "colon-3d", "public", "data", "planos"),
    path.resolve(cwd, "..", "..", "artifacts", "colon-3d", "public", "data", "planos"),
  ];
}

async function resolveDatasetPath(level: PublicationLevel): Promise<string> {
  const fileName = `obras-${level}.geojson`;
  for (const dir of candidatePlanosDirs()) {
    const candidate = path.join(dir, fileName);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  throw new Error(`No se encontró dataset ${fileName} en rutas esperadas`);
}

router.get("/obras/points", async (req, res) => {
  try {
    const level = parseLevel(req.query.level);
    const datasetPath = await resolveDatasetPath(level);
    const raw = await fs.readFile(datasetPath, "utf8");
    const data = JSON.parse(raw) as { type?: string; features?: unknown[] };

    if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) {
      return res.status(500).json({
        error: "Dataset inválido",
        details: "El archivo de obras no tiene formato GeoJSON FeatureCollection",
      });
    }

    return res.json({
      level,
      source: path.basename(datasetPath),
      data,
    });
  } catch (error) {
    return res.status(500).json({
      error: "No se pudo cargar dataset de Obras Privadas",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
