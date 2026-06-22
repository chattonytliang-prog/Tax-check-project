import { json, requireDb, serverError } from './_utils.js'

export async function onRequestGet({ env }) {
  try {
    const db = requireDb(env)
    const [clients, reports, riskResults] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS count FROM clients').first(),
      db.prepare('SELECT COUNT(*) AS count FROM reports').first(),
      db.prepare('SELECT COUNT(*) AS count FROM risk_results').first(),
    ])
    return json({
      ok: true,
      database: 'connected',
      clients: clients?.count || 0,
      reports: reports?.count || 0,
      riskResults: riskResults?.count || 0,
    })
  } catch (error) {
    return serverError(error)
  }
}
