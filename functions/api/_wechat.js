const encoder = new TextEncoder()
const fields = ['WECHAT_MCH_ID', 'WECHAT_APP_ID', 'WECHAT_CERT_SERIAL', 'WECHAT_PRIVATE_KEY',
  'WECHAT_API_V3_KEY', 'WECHAT_PUBLIC_KEY_ID', 'WECHAT_PUBLIC_KEY', 'WECHAT_NOTIFY_URL']

export function wechatConfigured(env) {
  return env.WECHAT_PAY_ENABLED === 'true' && fields.every((name) => typeof env[name] === 'string' && env[name].trim())
}

export function paymentConfig(env, requireEnabled = true) {
  if (!wechatConfigured({ ...env, WECHAT_PAY_ENABLED: requireEnabled ? env.WECHAT_PAY_ENABLED : 'true' })) throw new Error('PAYMENT_NOT_CONFIGURED')
  const url = new URL(env.WECHAT_NOTIFY_URL)
  if (url.protocol !== 'https:' || url.pathname !== '/api/payments/wechat/notify'
    || url.search || url.hash || encoder.encode(env.WECHAT_API_V3_KEY).length !== 32
    || !/^\d+$/.test(env.WECHAT_MCH_ID) || !/^wx[a-zA-Z0-9]+$/.test(env.WECHAT_APP_ID)
    || !/^PUB_KEY_ID_\d+$/.test(env.WECHAT_PUBLIC_KEY_ID)) throw new Error('PAYMENT_NOT_CONFIGURED')
  return env
}

function decode64(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}

function encode64(value) {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
}

async function importPem(pem, privateKey) {
  const text = pem.replaceAll('\\n', '\n').replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  return crypto.subtle.importKey(privateKey ? 'pkcs8' : 'spki', decode64(text),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [privateKey ? 'sign' : 'verify'])
}

export async function verifyWechat(headers, body, env) {
  const timestamp = headers.get('Wechatpay-Timestamp')
  const nonce = headers.get('Wechatpay-Nonce')
  const signature = headers.get('Wechatpay-Signature')
  if (headers.get('Wechatpay-Serial') !== env.WECHAT_PUBLIC_KEY_ID
    || !/^\d+$/.test(timestamp || '') || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
    || !nonce || !signature || signature.startsWith('WECHATPAY/SIGNTEST/')) throw new Error('INVALID_PAYMENT_SIGNATURE')
  const key = await importPem(env.WECHAT_PUBLIC_KEY, false)
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode64(signature),
    encoder.encode(`${timestamp}\n${nonce}\n${body}\n`))
  if (!valid) throw new Error('INVALID_PAYMENT_SIGNATURE')
}

export async function wechatRequest(env, method, path, payload) {
  paymentConfig(env, false)
  const body = payload ? JSON.stringify(payload) : ''
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonce = crypto.randomUUID().replaceAll('-', '')
  const key = await importPem(env.WECHAT_PRIVATE_KEY, true)
  const signature = encode64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key,
    encoder.encode(`${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`)))
  const response = await fetch(`https://api.mch.weixin.qq.com${path}`, {
    method,
    headers: {
      Accept: 'application/json', 'Content-Type': 'application/json',
      Authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${env.WECHAT_MCH_ID}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${env.WECHAT_CERT_SERIAL}"`,
      'Wechatpay-Serial': env.WECHAT_PUBLIC_KEY_ID,
    },
    ...(body ? { body } : {}),
    signal: AbortSignal.timeout(4000),
  })
  const raw = await response.text()
  // Unverified upstream responses are never used for QR codes or credits.
  await verifyWechat(response.headers, raw, env)
  if (!response.ok) throw new Error('WECHAT_UPSTREAM_ERROR')
  return JSON.parse(raw)
}

export async function decryptNotification(resource, env) {
  if (resource?.algorithm !== 'AEAD_AES_256_GCM' || resource.original_type !== 'transaction') {
    throw new Error('INVALID_PAYMENT_RESOURCE')
  }
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.WECHAT_API_V3_KEY), 'AES-GCM', false, ['decrypt'])
  const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: encoder.encode(resource.nonce),
    additionalData: encoder.encode(resource.associated_data || ''), tagLength: 128 }, key, decode64(resource.ciphertext))
  return JSON.parse(new TextDecoder().decode(clear))
}

export async function settleWechat(db, transaction, env) {
  const order = await db.prepare('SELECT * FROM wechat_orders WHERE id = ?').bind(transaction.out_trade_no).first()
  if (!order || transaction.trade_state !== 'SUCCESS' || transaction.trade_type !== 'NATIVE'
    || transaction.mchid !== order.mchid || transaction.appid !== order.appid
    || transaction.mchid !== env.WECHAT_MCH_ID || transaction.appid !== env.WECHAT_APP_ID
    || transaction.amount?.total !== order.amount_fen || transaction.amount?.currency !== 'CNY'
    || typeof transaction.transaction_id !== 'string' || !/^\d{1,64}$/.test(transaction.transaction_id)
    || !transaction.success_time || !Number.isFinite(Date.parse(transaction.success_time))) {
    throw new Error('PAYMENT_ORDER_MISMATCH')
  }
  if (order.status === 'paid' && order.transaction_id !== transaction.transaction_id) throw new Error('PAYMENT_ORDER_MISMATCH')
  await db.prepare(`UPDATE wechat_orders SET status = 'paid', transaction_id = ?, paid_at = ?
    WHERE id = ? AND status != 'paid'`).bind(transaction.transaction_id, transaction.success_time, order.id).run()
  const settled = await db.prepare('SELECT transaction_id FROM wechat_orders WHERE id = ?').bind(order.id).first()
  if (settled?.transaction_id !== transaction.transaction_id) throw new Error('PAYMENT_ORDER_MISMATCH')
}

export function publicOrder(order) {
  return { id: order.id, amountFen: order.amount_fen, points: order.points, status: order.status,
    codeUrl: order.code_url, expiresAt: order.expires_at, paidAt: order.paid_at }
}

export function paymentError() {
  return new Response(JSON.stringify({ error: '微信支付暂不可用，请稍后重试；如已付款，请勿重复支付，稍后查询订单。' }), {
    status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}
