import { json, requireDb } from '../../_utils.js'
import { requireUser } from '../../auth/_auth.js'
import { paymentConfig, paymentError, publicOrder, wechatRequest } from '../../_wechat.js'

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response
    if (auth.user.actor || auth.user.role === 'admin') return json({ error: '请使用本人普通账户充值。' }, { status: 403 })
    const origin = request.headers.get('origin')
    if (origin !== new URL(request.url).origin) return json({ error: '无效请求来源' }, { status: 403 })
    paymentConfig(env)
    const { requestId } = await request.json()
    if (!/^[a-zA-Z0-9-]{16,64}$/.test(requestId || '')) return json({ error: '无效订单请求' }, { status: 400 })
    await db.prepare("UPDATE wechat_orders SET status = 'expired' WHERE user_id = ? AND status = 'pending' AND expires_at <= ?")
      .bind(auth.user.id, new Date().toISOString()).run()
    let order = await db.prepare('SELECT * FROM wechat_orders WHERE user_id = ? AND request_id = ?')
      .bind(auth.user.id, requestId).first()
    if (!order) {
      // One active checkout per user; retries and double clicks reuse it.
      order = await db.prepare(`SELECT * FROM wechat_orders WHERE user_id = ? AND status = 'pending'
        AND expires_at > ? ORDER BY created_at DESC LIMIT 1`).bind(auth.user.id, new Date().toISOString()).first()
    }
    if (!order) {
      const id = crypto.randomUUID().replaceAll('-', '')
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
      await db.prepare(`INSERT OR IGNORE INTO wechat_orders
        (id, user_id, request_id, appid, mchid, amount_fen, points, expires_at)
        VALUES (?, ?, ?, ?, ?, 20000, 200, ?)`).bind(id, auth.user.id, requestId, env.WECHAT_APP_ID, env.WECHAT_MCH_ID, expiresAt).run()
      order = await db.prepare('SELECT * FROM wechat_orders WHERE user_id = ? AND request_id = ?').bind(auth.user.id, requestId).first()
      if (!order) order = await db.prepare("SELECT * FROM wechat_orders WHERE user_id = ? AND status = 'pending'").bind(auth.user.id).first()
      if (!order) throw new Error('ORDER_RETRY_REQUIRED')
    }
    if (order.status === 'paid' || Date.parse(order.expires_at) <= Date.now()) return json({ order: publicOrder(order) })
    if (!order.code_url) {
      const result = await wechatRequest(env, 'POST', '/v3/pay/transactions/native', {
        appid: order.appid, mchid: order.mchid, description: '税务风控报告积分充值200积分',
        out_trade_no: order.id, time_expire: order.expires_at, notify_url: env.WECHAT_NOTIFY_URL,
        amount: { total: order.amount_fen, currency: 'CNY' },
      })
      if (typeof result.code_url !== 'string' || !result.code_url.startsWith('weixin://wxpay/')) throw new Error('INVALID_QR')
      await db.prepare('UPDATE wechat_orders SET code_url = ? WHERE id = ? AND status = ?')
        .bind(result.code_url, order.id, 'pending').run()
      order = await db.prepare('SELECT * FROM wechat_orders WHERE id = ?').bind(order.id).first()
    }
    return json({ order: publicOrder(order) }, { headers: { 'cache-control': 'no-store' } })
  } catch { return paymentError() }
}
