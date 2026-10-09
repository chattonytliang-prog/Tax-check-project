import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { decryptNotification, paymentConfig, settleWechat, verifyWechat, wechatRequest } from '../../_wechat.js'
import { onRequestPost as notify } from './notify.js'
import { onRequestPost as create } from './orders.js'
import { onRequestGet as query } from './orders/[id].js'

vi.mock('../../auth/_auth.js', () => ({ requireUser: async (request) => {
  const id = request.headers.get('x-test-user')
  return id ? { user: { id, role: 'user', actor: request.headers.get('x-test-actor') } } : { response: new Response('', { status: 401 }) }
} }))

let keys, env
const encoder = new TextEncoder()
const databases = []
beforeAll(async () => {
  keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const pem = async (format, key, label) => `-----BEGIN ${label}-----\n${Buffer.from(await crypto.subtle.exportKey(format, key)).toString('base64')}\n-----END ${label}-----`
  env = { WECHAT_PAY_ENABLED: 'true', WECHAT_APP_ID: 'wx123', WECHAT_MCH_ID: '12345',
    WECHAT_CERT_SERIAL: 'ABCD', WECHAT_PRIVATE_KEY: await pem('pkcs8', keys.privateKey, 'PRIVATE KEY'),
    WECHAT_PUBLIC_KEY: await pem('spki', keys.publicKey, 'PUBLIC KEY'), WECHAT_PUBLIC_KEY_ID: 'PUB_KEY_ID_123',
    WECHAT_API_V3_KEY: 'a'.repeat(32), WECHAT_NOTIFY_URL: 'https://tax.heyaokeji.com/api/payments/wechat/notify' }
})
afterEach(() => { databases.splice(0).forEach((db) => db.close()); vi.unstubAllGlobals() })

function database() {
  const sqlite = new DatabaseSync(':memory:')
  databases.push(sqlite)
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users (id TEXT PRIMARY KEY);
    INSERT INTO users VALUES ('u'), ('other');
    CREATE TABLE point_wallets (user_id TEXT PRIMARY KEY REFERENCES users(id), balance INTEGER, updated_at TEXT);
    INSERT INTO point_wallets VALUES ('u', 10000, ''), ('other', 0, '');`)
  sqlite.exec(readFileSync(new URL('../../../../migrations/0011_wechat_recharge.sql', import.meta.url), 'utf8'))
  sqlite.prepare(`INSERT INTO wechat_orders (id,user_id,request_id,appid,mchid,amount_fen,points,expires_at)
    VALUES ('order123','u','request123','wx123','12345',20000,200,?)`).run(new Date(Date.now() + 600000).toISOString())
  return { sqlite, prepare(sql) {
    let bindings = []
    return { bind(...args) { bindings = args; return this },
      async first() { return sqlite.prepare(sql).get(...bindings) || null },
      async all() { return { results: sqlite.prepare(sql).all(...bindings) } },
      async run() { return sqlite.prepare(sql).run(...bindings) } }
  } }
}
function transaction(extra = {}) {
  return { out_trade_no: 'order123', mchid: '12345', appid: 'wx123', trade_state: 'SUCCESS', trade_type: 'NATIVE',
    amount: { total: 20000, currency: 'CNY' }, transaction_id: '1234567890', success_time: new Date().toISOString(), ...extra }
}
async function headers(body, timestamp = String(Math.floor(Date.now() / 1000))) {
  const nonce = 'nonce123'
  const signature = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey,
    encoder.encode(`${timestamp}\n${nonce}\n${body}\n`))).toString('base64')
  return new Headers({ 'Wechatpay-Serial': env.WECHAT_PUBLIC_KEY_ID, 'Wechatpay-Timestamp': timestamp,
    'Wechatpay-Nonce': nonce, 'Wechatpay-Signature': signature })
}
async function notification(value = transaction()) {
  const nonce = '123456789012'
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.WECHAT_API_V3_KEY), 'AES-GCM', false, ['encrypt'])
  const ciphertext = Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: encoder.encode(nonce),
    additionalData: encoder.encode('transaction') }, key, encoder.encode(JSON.stringify(value)))).toString('base64')
  return { event_type: 'TRANSACTION.SUCCESS', resource_type: 'encrypt-resource', resource: {
    algorithm: 'AEAD_AES_256_GCM', original_type: 'transaction', nonce, associated_data: 'transaction', ciphertext } }
}

describe('WeChat payment security and atomic credits', () => {
  it('is disabled without explicit activation or with invalid callback/key', () => {
    expect(() => paymentConfig({ ...env, WECHAT_PAY_ENABLED: '' })).toThrow()
    expect(() => paymentConfig({ ...env, WECHAT_API_V3_KEY: 'short' })).toThrow()
    expect(() => paymentConfig({ ...env, WECHAT_NOTIFY_URL: 'http://evil.test/notify' })).toThrow()
    expect(paymentConfig(env)).toBe(env)
  })
  it('verifies authentic signatures and rejects changed body, stale time, serial and probes', async () => {
    const valid = await headers('{}')
    await expect(verifyWechat(valid, '{}', env)).resolves.toBeUndefined()
    await expect(verifyWechat(valid, '{"changed":true}', env)).rejects.toThrow()
    await expect(verifyWechat(await headers('{}', '1000'), '{}', env)).rejects.toThrow()
    valid.set('Wechatpay-Serial', 'PUB_KEY_ID_999')
    await expect(verifyWechat(valid, '{}', env)).rejects.toThrow()
    valid.set('Wechatpay-Serial', env.WECHAT_PUBLIC_KEY_ID)
    valid.set('Wechatpay-Signature', 'WECHATPAY/SIGNTEST/invalid')
    await expect(verifyWechat(valid, '{}', env)).rejects.toThrow()
  })
  it('decrypts notifications and rejects modified ciphertext', async () => {
    const body = await notification()
    expect((await decryptNotification(body.resource, env)).out_trade_no).toBe('order123')
    body.resource.ciphertext = 'AAAA'
    await expect(decryptNotification(body.resource, env)).rejects.toThrow()
  })
  it('credits exactly once on duplicate and concurrent success, with a ledger entry', async () => {
    const db = database()
    await Promise.all([settleWechat(db, transaction(), env), settleWechat(db, transaction(), env)])
    await settleWechat(db, transaction(), env)
    expect(db.sqlite.prepare('SELECT balance FROM point_wallets WHERE user_id = ?').get('u').balance).toBe(10200)
    expect(db.sqlite.prepare('SELECT count(*) AS n FROM wechat_recharges').get().n).toBe(1)
    await expect(settleWechat(db, transaction({ transaction_id: '9999' }), env)).rejects.toThrow()
  })
  it.each([{ amount: { total: 1, currency: 'CNY' } }, { amount: { total: 20000, currency: 'USD' } },
    { appid: 'wxevil' }, { mchid: '999' }, { trade_state: 'NOTPAY' }, { trade_type: 'JSAPI' },
    { out_trade_no: 'missing' }, { success_time: 'invalid' }])('rejects mismatched transaction %j', async (extra) => {
    const db = database()
    await expect(settleWechat(db, transaction(extra), env)).rejects.toThrow()
    expect(db.sqlite.prepare('SELECT balance FROM point_wallets WHERE user_id = ?').get('u').balance).toBe(10000)
  })
  it('rolls back paid state if wallet is missing and rejects immutable order edits', async () => {
    const db = database()
    db.sqlite.exec("DELETE FROM point_wallets WHERE user_id='u'")
    await expect(settleWechat(db, transaction(), env)).rejects.toThrow()
    expect(db.sqlite.prepare('SELECT status FROM wechat_orders').get().status).toBe('pending')
    expect(() => db.sqlite.exec("UPDATE wechat_orders SET user_id='other'")).toThrow()
  })
  it('only acknowledges a verified, committed callback', async () => {
    const db = database()
    const body = JSON.stringify(await notification())
    const request = () => new Request(env.WECHAT_NOTIFY_URL, { method: 'POST', body, headers: signed })
    const signed = await headers(body)
    expect((await notify({ request: request(), env: { ...env, DB: db } })).status).toBe(204)
    expect((await notify({ request: request(), env: { ...env, DB: db } })).status).toBe(204)
    expect(db.sqlite.prepare('SELECT balance FROM point_wallets WHERE user_id = ?').get('u').balance).toBe(10200)
    signed.set('Wechatpay-Signature', 'bad')
    expect((await notify({ request: request(), env: { ...env, DB: db } })).status).toBe(500)
  })
  it('does not acknowledge storage failures', async () => {
    const body = JSON.stringify(await notification())
    expect((await notify({ request: new Request(env.WECHAT_NOTIFY_URL, { method: 'POST', body, headers: await headers(body) }),
      env: { ...env, DB: { prepare() { throw new Error('unavailable') } } } })).status).toBe(500)
  })
  it('rejects unauthenticated, cross-origin and impersonated checkouts', async () => {
    const db = database()
    for (const [headers, status] of [[{}, 401], [{ 'x-test-user': 'u', origin: 'https://evil.test' }, 403],
      [{ 'x-test-user': 'u', 'x-test-actor': 'admin' }, 403]]) {
      expect((await create({ request: new Request('https://tax.heyaokeji.com/api/payments/wechat/orders', { method: 'POST', headers, body: '{}' }),
        env: { ...env, DB: db } })).status).toBe(status)
    }
  })
  it('does not disclose another account order', async () => {
    const db = database()
    expect((await query({ request: new Request('https://tax.heyaokeji.com', { headers: { 'x-test-user': 'other' } }),
      params: { id: 'order123' }, env: { ...env, DB: db } })).status).toBe(404)
  })
  it('creates a fixed-price QR and reuses the same active order on retries', async () => {
    const db = database()
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      calls++
      const input = JSON.parse(options.body)
      expect(input.amount).toEqual({ total: 20000, currency: 'CNY' })
      expect(input.out_trade_no).toBe('order123')
      const raw = JSON.stringify({ code_url: 'weixin://wxpay/test' })
      return new Response(raw, { headers: await headers(raw) })
    }))
    const request = () => new Request('https://tax.heyaokeji.com/api/payments/wechat/orders', { method: 'POST',
      headers: { 'x-test-user': 'u', origin: 'https://tax.heyaokeji.com' },
      body: JSON.stringify({ requestId: '1234567890123456', amount: 1, points: 1000000 }) })
    for (let i = 0; i < 2; i++) {
      const response = await create({ request: request(), env: { ...env, DB: db } })
      expect(response.status).toBe(200)
      expect((await response.json()).order.points).toBe(200)
    }
    expect(calls).toBe(1)
    expect(db.sqlite.prepare('SELECT count(*) AS n FROM wechat_orders').get().n).toBe(1)
  })
  it('creates a new order after expiry and still credits a delayed authentic payment', async () => {
    const db = database()
    db.sqlite.exec("UPDATE wechat_orders SET expires_at='2020-01-01T00:00:00Z'")
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      expect(JSON.parse(options.body).out_trade_no).not.toBe('order123')
      const raw = JSON.stringify({ code_url: 'weixin://wxpay/test' })
      return new Response(raw, { headers: await headers(raw) })
    }))
    const response = await create({ request: new Request('https://tax.heyaokeji.com/api/payments/wechat/orders', { method: 'POST',
      headers: { 'x-test-user': 'u', origin: 'https://tax.heyaokeji.com' }, body: JSON.stringify({ requestId: '1234567890123456' }) }), env: { ...env, DB: db } })
    expect(response.status).toBe(200)
    expect(db.sqlite.prepare("SELECT status FROM wechat_orders WHERE id='order123'").get().status).toBe('expired')
    await settleWechat(db, transaction(), env)
    expect(db.sqlite.prepare("SELECT balance FROM point_wallets WHERE user_id='u'").get().balance).toBe(10200)
  })
  it('reconciles a missed callback through a signed query with checkout disabled', async () => {
    const db = database()
    vi.stubGlobal('fetch', vi.fn(async () => {
      const raw = JSON.stringify(transaction())
      return new Response(raw, { headers: await headers(raw) })
    }))
    const response = await query({ request: new Request('https://tax.heyaokeji.com', { headers: { 'x-test-user': 'u' } }),
      params: { id: 'order123' }, env: { ...env, DB: db, WECHAT_PAY_ENABLED: 'false' } })
    expect(response.status).toBe(200)
    expect((await response.json()).order.status).toBe('paid')
    expect(db.sqlite.prepare("SELECT balance FROM point_wallets WHERE user_id='u'").get().balance).toBe(10200)
  })
  it('signs merchant requests and verifies the upstream response', async () => {
    const body = JSON.stringify({ code_url: 'weixin://wxpay/test' })
    const responseHeaders = await headers(body)
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      expect(options.headers.Authorization).toContain('WECHATPAY2-SHA256-RSA2048')
      return new Response(body, { headers: responseHeaders })
    }))
    expect((await wechatRequest(env, 'POST', '/v3/pay/transactions/native', { amount: { total: 20000 } })).code_url).toContain('weixin://')
    responseHeaders.set('Wechatpay-Signature', 'invalid')
    await expect(wechatRequest(env, 'GET', '/v3/test')).rejects.toThrow()
  })
})
