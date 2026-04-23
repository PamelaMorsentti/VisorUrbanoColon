import { Router, type IRouter } from "express";

const router: IRouter = Router();

const PNA_ALTURAS_URL = "https://contenidosweb.prefecturanaval.gob.ar/alturas/";
const CARU_ALTURAS_URL = "http://190.0.152.194:8080/alturas/web/user/alturas";
const CARU_ALTURAS_READABLE_URL =
  "https://r.jina.ai/http://190.0.152.194:8080/alturas/web/user/alturas";

const COLON_ALERT_LEVEL = 7.1;
const COLON_EVAC_LEVEL = 7.9;

type RiverStatus = "normal" | "vigilar" | "alerta" | "evacuar";

interface ColonHydrologyData {
  station: "Colon";
  river: "Uruguay";
  level: number;
  delta: number;
  trend: string;
  updatedAt: string;
  thresholds: {
    alert: number;
    evacuation: number;
    source: "Prefectura Naval Argentina";
  };
  status: RiverStatus;
  source: {
    provider: "CARU";
    mode: "direct-html" | "readable-fallback";
    urls: {
      caru: string;
      prefectura: string;
    };
  };
  fetchedAt: string;
}

router.get("/hydrology/colon", async (_req, res) => {
  try {
    const direct = await fetchWithTimeout(CARU_ALTURAS_URL, 10000);

    if (direct.ok) {
      const html = await direct.text();
      const parsed = parseColonFromHtml(html);
      if (parsed) {
        return res.json(buildResponse(parsed, "direct-html"));
      }
    }

    const fallback = await fetchWithTimeout(CARU_ALTURAS_READABLE_URL, 12000);
    if (!fallback.ok) {
      return res.status(502).json({
        error: "No se pudo consultar CARU",
        details: `HTTP ${fallback.status}`,
      });
    }

    const markdown = await fallback.text();
    const parsed = parseColonFromReadable(markdown);
    if (!parsed) {
      return res.status(502).json({
        error: "No se pudo parsear la estación Colón desde CARU",
      });
    }

    return res.json(buildResponse(parsed, "readable-fallback"));
  } catch (error) {
    return res.status(502).json({
      error: "Fallo al obtener hidrometría de Colón",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

function buildResponse(
  parsed: { level: number; delta: number; trend: string; updatedAt: string },
  mode: "direct-html" | "readable-fallback",
): ColonHydrologyData {
  const status = computeRiverStatus(parsed.level, COLON_ALERT_LEVEL, COLON_EVAC_LEVEL);

  return {
    station: "Colon",
    river: "Uruguay",
    level: parsed.level,
    delta: parsed.delta,
    trend: parsed.trend,
    updatedAt: parsed.updatedAt,
    thresholds: {
      alert: COLON_ALERT_LEVEL,
      evacuation: COLON_EVAC_LEVEL,
      source: "Prefectura Naval Argentina",
    },
    status,
    source: {
      provider: "CARU",
      mode,
      urls: {
        caru: CARU_ALTURAS_URL,
        prefectura: PNA_ALTURAS_URL,
      },
    },
    fetchedAt: new Date().toISOString(),
  };
}

function computeRiverStatus(level: number, alert: number, evacuation: number): RiverStatus {
  if (level >= evacuation) return "evacuar";
  if (level >= alert) return "alerta";
  if (level >= alert - 0.5) return "vigilar";
  return "normal";
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseColonFromHtml(html: string): { level: number; delta: number; trend: string; updatedAt: string } | null {
  const rowMatch = html.match(/<tr[^>]*>[\s\S]*?href="[^\"]*\/altura\/12"[^>]*>[\s\S]*?<\/tr>/i);
  if (!rowMatch) return null;

  const cells = Array.from(rowMatch[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map(m =>
    stripHtml(m[1]),
  );

  if (cells.length < 6) return null;

  const updatedAt = cells[1] || "S/D";
  const level = toNumber(cells[2]);
  const delta = toNumber(cells[3]);
  const trend = normalizeTrend(cells[5] || "S/D");

  if (Number.isNaN(level) || Number.isNaN(delta)) return null;
  return { level, delta, trend, updatedAt };
}

function parseColonFromReadable(markdown: string): { level: number; delta: number; trend: string; updatedAt: string } | null {
  const line = markdown
    .split("\n")
    .find(l => /\|\s*\[Col[oó]n\]\([^)]*\/altura\/12\)\s*\|/i.test(l));

  if (!line) return null;

  const cols = line.split("|").map(c => c.trim()).filter(Boolean);
  if (cols.length < 7) return null;

  const updatedAt = stripMarkdown(cols[1]);
  const level = toNumber(stripMarkdown(cols[2]));
  const delta = toNumber(stripMarkdown(cols[3]));
  const trend = normalizeTrend(stripMarkdown(cols[5]));

  if (Number.isNaN(level) || Number.isNaN(delta)) return null;
  return { level, delta, trend, updatedAt };
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripMarkdown(value: string): string {
  return value
    .replace(/\*\*/g, "")
    .replace(/\[(.*?)\]\([^)]*\)/g, "$1")
    .trim();
}

function toNumber(value: string): number {
  const clean = value.replace(/[^0-9,.-]/g, "");
  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(/,/g, ".")
    : clean;
  return Number(normalized);
}

function normalizeTrend(value: string): string {
  const v = value.toLowerCase();
  if (v.includes("crece")) return "Crece";
  if (v.includes("baja")) return "Baja";
  if (v.includes("estac")) return "Estacionado";
  return value || "S/D";
}

export default router;
