/**
 * fetch-osm-pois.mjs
 * Descarga POIs de Colon, Entre Rios via Overpass API (OpenStreetMap, licencia ODbL).
 * Genera un GeoJSON por categoria en artifacts/colon-3d/public/data/osm/
 *
 * Uso: node ./src/fetch-osm-pois.mjs
 */

import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../../artifacts/colon-3d/public/data/osm");

// Bounding box conservadora alrededor de Colon, Entre Rios
// (S, W, N, E)
const BBOX = "-32.35,-58.35,-32.10,-58.08";

const QUERIES = [
  {
    id: "culto",
    label: "Lugares de culto",
    overpass: `[out:json][timeout:30];
(
  node["amenity"="place_of_worship"](${BBOX});
  way["amenity"="place_of_worship"](${BBOX});
);
out center tags;`,
  },
  {
    id: "turismo",
    label: "Atractivos turisticos",
    overpass: `[out:json][timeout:30];
(
  node["tourism"](${BBOX});
  way["tourism"](${BBOX});
);
out center tags;`,
  },
  {
    id: "gobierno",
    label: "Sedes gubernamentales y oficinas publicas",
    overpass: `[out:json][timeout:30];
(
  node["amenity"="townhall"](${BBOX});
  way["amenity"="townhall"](${BBOX});
  node["amenity"="courthouse"](${BBOX});
  way["amenity"="courthouse"](${BBOX});
  node["amenity"="police"](${BBOX});
  way["amenity"="police"](${BBOX});
  node["amenity"="fire_station"](${BBOX});
  way["amenity"="fire_station"](${BBOX});
  node["amenity"="post_office"](${BBOX});
  way["amenity"="post_office"](${BBOX});
  node["office"="government"](${BBOX});
  way["office"="government"](${BBOX});
  node["office"="administrative"](${BBOX});
  way["office"="administrative"](${BBOX});
);
out center tags;`,
  },
  {
    id: "educacion",
    label: "Educacion",
    overpass: `[out:json][timeout:30];
(
  node["amenity"="school"](${BBOX});
  way["amenity"="school"](${BBOX});
  node["amenity"="university"](${BBOX});
  way["amenity"="university"](${BBOX});
  node["amenity"="college"](${BBOX});
  way["amenity"="college"](${BBOX});
  node["amenity"="kindergarten"](${BBOX});
  way["amenity"="kindergarten"](${BBOX});
  node["amenity"="library"](${BBOX});
  way["amenity"="library"](${BBOX});
);
out center tags;`,
  },
  {
    id: "salud",
    label: "Salud",
    overpass: `[out:json][timeout:30];
(
  node["amenity"="hospital"](${BBOX});
  way["amenity"="hospital"](${BBOX});
  node["amenity"="clinic"](${BBOX});
  way["amenity"="clinic"](${BBOX});
  node["amenity"="pharmacy"](${BBOX});
  way["amenity"="pharmacy"](${BBOX});
  node["amenity"="doctors"](${BBOX});
  way["amenity"="doctors"](${BBOX});
  node["amenity"="dentist"](${BBOX});
  way["amenity"="dentist"](${BBOX});
);
out center tags;`,
  },
  {
    id: "patrimonio",
    label: "Patrimonio e historia",
    overpass: `[out:json][timeout:30];
(
  node["historic"](${BBOX});
  way["historic"](${BBOX});
);
out center tags;`,
  },
  {
    id: "cultura",
    label: "Cultura",
    overpass: `[out:json][timeout:30];
(
  node["amenity"="theatre"](${BBOX});
  way["amenity"="theatre"](${BBOX});
  node["amenity"="cinema"](${BBOX});
  way["amenity"="cinema"](${BBOX});
  node["amenity"="arts_centre"](${BBOX});
  way["amenity"="arts_centre"](${BBOX});
  node["amenity"="community_centre"](${BBOX});
  way["amenity"="community_centre"](${BBOX});
  node["amenity"="social_centre"](${BBOX});
  way["amenity"="social_centre"](${BBOX});
);
out center tags;`,
  },
  {
    id: "deporte",
    label: "Deporte y esparcimiento",
    overpass: `[out:json][timeout:30];
(
  node["leisure"="sports_centre"](${BBOX});
  way["leisure"="sports_centre"](${BBOX});
  node["leisure"="stadium"](${BBOX});
  way["leisure"="stadium"](${BBOX});
  node["leisure"="pitch"](${BBOX});
  way["leisure"="pitch"](${BBOX});
  node["leisure"="swimming_pool"](${BBOX});
  way["leisure"="swimming_pool"](${BBOX});
  node["leisure"="park"](${BBOX});
  way["leisure"="park"](${BBOX});
  node["leisure"="garden"](${BBOX});
  way["leisure"="garden"](${BBOX});
);
out center tags;`,
  },
  {
    id: "alojamiento",
    label: "Alojamiento",
    overpass: `[out:json][timeout:30];
(
  node["tourism"="hotel"](${BBOX});
  way["tourism"="hotel"](${BBOX});
  node["tourism"="hostel"](${BBOX});
  way["tourism"="hostel"](${BBOX});
  node["tourism"="motel"](${BBOX});
  way["tourism"="motel"](${BBOX});
  node["tourism"="guest_house"](${BBOX});
  way["tourism"="guest_house"](${BBOX});
  node["tourism"="camp_site"](${BBOX});
  way["tourism"="camp_site"](${BBOX});
);
out center tags;`,
  },
  {
    id: "gastronomia",
    label: "Gastronomia",
    overpass: `[out:json][timeout:30];
(
  node["amenity"="restaurant"](${BBOX});
  way["amenity"="restaurant"](${BBOX});
  node["amenity"="cafe"](${BBOX});
  way["amenity"="cafe"](${BBOX});
  node["amenity"="bar"](${BBOX});
  way["amenity"="bar"](${BBOX});
  node["amenity"="fast_food"](${BBOX});
  way["amenity"="fast_food"](${BBOX});
);
out center tags;`,
  },
];

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function fetchOverpass(query, retries = 4, baseDelayMs = 6000) {
  return new Promise(async (resolve, reject) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        const wait = baseDelayMs * attempt;
        console.log(`   retry ${attempt}/${retries} in ${wait / 1000}s ...`);
        await sleep(wait);
      }
      try {
        const result = await fetchOnce(query);
        return resolve(result);
      } catch (err) {
        if (attempt === retries) return reject(err);
        console.log(`   attempt ${attempt + 1} failed: ${err.message.slice(0, 80)}`);
      }
    }
  });
}

function fetchOnce(query) {
  return new Promise((resolve, reject) => {
    const body = "data=" + encodeURIComponent(query);
    const opts = {
      hostname: "overpass-api.de",
      path: "/api/interpreter",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
        "User-Agent": "colon-entre-rios-gis/1.0",
      },
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 429 || res.statusCode === 503) {
          return reject(new Error(`HTTP ${res.statusCode} rate-limited`));
        }
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch {
          reject(new Error(`HTTP ${res.statusCode} parse error: ` + data.slice(0, 120)));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function osmToGeoJSON(elements, layerId) {
  const features = [];
  for (const el of elements) {
    let lon, lat;
    if (el.type === "node") {
      lon = el.lon;
      lat = el.lat;
    } else if (el.center) {
      lon = el.center.lon;
      lat = el.center.lat;
    } else {
      continue; // skip ways sin center
    }
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

    const props = {
      osm_id: el.id,
      osm_type: el.type,
      NOMBRE: el.tags?.name || el.tags?.["name:es"] || "",
      amenity: el.tags?.amenity || "",
      tourism: el.tags?.tourism || "",
      historic: el.tags?.historic || "",
      leisure: el.tags?.leisure || "",
      office: el.tags?.office || "",
      religion: el.tags?.religion || "",
      denomination: el.tags?.denomination || "",
      website: el.tags?.website || "",
      phone: el.tags?.phone || "",
      opening_hours: el.tags?.opening_hours || "",
      layers_group: layerId,
    };

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: props,
    });
  }
  return { type: "FeatureCollection", features };
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const summary = [];

  for (const q of QUERIES) {
    const outFile = path.join(OUT_DIR, `osm_${q.id}.geojson`);
    console.log(`\n→ ${q.label} ...`);
    try {
      const raw = await fetchOverpass(q.overpass);
      const geojson = osmToGeoJSON(raw.elements || [], q.id);
      fs.writeFileSync(outFile, JSON.stringify(geojson, null, 2));
      console.log(`   OK: ${geojson.features.length} features → ${path.relative(process.cwd(), outFile)}`);
      summary.push({ id: q.id, label: q.label, count: geojson.features.length, file: `osm/osm_${q.id}.geojson` });
    } catch (err) {
      console.error(`   ERROR: ${err.message}`);
      summary.push({ id: q.id, label: q.label, count: 0, error: err.message });
    }
    // Respetar rate-limit de Overpass (2 slots por IP; esperar entre queries)
    await sleep(4000);
  }

  console.log("\n── Resumen ───────────────────────────────────────────");
  for (const s of summary) {
    console.log(`  ${s.id.padEnd(20)} ${String(s.count).padStart(4)} features  ${s.error ? "ERROR: "+s.error : ""}`);
  }
  console.log("──────────────────────────────────────────────────────");
}

main().catch((e) => { console.error(e); process.exit(1); });
