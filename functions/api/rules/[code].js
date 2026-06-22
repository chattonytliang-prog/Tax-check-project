import { badRequest, json, nowIso, readJson, requireDb, serverError } from '../_utils.js'
import { requireAdmin } from '../auth/_auth.js'

function normalizeRule(input, code) {
  const name = String(input.name || '').trim()
  const level = ['高', '中', '低'].includes(input.level) ? input.level : '中'
  const materials = Array.isArray(input.materials)
    ? input.materials.map((item) => String(item).trim()).filter(Boolean)
    : String(input.materials || '')
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)

  return {
    code: String(code || '').trim().toUpperCase(),
    name,
    taxType: String(input.taxType || '').trim(),
    level,
    basis: String(input.basis || '').trim(),
    suggestion: String(input.suggestion || '').trim(),
    enabled: input.enabled === false ? 0 : 1,
    conditionText: String(input.conditionText || '').trim(),
    conditionJson:
      input.conditionJson && typeof input.conditionJson === 'object'
        ? {
            field: String(input.conditionJson.field || ''),
            operator: ['>', '>=', '<', '<=', '=', '!='].includes(input.conditionJson.operator)
              ? input.conditionJson.operator
              : '=',
            value: input.conditionJson.value ?? '',
          }
        : { field: '', operator: '=', value: '' },
    materials,
  }
}

export async function onRequestPut({ request, env, params }) {
  try {
    const db = requireDb(env)
    const auth = await requireAdmin(request, db)
    if (auth.response) return auth.response

    const rule = normalizeRule(await readJson(request), params.code)
    if (!rule.code || !rule.name) {
      return badRequest('Rule code and name are required')
    }

    const now = nowIso()
    const result = await db
      .prepare(
        `UPDATE risk_rules
         SET name = ?, tax_type = ?, risk_level = ?, basis = ?, suggestion = ?, enabled = ?, payload_json = ?, updated_at = ?
         WHERE code = ?`,
      )
      .bind(
        rule.name,
        rule.taxType,
        rule.level,
        rule.basis,
        rule.suggestion,
        rule.enabled,
        JSON.stringify({ conditionText: rule.conditionText, conditionJson: rule.conditionJson, materials: rule.materials }),
        now,
        rule.code,
      )
      .run()

    if (result.meta?.changes === 0) {
      return json({ error: 'Rule not found' }, { status: 404 })
    }

    return json({ rule: { ...rule, enabled: rule.enabled === 1, updatedAt: now } })
  } catch (error) {
    return serverError(error)
  }
}

export async function onRequestDelete({ request, env, params }) {
  try {
    const db = requireDb(env)
    const auth = await requireAdmin(request, db)
    if (auth.response) return auth.response

    await db.prepare('DELETE FROM risk_rules WHERE code = ?').bind(String(params.code || '').toUpperCase()).run()
    return json({ ok: true })
  } catch (error) {
    return serverError(error)
  }
}
