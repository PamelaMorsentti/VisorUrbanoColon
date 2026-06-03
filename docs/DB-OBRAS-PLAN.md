# Plan DB - Obras, Legajos y Profesionales

## Objetivo
Guardar el 100% de columnas y filas del Excel original y, en paralelo, tener tablas normalizadas para consultas rapidas, filtros y panel admin.

## Flujo recomendado
1. Subir Excel anual a `_temporal/diseno_fuentes/`.
2. Convertir a CSV normalizado y ejecutar pipeline de limpieza/geolocalizacion.
3. Insertar dataset completo en tabla raw (`obras_ingest_raw`).
4. Sincronizar tablas normalizadas (`obras`, `obras_legajos`, `profesionales`, `obras_partes`).
5. Publicar vistas por rol (`public`, `professional`, `admin`).

## Modelo de datos

### 1) Raw completo (sin perder columnas)
- Tabla: `core.obras_ingest_raw`
- Campos clave:
  - `id` uuid pk
  - `source_file` text
  - `source_year` int
  - `source_row_number` text
  - `legajo_canonico` text
  - `raw_payload` jsonb (todas las columnas originales)
  - `created_at`, `updated_at`

### 2) Legajos/obras normalizados
- Tabla: `core.obras`
  - identidad: `id`, `legajo_canonico`, `expediente`
  - negocio: `fecha_visado`, `destino_uso`, `tipo`, `propietario`, `constructor`, `profesional_proyecto`
  - superficie: `m2_total`, `m2_a_construir`, `m2_relevado`
  - ubicacion: `raw_ubicacion`, `direccion_obra`, `ncp`, `ncp_formatted`, `zonificacion`
  - geodata: `geom_point geometry(Point,4326)`

- Tabla: `core.profesionales`
  - `id`, `nombre`, `matricula`, `telefono`, `email`, `metadata`

- Tabla: `core.obra_profesional`
  - relacion M:N entre obra y profesional

### 3) Auditoria de edicion
- Tabla: `core.obras_edit_log`
  - `id`, `obra_id`, `field_name`, `old_value`, `new_value`, `edited_by`, `edited_at`, `reason`

## Reglas de visibilidad
- `public`: campos anonimizados/sanitizados.
- `professional`: campos tecnicos + trazabilidad parcial.
- `admin`: acceso total + capacidad de edicion.

## Filtros soportados (requisito funcional)
- Ano (ej. todas las obras 2024)
- Rango m2 (ej. > X m2)
- Profesional/constructor/propietario
- Destino/uso
- Ubicacion textual (calle/barrio/zona)
- NCP o partida municipal

## Acceso desde plano general
En el visor principal:
- `Acceso` (usuario autenticado)
- `Abrir dashboard` (analitica)
- `Panel admin de datos` (nuevo panel interno para listado + filtros + edicion)

## Nota de transicion
Hasta tener API de escritura activa, el panel admin del frontend guarda overrides localmente y permite exportarlos/importarlos como JSON para control de cambios.
