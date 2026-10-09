import { requireDb } from '../../_utils.js'
import { decryptNotification, paymentConfig, settleWechat, verifyWechat } from '../../_wechat.js'

export async function onRequestPost({ request, env }) {
  try {
    paymentConfig(env, false)
    const body = await request.text()
    if (body.length > 65536) throw new Error('INVALID_BODY')
    await verifyWechat(request.headers, body, env)
    const notification = JSON.parse(body)
    if (notification.event_type !== 'TRANSACTION.SUCCESS' || notification.resource_type !== 'encrypt-resource') throw new Error('INVALID_EVENT')
    await settleWechat(requireDb(env), await decryptNotification(notification.resource, env), env)
    return new Response(null, { status: 204 })
  } catch {
    // Never acknowledge failed DB writes: WeChat retries, or the user's query reconciles.
    return new Response(JSON.stringify({ code: 'FAIL', message: '支付通知未完成，请重试' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
