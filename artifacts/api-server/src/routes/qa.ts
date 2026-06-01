import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

function clampLimit(value: unknown, fallback = 200, max = 5000) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

router.get("/qa/topology-issues", async (req, res) => {
  const severity = typeof req.query.severity === "string" ? req.query.severity.trim() : "";
  const ruleCode = typeof req.query.ruleCode === "string" ? req.query.ruleCode.trim() : "";
  const layerName = typeof req.query.layerName === "string" ? req.query.layerName.trim() : "";
  const limit = clampLimit(req.query.limit, 200, 5000);

  const where: string[] = [];
  const params: unknown[] = [];

  if (severity) {
    params.push(severity);
    where.push(`severity = $${params.length}`);
  }
  if (ruleCode) {
    params.push(ruleCode);
    where.push(`rule_code = $${params.length}`);
  }
  if (layerName) {
    params.push(layerName);
    where.push(`layer_name = $${params.length}`);
  }

  params.push(limit);
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const sql = `
    SELECT
      issue_id,
      detected_at,
      rule_code,
      severity,
      layer_name,
      feature_id,
      related_layer,
      related_feature_id,
      message,
      issue_data,
      ST_AsGeoJSON(geom)::jsonb AS geometry
    FROM qa.topology_issues
    ${whereSql}
    ORDER BY issue_id ASC
    LIMIT $${params.length}
  `;

  const result = await pool.query(sql, params);
  return res.json({
    data: result.rows,
    meta: {
      count: result.rowCount,
      limit,
      filters: {
        severity: severity || null,
        ruleCode: ruleCode || null,
        layerName: layerName || null,
      },
    },
  });
});

router.get("/qa/topology-issues/summary", async (_req, res) => {
  const byRule = await pool.query(`
    SELECT rule_code, COUNT(*)::int AS count
    FROM qa.topology_issues
    GROUP BY rule_code
    ORDER BY count DESC, rule_code ASC
  `);

  const bySeverity = await pool.query(`
    SELECT severity, COUNT(*)::int AS count
    FROM qa.topology_issues
    GROUP BY severity
    ORDER BY count DESC, severity ASC
  `);

  const total = await pool.query(`SELECT COUNT(*)::int AS count FROM qa.topology_issues`);

  return res.json({
    data: {
      total: total.rows[0]?.count ?? 0,
      byRule: byRule.rows,
      bySeverity: bySeverity.rows,
    },
  });
});

export default router;
