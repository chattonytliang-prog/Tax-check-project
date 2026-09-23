import { json, nowIso, readJson, requireDb, serverError } from '../_utils.js'
import { updateReportRemediation } from '../_report_remediation.js'
import { requireUser } from '../auth/_auth.js'

export async function onRequestGet({ request, env, params }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response

    const row = await db
      .prepare('SELECT payload_json FROM reports WHERE id = ? AND owner_user_id = ?')
      .bind(params.id, auth.user.id)
      .first()

    if (!row) {
      return json({ error: 'Report not found' }, { status: 404 })
    }

    return json({ report: JSON.parse(row.payload_json) })
  } catch (error) {
    return serverError(error)
  }
}

export async function onRequestPatch({ request, env, params }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response

    const input = await readJson(request)
    const row = await db
      .prepare('SELECT payload_json FROM reports WHERE id = ? AND owner_user_id = ?')
      .bind(params.id, auth.user.id)
      .first()
    if (!row) return json({ error: 'Report not found' }, { status: 404 })

    const updatedAt = nowIso()
    const result = updateReportRemediation(JSON.parse(row.payload_json), input, auth.user.actor || auth.user, updatedAt)
    if (result.error) return json({ error: result.error }, { status: result.status })

    const payload = JSON.stringify(result.report)
    const saved = await db
      .prepare(
        `UPDATE reports SET payload_json = ?, updated_at = ?
         WHERE id = ? AND owner_user_id = ? AND payload_json = ?`,
      )
      .bind(payload, updatedAt, params.id, auth.user.id, row.payload_json)
      .run()
    if ((saved.meta?.changes ?? saved.changes) !== 1) {
      return json({ error: '报告已被其他操作更新，请刷新后重试' }, { status: 409 })
    }

    return json({ report: result.report, task: result.task })
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
        .bind(params.id, auth.user.id),
      db.prepare('DELETE FROM reports WHERE id = ? AND owner_user_id = ?').bind(params.id, auth.user.id),
    ])
    return json({ ok: true })
  } catch (error) {
    return serverError(error)
  }
}
