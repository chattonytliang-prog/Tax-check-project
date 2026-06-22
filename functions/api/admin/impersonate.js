import { badRequest, json, readJson, requireDb, serverError } from '../_utils.js'
import { createSession, deleteCurrentSession, requireAdmin } from '../auth/_auth.js'

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env)
    const auth = await requireAdmin(request, db)
    if (auth.response) return auth.response

    const body = await readJson(request)
    const targetUserId = String(body.userId || '')
    if (!targetUserId) {
      return badRequest('Target user id is required')
    }

    const target = await db
      .prepare('SELECT id, username, role, disabled_at FROM users WHERE id = ?')
      .bind(targetUserId)
      .first()

    if (!target) {
      return json({ error: 'User not found' }, { status: 404 })
    }
    if (target.disabled_at) {
      return json({ error: 'User disabled' }, { status: 400 })
    }

    await deleteCurrentSession(request, db)
    const session = await createSession(db, target.id, auth.admin.id)
    await db
      .prepare(
        'INSERT INTO audit_logs (id, actor_user_id, target_user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
      )
      .bind(crypto.randomUUID(), auth.admin.id, target.id, 'impersonate_start', '')
      .run()

    return json(
      {
        user: {
          id: target.id,
          username: target.username,
          role: target.role || 'user',
          actor: auth.admin,
        },
      },
      { headers: { 'set-cookie': session.cookie } },
    )
  } catch (error) {
    return serverError(error)
  }
}
