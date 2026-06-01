import { promises as fs } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

type RawRow = {
  geom?: string;
  tension?: string;
  geojson?: string;
};

type Geometry = {
  type: string;
  coordinates: unknown;
};

type Feature = {
  type: "Feature";
  geometry: Geometry;
  properties: Record<string, unknown>;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: Feature[];
};

function toNumberOrNull(value: unknown): number | null {
  const parsed = Number(String(value ?? "").replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function updateBounds(coords: unknown, bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number }): void {
  if (!Array.isArray(coords)) return;
  if (coords.length === 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
    const lon = coords[0];
    const lat = coords[1];
    if (lon < bounds.minLon) bounds.minLon = lon;
    if (lat < bounds.minLat) bounds.minLat = lat;
    if (lon > bounds.maxLon) bounds.maxLon = lon;
    if (lat > bounds.maxLat) bounds.maxLat = lat;
    return;
  }
  for (const nested of coords) {
    updateBounds(nested, bounds);
  }
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const root = path.resolve(cwd, "..");

  const inputArg = process.argv[2]
    ?? path.join(root, "redes-de-distribucin-elctrica-del-consejo-federal-entre-ros-media-tensin-lneas (1).csv");

  const outputArg = process.argv[3]
    ?? path.join(root, "artifacts", "colon-3d", "public", "data", "enersa_mt_lineas.geojson");

  const inputPath = path.resolve(cwd, inputArg);
  const outputPath = path.resolve(cwd, outputArg);

  const raw = await fs.readFile(inputPath, "utf8");
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as RawRow[];

  const features: Feature[] = [];
  let skipped = 0;

  const bounds = {
    minLon: Number.POSITIVE_INFINITY,
    minLat: Number.POSITIVE_INFINITY,
    maxLon: Number.NEGATIVE_INFINITY,
    maxLat: Number.NEGATIVE_INFINITY,
  };

  for (const row of rows) {
    if (!row.geojson) {
      skipped += 1;
      continue;
    }

    try {
      const parsedGeometry = JSON.parse(row.geojson) as Geometry;
      if (!parsedGeometry?.type || parsedGeometry.coordinates === undefined) {
        skipped += 1;
        continue;
      }

      const tensionKv = toNumberOrNull(row.tension);
      const feature: Feature = {
        type: "Feature",
        geometry: parsedGeometry,
        properties: {
          tension_kv: tensionKv,
          tension_raw: row.tension ?? null,
          source: "ENERSA",
          dataset: "redes-distribucion-media-tension",
        },
      };

      updateBounds(parsedGeometry.coordinates, bounds);
      features.push(feature);
    } catch {
      skipped += 1;
    }
  }

  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(fc));

  console.log(`Input: ${inputPath}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Features: ${features.length}`);
  console.log(`Skipped: ${skipped}`);

  if (features.length > 0 && Number.isFinite(bounds.minLon)) {
    console.log(`Bounds: [${bounds.minLon}, ${bounds.minLat}] .. [${bounds.maxLon}, ${bounds.maxLat}]`);
  }
}

void main();
