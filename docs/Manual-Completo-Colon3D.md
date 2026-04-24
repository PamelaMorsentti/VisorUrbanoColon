# Manual Completo - Colon 3D (Visor Urbano)

## 1. Proposito de la aplicacion

Colon 3D es un visor urbano municipal para:

- visualizar capas catastrales, urbanas, ambientales y de infraestructura;
- consultar informacion de parcelas y normativa de zonificacion;
- realizar analisis basicos (densidad edilicia, estadisticas por zonas, superficie construida);
- generar informes imprimibles por parcela;
- cargar capas GIS temporales para analisis operativo.

El objetivo principal es centralizar informacion territorial para soporte tecnico y de gestion.

---

## 2. Alcance funcional actual

### 2.1 Funciones principales

- Mapa interactivo Leaflet centrado en Colon, Entre Rios.
- Gestion de capas por grupos (Catastro, Infraestructura, Topografia, Edificios, Verde urbano, Zonificacion).
- Busqueda de direccion (IGN) y busqueda catastral por campos de parcela.
- Seleccion de entidad en mapa con panel de atributos.
- Reporte de parcela con:
  - datos catastrales,
  - zona normativa y parametros (FOS/FOT/altura/retiros/suelo absorbente),
  - cotas proximas,
  - capas intersectadas.
- Medicion en mapa (distancia y superficie).
- Panel de servicios regionales (clima, rio, transito, emergencias).
- Carga temporal de capas GIS (GeoJSON, ZIP SHP, KML).
- Control de acceso por roles: admin, registrado, invitado.
- Calibracion manual de zonificacion disponible solo para admin (respaldo operativo).

### 2.2 Backend actual

- API Express (puerto 3000 / 5180) con los siguientes endpoints:
  - `GET /api/healthz` — health check
  - `GET /api/hydrology/colon` — nivel del río (CARU + fallback)
  - `GET /api/layers/catalog` — catálogo de capas desde PostgreSQL
  - `POST /api/layers/catalog/upsert` — alta/actualización de capa por key
  - `PATCH /api/layers/catalog/:key/health` — actualizar estado de salud
  - `GET /api/layers/catalog/health` — dashboard de estado de todas las capas
  - `POST /api/layers/catalog/bootstrap-external` — sembrado idempotente de las 10 capas externas

- Base de datos PostgreSQL (`colondb`) con Drizzle ORM:
  - Tabla `layer_catalog`: catálogo centralizado de capas (locales y externas)
  - Enums: `layer_type` (`tms`/`wms`/`geojson`) y `layer_health_status` (`unknown`/`ok`/`degraded`/`down`)
  - Schema en `lib/db/src/schema/layerCatalog.ts`
  - Aplicar schema: `cd lib/db && pnpm run push`
  - GUI: `pnpm exec drizzle-kit studio --port 4983` → https://local.drizzle.studio

---

## 3. Estructura del proyecto (arbol de trabajo)

```text
Colon-Entre-Rios/
├─ artifacts/
│  ├─ colon-3d/                        # Frontend React + Vite + Leaflet
│  │  ├─ public/
│  │  │  └─ data/                      # GeoJSON consumidos por el visor
│  │  └─ src/
│  │     ├─ pages/
│  │     │  └─ MapViewer.tsx           # Pagina principal y logica GIS
│  │     ├─ components/
│  │     │  ├─ Header.tsx
│  │     │  ├─ LayersPanel.tsx
│  │     │  ├─ CadastralSearch.tsx
│  │     │  ├─ FeatureInfo.tsx
│  │     │  ├─ ParcelReport.tsx
│  │     │  ├─ DensidadPanel.tsx
│  │     │  ├─ ZonaPanel.tsx
│  │     │  ├─ ZonaLegend.tsx
│  │     │  ├─ MeasureTool.tsx
│  │     │  ├─ LayerUpload.tsx
│  │     │  ├─ AnalysisPanel.tsx
│  │     │  ├─ RegionalInfoPanel.tsx
│  │     │  ├─ BaseMapSelector.tsx
│  │     │  └─ AuthGate.tsx
│  │     ├─ lib/
│  │     │  ├─ layers.ts               # Definicion de capas y grupos
│  │     │  ├─ zonaData.ts             # Indicadores normativos por zona
│  │     │  └─ auth.ts                 # Roles y permisos
│  │     ├─ contexts/
│  │     │  └─ AuthContext.tsx
│  │     ├─ App.tsx
│  │     └─ main.tsx
│  ├─ api-server/                      # Backend Express
│  │  └─ src/
│  │     ├─ app.ts
│  │     ├─ index.ts
│  │     ├─ routes/
│  │     │  ├─ health.ts
│  │     │  ├─ hydrology.ts
│  │     │  ├─ layerCatalog.ts         # ← NUEVO: CRUD catálogo de capas
│  │     │  └─ index.ts
│  │     └─ lib/
│  │        ├─ logger.ts
│  │        └─ externalLayersSeed.ts   # ← NUEVO: datos semilla 10 capas externas
│  └─ mockup-sandbox/                  # Espacio de pruebas UI
├─ lib/
│  ├─ api-client-react/                # Cliente tipado de API
│  ├─ api-zod/                         # Contratos y validaciones API
│  ├─ api-spec/                        # Configuracion OpenAPI/Orval
│  └─ db/                              # Base Drizzle + PostgreSQL
│     └─ src/schema/
│        └─ layerCatalog.ts            # ← NUEVO: tabla layer_catalog + Zod validators
├─ attached_assets/                    # Insumos originales SHP/DBF/GeoJSON
│  ├─ geojson/
│  └─ geojson_wgs84/
├─ scripts/
│  └─ dev-up.ps1                       # Arranque rapido en Windows
├─ docs/
│  ├─ Guia-QGIS-Reproyeccion-Zonificacion.md
│  └─ Manual-Completo-Colon3D.md
├─ Iniciar-Colon3D.bat
├─ package.json
└─ pnpm-workspace.yaml
```

---

## 4. Arquitectura funcional

### 4.1 Frontend

- Framework: React + TypeScript + Vite.
- Motor GIS: Leaflet.
- Patron general:
  - MapViewer centraliza mapa, capas, seleccion y herramientas;
  - componentes UI controlan paneles de operacion;
  - `layers.ts` define catalogo de capas;
  - `zonaData.ts` define normativa urbana;
  - contexto de auth administra sesion y permisos.

### 4.2 Backend

- Framework: Express 5 + pino.
- Base de datos: PostgreSQL con Drizzle ORM (`lib/db`).
- Endpoints operativos:
  - `/api/healthz`
  - `/api/hydrology/colon`
  - `/api/layers/catalog` (GET, POST upsert, PATCH health, GET health, POST bootstrap)
- Variables de entorno requeridas: `DATABASE_URL` (en `.env` raíz), `ADMIN_PASSWORD`.
- Build: `pnpm run build:api` → `pnpm run start:api` (requiere `.env` cargado en el entorno).

### 4.3 Capas externas

Capas servidas por terceros (IGN, INTA, CONAE, ESA, NASA, SAyDS, SMN) definidas en:
- `artifacts/colon-3d/src/lib/layers.ts` → `EXTERNAL_LAYERS[]` (fuente frontend, estática)
- `lib/db` → tabla `layer_catalog` (fuente DB, dinámica, sembrada con bootstrap)

Las capas WMS con `supportsGetFeatureInfo: true` responden al click en el mapa mostrando
atributos en el componente `ExternalFeatureInfo.tsx`.

> **Próximo paso**: conectar el frontend a `GET /api/layers/catalog?externalOnly=true`
> para eliminar la duplicación y que la config provenga exclusivamente de la DB.

### 4.3 Datos geoespaciales

- Fuente operativa consumida por app: `artifacts/colon-3d/public/data`.
- CRS esperado en frontend: WGS84 (EPSG:4326).
- Capas pesadas con carga lazy para reducir impacto inicial.

---

## 5. Roles y permisos

### 5.1 Admin

- Gestion completa
- Carga de capas
- Analisis
- Impresion de informes
- Calibracion manual de zonificacion

### 5.2 Registrado

- Carga de capas temporales
- Analisis basicos
- Impresion
- Sin herramientas administrativas

### 5.3 Invitado

- Visualizacion y navegacion
- Sin carga de capas
- Sin analisis avanzado
- Sin impresion

---

## 6. Flujo de uso operativo (manual de usuario)

### 6.1 Inicio de aplicacion

1. Ejecutar `pnpm run dev` (o `pnpm run dev:fast` en Windows).
2. Abrir web en `http://localhost:5173`.
3. Verificar API en `http://localhost:5180/api/healthz`.

### 6.2 Navegacion y capas

1. Abrir panel Capas.
2. Activar/desactivar por grupos.
3. Usar zoom y desplazamiento para inspeccion.

### 6.3 Consulta catastral

1. Abrir Catastro.
2. Buscar por NCP, seccion, grupo, manzana, parcela, objeto o nombre.
3. Seleccionar resultado para centrar e inspeccionar.

### 6.4 Consulta normativa

1. Activar zonificacion.
2. Hacer clic en parcela/zona.
3. Revisar valores normativos del panel (FOS, FOT, altura, retiros, etc.).

### 6.5 Informe tecnico imprimible

1. Seleccionar parcela.
2. Ejecutar imprimir informe.
3. Revisar reporte con datos catastrales, zonificacion e intersecciones.

### 6.6 Medicion

1. Distancia: clic en puntos de quiebre, doble clic para finalizar.
2. Superficie: trazar poligono y cerrar con doble clic.

### 6.7 Carga temporal de capa GIS

1. Abrir Carga.
2. Subir GeoJSON o ZIP SHP o KML.
3. Revisar capa en mapa y popups de atributos.

---

## 7. Flujo de datos recomendado

### 7.1 Pipeline GIS

1. Ingreso de datos originales (SHP/DXF/Excel georreferenciable).
2. Normalizacion de campos y codigos.
3. Validacion topologica.
4. Reproyeccion a EPSG:4326.
5. Control de calidad visual en visor.
6. Publicacion a `public/data` (versionada).

### 7.2 Zonificacion

- La calibracion manual es contingencia.
- La solucion de fondo es corregir georreferenciacion en origen (QGIS).
- Ver guia tecnica en documento especifico de QGIS.

---

## 8. Estado tecnico observado en esta revision (abril 2026)

- Frontend build: correcto. Typecheck limpio.
- Backend: operativo con catálogo de capas en DB.
- Schema PostgreSQL aplicado (`layer_catalog`, enums `layer_type` y `layer_health_status`).
- 10 capas externas sembradas en DB (bootstrap idempotente verificado).
- Capas externas: URLs corregidas (INTA `.gob.ar`, NASA WMTS, SAyDS dominio nuevo).
- Leyendas inline en `LayersPanel` implementadas.
- `ExternalFeatureInfo.tsx`: GetFeatureInfo sobre capas WMS activas.
- Drizzle Studio disponible en `https://local.drizzle.studio` cuando se ejecuta `pnpm exec drizzle-kit studio`.

Pendientes técnicos inmediatos:
- Conectar frontend al endpoint `GET /api/layers/catalog` (eliminar array estático).
- Implementar health-check automático periódico (job en el servidor).
- Mostrar badge de salud por capa en el panel.
- Resolver script `dev:local` del api-server (ts-node no instalado; usar `build + start`).

---

## 9. Hoja de ruta de nuevas herramientas (propuesta actualizada)

### 9.0 Conexion frontend → catalogo DB (prioridad inmediata)

- Reemplazar `EXTERNAL_LAYERS` estático en `layers.ts` por hook `useLayerCatalog()`
  que llama `GET /api/layers/catalog?externalOnly=true&onlyActive=true`.
- Eliminar duplicación de datos entre `externalLayersSeed.ts` y `layers.ts`.
- Manejar loading/error en `LayersPanel`.

### 9.1 Health-check automatico de capas (prioridad alta)

- Job periódico (cron/interval) en el servidor que prueba cada capa activa:
  - TMS: solicita una tile conocida y verifica HTTP 200.
  - WMS: solicita `GetCapabilities` y verifica respuesta válida.
- Actualiza `health_status` y `last_error` via `PATCH /api/layers/catalog/:key/health`.
- Badge visual en `LayersPanel` (verde/amarillo/rojo).

### 9.2 Modulo de redes de servicios publicos (prioridad alta)

Capas objetivo: agua, cloacas, pavimento, gas, electricidad, alumbrado, desagues pluviales.

Funcionalidades propuestas:
1. Catalogo de capas de servicio con esquema estandar por tipo.
2. Versionado por fecha de relevamiento y fuente.
3. Simbologia tematica por estado (activo/proyectado/fuera de servicio).
4. Filtros: por barrio, tipo de red, estado, anio de obra.
5. Descarga de capas filtradas (GeoJSON/CSV).

### 9.3 Modulo Obras Privadas (prioridad alta)

1. Ingesta del Excel historico multihoja → tabla canonica en DB.
2. Geocodificacion: NCP/parcela → geocodificacion de direccion (IGN) → manual asistida.
3. Capa historica temporal (slider por anio).
4. Filtros: tipo de obra, estado de tramite, zona.
5. Tablero KPI: cantidad, superficie, tiempos, distribucion territorial.
6. Exportes CSV/GeoJSON/Excel/PDF.

### 9.4 Modulo de calidad de datos (prioridad media-alta)

1. Validador automatico pre-publicacion (CRS, geometria, campos obligatorios, duplicados).
2. Semaforo de calidad por capa (verde/amarillo/rojo).
3. Registro de errores con sugerencia de correccion.

### 9.5 Administracion de datos (prioridad media)

1. Repositorio de capas versionadas (metadatos + changelog).
2. Publicacion por ambiente: borrador → validado → productivo.
3. RBAC fino: visualizar / cargar / validar / publicar / administrar.

---

## 10. Plan de implementacion sugerido (por etapas)

### Etapa 0 — Completar infraestructura existente (inmediata)

- Conectar frontend al endpoint `GET /api/layers/catalog` (eliminar array estático en `layers.ts`).
- Implementar health-check automático y badge de salud en LayersPanel.

### Etapa 1 — Obras Privadas (corto plazo)

- Normalizar ingestion Excel Obras Privadas (multihoja -> tabla unica).
- Georreferencia inicial por NCP + direccion.
- Vista de puntos/parcelas de Obras Privadas con filtros por anio y estado.

### Etapa 2 — Redes de servicios (mediano plazo)

- Modulo servicios publicos con catalogo de capas y filtros avanzados.
- Panel de indicadores basicos por red y cobertura territorial.

### Etapa 3 — Calidad y publicacion (mediano plazo)

- Calidad de datos automatica + versionado + flujo de publicacion.
- Reportes institucionales y exportes consolidados.

---

## 11. Recomendaciones de modelado para Obras Privadas

Campos minimos recomendados:

- id_obra
- anio
- expediente
- estado_expediente
- tipo_obra
- titular
- profesional
- direccion
- ncp
- parcela_id
- superficie_m2
- fecha_ingreso
- fecha_aprobacion
- lat
- lng
- metodo_georreferencia
- confianza_georreferencia
- observaciones

Esto permite analitica historica, trazabilidad y control de calidad espacial.

---

## 12. Criterio de exito

Se considera implementacion exitosa cuando:

- El frontend lee las capas desde la DB (sin array estático).
- Obras Privadas se visualiza por anio, estado y tipo de obra en mapa.
- Servicios publicos se gestionan por capa con filtros y calidad de datos.
- Cualquier publicacion nueva pasa por validacion tecnica previa.
- El visor mantiene tiempos de carga aceptables y reportes consistentes.

---

## 13. Siguiente paso recomendado

**Inmediato**: conectar el frontend al endpoint `GET /api/layers/catalog` para
eliminar la duplicación entre código y base de datos.  
**Corto plazo**: módulo de ingesta y georreferenciación de Obras Privadas (Excel
multihoja), que genera impacto directo en la operación diaria municipal.
