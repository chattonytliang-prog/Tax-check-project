import { json, requireDb } from '../../_utils.js'
import { requireUser } from '../../auth/_auth.js'
import { alipayCheckout, alipayCheckoutUrl, alipayError, alipaySettings, canCheckoutWithAlipay, noStore, publicAlipayOrder } from '../../_alipay.js'

export function onRequestPost(context) {
  return createAlipayOrder(context, alipayCheckout)
}

export async function createAlipayOrder({ request, env }, checkout) {
  try {
    const origin = new URL(request.url).origin
    if (request.headers.get('origin') !== origin) return alipayError('无效请求来源', 403)
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response
    if (auth.user.actor || auth.user.role === 'admin') return alipayError('请使用本人普通账户充值。', 403)
    if (!canCheckoutWithAlipay(env, auth.user, checkout)) return alipayError('当前账户暂不能使用此支付宝充值档位。', 403)
    const settings = await alipaySettings(env, origin)
    const body = await request.json().catch(() => null)
    if (typeof body?.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(body.requestId)) {
      return alipayError('无效订单请求', 400)
    }
    const userId = auth.user.id
    const now = new Date().toISOString()
    const byRequest = () => db.prepare('SELECT * FROM alipay_orders WHERE user_id = ? AND request_id = ?').bind(userId, body.requestId).first()
    const pending = () => db.prepare("SELECT * FROM alipay_orders WHERE user_id = ? AND amount_fen = ? AND status = 'pending' AND expires_at > ?")
      .bind(userId, checkout.amountFen, now).first()
    await db.prepare("UPDATE alipay_orders SET status = 'expired' WHERE user_id = ? AND status = 'pending' AND expires_at <= ?").bind(userId, now).run()
    let order = await byRequest() || await pending()
    if (!order) {
      const id = `ali${crypto.randomUUID().replaceAll('-', '').slice(0, 29)}`
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
      await db.prepare(`INSERT OR IGNORE INTO alipay_orders
        (id,user_id,request_id,app_id,seller_id,amount_fen,points,expires_at) VALUES (?,?,?,?,?,?,?,?)`)
        .bind(id, userId, body.requestId, settings.appId, settings.sellerId, checkout.amountFen, checkout.points, expiresAt).run()
      order = await byRequest() || await pending()
    }
    if (!order) throw new Error('ALIPAY_ORDER_CREATION_FAILED')
    if (order.amount_fen !== checkout.amountFen || order.points !== checkout.points) {
      return alipayError('该请求编号已用于其他充值档位。', 409)
    }
    const summary = publicAlipayOrder(order)
    const checkoutUrl = summary.status === 'pending' ? await alipayCheckoutUrl(order, settings) : null
    return json({ order: summary, checkoutUrl }, { headers: noStore })
  } catch { return alipayError('支付宝暂不可用，未能打开收银台。') }
}
