import { requireDb } from '../../_utils.js'
import { alipaySettings, settleAlipay, verifiedAlipayNotification } from '../../_alipay.js'

export async function onRequestPost({ request, env }) {
  const headers = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
  try {
    // Previously issued orders still receive notifications when new checkouts are disabled.
    const settings = await alipaySettings(env)
    const fields = await verifiedAlipayNotification(request, settings)
    await settleAlipay(requireDb(env), fields, settings)
    return new Response('success', { headers })
  } catch {
    return new Response('failure', { status: 500, headers })
  }
}
