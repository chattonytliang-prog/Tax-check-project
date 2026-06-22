import { badRequest, json, readJson, requireDb, serverError } from '../_utils.js'
import { createSession, hashPassword, normalizeUsername, validateCredentials } from './_auth.js'

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env)
    const body = await readJson(request)
    const username = normalizeUsername(body.username)
    const password = String(body.password || '')
    const validationError = validateCredentials(username, password)

    if (validationError) {
      return badRequest(validationError)
    }

    const user = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first()
    if (!user) {
      return json({ error: 'Invalid username or password' }, { status: 401 })
    }
    if (user.disabled_at) {
      return json({ error: 'Account disabled' }, { status: 403 })
    }

    const passwordHash = await hashPassword(password, user.password_salt)
    if (passwordHash !== user.password_hash) {
      return json({ error: 'Invalid username or password' }, { status: 401 })
    }

    const session = await createSession(db, user.id)
    return json(
      { user: { id: user.id, username: user.username, role: user.role || 'user', actor: null } },
      {
        headers: { 'set-cookie': session.cookie },
      },
    )
  } catch (error) {
    return serverError(error)
  }
}
