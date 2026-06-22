import { badRequest, json, readJson, requireDb, serverError } from '../../../_utils.js'
import { createSalt, hashPassword, requireAdmin } from '../../../auth/_auth.js'

export async function onRequestPost({ request, env, params }) {
  try {
    const db = requireDb(env)
    const auth = await requireAdmin(request, db)
    if (auth.response) return auth.response

    const body = await readJson(request)
    const password = String(body.password || '')
    if (password.length < 6 || password.length > 72) {
      return badRequest('Password must be 6-72 characters')
    }

    const user = await db.prepare('SELECT id FROM users WHERE id = ?').bind(params.id).first()
    if (!user) {
      return json({ error: 'User not found' }, { status: 404 })
    }

    const salt = createSalt()
    const passwordHash = await hashPassword(password, salt)
    await db.batch([
      db
        .prepare('UPDATE users SET password_hash = ?, password_salt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(passwordHash, salt, params.id),
      db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(params.id),
      db
        .prepare(
          'INSERT INTO audit_logs (id, actor_user_id, target_user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
        )
        .bind(crypto.randomUUID(), auth.admin.id, params.id, 'reset_password', '',),
    ])

    return json({ ok: true })
  } catch (error) {
    return serverError(error)
  }
}
