# Inventario de Codigo Clave

Este inventario resume donde vive cada responsabilidad principal para facilitar mantenimiento.

## 1. Raiz del workspace

- package.json: scripts globales de desarrollo/build/typecheck
- pnpm-workspace.yaml: definicion de paquetes de workspace
- tsconfig.base.json y tsconfig.json: configuracion TypeScript compartida
- CHECKLIST-PUBLICACION.md: checklist operativo de publicacion de datos

## 2. Frontend principal

Ubicacion: artifacts/colon-3d

### 2.1 Entradas y configuracion

- src/main.tsx
- src/App.tsx
- src/pages/MapViewer.tsx
- vite.config.ts

### 2.2 Dominio GIS y seguridad

- src/lib/layers.ts: catalogo local de capas
- src/lib/zonaData.ts: parametros normativos por zona
- src/lib/auth.ts: utilidades de permisos
- src/contexts/AuthContext.tsx: estado de sesion por rol

### 2.3 Paneles funcionales

- src/components/LayersPanel.tsx
- src/components/FeatureInfo.tsx
- src/components/ExternalFeatureInfo.tsx
- src/components/CadastralSearch.tsx
- src/components/ParcelReport.tsx
- src/components/MeasureTool.tsx
- src/components/ZonaPanel.tsx
- src/components/ZonaLegend.tsx
- src/components/LayerUpload.tsx

### 2.4 Integraciones API

- src/hooks/useLayerCatalog.ts

### 2.5 Componentes UI base

- src/components/ui/*

Estos componentes son base visual reutilizable (botones, cards, forms, etc.) y deben mantenerse desacoplados de logica de negocio.

## 3. API server

Ubicacion: artifacts/api-server

- src/index.ts: bootstrap
- src/app.ts: middlewares
- src/routes/index.ts: agregador de rutas
- src/routes/health.ts
- src/routes/hydrology.ts
- src/routes/layerCatalog.ts
- src/routes/obras.ts
- src/lib/logger.ts
- src/lib/externalLayersSeed.ts

## 4. Librerias compartidas

### 4.1 Base de datos

Ubicacion: lib/db

- src/index.ts
- src/schema/layerCatalog.ts
- src/schema/obrasPrivadas.ts
- drizzle.config.ts

### 4.2 Contratos y clientes

- lib/api-zod: contratos de API
- lib/api-client-react: cliente tipado
- lib/api-spec: soporte para especificacion OpenAPI

## 5. Scripts de datos y geoprocesamiento

Ubicacion: scripts/src

- build-jurisdiccion-municipal.mjs
- convert-enersa-csv.ts
- clip-enersa-to-colon.mjs
- geolocate-planos-catastro.ts
- build-cadastral-review-queue.ts
- clean-planos.ts
- publication-levels.ts
- planos-analytics.ts

Scripts con prefijo guion bajo son de diagnostico temporal y no son requeridos para ejecucion normal.

## 6. Datos geoespaciales de runtime

- artifacts/colon-3d/public/data/*.geojson

Todo archivo aqui debe estar en WGS84 y con estructura GeoJSON valida.

## 7. Sandbox y auxiliares

- artifacts/mockup-sandbox: prototipos UI y pruebas de componentes
- attached_assets: insumos originales no optimizados para runtime

## 8. Nota de mantenimiento

Cuando se corrija o agregue una capa:

1. Actualizar definicion en src/lib/layers.ts.
2. Validar archivo en public/data.
3. Verificar visibilidad y permisos en LayersPanel.
4. Documentar cambio en docs.
