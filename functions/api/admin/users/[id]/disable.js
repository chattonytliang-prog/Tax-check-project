import { json, requireDb, serverError } from '../../../_utils.js'
import { requireAdmin } from '../../../auth/_auth.js'

export async function onRequestPost({ request, env, params }) {
  try {
    const db = requireDb(env)
    const auth = await requireAdmin(request, db)
    if (auth.response) return auth.response

    if (params.id === auth.admin.id) {
      return json({ error: 'Cannot disable current admin' }, { status: 400 })
    }

    const result = await db.batch([
      db.prepare('UPDATE users SET disabled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(params.id),
      db.prepare('DELETE FROM sessions WHERE user_id = ? OR actor_user_id = ?').bind(params.id, params.id),
      db
        .prepare(
          'INSERT INTO audit_logs (id, actor_user_id, target_user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
        )
        .bind(crypto.randomUUID(), auth.admin.id, params.id, 'disable_user', ''),
    ])

    return json({ ok: true, result })
  } catch (error) {
    return serverError(error)
  }
}
