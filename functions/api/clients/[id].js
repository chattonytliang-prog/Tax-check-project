import { json, nowIso, readJson, requireDb, serverError } from '../_utils.js'
import { requireUser } from '../auth/_auth.js'

export async function onRequestGet({ request, env, params }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response

    const row = await db
      .prepare('SELECT payload_json FROM clients WHERE id = ? AND owner_user_id = ?')
      .bind(params.id, auth.user.id)
      .first()

    if (!row) {
      return json({ error: 'Client not found' }, { status: 404 })
    }

    return json({ client: JSON.parse(row.payload_json) })
  } catch (error) {
    return serverError(error)
  }
}

export async function onRequestPut({ request, env, params }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response

    const client = await readJson(request)
    const now = nowIso()
    const payload = JSON.stringify({ ...client, id: params.id })
    await db
      .prepare(
        `UPDATE clients
         SET name = ?, credit_code = ?, region = ?, industry = ?, taxpayer_type = ?, risk_level = ?, payload_json = ?, updated_at = ?
         WHERE id = ? AND owner_user_id = ?`,
      )
      .bind(
        client.name || '',
        client.creditCode || '',
        client.region || '',
        client.industry || '',
        client.taxpayerType || '',
        client.riskLevel || '',
        payload,
        now,
        params.id,
        auth.user.id,
      )
      .run()

    return json({ client: { ...client, id: params.id } })
  } catch (error) {
    return serverError(error)
  }
}

export async function onRequestDelete({ request, env, params }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response

    await db.prepare('DELETE FROM clients WHERE id = ? AND owner_user_id = ?').bind(params.id, auth.user.id).run()
    return json({ ok: true })
  } catch (error) {
    return serverError(error)
  }
}
