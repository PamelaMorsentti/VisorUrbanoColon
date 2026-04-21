# Colón 3D — Visor Urbano

Visor interactivo de la ciudad de Colón, Entre Ríos. Permite explorar capas de datos geoespaciales urbanos y catastrales sobre un mapa, con funcionalidades de búsqueda, inspección y leyenda de zonificación.

---

## Tabla de Contenidos

- [Características](#características)
- [Requisitos](#requisitos)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Instalación y Puesta en Marcha](#instalación-y-puesta-en-marcha)
- [Uso de la Aplicación](#uso-de-la-aplicación)
- [Gestión de Datos Geoespaciales](#gestión-de-datos-geoespaciales)
- [Comandos Útiles](#comandos-útiles)
- [Notas y Pendientes](#notas-y-pendientes)

---

## Características

- Mapa interactivo centrado en Colón, Entre Ríos.
- Panel para activar/desactivar hasta 16 capas de datos urbanos y catastrales.
- Inspección de elementos con panel lateral.
- Búsqueda de direcciones (OpenStreetMap/Nominatim).
- Leyenda de zonificación urbana.
- Estética de mapa oscuro.
- Backend Express preparado para futuras ampliaciones.

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
│   ├── colon-3d/         # Frontend React + Vite
│   └── api-server/       # Backend Express
├── lib/
│   ├── db/               # ORM y conexión a PostgreSQL (drizzle-orm)
│   └── api-client-react/ # Cliente API para React
├── attached_assets/      # Datos originales (SHP, DBF, GeoJSON)
├── scripts/              # Scripts de utilidad y conversión
├── pnpm-workspace.yaml   # Configuración de monorepo
└── ...
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

4. **Inicializar la base de datos (opcional, solo si se usa PostgreSQL):**
   - Asegúrate de tener PostgreSQL corriendo y la base creada.
   - Ejecuta migraciones si corresponde (ver documentación de drizzle-orm).

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

## Uso de la Aplicación

- **Navegación:** Usa el mouse para moverte y hacer zoom en el mapa.
- **Panel de capas:** Activa o desactiva capas como manzanas, calles, edificios, árboles, etc.
- **Inspección:** Haz clic sobre cualquier elemento para ver detalles en el panel lateral.
- **Búsqueda:** Utiliza la barra de búsqueda para encontrar direcciones.
- **Leyenda:** Consulta la leyenda de zonificación para interpretar los colores y símbolos.

---

## Gestión de Datos Geoespaciales

- Los datos originales (SHP/DBF) están en `attached_assets/`.
- Los datos convertidos a GeoJSON se encuentran en `artifacts/colon-3d/public/data/`.
- Para convertir nuevos datos:
  1. Usa los scripts de `/tmp/shp_convert/convert.js` y `/tmp/shp_convert/reproject.js`.
  2. Asegúrate de que los archivos GeoJSON estén en WGS84 (EPSG:4326).

---

## Comandos Útiles

- `pnpm run dev` — Inicia API + frontend en paralelo (recomendado para uso diario).
- `pnpm run dev:fast` — Limpia puertos y arranca API + frontend (recomendado cuando hubo cierres inesperados).
- `pnpm run typecheck` — Verifica los tipos en todo el monorepo.
- `pnpm run build` — Compila todos los paquetes.
- `pnpm run dev:api` — Inicia API local.
- `pnpm run dev:web` — Inicia frontend local.
- `pnpm --filter @workspace/api-server run dev` — Inicia el backend.
- `pnpm --filter @workspace/colon-3d run dev` — Inicia el frontend.

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

- Faltan cargar ordenanzas urbanas (PDF/texto).
- Se pueden agregar más atributos a las parcelas (ej: propietario).
- Pendiente la carga de alturas para extrusión 3D de edificios.
- El backend está preparado para crecer (actualmente solo health checks).

---
