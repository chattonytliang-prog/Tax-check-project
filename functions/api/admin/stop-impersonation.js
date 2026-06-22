import { json, requireDb, serverError } from '../_utils.js'
import { createSession, deleteCurrentSession, getCurrentUser } from '../auth/_auth.js'

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env)
    const user = await getCurrentUser(request, db)
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!user.actor || user.actor.role !== 'admin') {
      return json({ error: 'Not impersonating' }, { status: 400 })
    }

    await deleteCurrentSession(request, db)
    const session = await createSession(db, user.actor.id)
    await db
      .prepare(
        'INSERT INTO audit_logs (id, actor_user_id, target_user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
      )
      .bind(crypto.randomUUID(), user.actor.id, user.id, 'impersonate_stop', '')
      .run()

    return json(
      {
        user: {
          id: user.actor.id,
          username: user.actor.username,
          role: user.actor.role,
          actor: null,
        },
      },
      { headers: { 'set-cookie': session.cookie } },
    )
  } catch (error) {
    return serverError(error)
  }
}
