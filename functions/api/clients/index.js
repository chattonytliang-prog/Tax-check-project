import { badRequest, json, nowIso, readJson, requireDb, serverError } from '../_utils.js'

export async function onRequestGet({ env }) {
  try {
    const db = requireDb(env)
    const { results } = await db
      .prepare('SELECT payload_json FROM clients ORDER BY updated_at DESC')
      .all()
    const clients = results.map((row) => JSON.parse(row.payload_json))
    return json({ clients })
  } catch (error) {
    return serverError(error)
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env)
    const client = await readJson(request)
    if (!client.id || !client.name) {
      return badRequest('Client id and name are required')
    }

    const now = nowIso()
    const payload = JSON.stringify(client)
    await db
      .prepare(
        `INSERT INTO clients (
          id, name, credit_code, region, industry, taxpayer_type, risk_level, payload_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          credit_code = excluded.credit_code,
          region = excluded.region,
          industry = excluded.industry,
          taxpayer_type = excluded.taxpayer_type,
          risk_level = excluded.risk_level,
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at`,
      )
      .bind(
        client.id,
        client.name,
        client.creditCode || '',
        client.region || '',
        client.industry || '',
        client.taxpayerType || '',
        client.riskLevel || '',
        payload,
        now,
        now,
      )
      .run()

    return json({ client })
  } catch (error) {
    return serverError(error)
  }
}
