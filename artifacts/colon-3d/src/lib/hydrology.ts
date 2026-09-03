const CARU_ALTURAS_READABLE_URL = "https://r.jina.ai/http://190.0.152.194:8080/alturas/web/user/alturas";
const HYDROLOGY_404_COOLDOWN_MS = 5 * 60 * 1000;
const suppressedHydrologyApiUntil = new Map<string, number>();

export type ColonHydrologySnapshot = {
  level: number;
  delta: number | null;
  trend: string | null;
  updatedAt: string | null;
  source: "api" | "caru";
  alertLevel?: number;
  evacuationLevel?: number;
};

type HydrologyApiResponse = {
  level: number | string;
  delta?: number | string;
  trend?: string;
  updatedAt?: string;
  thresholds?: {
    alert?: number;
    evacuation?: number;
  };
};

function getHydrologyApiCandidates(apiBaseUrl: string): string[] {
  const urls: string[] = [];
  const base = apiBaseUrl.replace(/\/$/, "");
  if (base) urls.push(`${base}/api/hydrology/colon`);
  urls.push("/api/hydrology/colon");

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      urls.push("http://localhost:5180/api/hydrology/colon");
      urls.push("http://localhost:3000/api/hydrology/colon");
    }
  }

  return Array.from(new Set(urls));
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

function stripMarkdown(value: string): string {
  return value
    .replace(/\*\*/g, "")
    .replace(/\[(.*?)\]\([^)]*\)/g, "$1")
    .trim();
}

function parseSpanishNumber(value: string): number {
  const clean = value.replace(/[^0-9,.-]/g, "");
  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(/,/g, ".")
    : clean;
  return Number(normalized);
}

function extractColonRiverRow(markdown: string): { updatedAt: string; level: number; delta: number; trend: string } | null {
  const line = markdown
    .split("\n")
    .find((l) => /\|\s*\[Col[oó]n\]\([^)]*\)\s*\|/i.test(l));

  if (!line) return null;

  const cols = line.split("|").map((c) => c.trim()).filter(Boolean);
  if (cols.length < 7) return null;

  const updatedAt = stripMarkdown(cols[1]);
  const level = parseSpanishNumber(stripMarkdown(cols[2]));
  const delta = parseSpanishNumber(stripMarkdown(cols[3]));
  const trend = stripMarkdown(cols[5]);

  if (Number.isNaN(level) || Number.isNaN(delta)) return null;
  return { updatedAt, level, delta, trend };
}

export function formatHydrologyUpdatedAt(raw: string | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.trim() || null;
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function fetchColonHydrology(apiBaseUrl = ""): Promise<ColonHydrologySnapshot | null> {
  const now = Date.now();
  const candidates = getHydrologyApiCandidates(apiBaseUrl)
    .filter((url) => (suppressedHydrologyApiUntil.get(url) ?? 0) <= now);

  for (const url of candidates) {
    try {
      const res = await fetchJsonWithTimeout(url, 10000);
      if (!res.ok) {
        if (res.status === 404) {
          suppressedHydrologyApiUntil.set(url, Date.now() + HYDROLOGY_404_COOLDOWN_MS);
        }
        continue;
      }

      const data = await res.json() as HydrologyApiResponse;
      const level = Number(data.level);
      if (!Number.isFinite(level)) continue;

      const delta = data.delta == null ? null : Number(data.delta);
      return {
        level,
        delta: Number.isFinite(delta ?? NaN) ? (delta as number) : null,
        trend: data.trend ?? null,
        updatedAt: formatHydrologyUpdatedAt(data.updatedAt),
        source: "api",
        alertLevel: data.thresholds?.alert,
        evacuationLevel: data.thresholds?.evacuation,
      };
    } catch {
      // Try next candidate.
    }
  }

  try {
    const res = await fetchJsonWithTimeout(CARU_ALTURAS_READABLE_URL, 12000);
    if (!res.ok) return null;

    const text = await res.text();
    const row = extractColonRiverRow(text);
    if (!row || !Number.isFinite(row.level)) return null;

    return {
      level: row.level,
      delta: Number.isFinite(row.delta) ? row.delta : null,
      trend: row.trend || null,
      updatedAt: formatHydrologyUpdatedAt(row.updatedAt),
      source: "caru",
    };
  } catch {
    return null;
  }
}
