import { json } from '../../_utils.js'
import { requireUser } from '../../auth/_auth.js'
import { canCheckoutWithWechat, paymentConfig } from '../../_wechat.js'

const disabledConfig = { enabled: false, amountFen: 20000, points: 200 }
const responseOptions = { headers: { 'cache-control': 'no-store' } }

export async function onRequestGet({ request, env }) {
  let enabled = false
  try {
    paymentConfig(env)
    if (env.WECHAT_PAY_ENABLED === 'pilot') {
      const auth = await requireUser(request, env.DB)
      if (!canCheckoutWithWechat(env, auth.user)) return json(disabledConfig, responseOptions)
    }
    const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('wechat_orders', 'wechat_recharges')").all()
    enabled = tables.results.length === 2
  } catch { /* Keep checkout disabled until provisioning completes. */ }
  return json({ ...disabledConfig, enabled }, responseOptions)
}
