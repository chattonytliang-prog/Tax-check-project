import { badRequest, json, readJson, requireDb, serverError } from '../_utils.js'
import { createSalt, createSession, hashPassword, normalizeUsername, validateCredentials } from './_auth.js'

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

    const existing = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first()
    if (existing) {
      return json({ error: 'Username already exists' }, { status: 409 })
    }

    const id = crypto.randomUUID()
    const salt = createSalt()
    const passwordHash = await hashPassword(password, salt)

    await db
      .prepare(
        `INSERT INTO users (id, username, password_hash, password_salt, created_at, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .bind(id, username, passwordHash, salt)
      .run()

    const session = await createSession(db, id)
    return json(
      { user: { id, username, role: 'user', actor: null } },
      {
        status: 201,
        headers: { 'set-cookie': session.cookie },
      },
    )
  } catch (error) {
    return serverError(error)
  }
}
