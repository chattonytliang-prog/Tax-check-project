import { json } from '../../_utils.js'
import { paymentConfig } from '../../_wechat.js'

export async function onRequestGet({ env }) {
  let enabled = false
  try {
    paymentConfig(env)
    const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('wechat_orders', 'wechat_recharges')").all()
    enabled = tables.results.length === 2
  } catch { /* Keep checkout disabled until provisioning completes. */ }
  return json({ enabled, amountFen: 20000, points: 200 }, { headers: { 'cache-control': 'no-store' } })
}
