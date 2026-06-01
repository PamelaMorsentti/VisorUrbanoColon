-- Topology QA views and refresh routine for municipal IDE
-- Depends on schema created in ide_core_schema.sql

BEGIN;

CREATE SCHEMA IF NOT EXISTS qa;

-- 1) Invalid geometries in core tables.
CREATE OR REPLACE VIEW qa.v_invalid_geometries AS
SELECT
  'core.jurisdiccion_municipal'::text AS layer_name,
  id::text AS feature_id,
  ST_IsValidReason(geom) AS reason,
  geom
FROM core.jurisdiccion_municipal
WHERE NOT ST_IsValid(geom)
UNION ALL
SELECT
  'core.manzana',
  id::text,
  ST_IsValidReason(geom),
  geom
FROM core.manzana
WHERE NOT ST_IsValid(geom)
UNION ALL
SELECT
  'core.parcela',
  id::text,
  ST_IsValidReason(geom),
  geom
FROM core.parcela
WHERE NOT ST_IsValid(geom)
UNION ALL
SELECT
  'core.zonificacion',
  id::text,
  ST_IsValidReason(geom),
  geom
FROM core.zonificacion
WHERE NOT ST_IsValid(geom);

-- 2) Parcelas outside any manzana by representative point.
CREATE OR REPLACE VIEW qa.v_parcela_outside_manzana AS
SELECT
  p.id::text AS parcela_id,
  p.cod_parcela,
  p.nomenclatura,
  p.geom
FROM core.parcela p
LEFT JOIN core.manzana m
  ON ST_Contains(m.geom, ST_PointOnSurface(p.geom))
WHERE m.id IS NULL;

-- 3) Manzanas outside municipal jurisdiction by representative point.
CREATE OR REPLACE VIEW qa.v_manzana_outside_jurisdiccion AS
SELECT
  m.id::text AS manzana_id,
  m.cod_manzana,
  m.nomenclatura,
  m.geom
FROM core.manzana m
LEFT JOIN core.jurisdiccion_municipal j
  ON ST_Contains(j.geom, ST_PointOnSurface(m.geom))
WHERE j.id IS NULL;

-- 4) Overlapping parcelas (excluding same feature).
CREATE OR REPLACE VIEW qa.v_parcela_overlaps AS
SELECT
  a.id::text AS parcela_a_id,
  b.id::text AS parcela_b_id,
  ST_Area(ST_Intersection(a.geom, b.geom)::geography) AS overlap_m2,
  ST_Intersection(a.geom, b.geom) AS geom
FROM core.parcela a
JOIN core.parcela b
  ON a.id < b.id
 AND ST_Intersects(a.geom, b.geom)
 AND NOT ST_Touches(a.geom, b.geom)
WHERE ST_Area(ST_Intersection(a.geom, b.geom)::geography) > 0.01;

-- 5) Sliver candidate manzanas (very small polygons).
CREATE OR REPLACE VIEW qa.v_manzana_slivers AS
SELECT
  m.id::text AS manzana_id,
  m.cod_manzana,
  ST_Area(m.geom::geography) AS area_m2,
  m.geom
FROM core.manzana m
WHERE ST_Area(m.geom::geography) < 5.0;

-- Materialize findings in qa.topology_issues.
CREATE OR REPLACE FUNCTION qa.refresh_topology_issues()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  total_manzana integer := 0;
  inside_manzana integer := 0;
  manzana_coverage numeric := 0;
BEGIN
  DELETE FROM qa.topology_issues;

  INSERT INTO qa.topology_issues (
    rule_code, severity, layer_name, feature_id, message, issue_data, geom
  )
  SELECT
    'invalid_geometry',
    'high',
    v.layer_name,
    v.feature_id,
    'Geometría inválida: ' || COALESCE(v.reason, 'sin detalle'),
    jsonb_build_object('reason', v.reason),
    v.geom
  FROM qa.v_invalid_geometries v;

  INSERT INTO qa.topology_issues (
    rule_code, severity, layer_name, feature_id, related_layer, message, issue_data, geom
  )
  SELECT
    'parcela_outside_manzana',
    'high',
    'core.parcela',
    v.parcela_id,
    'core.manzana',
    'Parcela fuera de cualquier manzana (point-on-surface).',
    jsonb_build_object(
      'cod_parcela', v.cod_parcela,
      'nomenclatura', v.nomenclatura
    ),
    v.geom
  FROM qa.v_parcela_outside_manzana v;

  SELECT COUNT(*) INTO total_manzana FROM core.manzana;
  SELECT COUNT(*) INTO inside_manzana
  FROM core.manzana m
  WHERE EXISTS (
    SELECT 1
    FROM core.jurisdiccion_municipal j
    WHERE ST_Contains(j.geom, ST_PointOnSurface(m.geom))
  );

  IF total_manzana > 0 THEN
    manzana_coverage := inside_manzana::numeric / total_manzana::numeric;
  ELSE
    manzana_coverage := 1;
  END IF;

  IF manzana_coverage >= 0.20 THEN
    INSERT INTO qa.topology_issues (
      rule_code, severity, layer_name, feature_id, related_layer, message, issue_data, geom
    )
    SELECT
      'manzana_outside_jurisdiccion',
      'high',
      'core.manzana',
      v.manzana_id,
      'core.jurisdiccion_municipal',
      'Manzana fuera de jurisdicción municipal (point-on-surface).',
      jsonb_build_object(
        'cod_manzana', v.cod_manzana,
        'nomenclatura', v.nomenclatura
      ),
      v.geom
    FROM qa.v_manzana_outside_jurisdiccion v;
  ELSE
    INSERT INTO qa.topology_issues (
      rule_code, severity, layer_name, message, issue_data, geom
    )
    SELECT
      'manzana_jurisdiccion_coverage_low',
      'medium',
      'core.jurisdiccion_municipal',
      'Cobertura de jurisdicción insuficiente para evaluar contención de manzanas; se omiten issues individuales.',
      jsonb_build_object(
        'coverage_ratio', manzana_coverage,
        'inside_manzana', inside_manzana,
        'total_manzana', total_manzana,
        'threshold', 0.20
      ),
      ST_Envelope(ST_Collect(geom))
    FROM core.jurisdiccion_municipal;
  END IF;

  INSERT INTO qa.topology_issues (
    rule_code, severity, layer_name, feature_id, related_layer, related_feature_id, message, issue_data, geom
  )
  SELECT
    'parcela_overlap',
    'medium',
    'core.parcela',
    v.parcela_a_id,
    'core.parcela',
    v.parcela_b_id,
    'Superposición entre parcelas.',
    jsonb_build_object('overlap_m2', v.overlap_m2),
    v.geom
  FROM qa.v_parcela_overlaps v;

  INSERT INTO qa.topology_issues (
    rule_code, severity, layer_name, feature_id, message, issue_data, geom
  )
  SELECT
    'manzana_sliver',
    'low',
    'core.manzana',
    v.manzana_id,
    'Manzana con área menor al umbral (sliver candidate).',
    jsonb_build_object('area_m2', v.area_m2, 'cod_manzana', v.cod_manzana),
    v.geom
  FROM qa.v_manzana_slivers v;
END;
$$;

COMMIT;
