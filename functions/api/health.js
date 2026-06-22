import { json, requireDb, serverError } from './_utils.js'

export async function onRequestGet({ env }) {
  try {
    const db = requireDb(env)
    const row = await db.prepare('SELECT COUNT(*) AS count FROM clients').first()
    return json({
      ok: true,
      database: 'connected',
      clients: row?.count || 0,
    })
  } catch (error) {
    return serverError(error)
  }
}
