import { badRequest, json, nowIso, readJson, requireDb, serverError } from '../_utils.js'
import { requireUser } from '../auth/_auth.js'

export async function onRequestGet({ request, env }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response

    const { results } = await db
      .prepare('SELECT payload_json FROM reports WHERE owner_user_id = ? ORDER BY created_at DESC')
      .bind(auth.user.id)
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
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response

    const report = await readJson(request)
    if (!report.id || !report.clientId || !report.clientName) {
      return badRequest('Report id, clientId and clientName are required')
    }

    const client = await db
      .prepare('SELECT id FROM clients WHERE id = ? AND owner_user_id = ?')
      .bind(report.clientId, auth.user.id)
      .first()
    if (!client) {
      return json({ error: 'Client not found' }, { status: 404 })
    }

    const now = nowIso()
    const payload = JSON.stringify(report)
    const statements = [
      db
        .prepare(
          `INSERT INTO reports (
            id, owner_user_id, client_id, client_name, risk_level, content, payload_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            owner_user_id = excluded.owner_user_id,
            client_id = excluded.client_id,
            client_name = excluded.client_name,
            risk_level = excluded.risk_level,
            content = excluded.content,
            payload_json = excluded.payload_json,
            updated_at = excluded.updated_at
          WHERE reports.owner_user_id = excluded.owner_user_id`,
        )
        .bind(
          report.id,
          auth.user.id,
          report.clientId,
          report.clientName,
          report.riskLevel || '',
          report.content || '',
          payload,
          report.createdAt || now,
          now,
        ),
      db
        .prepare(
          `DELETE FROM risk_results
           WHERE report_id = ?
           AND EXISTS (
             SELECT 1 FROM reports
             WHERE reports.id = risk_results.report_id
             AND reports.owner_user_id = ?
           )`,
        )
        .bind(report.id, auth.user.id),
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
