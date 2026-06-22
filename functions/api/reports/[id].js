import { json, requireDb, serverError } from '../_utils.js'
import { requireUser } from '../auth/_auth.js'

export async function onRequestGet({ request, env, params }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response

    const row = await db
      .prepare('SELECT payload_json FROM reports WHERE id = ?')
      .bind(params.id)
      .first()

    if (!row) {
      return json({ error: 'Report not found' }, { status: 404 })
    }

    return json({ report: JSON.parse(row.payload_json) })
  } catch (error) {
    return serverError(error)
  }
}

export async function onRequestDelete({ request, env, params }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response

    await db.batch([
      db.prepare('DELETE FROM risk_results WHERE report_id = ?').bind(params.id),
      db.prepare('DELETE FROM reports WHERE id = ?').bind(params.id),
    ])
    return json({ ok: true })
  } catch (error) {
    return serverError(error)
  }
}
