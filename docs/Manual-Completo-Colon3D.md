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

- API Express para:
  - health check,
  - hidrometria de Colon (CARU + fallback legible).

No hay todavia un backend transaccional completo para almacenar capas tematicas versionadas ni expedientes de Obras Privadas.

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
│  │     │  └─ index.ts
│  │     └─ lib/logger.ts
│  └─ mockup-sandbox/                  # Espacio de pruebas UI
├─ lib/
│  ├─ api-client-react/                # Cliente tipado de API
│  ├─ api-zod/                         # Contratos y validaciones API
│  ├─ api-spec/                        # Configuracion OpenAPI/Orval
│  └─ db/                              # Base Drizzle (esqueleto)
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
- Endpoints actuales:
  - `/api/healthz`
  - `/api/hydrology/colon`
- Diseño preparado para ampliar rutas de negocio.

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

## 8. Estado tecnico observado en esta revision

- Frontend build: correcto.
- Restriccion de calibracion de zonificacion a admin: implementada.
- Typecheck monorepo: pendiente de ajuste en `lib/api-zod` por imports con extension `.ts`.

Recomendacion inmediata:
- Corregir exports en `lib/api-zod` para eliminar extensiones en imports y recuperar typecheck global limpio.

---

## 9. Hoja de ruta de nuevas herramientas (propuesta)

A continuacion se priorizan herramientas concretas para tu necesidad de servicios publicos y Obras Privadas.

### 9.1 Modulo de redes de servicios publicos (prioridad alta)

Capas objetivo:
- agua
- cloacas
- pavimento
- gas
- electricidad
- alumbrado
- desagues pluviales

Funcionalidades propuestas:

1. Catalogo de capas de servicio con esquema estandar por tipo.
2. Versionado por fecha de relevamiento y fuente.
3. Simbologia tematica por estado (activo/proyectado/fuera de servicio).
4. Filtros operativos:
   - por barrio,
   - por tipo de red,
   - por estado,
   - por anio de obra.
5. Trazabilidad de cambios y auditoria de ediciones.
6. Descarga de capas filtradas (GeoJSON/CSV).

### 9.2 Modulo Obras Privadas (prioridad alta)

Problema actual:
- datos en Excel, separados por hojas por anio, sin georreferencia operativa unica.

Propuesta de solucion:

1. Ingesta Excel multihoja
- Cargar archivo xlsx.
- Detectar hojas (por anio) y unificarlas en una tabla canonica.
- Mapeo asistido de columnas (expediente, titular, direccion, nomenclatura, estado, superficie, destino, fecha, etc.).

2. Georreferenciacion de expedientes
- Estrategia 1: NCP/parcela (si existe clave catastral).
- Estrategia 2: geocodificacion de direccion (IGN/Nominatim).
- Estrategia 3: ubicacion manual asistida en mapa para casos no resueltos.
- Guardar nivel de confianza de geocodificacion.

3. Capa historica temporal
- Visualizacion por anio (slider temporal).
- Filtro por tipo de obra (nueva, ampliacion, regularizacion, demolicion, etc.).
- Filtro por estado de tramite.
- Densidad de expedientes por zona/manzana.

4. Tablero de gestion
- KPI por periodo:
  - cantidad de expedientes,
  - superficie aprobada,
  - tiempos promedio de tramitacion,
  - distribucion territorial.

5. Exportes y reportes
- Exportar resultados filtrados a Excel/CSV/PDF.
- Reporte por parcela y reporte anual de Obras Privadas.

### 9.3 Modulo de calidad de datos (prioridad media-alta)

1. Validador automatico pre-publicacion:
- CRS valido,
- geometria valida,
- campos obligatorios,
- duplicados,
- vacios criticos.

2. Semaforo de calidad por capa:
- verde: apta,
- amarillo: observaciones,
- rojo: no publicar.

3. Registro de errores con sugerencia de correccion.

### 9.4 Modulo de administracion de datos (prioridad media)

1. Repositorio de capas versionadas (metadatos + changelog).
2. Publicacion por ambiente (borrador, validado, productivo).
3. Control de acceso por permisos finos (RBAC):
- visualizar,
- cargar,
- validar,
- publicar,
- administrar.

---

## 10. Plan de implementacion sugerido (por etapas)

### Etapa 1 (rapida, 2-3 semanas)

- Normalizar ingestion Excel Obras Privadas (multihoja -> tabla unica).
- Georreferencia inicial por NCP + direccion.
- Vista de puntos/parcelas de Obras Privadas con filtros por anio y estado.

### Etapa 2 (3-5 semanas)

- Modulo servicios publicos con catalogo de capas y filtros avanzados.
- Panel de indicadores basicos por red y cobertura territorial.

### Etapa 3 (4-6 semanas)

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

- Obras Privadas se visualiza por anio, estado y tipo de obra en mapa.
- Servicios publicos se gestionan por capa con filtros y calidad de datos.
- Cualquier publicacion nueva pasa por validacion tecnica previa.
- El visor mantiene tiempos de carga aceptables y reportes consistentes.

---

## 13. Siguiente paso recomendado

Iniciar con el modulo de ingesta y georreferenciacion de Obras Privadas (Excel multihoja), porque genera impacto directo en tu operacion diaria y luego alimenta analisis y decisiones en todas las demas capas.
