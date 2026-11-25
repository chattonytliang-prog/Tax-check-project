import { json } from '../../_utils.js'
import { requireUser } from '../../auth/_auth.js'
import { canCheckoutWithWechat, canCheckoutWithWechatTest, paymentConfig } from '../../_wechat.js'
import { standardCheckout, testCheckout } from '../../_wechat_checkout.js'

const disabledConfig = { enabled: false, amountFen: standardCheckout.amountFen, points: standardCheckout.points }
const responseOptions = { headers: { 'cache-control': 'no-store' } }

export async function onRequestGet({ request, env }) {
  let enabled = false
  try {
    paymentConfig(env)
    const user = env.WECHAT_PAY_ENABLED === 'pilot' || env.WECHAT_PAY_TEST_USER_ID
      ? (await requireUser(request, env.DB)).user : null
    if (env.WECHAT_PAY_ENABLED === 'pilot' && !canCheckoutWithWechat(env, user)) return json(disabledConfig, responseOptions)
    const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('wechat_orders', 'wechat_recharges')").all()
    enabled = tables.results.length === 2
    if (enabled && canCheckoutWithWechatTest(env, user)) {
      return json({ ...disabledConfig, enabled, test: { amountFen: testCheckout.amountFen, points: testCheckout.points } }, responseOptions)
    }
  } catch { /* Keep checkout disabled until provisioning completes. */ }
  return json({ ...disabledConfig, enabled }, responseOptions)
}
