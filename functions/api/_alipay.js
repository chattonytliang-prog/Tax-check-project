import { json } from './_utils.js'

export const alipayCheckout = Object.freeze({ amountFen: 20000, points: 200 })
export const alipayTestCheckout = Object.freeze({ amountFen: 100, points: 1 })
export const alipayOrderId = /^ali[0-9a-f]{29}$/
export const noStore = { 'cache-control': 'no-store' }
const gateway = 'https://openapi.alipay.com/gateway.do'
const rsa = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
const encode = new TextEncoder()

export function canCheckoutWithAlipay(env, user, checkout) {
  if (!user || user.actor || user.role === 'admin') return false
  if (checkout === alipayCheckout) return env.ALIPAY_PAY_ENABLED === 'true'
  const testUserId = String(env.ALIPAY_PAY_TEST_USER_ID || '').trim()
  return checkout === alipayTestCheckout && ['pilot', 'true'].includes(env.ALIPAY_PAY_ENABLED) &&
    Boolean(testUserId) && user.id === testUserId && user.username?.toLowerCase() === 'test2'
}

function keyBytes(input, label) {
  const text = String(input || '').trim().replaceAll('\\n', '\n')
  const base64 = text.replace(`-----BEGIN ${label}-----`, '').replace(`-----END ${label}-----`, '').replace(/\s/g, '')
  return decodeBase64(base64)
}

function decodeBase64(value) {
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('INVALID_ALIPAY_KEY_OR_SIGNATURE')
  return Uint8Array.from(atob(value), char => char.charCodeAt(0))
}

export async function alipaySettings(env, checkoutOrigin) {
  const appId = String(env.ALIPAY_APP_ID || '').trim()
  const sellerId = String(env.ALIPAY_SELLER_ID || '').trim()
  if (!/^\d{16}$/.test(appId) || !/^2088\d{12}$/.test(sellerId)) throw new Error('INVALID_ALIPAY_MERCHANT')
  const publicKey = await crypto.subtle.importKey('spki', keyBytes(env.ALIPAY_PUBLIC_KEY, 'PUBLIC KEY'), rsa, false, ['verify'])
  if (publicKey.algorithm.modulusLength < 2048) throw new Error('INVALID_ALIPAY_KEY')
  if (!checkoutOrigin) return { appId, sellerId, publicKey }
  if (!['pilot', 'true'].includes(env.ALIPAY_PAY_ENABLED) || env.ALIPAY_SITE_ORIGIN !== checkoutOrigin ||
      !/^https:\/\/[a-z0-9.-]+$/.test(checkoutOrigin)) throw new Error('ALIPAY_DISABLED')
  const privateKey = await crypto.subtle.importKey('pkcs8', keyBytes(env.ALIPAY_APP_PRIVATE_KEY, 'PRIVATE KEY'), rsa, false, ['sign'])
  if (privateKey.algorithm.modulusLength < 2048) throw new Error('INVALID_ALIPAY_KEY')
  return { appId, sellerId, publicKey, privateKey, origin: checkoutOrigin }
}

export function alipaySignContent(fields, notification = false) {
  return Object.keys(fields).filter(key => key !== 'sign' && (!notification || key !== 'sign_type') && fields[key] !== '')
    .sort().map(key => `${key}=${fields[key]}`).join('&')
}

function alipayTime(date) {
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ')
}

export async function alipayCheckoutUrl(order, settings) {
  if (order.app_id !== settings.appId || order.seller_id !== settings.sellerId) throw new Error('ALIPAY_MERCHANT_CHANGED')
  const fields = {
    app_id: settings.appId, method: 'alipay.trade.page.pay', format: 'JSON', charset: 'utf-8',
    sign_type: 'RSA2', timestamp: alipayTime(new Date()), version: '1.0',
    notify_url: `${settings.origin}/api/payments/alipay/notify`,
    return_url: `${settings.origin}/api/payments/alipay/return`,
    biz_content: JSON.stringify({
      out_trade_no: order.id, product_code: 'FAST_INSTANT_TRADE_PAY', seller_id: settings.sellerId,
      total_amount: (order.amount_fen / 100).toFixed(2),
      subject: order.points === 1 ? '税务风控报告积分测试充值1积分' : `税务风控报告积分充值${order.points}积分`,
      time_expire: alipayTime(new Date(order.expires_at)),
    }),
  }
  const signature = await crypto.subtle.sign(rsa.name, settings.privateKey, encode.encode(alipaySignContent(fields)))
  fields.sign = btoa(String.fromCharCode(...new Uint8Array(signature)))
  return `${gateway}?${new URLSearchParams(fields)}`
}

export async function verifiedAlipayNotification(request, settings) {
  if (!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) {
    throw new Error('INVALID_ALIPAY_CONTENT_TYPE')
  }
  const reader = request.body?.getReader()
  if (!reader) throw new Error('INVALID_ALIPAY_BODY')
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let body = ''
  let bytes = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 32768) throw new Error('INVALID_ALIPAY_BODY')
      body += decoder.decode(value, { stream: true })
    }
    body += decoder.decode()
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally { reader.releaseLock() }
  const fields = Object.create(null)
  for (const [key, value] of new URLSearchParams(body)) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(key) || Object.hasOwn(fields, key)) throw new Error('INVALID_ALIPAY_FIELD')
    fields[key] = value
  }
  if (fields.sign_type !== 'RSA2' || !await crypto.subtle.verify(rsa.name, settings.publicKey,
    decodeBase64(fields.sign), encode.encode(alipaySignContent(fields, true)))) throw new Error('INVALID_ALIPAY_SIGNATURE')
  return fields
}

export async function settleAlipay(db, fields, settings) {
  if (fields.notify_type !== 'trade_status_sync' || fields.app_id !== settings.appId || fields.seller_id !== settings.sellerId ||
      !alipayOrderId.test(fields.out_trade_no || '')) throw new Error('ALIPAY_MERCHANT_MISMATCH')
  const order = await db.prepare('SELECT * FROM alipay_orders WHERE id = ?').bind(fields.out_trade_no).first()
  // Compare exact decimal cents; do not use floating point or trust buyer_pay_amount.
  const amount = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(fields.total_amount || '')
  const cents = amount ? Number(amount[1]) * 100 + Number((amount[2] || '').padEnd(2, '0')) : -1
  if (!order || order.app_id !== fields.app_id || order.seller_id !== fields.seller_id || cents !== order.amount_fen) {
    throw new Error('ALIPAY_ORDER_MISMATCH')
  }
  if (['WAIT_BUYER_PAY', 'TRADE_CLOSED'].includes(fields.trade_status)) return
  if (!['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(fields.trade_status) || !/^\d{16,64}$/.test(fields.trade_no || '')) {
    throw new Error('INVALID_ALIPAY_TRADE')
  }
  if (order.status !== 'paid') {
    const now = new Date().toISOString()
    await db.prepare("UPDATE alipay_orders SET status = 'paid', trade_no = ?, paid_at = ? WHERE id = ? AND status != 'paid'")
      .bind(fields.trade_no, now, order.id).run()
  }
  const settled = await db.prepare('SELECT status, trade_no FROM alipay_orders WHERE id = ?').bind(order.id).first()
  if (settled?.status !== 'paid' || settled.trade_no !== fields.trade_no) throw new Error('ALIPAY_TRADE_CONFLICT')
}

export function publicAlipayOrder(order) {
  const expired = Date.parse(order.expires_at) <= Date.now()
  return { id: order.id, status: order.status === 'pending' && expired ? 'expired' : order.status,
    amountFen: order.amount_fen, points: order.points, expiresAt: order.expires_at }
}

export const alipayError = (error, status = 503) => json({ error }, { status, headers: noStore })
