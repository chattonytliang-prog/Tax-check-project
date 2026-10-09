import { json, requireDb } from '../../../_utils.js'
import { requireUser } from '../../../auth/_auth.js'
import { paymentConfig, paymentError, publicOrder, settleWechat, wechatRequest } from '../../../_wechat.js'

export async function onRequestGet({ request, env, params }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response
    let order = await db.prepare('SELECT * FROM wechat_orders WHERE id = ? AND user_id = ?').bind(params.id, auth.user.id).first()
    if (!order) return json({ error: '订单不存在' }, { status: 404 })
    if (order.status !== 'paid') {
      paymentConfig(env, false)
      const result = await wechatRequest(env, 'GET', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(order.id)}?mchid=${encodeURIComponent(order.mchid)}`)
      if (result.trade_state === 'SUCCESS') {
        await settleWechat(db, result, env)
        order = await db.prepare('SELECT * FROM wechat_orders WHERE id = ?').bind(order.id).first()
      }
    }
    return json({ order: publicOrder(order) }, { headers: { 'cache-control': 'no-store' } })
  } catch { return paymentError() }
}
