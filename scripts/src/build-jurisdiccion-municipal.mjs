import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { area, featureCollection, union, buffer, simplify, intersect } from "@turf/turf";

/** Extract all exterior rings so detached urban polygons are preserved */
function exteriorRingsAsLine(feature, props) {
  const geom = feature.geometry;
  if (geom.type === "Polygon") {
    return {
      type: "Feature",
      geometry: { type: "LineString", coordinates: geom.coordinates[0] },
      properties: props,
    };
  }
  if (geom.type === "MultiPolygon") {
    const rings = geom.coordinates.map((poly) => poly[0]).filter(Boolean);
    if (rings.length === 1) {
      return {
        type: "Feature",
        geometry: { type: "LineString", coordinates: rings[0] },
        properties: props,
      };
    }
    return {
      type: "Feature",
      geometry: { type: "MultiLineString", coordinates: rings },
      properties: props,
    };
  }
  throw new Error(`Unexpected geometry type: ${geom.type}`);
}

function countVertices(geometry) {
  if (geometry.type === "LineString") return geometry.coordinates.length;
  if (geometry.type === "MultiLineString") {
    return geometry.coordinates.reduce((sum, line) => sum + line.length, 0);
  }
  return 0;
}

function pointInBBox([x, y], [minX, minY, maxX, maxY]) {
  return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

function sqDist(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function findNearestIndex(coords, target) {
  let bestI = -1;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < coords.length; i++) {
    const d = sqDist(coords[i], target);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  return bestI;
}

function dedupeSequential(coords) {
  if (coords.length < 2) return coords;
  const out = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const prev = out[out.length - 1];
    const curr = coords[i];
    if (prev[0] !== curr[0] || prev[1] !== curr[1]) out.push(curr);
  }
  return out;
}

/**
 * Reemplaza un tramo entre dos anclas por una polilinea de guia.
 * Se usa para forzar que el borde SE siga la forma observada en Manzanas.
 */
function replaceSegmentByAnchors(coords, startAnchor, endAnchor, replacement) {
  const a = findNearestIndex(coords, startAnchor);
  const b = findNearestIndex(coords, endAnchor);
  if (a < 0 || b < 0 || a === b) return coords;

  const start = Math.min(a, b);
  const end = Math.max(a, b);
  const out = [
    ...coords.slice(0, start),
    ...replacement,
    ...coords.slice(end + 1),
  ];
  return dedupeSequential(out);
}

/**
 * Remove staircase-like artifacts inside a small bbox by replacing
 * the local polyline chunk with a direct segment from entry to exit.
 */
function straightenLineChunkInBBox(coords, bbox) {
  const indices = [];
  for (let i = 0; i < coords.length; i++) {
    if (pointInBBox(coords[i], bbox)) indices.push(i);
  }
  if (indices.length < 3) return coords;

  const start = indices[0];
  const end = indices[indices.length - 1];
  if (end <= start + 1) return coords;

  return [...coords.slice(0, start + 1), ...coords.slice(end)];
}

/**
 * Remove ALL vertices inside a bbox (e.g. a rectangular notch that sticks
 * outward from the perimeter), connecting the two outside neighbours directly.
 */
function removeChunkInBBox(coords, bbox) {
  return coords.filter(pt => !pointInBBox(pt, bbox));
}

function applyTargetedPerimeterFixes(feature) {
  if (feature.geometry.type !== "LineString") return feature;

  let coords = feature.geometry.coordinates;

  // Dos sectores puntuales (Oeste) marcados por el usuario.
  // Ajuste quirurgico: solo se endereza el tramo dentro de cada bbox.
  const fixBBoxes = [
    [-58.2980, -32.2844, -58.2898, -32.2819],
    [-58.2860, -32.2842, -58.2738, -32.2825],
  ];

  for (const bbox of fixBBoxes) {
    coords = straightenLineChunkInBBox(coords, bbox);
  }

  // Sector SE: protuberancia rectangular hacia el este (vértices 695-699 antes del fix).
  // Se eliminan todos los vértices dentro del bbox, conectando directamente los extremos.
  // Además, se elimina un codo residual cercano (lat ~-32.295) para evitar el gancho visible.
  const removeBBoxes = [
    [-58.191, -32.315, -58.184, -32.304],
    [-58.176, -32.296, -58.169, -32.293],
  ];

  for (const bbox of removeBBoxes) {
    coords = removeChunkInBBox(coords, bbox);
  }

  // Sector SE (costa rio Uruguay): la brecha entre seccion 17 y seccion 18 crea una
  // "U" invertida (concavidad interna) en el limite costero sur de lat ~-32.294 a -32.298.
  // Se endereza ese tramo conectando directamente el borde de entrada con el de salida.
  const seCoastFixes = [
    [-58.188, -32.298, -58.173, -32.292],
  ];
  for (const bbox of seCoastFixes) {
    coords = straightenLineChunkInBBox(coords, bbox);
  }

  // Sector SE: forzar alineacion con la forma de Manzanas en el tramo
  // donde aparece el salto diagonal (lat ~ -32.296 a -32.287).
  coords = replaceSegmentByAnchors(
    coords,
    [-58.178216, -32.295688],
    [-58.163262, -32.288460],
    [
      [-58.178216, -32.295688],
      [-58.174422, -32.294881],
      [-58.170549, -32.293906],
      [-58.170102, -32.292205],
      [-58.169462, -32.289904],
      [-58.162771, -32.287032],
      [-58.163274, -32.288457],
      [-58.163262, -32.288460],
    ],
  );

  return {
    ...feature,
    geometry: {
      ...feature.geometry,
      coordinates: coords,
    },
  };
}

async function buildUnion(polys) {
  let result = polys[0];
  for (let i = 1; i < polys.length; i++) {
    const res = union(featureCollection([result, polys[i]]));
    if (res) result = res;
  }
  return result;
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(scriptDir, "..", "..");
  const dataDir = path.join(root, "artifacts", "colon-3d", "public", "data");

  const [seccionRaw, grupoRaw, manzanaRaw, barriosRaw] = await Promise.all([
    fs.readFile(path.join(dataDir, "seccion.geojson"), "utf8"),
    fs.readFile(path.join(dataDir, "grupo.geojson"), "utf8"),
    fs.readFile(path.join(dataDir, "manzana.geojson"), "utf8"),
    fs.readFile(path.join(dataDir, "barrios.geojson"), "utf8"),
  ]);
  const seccion = JSON.parse(seccionRaw);
  const grupo = JSON.parse(grupoRaw);
  const manzana = JSON.parse(manzanaRaw);
  const barrios = JSON.parse(barriosRaw);

  // 1. Union de secciones -> define el ejido completo
  const seccionPolys = seccion.features.filter(
    (f) => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"),
  );
  if (seccionPolys.length === 0) throw new Error("Sin poligonos de seccion");

  console.log(`Uniendo ${seccionPolys.length} secciones catastrales...`);
  const seccionUnion = await buildUnion(seccionPolys);

  // 2. Recortar grupos y manzanas al ejido (barrios se incluyen completos)
  function clipToEjido(features) {
    return features
      .filter((f) => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"))
      .map((f) => { try { return intersect(featureCollection([f, seccionUnion])); } catch { return null; } })
      .filter(Boolean);
  }
  const gruposClipped = clipToEjido(grupo.features);
  const manzanasClipped = clipToEjido(manzana.features);
  const barriosPolys = barrios.features.filter(
    (f) => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"),
  );
  console.log(`Grupos clipeados: ${gruposClipped.length}/${grupo.features.length}`);
  console.log(`Manzanas clipeadas: ${manzanasClipped.length}/${manzana.features.length}`);
  console.log(`Barrios incluidos completos: ${barriosPolys.length}/${barrios.features.length}`);

  // 3. Union final: secciones + grupos + manzanas + barrios
  const allPolys = [seccionUnion, ...gruposClipped, ...manzanasClipped, ...barriosPolys];
  const unioned = await buildUnion(allPolys);

  // 4. Buffer +/- para cerrar micro-huecos residuales, luego simplificar
  const BUFFER_DEG = 0.0002;
  const expanded = buffer(unioned, BUFFER_DEG, { units: "degrees" });
  const restored = buffer(expanded, -BUFFER_DEG, { units: "degrees" });
  const simplified = simplify(restored, { tolerance: 0.00005, highQuality: true, mutate: false });

  // 4b. Conservamos el resultado simplificado compuesto (sin re-union con seccion original)
  // para evitar volver a introducir quiebres de borde costero presentes en seccion.
  const finalUnion = simplified;

  // Exportar anillos exteriores
  const jurisdiccion = exteriorRingsAsLine(finalUnion, {
    tipo: "jurisdiccion_municipal",
    label: "Jurisdiccion Municipal",
    source_union: "seccion+grupo+manzana+barrios",
  });

  const jurisdiccionFixed = applyTargetedPerimeterFixes(jurisdiccion);

  // 5. Guardar resultado
  const combined = featureCollection([jurisdiccionFixed]);
  const outPath = path.join(dataDir, "jurisdiccion_municipal.geojson");
  await fs.writeFile(outPath, JSON.stringify(combined));

  console.log(`\nArchivo generado: ${outPath}`);
  console.log(`  Jurisdiccion: ${jurisdiccionFixed.geometry.type} (${countVertices(jurisdiccionFixed.geometry)} vertices)`);
  console.log("  Regla: secciones + grupos + manzanas(clipeados) + barrios(completos) + buffer+-0.0002 + simplify");
}

await main();
