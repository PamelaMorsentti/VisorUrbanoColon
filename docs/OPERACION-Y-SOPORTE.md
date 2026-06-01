# Operacion y Soporte Tecnico

## 1. Arranque de entorno

Desde la raiz del proyecto:

- pnpm install
- pnpm run dev

Esto levanta API y frontend en paralelo.

## 2. Comandos de verificacion

- pnpm run typecheck
- pnpm run build:web
- pnpm run build:api

## 2.1 Comandos de mantenimiento automatizado

- pnpm run docs:fichas-src
- pnpm run maint:archive-temp:dry
- pnpm run maint:archive-temp

## 3. Verificaciones funcionales minimas

- Frontend accesible en http://localhost:5173
- API responde en /api/healthz
- Panel de capas carga y alterna capas locales
- Capas externas se muestran (catalogo API o fallback)
- Descarga GeoJSON desde panel de capas

## 4. Operacion de datos geograficos

### 4.1 Regenerar jurisdiccion municipal

- pnpm --filter @workspace/scripts run build:jurisdiccion

Salida esperada:

- artifacts/colon-3d/public/data/jurisdiccion_municipal.geojson actualizado

### 4.2 Flujo sugerido para correcciones manuales en QGIS

1. Exportar/editar en QGIS.
2. Confirmar CRS WGS84.
3. Reemplazar archivo de jurisdiccion en public/data.
4. Recargar visor y validar visualmente.

## 5. Diagnostico rapido de fallos comunes

### 5.1 ECONNREFUSED al consultar API local

Causa frecuente: API no iniciada o puerto incorrecto.

Accion:

- verificar proceso API
- revisar VITE_API_BASE_URL en frontend

### 5.2 Capa externa sin datos

Causa frecuente: servicio WMS/TMS externo caido.

Accion:

- revisar /api/layers/catalog/health
- validar URL del proveedor
- desactivar temporalmente capa afectada si impacta UX

### 5.3 Error de base de datos

Causa frecuente: DATABASE_URL ausente o DB no disponible.

Accion:

- configurar DATABASE_URL
- validar conexion a PostgreSQL
- ejecutar push de schema en lib/db si corresponde

## 6. Politica de carpeta temporal

Para mantener raiz limpia y no romper runtime:

- usar carpeta _temporal en la raiz
- mover solo documentos fuentes, artefactos de diseño y configuraciones no usadas en ejecucion
- no mover package.json, pnpm-workspace.yaml, artifacts/colon-3d, artifacts/api-server, lib, scripts, ni public/data

## 7. Criterio de aceptacion despues de mantenimiento

El mantenimiento se considera correcto cuando:

- pnpm run dev inicia sin errores bloqueantes
- frontend y API funcionan
- no se rompieron rutas de datos ni endpoints
- documentacion en docs refleja el estado actual
