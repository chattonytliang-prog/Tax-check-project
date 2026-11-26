import { json } from '../../_utils.js'
import { requireUser } from '../../auth/_auth.js'
import { alipayCheckout, alipaySettings, alipayTestCheckout, canCheckoutWithAlipay, noStore } from '../../_alipay.js'

export async function onRequestGet({ request, env }) {
  let enabled = false
  try {
    const { user } = await requireUser(request, env.DB)
    const standard = canCheckoutWithAlipay(env, user, alipayCheckout)
    const test = canCheckoutWithAlipay(env, user, alipayTestCheckout)
    if (standard || test) {
      await alipaySettings(env, new URL(request.url).origin)
      const { results } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('alipay_orders', 'alipay_recharges')").all()
      if (results.length === 2) {
        if (test) return json({ ...alipayCheckout, enabled: standard, test: alipayTestCheckout }, { headers: noStore })
        enabled = standard
      }
    }
  } catch { /* Fail closed until provisioning is complete. */ }
  return json({ ...alipayCheckout, enabled }, { headers: noStore })
}
