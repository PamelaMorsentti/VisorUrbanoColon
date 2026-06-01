import { promises as fs } from 'node:fs';

const dataDir = '../artifacts/colon-3d/public/data';
const files = ['seccion.geojson','grupo.geojson','manzana.geojson','Municipio.geojson','ejido_secciones.geojson','zonas.geojson'];

function bbox(features) {
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  function walkCoords(c) {
    if (typeof c[0] === 'number') {
      if(c[0]<minX)minX=c[0]; if(c[0]>maxX)maxX=c[0];
      if(c[1]<minY)minY=c[1]; if(c[1]>maxY)maxY=c[1];
    } else { c.forEach(walkCoords); }
  }
  for (const f of features) if(f.geometry && f.geometry.coordinates) walkCoords(f.geometry.coordinates);
  return [minX,minY,maxX,maxY];
}

for (const f of files) {
  try {
    const j = JSON.parse(await fs.readFile(dataDir+'/'+f,'utf8'));
    const polys = j.features.filter(x=>x.geometry&&(x.geometry.type==='Polygon'||x.geometry.type==='MultiPolygon'));
    const b = bbox(polys);
    console.log(f.padEnd(22), 'features:', j.features.length, '| polys:', polys.length, '| bbox:', b.map(n=>n.toFixed(5)).join(', '));
  } catch(e) { console.log(f, 'ERROR:', e.message); }
}
