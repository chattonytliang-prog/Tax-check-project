import { badRequest, json, nowIso, readJson, requireDb, serverError } from '../_utils.js'

export async function onRequestGet({ env }) {
  try {
    const db = requireDb(env)
    const { results } = await db
      .prepare('SELECT payload_json FROM reports ORDER BY created_at DESC')
      .all()
    const reports = results.map((row) => JSON.parse(row.payload_json))
    return json({ reports })
  } catch (error) {
    return serverError(error)
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env)
    const report = await readJson(request)
    if (!report.id || !report.clientId || !report.clientName) {
      return badRequest('Report id, clientId and clientName are required')
    }

    const now = nowIso()
    const payload = JSON.stringify(report)
    const statements = [
      db
        .prepare(
          `INSERT INTO reports (
            id, client_id, client_name, risk_level, content, payload_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            client_id = excluded.client_id,
            client_name = excluded.client_name,
            risk_level = excluded.risk_level,
            content = excluded.content,
            payload_json = excluded.payload_json,
            updated_at = excluded.updated_at`,
        )
        .bind(
          report.id,
          report.clientId,
          report.clientName,
          report.riskLevel || '',
          report.content || '',
          payload,
          report.createdAt || now,
          now,
        ),
      db.prepare('DELETE FROM risk_results WHERE report_id = ?').bind(report.id),
    ]

    for (const risk of report.risks || []) {
      statements.push(
        db
          .prepare(
            `INSERT INTO risk_results (
              id, client_id, report_id, rule_code, rule_name, risk_level, payload_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            report.clientId,
            report.id,
            risk.code || '',
            risk.name || '',
            risk.level || '',
            JSON.stringify(risk),
            now,
          ),
      )
    }

    await db.batch(statements)
    return json({ report })
  } catch (error) {
    return serverError(error)
  }
}
