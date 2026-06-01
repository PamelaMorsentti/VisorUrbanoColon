import { promises as fs } from "node:fs";
import path from "node:path";
import {
  bbox,
  bboxClip,
  booleanPointInPolygon,
  featureCollection,
  lineString,
  union,
} from "@turf/turf";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Strip Z coordinate so turf v7 doesn't choke on 3D points */
function to2d(coords) {
  return coords.map((c) => [c[0], c[1]]);
}

function coordsBounds(coords) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of coords) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

function boundsOverlap(a, b) {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

function tensionClass(value) {
  const n = Number(String(value ?? "").replace(",", ".").trim());
  if (!Number.isFinite(n)) return "other";
  if (Math.abs(n - 13.2) < 0.01) return "13.2";
  if (Math.abs(n - 33) < 0.01) return "33";
  if (Math.abs(n - 132) < 0.01) return "132";
  return "other";
}

function midpointInPoly(coords, poly) {
  const midIdx = Math.floor(coords.length / 2);
  // Use the middle vertex as a quick proxy for midpoint
  const [lon, lat] = coords[midIdx];
  const pt = { type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: {} };
  return booleanPointInPolygon(pt, poly);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const root = path.resolve(process.cwd(), "..");
  const dataDir = path.join(root, "artifacts", "colon-3d", "public", "data");

  const [enersaRaw, seccionRaw] = await Promise.all([
    fs.readFile(path.join(dataDir, "enersa_mt_lineas.geojson"), "utf8"),
    fs.readFile(path.join(dataDir, "seccion.geojson"), "utf8"),
  ]);

  const enersa = JSON.parse(enersaRaw);
  const seccion = JSON.parse(seccionRaw);

  // Build ejido polygon: union of all secciones catastrales
  const seccionPolys = seccion.features.filter(
    (f) => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"),
  );
  if (seccionPolys.length === 0) throw new Error("No hay polígonos en seccion.geojson");

  console.log(`Uniendo ${seccionPolys.length} secciones para construir límite del ejido…`);
  let ejido = seccionPolys[0];
  for (let i = 1; i < seccionPolys.length; i++) {
    const res = union(featureCollection([ejido, seccionPolys[i]]));
    if (res) ejido = res;
  }

  const ejidoBB = bbox(ejido);
  const ejidoBounds = { minX: ejidoBB[0], minY: ejidoBB[1], maxX: ejidoBB[2], maxY: ejidoBB[3] };

  console.log(`Ejido construido. Bbox: ${ejidoBB.map((n) => n.toFixed(5)).join(", ")}`);
  console.log(`Procesando ${enersa.features.length} features ENERSA…`);

  const clippedAll = [];
  const clipped132 = [];
  const clipped33 = [];
  const clipped13 = [];

  let processed = 0;
  let discardedByBounds = 0;

  for (const feature of enersa.features) {
    if (!feature.geometry) continue;

    const rawLines =
      feature.geometry.type === "LineString"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates; // MultiLineString

    for (const rawCoords of rawLines) {
      if (!rawCoords || rawCoords.length < 2) continue;

      const coords = to2d(rawCoords);
      const lb = coordsBounds(coords);

      if (!boundsOverlap(lb, ejidoBounds)) {
        discardedByBounds++;
        continue;
      }

      // Fast bbox clip first
      const ls = lineString(coords, feature.properties);
      const clippedResult = bboxClip(ls, ejidoBB);
      const clippedCoords = clippedResult?.geometry?.coordinates;
      if (!clippedCoords || clippedCoords.length < 2) continue;

      // Check midpoint vertex is inside the ejido polygon
      if (!midpointInPoly(clippedCoords, ejido)) continue;

      const outFeature = {
        type: "Feature",
        geometry: { type: "LineString", coordinates: clippedCoords },
        properties: {
          ...(feature.properties ?? {}),
          clipped_to: "colon_ejido_secciones",
        },
      };

      clippedAll.push(outFeature);
      const t = tensionClass(
        outFeature.properties.tension_kv ??
        outFeature.properties.tension_raw ??
        outFeature.properties.tension,
      );
      if (t === "132") clipped132.push(outFeature);
      if (t === "33") clipped33.push(outFeature);
      if (t === "13.2") clipped13.push(outFeature);

      processed++;
    }
  }

  // Write outputs
  const outFiles = [
    ["enersa_mt_colon.geojson", clippedAll],
    ["enersa_mt_132_colon.geojson", clipped132],
    ["enersa_mt_33_colon.geojson", clipped33],
    ["enersa_mt_13_2_colon.geojson", clipped13],
  ];

  for (const [name, features] of outFiles) {
    await fs.writeFile(path.join(dataDir, name), JSON.stringify(featureCollection(features)));
  }

  // Also export the computed ejido boundary for optional display
  await fs.writeFile(
    path.join(dataDir, "ejido_secciones.geojson"),
    JSON.stringify(featureCollection([ejido])),
  );

  console.log("\nRecorte completo:");
  console.log(`  Candidatas procesadas: ${processed}`);
  console.log(`  Descartadas por bbox:  ${discardedByBounds}`);
  console.log(`  Total recortadas:      ${clippedAll.length}`);
  console.log(`  132 kV:                ${clipped132.length}`);
  console.log(`   33 kV:                ${clipped33.length}`);
  console.log(`  13.2 kV:               ${clipped13.length}`);
}

await main();
