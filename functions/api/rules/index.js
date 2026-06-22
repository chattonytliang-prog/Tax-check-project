import { badRequest, json, nowIso, readJson, requireDb, serverError } from '../_utils.js'
import { requireAdmin, requireUser } from '../auth/_auth.js'

function parseRule(row) {
  const payload = row.payload_json ? JSON.parse(row.payload_json) : {}
  return {
    code: row.code,
    name: row.name,
    taxType: row.tax_type || '',
    level: row.risk_level || '中',
    basis: row.basis || '',
    suggestion: row.suggestion || '',
    enabled: row.enabled === 1,
    conditionText: payload.conditionText || '',
    materials: Array.isArray(payload.materials) ? payload.materials : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeRule(input) {
  const code = String(input.code || '').trim().toUpperCase()
  const name = String(input.name || '').trim()
  const level = ['高', '中', '低'].includes(input.level) ? input.level : '中'
  const materials = Array.isArray(input.materials)
    ? input.materials.map((item) => String(item).trim()).filter(Boolean)
    : String(input.materials || '')
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)

  return {
    code,
    name,
    taxType: String(input.taxType || '').trim(),
    level,
    basis: String(input.basis || '').trim(),
    suggestion: String(input.suggestion || '').trim(),
    enabled: input.enabled === false ? 0 : 1,
    conditionText: String(input.conditionText || '').trim(),
    materials,
  }
}

export async function onRequestGet({ request, env }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response

    const canViewAll = auth.user.role === 'admin' || auth.user.actor?.role === 'admin'
    const total = await db.prepare('SELECT COUNT(*) AS count FROM risk_rules').first()
    const statement = canViewAll
      ? db.prepare('SELECT * FROM risk_rules ORDER BY code ASC')
      : db.prepare('SELECT * FROM risk_rules ORDER BY code ASC LIMIT 5')
    const { results } = await statement.all()

    return json({
      rules: results.map(parseRule),
      restrictedCount: canViewAll ? 0 : Math.max(0, (total?.count || 0) - results.length),
    })
  } catch (error) {
    return serverError(error)
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env)
    const auth = await requireAdmin(request, db)
    if (auth.response) return auth.response

    const rule = normalizeRule(await readJson(request))
    if (!rule.code || !rule.name) {
      return badRequest('Rule code and name are required')
    }

    const now = nowIso()
    await db
      .prepare(
        `INSERT INTO risk_rules (
          code, name, tax_type, risk_level, basis, suggestion, enabled, payload_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(code) DO UPDATE SET
          name = excluded.name,
          tax_type = excluded.tax_type,
          risk_level = excluded.risk_level,
          basis = excluded.basis,
          suggestion = excluded.suggestion,
          enabled = excluded.enabled,
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at`,
      )
      .bind(
        rule.code,
        rule.name,
        rule.taxType,
        rule.level,
        rule.basis,
        rule.suggestion,
        rule.enabled,
        JSON.stringify({ conditionText: rule.conditionText, materials: rule.materials }),
        now,
        now,
      )
      .run()

    return json({ rule: { ...rule, enabled: rule.enabled === 1, createdAt: now, updatedAt: now } })
  } catch (error) {
    return serverError(error)
  }
}
