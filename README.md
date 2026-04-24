# Colón 3D — Visor Urbano

Visor interactivo de la ciudad de Colón, Entre Ríos. Permite explorar capas de datos geoespaciales urbanos, catastrales y temáticas nacionales sobre un mapa, con funcionalidades de búsqueda, inspección, leyenda de zonificación y capas externas con GetFeatureInfo.

> **Estado (abril 2026):** Frontend operativo · API con catálogo de capas · DB PostgreSQL con schema de capas aplicado · 10 capas externas sembradas · Drizzle Studio disponible

---

## Tabla de Contenidos

- [Características](#características)
- [Requisitos](#requisitos)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Instalación y Puesta en Marcha](#instalación-y-puesta-en-marcha)
- [Base de Datos](#base-de-datos)
- [Uso de la Aplicación](#uso-de-la-aplicación)
- [Capas Externas](#capas-externas)
- [Gestión de Datos Geoespaciales](#gestión-de-datos-geoespaciales)
- [Comandos Útiles](#comandos-útiles)
- [API Endpoints](#api-endpoints)
- [Notas y Pendientes](#notas-y-pendientes)

---

## Características

- Mapa interactivo centrado en Colón, Entre Ríos.
- Panel para activar/desactivar capas locales (catastro, infraestructura, topografía, verde urbano) y capas externas (IGN, INTA, NASA, etc.).
- **10 capas externas** de servicios nacionales (TMS y WMS): IGN, INTA, CONAE, ESA, NASA GPM, SAyDS, SMN.
- Leyendas inline por capa en el panel de capas.
- **GetFeatureInfo**: al hacer click sobre el mapa sobre una capa WMS activa, muestra atributos del elemento.
- Inspección de elementos locales con panel lateral.
- Búsqueda de direcciones (IGN/Nominatim) y búsqueda catastral.
- Leyenda de zonificación urbana con parámetros normativos (FOS, FOT, altura, retiros).
- Informes técnicos imprimibles por parcela.
- Herramienta de medición (distancia y superficie).
- Carga temporal de capas GIS (GeoJSON, ZIP SHP, KML).
- Control de acceso por roles: admin, registrado, invitado.
- **Backend Express** con catálogo de capas en PostgreSQL (Drizzle ORM).
- Estética de mapa oscuro.

---

## Requisitos

- Node.js 24+
- pnpm (gestor de paquetes)
- PostgreSQL (para funcionalidades avanzadas y persistencia)
- Acceso a los datos geoespaciales (GeoJSON/SHP)

---

## Estructura del Proyecto

```
Colon-Entre-Rios/
├── artifacts/
│   ├── colon-3d/         # Frontend React + Vite + Leaflet
│   │   ├── public/data/  # GeoJSON operativos (WGS84)
│   │   └── src/
│   │       ├── pages/MapViewer.tsx         # Página principal y lógica GIS
│   │       ├── components/                 # Paneles, búsqueda, capas, etc.
│   │       └── lib/
│   │           ├── layers.ts               # Definición de capas locales y externas
│   │           └── zonaData.ts             # Indicadores normativos por zona
│   ├── api-server/       # Backend Express (puerto 3000 / 5180)
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── health.ts               # GET /api/healthz
│   │       │   ├── hydrology.ts            # GET /api/hydrology/colon
│   │       │   └── layerCatalog.ts         # CRUD catálogo de capas
│   │       └── lib/
│   │           └── externalLayersSeed.ts   # Datos semilla de las 10 capas externas
│   └── mockup-sandbox/   # Espacio de pruebas UI
├── lib/
│   ├── db/               # ORM Drizzle + conexión PostgreSQL
│   │   └── src/schema/
│   │       └── layerCatalog.ts  # Tabla layer_catalog + Zod validators
│   ├── api-client-react/ # Cliente API tipado para React
│   ├── api-zod/          # Contratos y validaciones API
│   └── api-spec/         # Configuración OpenAPI/Orval
├── attached_assets/      # Insumos originales (SHP, DBF, GeoJSON)
├── scripts/              # Scripts de utilidad
├── docs/
│   ├── Manual-Completo-Colon3D.md
│   └── Guia-QGIS-Reproyeccion-Zonificacion.md
├── Iniciar-Colon3D.bat   # Inicio rápido Windows (doble clic)
├── .env                  # Variables de entorno (DATABASE_URL, etc.)
├── pnpm-workspace.yaml
└── package.json
```

---

## Instalación y Puesta en Marcha

1. **Clonar el repositorio y entrar al directorio:**
   ```sh
   git clone <url-del-repo>
   cd Colon-Entre-Rios
   ```

2. **Instalar dependencias:**
   ```sh
   pnpm install
   ```

### Flujo rápido para próximas veces (sin reinstalar)

Si ya ejecutaste `pnpm install` una vez y no cambiaste dependencias, la próxima vez solo necesitas:

```powershell
pnpm run dev
```

Eso levanta API + frontend en paralelo con un único comando.

- Frontend: `http://localhost:5173`
- API: `http://localhost:5180`

Para detener todo: `Ctrl + C` en esa misma terminal.

Si querés la opción más ágil y robusta (limpia puertos ocupados y arranca todo):

```powershell
pnpm run dev:fast
```

Este comando cierra procesos en puertos `5173`, `5174` y `5180` antes de iniciar.

Tambien puedes iniciar con doble clic usando `Iniciar-Colon3D.bat` en la raiz del proyecto.

3. **Configurar variables de entorno (opcional para desarrollo):**
    - Backend: usa `artifacts/api-server/.env.example` como base.
    - Frontend: usa `artifacts/colon-3d/.env.example` como base.
    - En desarrollo local, el proyecto ya tiene defaults seguros:
       - Frontend: `PORT=5173`, `BASE_PATH=/`
       - API: `PORT=5180`

4. **Inicializar la base de datos:**
   ```powershell
   # Cargar variables del .env y empujar el schema a PostgreSQL
   $envVars = Get-Content .env | Where-Object { $_ -match '^\s*([^#][^=]*)=(.*)' }
   $envVars | ForEach-Object { if ($_ -match '^([^=]+)=(.*)') { [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim()) } }
   cd lib/db
   pnpm run push
   cd ../..
   ```
   > Solo necesario la primera vez o cuando se agreguen tablas nuevas.

5. **Ejecutar el backend:**
   ```sh
   pnpm --filter @workspace/api-server run dev
   ```

6. **Ejecutar el frontend:**
   ```sh
   pnpm --filter @workspace/colon-3d run dev
   ```
   - Accede a la app en `http://localhost:5173`.

### Inicio rápido en Windows (PowerShell)

1. Instalar dependencias:
   ```powershell
   pnpm install
   ```

2. Terminal A (API):
   ```powershell
   $env:PORT=5180
   pnpm run dev:api
   ```

3. Terminal B (Frontend):
   ```powershell
   $env:PORT=5173
   $env:BASE_PATH="/"
   pnpm run dev:web
   ```

4. Abrir:
   - `http://localhost:5173`

---

## Base de Datos

### Conexión
- **Motor**: PostgreSQL local (`localhost:5432`)
- **Base**: `colondb` | **Usuario**: `postgres`
- **Config**: variable `DATABASE_URL` en `.env` raíz

### Tablas y enums (schema `public`)

| Objeto | Tipo | Descripción |
|---|---|---|
| `layer_type` | enum | `tms` / `wms` / `geojson` |
| `layer_health_status` | enum | `unknown` / `ok` / `degraded` / `down` |
| `layer_catalog` | tabla | Catálogo centralizado de capas geoespaciales |

**Columnas principales de `layer_catalog`:** `id` (UUID PK), `key` (UNIQUE), `label`, `group`, `layer_type`, `source_url`, `source_layer_name`, `attribution`, `is_external`, `is_active`, `supports_get_feature_info`, `legend` (JSONB), `health_status`, `health_checked_at`, `last_error`, `created_at`, `updated_at`.

### Herramientas de acceso

**Drizzle Studio** (GUI visual):
```powershell
# Desde lib/db (con DATABASE_URL en env)
pnpm exec drizzle-kit studio --port 4983
# Abre: https://local.drizzle.studio
```

**psql** (línea de comandos):
```powershell
psql -U postgres -d colondb -h localhost
# Luego: \dt  /  \d layer_catalog  /  SELECT key, label, health_status FROM layer_catalog;
```

**pgAdmin**: conectar a `localhost:5432`, base `colondb`.

### Sembrado inicial
```powershell
# Con el servidor API corriendo:
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/layers/catalog/bootstrap-external
# Siembra idempotente las 10 capas externas
```

---

## Capas Externas

10 capas de servicios nacionales integradas en el panel de capas:

| ID | Label | Tipo | Proveedor |
|---|---|---|---|
| `ext_ign_satelital` | IGN — Mosaico satelital | TMS | IGN Argentina |
| `ext_ign_topografico` | IGN — Topográfico | TMS | IGN Argentina |
| `ext_inta_suelos` | INTA — Suelos de Argentina | WMS | INTA |
| `ext_conae_ndvi` | CONAE — NDVI/Vegetación | TMS | CONAE |
| `ext_esa_worldcover` | ESA — WorldCover 2021 | TMS | ESA |
| `ext_nasa_gpm` | NASA GPM — Precipitaciones | TMS | NASA Earthdata |
| `ext_sayds_bosques` | SAyDS — Bosques Nativos | WMS | Ambiente Nación |
| `ext_sayds_incendios` | SAyDS — Riesgo de incendios | WMS | Ambiente Nación |
| `ext_smn_precipitacion` | SMN — Precipitación media | WMS | Servicio Met. Nac. |
| `ext_smn_temperatura` | SMN — Temperatura media | WMS | Servicio Met. Nac. |

Las capas WMS con `supportsGetFeatureInfo: true` muestran atributos al hacer click en el mapa.

---



- **Navegación:** Usa el mouse para moverte y hacer zoom en el mapa.
- **Panel de capas:** Activa o desactiva capas como manzanas, calles, edificios, árboles, etc.
- **Inspección:** Haz clic sobre cualquier elemento para ver detalles en el panel lateral.
- **Búsqueda:** Utiliza la barra de búsqueda para encontrar direcciones.
- **Leyenda:** Consulta la leyenda de zonificación para interpretar los colores y símbolos.

---

## API Endpoints

El servidor API corre en puerto **3000** (producción) o **5180** (desarrollo).

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/healthz` | Health check del servidor |
| `GET` | `/api/hydrology/colon` | Nivel del río Colón (CARU) |
| `GET` | `/api/layers/catalog` | Listado de capas (`?externalOnly=true&onlyActive=true`) |
| `POST` | `/api/layers/catalog/upsert` | Crear/actualizar una capa por `key` |
| `PATCH` | `/api/layers/catalog/:key/health` | Actualizar estado de salud de una capa |
| `GET` | `/api/layers/catalog/health` | Dashboard de salud de todas las capas |
| `POST` | `/api/layers/catalog/bootstrap-external` | Sembrar las 10 capas externas (idempotente) |

---

## Gestión de Datos Geoespaciales

- Los datos originales (SHP/DBF) están en `attached_assets/`.
- Los datos convertidos a GeoJSON se encuentran en `artifacts/colon-3d/public/data/`.
- Para convertir nuevos datos:
  1. Usa los scripts de `/tmp/shp_convert/convert.js` y `/tmp/shp_convert/reproject.js`.
  2. Asegúrate de que los archivos GeoJSON estén en WGS84 (EPSG:4326).

---

## Comandos Útiles

**Desarrollo:**
- `pnpm run dev` — Inicia API + frontend en paralelo (recomendado para uso diario).
- `pnpm run dev:fast` — Limpia puertos y arranca API + frontend (recomendado cuando hubo cierres inesperados).
- `pnpm run dev:api` — Inicia solo la API.
- `pnpm run dev:web` — Inicia solo el frontend.

**Compilación y verificación:**
- `pnpm run typecheck` — Verifica los tipos en todo el monorepo.
- `pnpm run build` — Compila todos los paquetes.
- `pnpm run build:api` — Compila solo la API.
- `pnpm run build:web` — Compila solo el frontend.

**Base de datos (desde `lib/db`):**
- `pnpm run push` — Aplica el schema a PostgreSQL sin migraciones.
- `pnpm exec drizzle-kit studio --port 4983` — GUI visual de la DB.

**API directa (PowerShell):**
```powershell
Invoke-RestMethod http://localhost:3000/api/healthz
Invoke-RestMethod http://localhost:3000/api/layers/catalog
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/layers/catalog/bootstrap-external
```

---

## Producción (Hardening básico)

1. API:
   - Configurar `PORT` y `DATABASE_URL` en el entorno del servidor.
   - Build y run:
     ```sh
     pnpm run build:api
     pnpm run start:api
     ```

2. Frontend:
   - Definir `BASE_PATH` si se publica bajo subruta (por defecto `/`).
   - Definir `VITE_API_BASE_URL` para apuntar a tu API productiva.
   - Build:
     ```sh
     pnpm run build:web
     ```

3. Verificación:
   - Health API: `GET /api/healthz`
   - Hidrología Colón: `GET /api/hydrology/colon`

---

## Notas y Pendientes

### Implementado ✅
- Catálogo de capas en PostgreSQL (`layer_catalog`) con Drizzle ORM.
- 10 capas externas nacionales (TMS/WMS) operativas con leyendas inline.
- GetFeatureInfo al hacer click sobre capas WMS activas.
- API REST para gestión del catálogo de capas.
- Bootstrap idempotente de capas externas.

### Pendiente ⏳
- **Frontend conectado al catálogo**: reemplazar el array estático `EXTERNAL_LAYERS` en `layers.ts` por una llamada a `GET /api/layers/catalog?externalOnly=true`. Los datos ya están en la DB.
- **Health-check automático**: job periódico que pruebe cada WMS/TMS y actualice `health_status` + `last_error` en la tabla.
- **Badge de salud de capas**: mostrar indicador visual (✓/⚠/✗) en el panel de capas basado en `health_status`.
- **Módulo Obras Privadas**: ingestión del Excel histórico, geocodificación, vista de puntos y filtros.
- **Módulo redes de servicios**: capas de agua, cloacas, pavimento, electricidad, gas.
- **Alturas para extrusión 3D** de edificios (datos ya disponibles en `Edif_PAlta.geojson`).
- Carga de ordenanzas urbanas como documentos vinculados a parcelas.

---
