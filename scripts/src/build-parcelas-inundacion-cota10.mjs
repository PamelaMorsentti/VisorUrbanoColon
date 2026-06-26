import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { area, bbox, booleanIntersects, buffer, featureCollection, intersect, union } from "@turf/turf";

function ringsFromGeometry(geometry) {
  if (!geometry) return [];
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  return [];
}

function isClosedRing(coords) {
  if (!Array.isArray(coords) || coords.length < 4) return false;
  const first = coords[0];
  const last = coords[coords.length - 1];
  return (
    Math.abs(first[0] - last[0]) < 1e-10 &&
    Math.abs(first[1] - last[1]) < 1e-10
  );
}

function bboxOverlap(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function unionMany(features) {
  if (!features.length) return null;
  let merged = features[0];
  for (let i = 1; i < features.length; i += 1) {
    try {
      const u = union(featureCollection([merged, features[i]]));
      if (u) merged = u;
    } catch {
      // Skip invalid topological merge candidates and keep the valid merged geometry.
    }
  }
  return merged;
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(scriptDir, "..", "..");

  const dataDir = path.join(root, "artifacts", "colon-3d", "public", "data");
  const parcelaPath = path.join(dataDir, "Parcela.geojson");
  const cNivelPath = path.join(dataDir, "c_nivel.geojson");
  const outPath = path.join(dataDir, "parcela_inundacion_cota10.geojson");
  const outSummaryPath = path.join(root, "docs", "parcela_inundacion_cota10_resumen.json");

  const [parcelaRaw, cNivelRaw] = await Promise.all([
    fs.readFile(parcelaPath, "utf8"),
    fs.readFile(cNivelPath, "utf8"),
  ]);

  const parcela = JSON.parse(parcelaRaw);
  const cNivel = JSON.parse(cNivelRaw);

  const lowContourLines = (cNivel.features || []).filter((f) => {
    const z = Number(f?.properties?.Z ?? f?.properties?.COTA);
    const t = f?.geometry?.type;
    return Number.isFinite(z) && z <= 10 && (t === "LineString" || t === "MultiLineString");
  });

  const lowClosedPolygons = [];
  for (const f of lowContourLines) {

    const rings = ringsFromGeometry(f.geometry);
    for (const ring of rings) {
      if (!isClosedRing(ring)) continue;
      const z = Number(f?.properties?.Z ?? f?.properties?.COTA ?? null);
      lowClosedPolygons.push({
        type: "Feature",
        properties: {
          fuente_curva_id: f?.properties?.CURVA_ID ?? null,
          nombre: f?.properties?.NOMBRE ?? "",
          codigo: f?.properties?.CODIGO ?? null,
          z,
        },
        geometry: {
          type: "Polygon",
          coordinates: [ring],
        },
      });
    }
  }

  if (!lowContourLines.length) {
    throw new Error("No se encontraron curvas de nivel con Z <= 10 en c_nivel.geojson");
  }

  const networkPolygons = [];
  const floodCandidates = lowClosedPolygons.filter((f) => {
    try {
      return area(f) > 1;
    } catch {
      return false;
    }
  });

  const lowPolyWithBbox = floodCandidates.map((feature) => ({ feature, bbox: bbox(feature) }));
  const lowPolyExtent = floodCandidates.length ? bbox(featureCollection(floodCandidates)) : null;
  const lowLineWithBbox = lowContourLines.map((feature) => ({ feature, bbox: bbox(feature) }));

  // Support open contour segments by a narrow buffer so parcels touched by
  // cotas <= 10 are also classified as afectadas (at least parcial).
  const OPEN_CONTOUR_BUFFER_M = 3;
  const lowLineMask = buffer(featureCollection(lowContourLines), OPEN_CONTOUR_BUFFER_M, { units: "meters" });
  const lowLineExtent = bbox(lowLineMask);

  const affected = [];
  let total = 0;
  let parcial = 0;

  for (const parcel of parcela.features || []) {
    const gType = parcel?.geometry?.type;
    if (gType !== "Polygon" && gType !== "MultiPolygon") continue;

    const parcelArea = area(parcel);
    if (!Number.isFinite(parcelArea) || parcelArea <= 0) continue;

    const pBbox = bbox(parcel);
    const hitsPolyExtent = lowPolyExtent ? bboxOverlap(pBbox, lowPolyExtent) : false;
    const hitsLineExtent = bboxOverlap(pBbox, lowLineExtent);
    if (!hitsPolyExtent && !hitsLineExtent) continue;

    const parcelIntersections = [];
    let touchesLowContourLine = false;
    if (hitsPolyExtent) {
      for (const poly of lowPolyWithBbox) {
        if (!bboxOverlap(pBbox, poly.bbox)) continue;
        let inter = null;
        try {
          inter = intersect(featureCollection([parcel, poly.feature]));
        } catch {
          inter = null;
        }
        if (inter) parcelIntersections.push(inter);
      }
    }

    if (hitsLineExtent) {
      let interLine = null;
      try {
        interLine = intersect(featureCollection([parcel, lowLineMask]));
      } catch {
        interLine = null;
      }
      if (interLine) parcelIntersections.push(interLine);

      // If a parcel touches any Z<=10 contour line, classify at least as parcial
      // even when area-based polygon inference is not possible.
      for (const line of lowLineWithBbox) {
        if (!bboxOverlap(pBbox, line.bbox)) continue;
        try {
          if (booleanIntersects(parcel, line.feature)) {
            touchesLowContourLine = true;
            break;
          }
        } catch {
          // Continue evaluating next line candidate.
        }
      }
    }

    if (!parcelIntersections.length && !touchesLowContourLine) continue;

    let floodedArea = 0;
    if (parcelIntersections.length === 1) {
      floodedArea = area(parcelIntersections[0]);
    } else {
      const mergedIntersections = unionMany(parcelIntersections);
      if (mergedIntersections) {
        floodedArea = area(mergedIntersections);
      } else {
        // Fallback: sum and clamp to parcel area if topological merge fails.
        floodedArea = Math.min(
          parcelArea,
          parcelIntersections.reduce((acc, f) => acc + Math.max(0, area(f)), 0),
        );
      }
    }

    if (floodedArea <= 0 && touchesLowContourLine) {
      floodedArea = 1;
    }
    if (floodedArea <= 0) continue;

    const ratio = Math.min(1, floodedArea / parcelArea);
    const afectacion = ratio >= 0.98 ? "total" : "parcial";
    if (afectacion === "total") total += 1;
    else parcial += 1;

    affected.push({
      type: "Feature",
      properties: {
        ...(parcel.properties || {}),
        inund_cota_ref_m: 10,
        inund_fuente: "c_nivel: curvas con Z <= 10,00 m (inclusive)",
        inund_afectacion: afectacion,
        inund_area_m2: Number(floodedArea.toFixed(2)),
        inund_ratio: Number(ratio.toFixed(4)),
      },
      geometry: parcel.geometry,
    });
  }

  const out = {
    type: "FeatureCollection",
    features: affected,
  };

  await fs.writeFile(outPath, JSON.stringify(out));

  const summary = {
    generatedAt: new Date().toISOString(),
    input: {
      parcelas: (parcela.features || []).length,
      cNivelLinesZLe10: lowContourLines.length,
      cNivelClosedRingsZLe10: lowClosedPolygons.length,
      floodPolygonsFromNetwork: networkPolygons.length,
      floodPolygonsUsed: floodCandidates.length,
      openContourBufferMeters: OPEN_CONTOUR_BUFFER_M,
    },
    output: {
      parcelasAfectadas: affected.length,
      total,
      parcial,
      criterio: "interseccion de area de parcela con mascara de curvas Z<=10 (anillos cerrados + buffer de lineas abiertas)",
      cotaReferencia: "+10.00 m",
    },
  };

  await fs.writeFile(outSummaryPath, JSON.stringify(summary, null, 2));

  console.log(`OK: ${outPath}`);
  console.log(`Parcelas afectadas: ${affected.length} (total=${total}, parcial=${parcial})`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
