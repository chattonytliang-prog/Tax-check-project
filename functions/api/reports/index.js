import { badRequest, json, nowIso, readJson, requireDb, serverError } from '../_utils.js'
import { requireUser } from '../auth/_auth.js'
import { pointErrorResponse, reportEntitlementStatement, REPORT_COST_POINTS } from '../_points.js'

function reportSourceFingerprint(report) {
  return JSON.stringify({
    clientId: report.clientId,
    clientName: report.clientName,
    riskLevel: report.riskLevel || '',
    createdAt: report.createdAt,
    risks: report.risks,
    structured: report.structured || null,
    aiSource: report.aiSource || null,
  })
}

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
    if (typeof report?.id !== 'string' || !report.id.trim()
      || typeof report.clientId !== 'string' || !report.clientId.trim()
      || typeof report.clientName !== 'string' || !report.clientName.trim()
      || typeof report.content !== 'string' || !report.content.trim()
      || !Array.isArray(report.risks)
      || report.risks.some((risk) => !risk || typeof risk !== 'object' || Array.isArray(risk))) {
      return badRequest('Report id, clientId, clientName, content and risks are required')
    }

    const client = await db
      .prepare('SELECT id, name FROM clients WHERE id = ? AND owner_user_id = ?')
      .bind(report.clientId, auth.user.id)
      .first()
    if (!client) {
      return json({ error: 'Client not found' }, { status: 404 })
    }
    if (client.name !== report.clientName) {
      return json({ error: '报告企业名称与档案不一致，请刷新企业档案后重试' }, { status: 409 })
    }

    const existing = await db.prepare('SELECT owner_user_id, payload_json FROM reports WHERE id = ?').bind(report.id).first()
    if (existing && existing.owner_user_id !== auth.user.id) {
      return json({ error: 'Report id already exists' }, { status: 409 })
    }
    if (existing) {
      const previous = JSON.parse(existing.payload_json)
      const unchanged = JSON.stringify(report) === existing.payload_json
      const oneTimeAiUpdate = !previous.aiGenerated && report.aiGenerated === true
        && reportSourceFingerprint(previous) === reportSourceFingerprint(report)
      if (!unchanged && !oneTimeAiUpdate) {
        return json({ error: '已有报告不可替换；请生成新报告' }, { status: 409 })
      }
      if (unchanged) return json({ report: previous, charged: false })
    }

    const now = nowIso()
    const payload = JSON.stringify(report)
    if (existing) {
      const result = await db.prepare(
        `UPDATE reports SET content = ?, payload_json = ?, updated_at = ?
         WHERE id = ? AND owner_user_id = ? AND payload_json = ?`,
      ).bind(report.content, payload, now, report.id, auth.user.id, existing.payload_json).run()
      if ((result.meta?.changes ?? result.changes) !== 1) {
        return json({ error: '报告已被其他请求更新，请刷新后重试' }, { status: 409 })
      }
      return json({ report, charged: false })
    }

    const expectedCostHeader = request.headers.get('x-expected-report-cost')
    if (expectedCostHeader !== '0' && expectedCostHeader !== String(REPORT_COST_POINTS)) {
      return badRequest('请先确认本次报告费用')
    }
    const expectedCostPoints = Number(expectedCostHeader)
    if (auth.user.role === 'admin' && expectedCostPoints !== 0) {
      return badRequest('管理员报告不需要积分')
    }

    const statements = [
      reportEntitlementStatement(db, report.id, auth.user.id, expectedCostPoints),
      db.prepare(
        `INSERT INTO reports (
          id, owner_user_id, client_id, client_name, risk_level, content, payload_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        report.id,
        auth.user.id,
        report.clientId,
        report.clientName,
        report.riskLevel || '',
        report.content,
        payload,
        report.createdAt || now,
        now,
      ),
    ]

    for (const risk of report.risks) {
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
    const entitlement = await db.prepare(
      'SELECT cost_points FROM report_entitlements WHERE report_id = ? AND user_id = ?',
    ).bind(report.id, auth.user.id).first()
    return json({ report, charged: entitlement.cost_points > 0 })
  } catch (error) {
    return pointErrorResponse(error) || serverError(error)
  }
}
