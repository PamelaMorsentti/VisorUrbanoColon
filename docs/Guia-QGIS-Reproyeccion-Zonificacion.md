# Guia QGIS - Correccion de Zonificacion (flujo recomendado)

Objetivo: corregir la capa de zonificacion en origen para que quede alineada sin depender de ajustes manuales en la app web.

## 1) Preparar insumos

- Capa CAD original de zonificacion (DXF/DWG o GeoJSON exportado desde CAD).
- Capa de referencia confiable en WGS84 (por ejemplo manzana/calle del proyecto).
- Definir una carpeta de salida para datos corregidos.

Sugerencia de referencia en este proyecto:
- `attached_assets/geojson_wgs84/manzana.geojson`
- `attached_assets/geojson_wgs84/Calle.geojson`

## 2) Diagnostico rapido del origen

En QGIS, al cargar la capa CAD:

1. Revisar si la capa trae CRS declarado.
2. Si no trae CRS, NO reproyectar aun. Primero hay que asignar CRS de origen real.
3. Verificar orden de ejes y magnitudes:
   - WGS84 suele estar aprox en lon -58.x / lat -32.x para Colon.
   - Si aparecen valores de miles o decenas de miles, son coordenadas locales/proyectadas CAD.

Regla clave:
- Asignar CRS (Set Layer CRS) != Reproyectar geometria.
- Reproyectar (Save As con otro CRS) solo despues de tener origen correcto.

## 3) Caso A - La capa SI tiene CRS correcto

Si se confirma CRS valido de origen:

1. Click derecho capa -> Export -> Save Features As...
2. CRS destino: EPSG:4326 (WGS 84)
3. Formato: GeoJSON
4. Guardar como `zonas.geojson`
5. Validar superposicion con manzana/calle.

## 4) Caso B - Capa CAD en coordenadas locales (sin georreferencia)

Este suele ser el caso de capas con "inclinacion" y "corrimiento".

### 4.1 Georreferenciar en QGIS

1. Abrir Georeferencer (Raster -> Georeferencer), o usar flujo vectorial equivalente con puntos de control.
2. Tomar puntos de control (GCP) bien distribuidos (minimo 6, ideal 10-20):
   - Esquinas de manzanas reconocibles
   - Cruces de calles claros
   - Cambios de borde notorios
3. En destino, usar la capa de referencia correcta (manzana/calle) en EPSG:4326.
4. Transformacion recomendada inicial:
   - Helmert (si predomina rotacion + escala + traslado)
   - Affine (si hay sesgo leve adicional)
5. Metodo de remuestreo no es critico para vector, pero mantener precision alta.
6. Ejecutar y generar capa corregida.

### 4.2 Control de calidad (obligatorio)

- Revisar error RMS global y por punto.
- Eliminar/reubicar GCPs con error alto.
- Repetir hasta tener ajuste estable visual y numerico.
- Validar en al menos 3 zonas del ejido (norte, centro, sur).

## 5) Convertir lineas CAD de zonas a poligonos validos

Si zonificacion llega como LineString:

1. Asegurar cierre de lineas por zona.
2. Usar herramienta "Polygonize" (o equivalente) para generar poligonos.
3. Mantener atributo `ZONA`.
4. Corregir topologia:
   - Sin gaps
   - Sin overlaps indeseados (salvo reglas urbanisticas explicitas)
   - Sin auto-intersecciones

## 6) Exportacion final para la app

1. Exportar GeoJSON final en EPSG:4326.
2. Archivo final esperado por la app:
   - `artifacts/colon-3d/public/data/zonas.geojson`
3. Confirmar que propiedades clave existan:
   - `ZONA`
   - (opcional) `color`

## 7) Validacion final en la app

1. Levantar app y activar capa zonificacion.
2. Comparar contra manzana/calle en:
   - borde oeste
   - centro urbano
   - borde este (zona del rio)
3. Verificar seleccion de zona en sectores solapados.
4. Si quedo correcto en origen, la calibracion manual debe quedar en valores neutros o minimos.

## 8) Politica operativa recomendada

- Calibracion manual en app: solo contingencia y solo administrador.
- Fuente de verdad: archivo georreferenciado correctamente en QGIS.
- Cada nueva version de zonificacion debe incluir:
  - CRS documentado
  - metodo de ajuste
  - fecha
  - responsable tecnico

## 9) Checklist de entrega

- [ ] CRS de origen identificado y documentado
- [ ] Georreferenciacion realizada (si aplica)
- [ ] RMS aceptable y GCPs revisados
- [ ] Poligonos validados topologicamente
- [ ] Exportado a EPSG:4326
- [ ] Reemplazo de `zonas.geojson` en la app
- [ ] Validacion visual en 3 sectores
- [ ] Validacion funcional de seleccion de zona

---

Nota de continuidad del proyecto:
- Se mantiene disponible la calibracion manual para administrador como respaldo operativo temporal.
- La meta es desactivarla gradualmente cuando la capa de origen quede estable.
