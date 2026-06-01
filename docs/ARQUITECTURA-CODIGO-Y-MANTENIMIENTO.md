# Arquitectura, Codigo y Mantenimiento

## 1. Objetivo

Este documento explica como esta implementada la aplicacion Colón 3D, cuales son sus modulos, como se conectan entre si y cuales son las practicas recomendadas para mantenimiento, correccion de errores y evolucion del sistema.

## 2. Vista general del monorepo

El repositorio usa pnpm workspaces y separa responsabilidades por paquete.

- artifacts/colon-3d: frontend principal (React + Vite + Leaflet)
- artifacts/api-server: API Express para salud, hidrologia, catalogo de capas y obras
- artifacts/mockup-sandbox: sandbox UI para prototipado
- lib/db: conexion y esquema de PostgreSQL con Drizzle ORM
- lib/api-zod: contratos Zod compartidos
- lib/api-client-react: cliente tipado para frontend
- scripts: pipelines y utilidades geoespaciales

## 3. Frontend principal (artifacts/colon-3d)

### 3.1 Punto de entrada

- src/main.tsx monta la aplicacion
- src/App.tsx encapsula layout general
- src/pages/MapViewer.tsx contiene la mayor parte de la logica GIS y de interaccion

### 3.2 Responsabilidades de MapViewer

MapViewer se encarga de:

- Inicializar el mapa Leaflet
- Cargar capas locales GeoJSON desde public/data
- Integrar capas externas TMS/WMS
- Gestionar visibilidad de capas y estado de paneles
- Resolver click sobre entidades locales y WMS
- Ejecutar mediciones, reportes y busquedas catastrales
- Aplicar filtros por nivel de publicacion para datos sensibles

### 3.3 Catalogo de capas locales

- src/lib/layers.ts define LayerDef y lista LAYERS
- Cada capa tiene id, archivo, grupo, estilo y flags de control
- adminOnly restringe acceso/descarga en interfaz segun rol

### 3.4 Paneles funcionales

En src/components se concentran paneles de dominio:

- LayersPanel: activacion de capas, descarga de GeoJSON, leyendas
- FeatureInfo y ExternalFeatureInfo: detalle de atributos
- CadastralSearch: busqueda por nomenclatura
- ParcelReport: informe tecnico imprimible
- MeasureTool: distancia y superficie
- ZonaPanel y ZonaLegend: lectura normativa urbana
- RegionalInfoPanel: datos regionales e hidrologia
- AuthGate + AuthContext: control de acceso por rol

### 3.5 Carga de capas externas

- src/hooks/useLayerCatalog.ts consulta API de catalogo de capas externas
- Si la API no responde, usa fallback estatico en src/lib/layers.ts
- Se mantienen metadatos visuales (color/opacidad/zoom) en DISPLAY_CONFIG

## 4. API server (artifacts/api-server)

### 4.1 Estructura

- src/index.ts inicia servidor
- src/app.ts configura middlewares (cors, pino-http, body parsers)
- src/routes/index.ts registra rutas

### 4.2 Rutas principales

- GET /api/healthz: estado basico del servicio
- GET /api/hydrology/colon: consulta hidrometria externa (CARU/PNA)
- /api/layers/catalog: CRUD + bootstrap + health del catalogo de capas
- /api/obras: entrega datasets por nivel de publicacion, con filtros y cache

### 4.3 Criterios de robustez

- Validaciones con Zod en payloads sensibles
- Fallback en hidrologia (direct-html y readable-fallback)
- ETag y cache en endpoints de obras para reducir costo de lectura
- Manejo de errores con mensajes explicitos para diagnostico

## 5. Capa de datos (lib/db)

### 5.1 Conexion

- lib/db/src/index.ts crea pool PostgreSQL con DATABASE_URL
- Exporta db y todo el schema para consumo desde API

### 5.2 Esquemas principales

- schema/layerCatalog.ts: tabla layer_catalog + enums de tipo y salud
- schema/obrasPrivadas.ts: tabla obras_privadas por nivel de publicacion

### 5.3 Reglas operativas

- Migracion de esquema por push desde lib/db con drizzle-kit
- Sin DATABASE_URL, el modulo falla en startup por diseño

## 6. Scripts de procesamiento (scripts)

### 6.1 Scripts de produccion de datos

- build-jurisdiccion-municipal.mjs: reconstruye jurisdiccion municipal con union y correcciones puntuales
- convert-enersa-csv.ts + clip-enersa-to-colon.mjs: conversion y recorte de red electrica
- geolocate-planos-catastro.ts: geolocalizacion de planos
- build-cadastral-review-queue.ts: cola de revision de casos catastro

### 6.2 Scripts de diagnostico temporal

- _compare-jurisdiccion-vs-manzana.mjs
- _inspect-layers.mjs

Estos scripts son auxiliares, no requeridos para runtime.

## 7. Flujo de datos de punta a punta

1. Fuentes crudas (SHP/CSV) entran por attached_assets o artefactos de trabajo.
2. scripts transforma/normaliza a GeoJSON operativo.
3. Frontend consume GeoJSON en artifacts/colon-3d/public/data.
4. API agrega catalogo externo e informacion dinamica (hidrologia/obras).
5. Frontend mezcla capas locales y externas segun rol y preferencias.

## 8. Seguridad y control de acceso

- Niveles de publicacion: public, professional, admin
- Capas adminOnly no se exponen a usuario invitado
- Para obras, se respeta nivel de dataset y filtros por endpoint
- Mantener credenciales fuera de repositorio, en variables de entorno

## 9. Mantenimiento preventivo

### 9.1 Checklist semanal

- Ejecutar typecheck global
- Probar arranque de frontend y API
- Verificar salud de capas externas
- Confirmar que jurisdiccion_municipal y capas criticas cargan sin errores

### 9.2 Checklist antes de publicar

- Validar integridad de GeoJSON (FeatureCollection, CRS WGS84, geometrias validas)
- Ejecutar build web y API sin errores
- Verificar endpoints /api/healthz y /api/layers/catalog
- Revisar permisos por rol en UI

## 10. Guia de correccion de incidentes

### 10.1 Capa no visible

1. Confirmar que el archivo existe en public/data.
2. Revisar nombre exacto del archivo en src/lib/layers.ts.
3. Confirmar geometria y atributos basicos del GeoJSON.
4. Revisar consola de navegador para errores de parseo o CORS.

### 10.2 Error de API

1. Consultar /api/healthz.
2. Revisar logs pino en terminal.
3. Confirmar DATABASE_URL y acceso a PostgreSQL si aplica.
4. Validar payload con esquema Zod correspondiente.

### 10.3 Problema de rendimiento

1. Marcar capas pesadas como lazy cuando aplique.
2. Evitar renders innecesarios en paneles y overlays.
3. Limitar cantidad de features y payloads por endpoint.
4. Evaluar simplificacion geometrica para datasets extensos.

## 11. Convenciones de cambios futuros

- Mantener separacion de responsabilidades entre frontend, API y scripts
- Toda capa nueva debe declararse en layers.ts con metadatos completos
- Todo endpoint nuevo debe tener validacion y manejo de error explicito
- Todo cambio geoespacial relevante debe documentarse en docs
- Evitar archivos temporales en raiz; usar carpeta temporal controlada

## 12. Dependencias criticas

- React + Vite + Leaflet en frontend
- Express + Drizzle + PostgreSQL en backend
- Turf para operaciones geometrico-espaciales en scripts

Conservar versionado y pruebas de arranque tras actualizar cualquiera de estas dependencias.
