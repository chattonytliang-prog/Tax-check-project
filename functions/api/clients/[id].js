import { json, nowIso, readJson, requireDb, serverError } from '../_utils.js'

export async function onRequestGet({ env, params }) {
  try {
    const db = requireDb(env)
    const row = await db
      .prepare('SELECT payload_json FROM clients WHERE id = ?')
      .bind(params.id)
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
    const client = await readJson(request)
    const now = nowIso()
    const payload = JSON.stringify({ ...client, id: params.id })
    await db
      .prepare(
        `UPDATE clients
         SET name = ?, credit_code = ?, region = ?, industry = ?, taxpayer_type = ?, risk_level = ?, payload_json = ?, updated_at = ?
         WHERE id = ?`,
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
      )
      .run()

    return json({ client: { ...client, id: params.id } })
  } catch (error) {
    return serverError(error)
  }
}

export async function onRequestDelete({ env, params }) {
  try {
    const db = requireDb(env)
    await db.prepare('DELETE FROM clients WHERE id = ?').bind(params.id).run()
    return json({ ok: true })
  } catch (error) {
    return serverError(error)
  }
}
