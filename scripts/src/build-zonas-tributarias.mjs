import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  area,
  bbox,
  bboxClip,
  bboxPolygon,
  booleanPointInPolygon,
  buffer,
  centroid,
  difference,
  featureCollection,
  intersect,
  polygonToLine,
  polygonize,
  union,
} from "@turf/turf";

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/gi, " ")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hasAllTokens(text, tokens) {
  return tokens.every((token) => text.includes(token));
}

function unionMany(features) {
  if (!features.length) return null;
  let out = features[0];
  for (let i = 1; i < features.length; i += 1) {
    const merged = union(featureCollection([out, features[i]]));
    if (merged) out = merged;
  }
  return out;
}

function toLineFeatures(features) {
  return features.filter((f) => {
    const t = f?.geometry?.type;
    return t === "LineString" || t === "MultiLineString";
  });
}

function toPolygonFeatures(features) {
  return features.filter((f) => {
    const t = f?.geometry?.type;
    return t === "Polygon" || t === "MultiPolygon";
  });
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes("\n") || s.includes("\"")) {
    return `"${s.replace(/\"/g, '""')}"`;
  }
  return s;
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(scriptDir, "..", "..");

  const dataDir = path.join(root, "artifacts", "colon-3d", "public", "data");
  const outZoneGeoJson = path.join(dataDir, "zona_tributaria_actividades_z1_z2.geojson");
  const outAxisGeoJson = path.join(dataDir, "zona_tributaria_ejes_z1.geojson");
  const outCsv = path.join(root, "docs", "parcela_categoria_tributaria_preliminar.csv");
  const outSummary = path.join(root, "docs", "parcela_categoria_tributaria_resumen.json");

  const [calleRaw, parcelaRaw, seccionRaw] = await Promise.all([
    fs.readFile(path.join(dataDir, "Calle.geojson"), "utf8"),
    fs.readFile(path.join(dataDir, "Parcela.geojson"), "utf8"),
    fs.readFile(path.join(dataDir, "seccion.geojson"), "utf8"),
  ]);

  const calle = JSON.parse(calleRaw);
  const parcela = JSON.parse(parcelaRaw);
  const seccion = JSON.parse(seccionRaw);

  const calleFeatures = toLineFeatures(calle.features || []);
  const seccionPolys = toPolygonFeatures(seccion.features || []);

  if (!calleFeatures.length) throw new Error("Calle.geojson sin lineas validas");
  if (!seccionPolys.length) throw new Error("seccion.geojson sin poligonos validos");

  const muniUnion = unionMany(seccionPolys);
  if (!muniUnion) throw new Error("No se pudo unir el ejido de secciones");

  const named = calleFeatures.map((f) => ({
    feature: f,
    name: normalizeText(f?.properties?.CALLE),
  }));

  const isSanMartin = (n) => hasAllTokens(n, ["SAN", "MARTIN"]);
  const isPeron = (n) => hasAllTokens(n, ["PRESIDENTE", "PERON"]);
  const isAPeyret = (n) => hasAllTokens(n, ["A", "PEYRET"]);
  const isJJPaso = (n) => hasAllTokens(n, ["J", "PASO"]);
  const isQuiros = (n) => n.includes("QUIROS");
  const isUrquiza = (n) => n.includes("URQUIZA");
  const isDoceAbril = (n) => hasAllTokens(n, ["12", "ABRIL"]);
  const isPaysandu = (n) => n.includes("PAYSANDU");
  const isBvGonzalez = (n) => hasAllTokens(n, ["BVARD", "GONZALEZ"]);
  const isBvSanguinetti = (n) => hasAllTokens(n, ["BVARD", "SANGUINETTI"]);

  const fullStreetLines = named
    .filter(({ name }) => isSanMartin(name) || isPeron(name) || isAPeyret(name) || isJJPaso(name) || isQuiros(name))
    .map(({ feature }) => feature);

  const segmentStreetLines = named
    .filter(({ name }) => isDoceAbril(name) || isPaysandu(name) || isUrquiza(name))
    .map(({ feature }) => feature);

  const corridorBoundaryLines = named
    .filter(({ name }) => isUrquiza(name) || isSanMartin(name) || isQuiros(name) || isBvGonzalez(name) || isBvSanguinetti(name))
    .map(({ feature }) => feature);

  if (!corridorBoundaryLines.length) {
    throw new Error("No se encontraron calles de borde para definir el corredor central");
  }

  const corridorBbox = bbox(featureCollection(corridorBoundaryLines));
  const corridorPoly = bboxPolygon(corridorBbox);

  const clippedSegmentLines = [];
  for (const line of segmentStreetLines) {
    try {
      const clipped = bboxClip(line, corridorBbox);
      const geomType = clipped?.geometry?.type;
      if (geomType === "LineString" || geomType === "MultiLineString") {
        clippedSegmentLines.push(clipped);
      }
    } catch {
      // Keep processing remaining lines.
    }
  }

  // Export legal representation based on street axes (no polygon inflation).
  const axisFeatures = [...fullStreetLines, ...clippedSegmentLines].map((f) => ({
    type: "Feature",
    geometry: f.geometry,
    properties: {
      ZONA_TRIB: "ZONA_1_EJE",
      TIPO: "EJE_CALLE",
      CALLE: String(f?.properties?.CALLE ?? ""),
      FUENTE_NORMA: "Art. 225",
      OBS: "Eje vial tributario de referencia legal",
    },
  }));

  const axisFc = {
    type: "FeatureCollection",
    features: axisFeatures,
  };

  await fs.writeFile(outAxisGeoJson, JSON.stringify(axisFc));

  // Build an approximate hint polygon from buffers (used only to identify
  // which polygonized face corresponds to Zona 1).
  const BUFFER_M = 25;
  const bufferedParts = [];
  for (const line of [...fullStreetLines, ...clippedSegmentLines]) {
    try {
      const buff = buffer(line, BUFFER_M, { units: "meters" });
      if (buff) bufferedParts.push(buff);
    } catch {
      // Ignore invalid geometry and continue.
    }
  }
  bufferedParts.push(corridorPoly);
  const zona1HintRaw = unionMany(bufferedParts);
  if (!zona1HintRaw) throw new Error("No se pudo construir zona_hint");
  const zona1Hint = intersect(featureCollection([zona1HintRaw, muniUnion]));
  if (!zona1Hint) throw new Error("No se pudo recortar zona_hint al ejido");

  // Build closed faces from legal divider axes + municipal outer boundary.
  const boundaryLine = polygonToLine(muniUnion);
  const muniArea = area(muniUnion);
  const lineNetworkFeatures = [...axisFeatures.map((f) => ({ type: "Feature", geometry: f.geometry, properties: {} }))];
  if (boundaryLine.geometry?.type === "LineString" || boundaryLine.geometry?.type === "MultiLineString") {
    lineNetworkFeatures.push({ type: "Feature", geometry: boundaryLine.geometry, properties: {} });
  }

  const faces = polygonize(featureCollection(lineNetworkFeatures));
  const faceCandidates = (faces?.features || [])
    .map((f) => {
      try {
        const clipped = intersect(featureCollection([f, muniUnion]));
        return clipped || null;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((f) => area(f) > 10_000)
    .filter((f) => area(f) < muniArea * 0.99);

  let zona1 = null;
  if (faceCandidates.length > 0) {
    const scored = faceCandidates
      .map((f) => {
        let overlapArea = 0;
        try {
          const overlap = intersect(featureCollection([f, zona1Hint]));
          if (overlap) overlapArea = area(overlap);
        } catch {
          overlapArea = 0;
        }
        return { f, overlapArea };
      })
      .sort((a, b) => b.overlapArea - a.overlapArea);

    zona1 = scored[0]?.f || null;
  }

  // Fallback if polygonize does not produce valid faces.
  if (!zona1) zona1 = zona1Hint;

  let zona2 = null;
  try {
    zona2 = difference(featureCollection([muniUnion, zona1]));
  } catch {
    zona2 = null;
  }

  if (!zona2) {
    zona1 = zona1Hint;
    try {
      zona2 = difference(featureCollection([muniUnion, zona1]));
    } catch {
      zona2 = null;
    }
  }

  if (!zona2) throw new Error("No se pudo construir Zona 2");

  const zoneFc = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: zona1.geometry,
        properties: {
          ZONA_TRIB: "ZONA_1",
          DESCRIPCION: "Zona 1 de actividades economicas (base preliminar automatica)",
          FUENTE_NORMA: "Art. 225",
          METODO: "polygonize_ejes_y_limite_municipal",
          ANCHO_BUFFER_M: BUFFER_M,
        },
      },
      {
        type: "Feature",
        geometry: zona2.geometry,
        properties: {
          ZONA_TRIB: "ZONA_2",
          DESCRIPCION: "Zona 2 de actividades economicas (resto del ejido fuera de Zona 1)",
          FUENTE_NORMA: "Art. 225",
          METODO: "diferencia_ejido_menos_zona_1_polygonizada",
          ANCHO_BUFFER_M: BUFFER_M,
        },
      },
    ],
  };

  await fs.writeFile(outZoneGeoJson, JSON.stringify(zoneFc));

  const header = [
    "ID",
    "NCP",
    "SEC",
    "GRU",
    "NMANZ",
    "NPARC",
    "ZONA_ACTIVIDAD",
    "CATEGORIA_TRIBUTARIA_PRELIMINAR",
    "COEFICIENTE",
    "CRITERIO",
  ];

  const counts = {
    total: 0,
    zona1: 0,
    zona2: 0,
    categoriaA: 0,
    categoriaB: 0,
    categoriaC: 0,
    categoriaD: 0,
  };

  const lines = [header.join(",")];

  for (const f of parcela.features || []) {
    const geomType = f?.geometry?.type;
    if (geomType !== "Polygon" && geomType !== "MultiPolygon") continue;

    counts.total += 1;

    let c;
    try {
      c = centroid(f);
    } catch {
      continue;
    }

    const inZona1 = booleanPointInPolygon(c, zoneFc.features[0]);
    const zonaActividad = inZona1 ? "ZONA_1" : "ZONA_2";
    if (inZona1) counts.zona1 += 1;
    else counts.zona2 += 1;

    const props = f.properties || {};
    const nmanz = Number(props.NMANZ || 0);
    const gru = Number(props.GRU || 0);

    let categoria = "D";
    let coef = 0.9;
    let criterio = "Fuera de Zona 1 y sin NMANZ/GRU informados";

    if (inZona1) {
      categoria = "A";
      coef = 1.0;
      criterio = "Parcela dentro de Zona 1 (proxy de centralidad y mayor nivel de servicios)";
    } else if (nmanz > 0) {
      categoria = "B";
      coef = 0.95;
      criterio = "Fuera de Zona 1, con NMANZ > 0 (proxy de tejido urbano consolidado)";
    } else if (gru > 0) {
      categoria = "C";
      coef = 0.9;
      criterio = "Fuera de Zona 1, sin NMANZ y con GRU > 0 (proxy periurbano consolidado)";
    }

    if (categoria === "A") counts.categoriaA += 1;
    if (categoria === "B") counts.categoriaB += 1;
    if (categoria === "C") counts.categoriaC += 1;
    if (categoria === "D") counts.categoriaD += 1;

    const row = [
      props.ID,
      props.NCP,
      props.SEC,
      props.GRU,
      props.NMANZ,
      props.NPARC,
      zonaActividad,
      categoria,
      coef,
      criterio,
    ].map(csvEscape);

    lines.push(row.join(","));
  }

  await fs.writeFile(outCsv, `${lines.join("\n")}\n`, "utf8");

  const summary = {
    generatedAt: new Date().toISOString(),
    source: {
      calle: "artifacts/colon-3d/public/data/Calle.geojson",
      parcela: "artifacts/colon-3d/public/data/Parcela.geojson",
      seccion: "artifacts/colon-3d/public/data/seccion.geojson",
    },
    outputs: {
      zonaGeoJson: "artifacts/colon-3d/public/data/zona_tributaria_actividades_z1_z2.geojson",
      zonaAxisGeoJson: "artifacts/colon-3d/public/data/zona_tributaria_ejes_z1.geojson",
      parcelaCsv: "docs/parcela_categoria_tributaria_preliminar.csv",
    },
    matchingStats: {
      fullStreetLines: fullStreetLines.length,
      segmentStreetLines: segmentStreetLines.length,
      clippedSegmentLines: clippedSegmentLines.length,
      corridorBoundaryLines: corridorBoundaryLines.length,
      polygonizedFaces: faceCandidates.length,
      bufferMeters: BUFFER_M,
    },
    counts,
    assumptions: [
      "Zona 1 se construye como union de corredor central y buffers de calles normativas.",
      "Zona 2 se define como diferencia entre ejido municipal y Zona 1.",
      "Categoria parcelaria es preliminar y usa reglas proxy: Zona 1->A, sino NMANZ>0->B, sino GRU>0->C, resto->D.",
    ],
  };

  await fs.writeFile(outSummary, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(`OK: ${summary.counts.total} parcelas clasificadas.`);
  console.log(`Zona 1: ${summary.counts.zona1} | Zona 2: ${summary.counts.zona2}`);
  console.log(`Categorias A/B/C/D: ${summary.counts.categoriaA}/${summary.counts.categoriaB}/${summary.counts.categoriaC}/${summary.counts.categoriaD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
