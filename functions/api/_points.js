export const REPORT_COST_POINTS = 200

export function reportEntitlementStatement(db, reportId, userId, expectedCostPoints) {
  return db.prepare(
    `INSERT INTO report_entitlements (report_id, user_id, kind, cost_points)
     SELECT ?, users.id,
       CASE
         WHEN users.role = 'admin' THEN 'admin'
         WHEN ? = 0 THEN 'free'
         ELSE 'paid'
       END,
       CASE
         WHEN users.role = 'admin' THEN 0
         ELSE ?
       END
     FROM users WHERE users.id = ?`,
  ).bind(reportId, expectedCostPoints, expectedCostPoints, userId)
}

export function pointErrorResponse(error) {
  const message = String(error)
  if (message.includes('insufficient_points')) {
    return new Response(JSON.stringify({ error: '积分不足，无法完成操作。', code: 'INSUFFICIENT_POINTS' }), {
      status: 402,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }
  if (message.includes('invalid_report_entitlement')) {
    return new Response(JSON.stringify({ error: '免费名额或本次费用已变化，请重新核对后确认。', code: 'REPORT_PRICE_CHANGED' }), {
      status: 409,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }
  if (message.includes('UNIQUE constraint failed: report_entitlements.report_id')) {
    return new Response(JSON.stringify({ error: '报告编号已使用，请重试。' }), {
      status: 409,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }
  return null
}
