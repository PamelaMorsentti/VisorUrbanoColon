import { promises as fs } from "node:fs";
import path from "node:path";
import { bbox, featureCollection, length, lineString, union } from "@turf/turf";

function ensureClosed(coords) {
  if (coords.length < 2) return coords;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return coords;
  return [...coords, first];
}

function largestPolygonFromGeometry(geometry) {
  if (geometry.type === "Polygon") {
    return geometry.coordinates;
  }
  if (geometry.type === "MultiPolygon") {
    let best = null;
    let bestSize = 0;
    for (const poly of geometry.coordinates) {
      const n = poly[0]?.length ?? 0;
      if (n > bestSize) {
        bestSize = n;
        best = poly;
      }
    }
    if (!best) throw new Error("No polygon found in MultiPolygon");
    return best;
  }
  throw new Error(`Unexpected geometry type: ${geometry.type}`);
}

async function buildUnion(polys) {
  let result = polys[0];
  for (let i = 1; i < polys.length; i++) {
    const merged = union(featureCollection([result, polys[i]]));
    if (merged) result = merged;
  }
  return result;
}

async function main() {
  const root = path.resolve(process.cwd(), "..");
  const dataDir = path.join(root, "artifacts", "colon-3d", "public", "data");

  const [currentRaw, manzanaRaw] = await Promise.all([
    fs.readFile(path.join(dataDir, "jurisdiccion_municipal.geojson"), "utf8"),
    fs.readFile(path.join(dataDir, "manzana.geojson"), "utf8"),
  ]);

  const current = JSON.parse(currentRaw);
  const currentCoords = current.features[0].geometry.coordinates;
  const currentLine = lineString(ensureClosed(currentCoords));

  const manzana = JSON.parse(manzanaRaw);
  const manzanaPolys = manzana.features.filter(
    (f) => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"),
  );
  const manzanaUnion = await buildUnion(manzanaPolys);
  const biggest = largestPolygonFromGeometry(manzanaUnion.geometry);
  const outer = ensureClosed(biggest[0]);
  const manzanaLine = lineString(outer);

  const currentBbox = bbox(currentLine);
  const manzanaBbox = bbox(manzanaLine);

  console.log("CURRENT jurisdiccion:");
  console.log("  vertices:", currentCoords.length);
  console.log("  bbox:", currentBbox.map((n) => n.toFixed(5)).join(", "));
  console.log("  length_km:", length(currentLine, { units: "kilometers" }).toFixed(2));

  console.log("MANZANA outer perimeter:");
  console.log("  vertices:", outer.length);
  console.log("  bbox:", manzanaBbox.map((n) => n.toFixed(5)).join(", "));
  console.log("  length_km:", length(manzanaLine, { units: "kilometers" }).toFixed(2));
}

await main();
