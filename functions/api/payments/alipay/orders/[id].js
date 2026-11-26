import { json, requireDb } from '../../../_utils.js'
import { requireUser } from '../../../auth/_auth.js'
import { alipayError, alipayOrderId, noStore, publicAlipayOrder } from '../../../_alipay.js'

export async function onRequestGet({ request, env, params }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response
    if (auth.user.actor || auth.user.role === 'admin') return alipayError('请使用本人普通账户查询。', 403)
    if (!alipayOrderId.test(params.id || '')) return alipayError('订单不存在', 404)
    const order = await db.prepare('SELECT * FROM alipay_orders WHERE id = ? AND user_id = ?').bind(params.id, auth.user.id).first()
    if (!order) return alipayError('订单不存在', 404)
    return json({ order: publicAlipayOrder(order) }, { headers: noStore })
  } catch { return alipayError('暂时无法查询支付宝到账状态。') }
}
