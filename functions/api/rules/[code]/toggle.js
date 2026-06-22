import { json, requireDb, serverError } from '../../_utils.js'
import { requireAdmin } from '../../auth/_auth.js'

export async function onRequestPost({ request, env, params }) {
  try {
    const db = requireDb(env)
    const auth = await requireAdmin(request, db)
    if (auth.response) return auth.response

    const code = String(params.code || '').toUpperCase()
    const row = await db.prepare('SELECT enabled FROM risk_rules WHERE code = ?').bind(code).first()
    if (!row) {
      return json({ error: 'Rule not found' }, { status: 404 })
    }

    const enabled = row.enabled === 1 ? 0 : 1
    await db
      .prepare('UPDATE risk_rules SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?')
      .bind(enabled, code)
      .run()

    return json({ ok: true, enabled: enabled === 1 })
  } catch (error) {
    return serverError(error)
  }
}
