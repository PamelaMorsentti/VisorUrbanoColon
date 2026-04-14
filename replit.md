# Colón 3D — Visor Urbano

## Overview

Visor interactivo de la ciudad de Colón, Entre Ríos. Aplicación web de mapas con capas de datos geoespaciales catastrales y urbanos, inspirada en ciudad3d.buenosaires.gob.ar.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifact: colon-3d)
- **Map library**: Leaflet.js (maplibre-gl installed but not used due to WebGL sandbox constraints)
- **Base tiles**: CartoDB Dark Matter (via CARTO CDN, no API key required)
- **API framework**: Express 5 (api-server artifact, used for health checks)

## Artifacts

### colon-3d (web, preview path: /)
Main urban viewer application.

**Features:**
- Interactive map centered on Colón, Entre Ríos
- Layer panel to toggle 16 data layers on/off
- Click-to-inspect any feature with a sidebar popup
- Search by address via Nominatim/OpenStreetMap
- Zonification legend (Ord. 130-2022)
- Dark map aesthetic

### api-server (api, preview path: /api)
Backend API server. Currently serves health checks only.

## Geospatial Data

Source files provided by the municipality of Colón, Entre Ríos.

Original format: SHP files in POSGAR 94 / Argentina Faja 5 (EPSG:22175) projection.
Converted to GeoJSON WGS84 (EPSG:4326) using proj4js.

Files in `artifacts/colon-3d/public/data/`:
- `manzana.geojson` — 1202 city blocks
- `Calle.geojson` — 2833 street segments
- `Edif.geojson` — 29182 buildings (large, lazy-loaded)
- `Edif_PAlta.geojson` — 499 tall buildings
- `Parcela.geojson` — 13564 land parcels (lazy-loaded)
- `barrios.geojson` — 11 neighborhoods
- `Municipio.geojson` — 48 municipal boundary segments
- `arbol.geojson` — 5115 urban trees (lazy-loaded)
- `postes.geojson` — 4135 utility poles (lazy-loaded)
- `bocas.geojson` — 105 storm drain access points
- `cota10.geojson` — 82 contour lines (10m intervals)
- `seccion.geojson` — 23 cadastral sections
- `grupo.geojson` — 292 cadastral groups
- `SuperP.geojson` — 306 built surfaces
- `ph.geojson` — 4486 roof/attic footprints (lazy-loaded)
- `ProyDameros.geojson` — 3658 projected lots

Also: `zonificacion_1776196112300.geojson` — zoning classifications (Ord. 130-2022, no geometry, attribute table only)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/colon-3d run dev` — run frontend locally

## Data Pipeline

SHP files are binary. Conversion done with custom Node.js scripts:
1. `/tmp/shp_convert/convert.js` — converts SHP to GeoJSON (using `shapefile` npm package)
2. `/tmp/shp_convert/reproject.js` — reprojects from POSGAR Faja 5 to WGS84 (using `proj4` npm package)

## Pending Data

User still needs to provide:
- Ordenanzas urbanas (text/PDF)
- Additional attribute data for parcelas (owner info, etc.)
- Heights data for 3D building extrusion
