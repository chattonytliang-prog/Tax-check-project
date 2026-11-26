import { json, requireDb } from './_utils.js'
import { requireUser } from './auth/_auth.js'
import { rechargeRangeError, standardRecharge } from './_recharge_amount.js'
import { canCheckoutWithWechat, canCheckoutWithWechatTest, paymentConfig, paymentError, publicOrder, wechatRequest } from './_wechat.js'

export const standardCheckout = Object.freeze({ amountFen: 20000, points: 200, description: '税务风控报告积分充值200积分' })
export const testCheckout = Object.freeze({ amountFen: 100, points: 1, description: '税务风控报告积分测试充值1积分' })

export async function createWechatOrder({ request, env }, checkout) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response
    if (auth.user.actor || auth.user.role === 'admin') return json({ error: '请使用本人普通账户充值。' }, { status: 403 })
    const origin = request.headers.get('origin')
    if (origin !== new URL(request.url).origin) return json({ error: '无效请求来源' }, { status: 403 })
    if (checkout === testCheckout && !canCheckoutWithWechatTest(env, auth.user)) {
      return json({ error: '当前账户不可使用测试充值。' }, { status: 403 })
    }
    paymentConfig(env)
    if (!canCheckoutWithWechat(env, auth.user)) return json({ error: '微信支付尚未向当前账户开放。' }, { status: 403 })
    const { requestId, rechargeYuan } = (await request.json().catch(() => null)) ?? {}
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(requestId)) return json({ error: '无效订单请求' }, { status: 400 })
    const price = checkout === testCheckout ? testCheckout : standardRecharge(rechargeYuan)
    if (!price) return json({ error: rechargeRangeError }, { status: 400 })
    await db.prepare("UPDATE wechat_orders SET status = 'expired' WHERE user_id = ? AND status = 'pending' AND expires_at <= ?")
      .bind(auth.user.id, new Date().toISOString()).run()
    const findPending = () => db.prepare(`SELECT * FROM wechat_orders WHERE user_id = ? AND amount_fen = ?
      AND status = 'pending' AND expires_at > ?`).bind(auth.user.id, price.amountFen, new Date().toISOString()).first()
    let order = await db.prepare('SELECT * FROM wechat_orders WHERE user_id = ? AND request_id = ?')
      .bind(auth.user.id, requestId).first()
    if (!order) {
      // Retries reuse an active checkout of the same denomination only.
      order = await findPending()
    }
    if (!order) {
      const id = crypto.randomUUID().replaceAll('-', '')
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
      await db.prepare(`INSERT OR IGNORE INTO wechat_orders
        (id, user_id, request_id, appid, mchid, amount_fen, points, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, auth.user.id, requestId, env.WECHAT_APP_ID, env.WECHAT_MCH_ID,
          price.amountFen, price.points, expiresAt).run()
      order = await db.prepare('SELECT * FROM wechat_orders WHERE user_id = ? AND request_id = ?').bind(auth.user.id, requestId).first()
      if (!order) order = await findPending()
      if (!order && checkout !== testCheckout && await db.prepare("SELECT id FROM wechat_orders WHERE user_id = ? AND amount_fen >= 20000 AND status = 'pending'").bind(auth.user.id).first()) {
        return json({ error: '还有一笔不同金额的微信充值订单待付款，请先核对原订单，待其到期后再选择新金额。' }, { status: 409 })
      }
      if (!order) throw new Error('ORDER_RETRY_REQUIRED')
    }
    if (order.amount_fen !== price.amountFen || order.points !== price.points) {
      return json({ error: '该请求编号已用于其他充值档位。' }, { status: 409 })
    }
    if (order.status === 'paid' || Date.parse(order.expires_at) <= Date.now()) {
      return json({ order: publicOrder(order) }, { headers: { 'cache-control': 'no-store' } })
    }
    if (!order.code_url) {
      const result = await wechatRequest(env, 'POST', '/v3/pay/transactions/native', {
        appid: order.appid, mchid: order.mchid, description: price.description,
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
