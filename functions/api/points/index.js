import { json, requireDb, serverError } from '../_utils.js'
import { requireUser } from '../auth/_auth.js'
import { REPORT_COST_POINTS } from '../_points.js'

export async function onRequestGet({ request, env }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response

    const wallet = await db.prepare(
      `SELECT point_wallets.balance,
        EXISTS (SELECT 1 FROM report_entitlements WHERE user_id = ?) AS free_report_used
       FROM point_wallets WHERE user_id = ?`,
    ).bind(auth.user.id, auth.user.id).first()
    if (!wallet) return json({ error: '积分账户尚未初始化' }, { status: 503 })

    const { results } = await db.prepare(
      `SELECT id, delta, source, report_id, actor_user_id, note, created_at
       FROM point_transactions WHERE user_id = ?
       ORDER BY created_at DESC, rowid DESC LIMIT 50`,
    ).bind(auth.user.id).all()

    return json({
      balance: wallet.balance,
      freeReportAvailable: auth.user.role !== 'admin' && !wallet.free_report_used,
      adminUnlimited: auth.user.role === 'admin',
      reportCost: REPORT_COST_POINTS,
      transactions: results.map((row) => ({
        id: row.id,
        delta: row.delta,
        source: row.source,
        reportId: row.report_id,
        actorUserId: row.actor_user_id,
        note: row.note,
        createdAt: row.created_at,
      })),
    })
  } catch (error) {
    return serverError(error)
  }
}
