import { badRequest, json, nowIso, readJson, requireDb, serverError } from '../_utils.js'
import { requireUser } from '../auth/_auth.js'

const maxThreads = 20

function normalizeThread(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = String(raw.id || '').trim()
  const title = String(raw.title || '新对话').trim().slice(0, 80)
  if (!id) return null
  return {
    ...raw,
    id,
    title: title || '新对话',
    messages: Array.isArray(raw.messages) ? raw.messages : [],
    drafts: Array.isArray(raw.drafts) ? raw.drafts : [],
    createdAt: String(raw.createdAt || nowIso()),
    updatedAt: String(raw.updatedAt || nowIso()),
  }
}

export async function onRequestGet({ request, env }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response

    const { results } = await db
      .prepare(
        `SELECT payload_json
         FROM assistant_threads
         WHERE owner_user_id = ?
         ORDER BY updated_at DESC
         LIMIT ?`,
      )
      .bind(auth.user.id, maxThreads)
      .all()
    const threads = results.map((row) => JSON.parse(row.payload_json))
    return json({ threads })
  } catch (error) {
    return serverError(error)
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response

    const body = await readJson(request)
    const rawThreads = Array.isArray(body?.threads) ? body.threads : []
    const threads = rawThreads.map(normalizeThread).filter(Boolean).slice(0, maxThreads)
    if (!threads.length) return badRequest('Threads are required')

    const now = nowIso()
    const statements = threads.map((thread) => db
      .prepare(
        `INSERT INTO assistant_threads (
          id, owner_user_id, title, payload_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          owner_user_id = excluded.owner_user_id,
          title = excluded.title,
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at
        WHERE assistant_threads.owner_user_id = excluded.owner_user_id`,
      )
      .bind(
        thread.id,
        auth.user.id,
        thread.title,
        JSON.stringify(thread),
        thread.createdAt || now,
        thread.updatedAt || now,
      ))

    await db.batch(statements)
    return json({ threads })
  } catch (error) {
    return serverError(error)
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response

    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    if (!id) return badRequest('Thread id is required')

    await db
      .prepare('DELETE FROM assistant_threads WHERE id = ? AND owner_user_id = ?')
      .bind(id, auth.user.id)
      .run()
    return json({ ok: true })
  } catch (error) {
    return serverError(error)
  }
}
