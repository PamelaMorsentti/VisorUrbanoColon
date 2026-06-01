import https from "https";
import fs from "fs";

const BBOX = "-32.35,-58.35,-32.10,-58.08";
const OUT = "artifacts/colon-3d/public/data/osm";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function postQuery(query) {
  return new Promise((resolve, reject) => {
    const body = "data=" + encodeURIComponent(query);
    const opts = {
      hostname: "overpass-api.de", path: "/api/interpreter", method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body), "User-Agent": "colon-gis/1.0" },
    };
    const req = https.request(opts, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => {
        if ([429, 503, 504].includes(res.statusCode)) return reject(new Error("HTTP " + res.statusCode));
        try { resolve(JSON.parse(d)); } catch { reject(new Error("parse HTTP " + res.statusCode + ": " + d.slice(0, 80))); }
      });
    });
    req.on("error", reject); req.write(body); req.end();
  });
}

async function fetch(q, retries = 5, base = 8000) {
  for (let i = 0; i <= retries; i++) {
    try { return await postQuery(q); } catch (e) {
      if (i === retries) throw e;
      console.log(`  retry ${i + 1} in ${base * (i + 1) / 1000}s: ${e.message}`);
      await sleep(base * (i + 1));
    }
  }
}

function toGeoJSON(els, gid) {
  return {
    type: "FeatureCollection",
    features: (els || []).filter(e => e.type === "node" || e.center).map(e => {
      const lon = e.type === "node" ? e.lon : e.center.lon;
      const lat = e.type === "node" ? e.lat : e.center.lat;
      return { type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: { osm_id: e.id, NOMBRE: e.tags?.name || "", amenity: e.tags?.amenity || "", tourism: e.tags?.tourism || "", leisure: e.tags?.leisure || "", layers_group: gid, ...e.tags } };
    }),
  };
}

const QUERIES = [
  {
    id: "deporte", label: "Deporte y esparcimiento",
    q: `[out:json][timeout:25];(
node["leisure"="sports_centre"](${BBOX});way["leisure"="sports_centre"](${BBOX});
node["leisure"="stadium"](${BBOX});way["leisure"="stadium"](${BBOX});
node["leisure"="pitch"](${BBOX});way["leisure"="pitch"](${BBOX});
node["leisure"="swimming_pool"](${BBOX});way["leisure"="swimming_pool"](${BBOX});
node["leisure"="park"](${BBOX});way["leisure"="park"](${BBOX});
);out center tags;`,
  },
  {
    id: "alojamiento", label: "Alojamiento",
    q: `[out:json][timeout:25];(
node["tourism"="hotel"](${BBOX});way["tourism"="hotel"](${BBOX});
node["tourism"="hostel"](${BBOX});way["tourism"="hostel"](${BBOX});
node["tourism"="motel"](${BBOX});way["tourism"="motel"](${BBOX});
node["tourism"="guest_house"](${BBOX});way["tourism"="guest_house"](${BBOX});
node["tourism"="camp_site"](${BBOX});way["tourism"="camp_site"](${BBOX});
);out center tags;`,
  },
  {
    id: "gastronomia", label: "Gastronomia",
    q: `[out:json][timeout:25];(
node["amenity"="restaurant"](${BBOX});way["amenity"="restaurant"](${BBOX});
node["amenity"="cafe"](${BBOX});way["amenity"="cafe"](${BBOX});
node["amenity"="bar"](${BBOX});way["amenity"="bar"](${BBOX});
node["amenity"="fast_food"](${BBOX});way["amenity"="fast_food"](${BBOX});
);out center tags;`,
  },
];

for (const { id, label, q } of QUERIES) {
  console.log(`\n→ ${label} ...`);
  try {
    const raw = await fetch(q);
    const gj = toGeoJSON(raw.elements, id);
    fs.writeFileSync(`${OUT}/osm_${id}.geojson`, JSON.stringify(gj, null, 2));
    console.log(`  OK: ${gj.features.length} features`);
  } catch (e) {
    console.error(`  FAIL: ${e.message}`);
  }
  await sleep(5000);
}
console.log("\ndone");
