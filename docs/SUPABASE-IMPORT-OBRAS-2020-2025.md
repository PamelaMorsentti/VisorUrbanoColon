# Supabase - Importacion de Obras 2020-2025

## 1) Requisitos
- Proyecto Supabase creado (plan Free).
- `DATABASE_URL` del proyecto disponible.
- Archivos fuente presentes:
  - `_temporal/diseno_fuentes/2020.csv`
  - `_temporal/diseno_fuentes/2021.csv`
  - `_temporal/diseno_fuentes/2022.csv`
  - `_temporal/diseno_fuentes/2023.csv`
  - `_temporal/diseno_fuentes/2024.csv`
  - `_temporal/diseno_fuentes/2025.csv`

## 2) Aplicar esquema SQL en Supabase
En SQL Editor de Supabase ejecutar:
- `lib/db/sql/obras_data_governance.sql`

Este script crea:
- `core.obras_ingest_raw` (json completo del Excel)
- `core.obras_ingest_wide` (49 columnas explicitas + json)
- `core.obras` (normalizada operativa)
- `core.obras_excel_column_catalog` (catalogo de columnas)
- `core.obras_edit_log` (auditoria)

## 3) Configurar DATABASE_URL localmente
PowerShell (temporal para sesion actual):

```powershell
$env:DATABASE_URL="postgres://..."
```

## 4) Ejecutar importacion masiva
Desde raiz del repo:

```powershell
pnpm --filter @workspace/scripts run import:obras:years
```

Opcional: importar solo algunos años (ejemplo 2024,2025)

```powershell
pnpm --filter @workspace/scripts exec tsx ./src/import-obras-years-to-db.ts 2024,2025
```

## 5) Validaciones SQL recomendadas

```sql
select source_year, count(*)
from core.obras_ingest_raw
group by source_year
order by source_year;

select source_year, count(*)
from core.obras_ingest_wide
group by source_year
order by source_year;

select count(*) as total_obras_normalizadas
from core.obras;
```

## 6) Consultas utiles para filtros funcionales

Todas las obras de 2024:

```sql
select *
from core.obras
where extract(year from fecha_visado) = 2024
order by fecha_visado desc;
```

Obras mayores a X m2:

```sql
select *
from core.obras
where m2_total > 200
order by m2_total desc;
```

Obras por profesional:

```sql
select *
from core.obras
where profesional_proyecto ilike '%apellido%'
order by fecha_visado desc;
```

Obras por constructor o propietario:

```sql
select *
from core.obras
where constructor ilike '%texto%'
   or propietario ilike '%texto%';
```

Obras por uso/destino:

```sql
select *
from core.obras
where destino_uso ilike '%vivienda%';
```

Obras por ubicacion textual (calle/barrio/zona):

```sql
select *
from core.obras
where raw_ubicacion ilike '%urquiza%'
   or zonificacion ilike '%urbana%';
```

## 7) Nota operativa
El importador usa upsert por `(source_file, source_row_number)`.
Si corregis CSV y re-ejecutas, actualiza los registros sin duplicar.
