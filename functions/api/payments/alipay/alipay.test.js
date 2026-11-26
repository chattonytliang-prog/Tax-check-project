import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { alipaySignContent } from '../../_alipay.js'
import { onRequestGet as points } from '../../points/index.js'
import { onRequestGet as config } from './config.js'
import { onRequestPost as create } from './orders.js'
import { onRequestPost as createTest } from './test-order.js'
import { onRequestGet as status } from './orders/[id].js'
import { onRequestPost as notify } from './notify.js'
import { onRequestGet as returnFromCheckout } from './return.js'

vi.mock('../../auth/_auth.js', () => ({ requireUser: async (request) => {
  const id = request.headers.get('x-test-user')
  return id ? { user: { id, username: request.headers.get('x-test-username') || (id === 'user' ? 'Test2' : 'other'),
    role: request.headers.get('x-test-role') || 'user', actor: request.headers.get('x-test-actor') } }
    : { response: new Response('', { status: 401 }) }
} }))

const origin = 'https://tax.heyaokeji.com'
const rsa = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }
const encoder = new TextEncoder()
const databases = []
let merchantKeys, providerKeys, settings
beforeAll(async () => {
  ;[merchantKeys, providerKeys] = await Promise.all([crypto.subtle.generateKey(rsa, true, ['sign', 'verify']),
    crypto.subtle.generateKey(rsa, true, ['sign', 'verify'])])
  const key = async (kind, value) => Buffer.from(await crypto.subtle.exportKey(kind, value)).toString('base64')
  settings = { ALIPAY_PAY_ENABLED: 'true', ALIPAY_SITE_ORIGIN: origin, ALIPAY_APP_ID: '2026000000000000',
    ALIPAY_SELLER_ID: '2088000000000000', ALIPAY_APP_PRIVATE_KEY: await key('pkcs8', merchantKeys.privateKey),
    ALIPAY_PUBLIC_KEY: await key('spki', providerKeys.publicKey) }
})
afterEach(() => { databases.splice(0).forEach(db => db.close()) })

function database(migrated = true) {
  const sqlite = new DatabaseSync(':memory:')
  databases.push(sqlite)
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users (id TEXT PRIMARY KEY);
    INSERT INTO users VALUES ('user'), ('other');
    CREATE TABLE point_wallets (user_id TEXT PRIMARY KEY REFERENCES users(id), balance INTEGER, updated_at TEXT);
    INSERT INTO point_wallets VALUES ('user', 7, ''), ('other', 0, '');
    CREATE TABLE point_transactions (id TEXT, user_id TEXT, delta INTEGER, source TEXT, report_id TEXT, actor_user_id TEXT, note TEXT, created_at TEXT);
    CREATE TABLE report_entitlements (user_id TEXT);`)
  if (migrated) sqlite.exec(readFileSync(new URL('../../../../migrations/0016_alipay_recharge.sql', import.meta.url), 'utf8'))
  return { sqlite, prepare(sql) {
    let bindings = []
    return { bind(...args) { bindings = args; return this },
      async first() { return sqlite.prepare(sql).get(...bindings) || null },
      async all() { return { results: sqlite.prepare(sql).all(...bindings) } },
      async run() { return sqlite.prepare(sql).run(...bindings) } }
  } }
}

function request(path, { method = 'GET', data, headers = {}, user = 'user', domain = origin } = {}) {
  return new Request(`${domain}${path}`, { method, headers: { ...(user ? { 'x-test-user': user } : {}), ...headers }, body: data })
}

function place(env, { user = 'user', source = origin, role = 'user', actor = '', username = '', test = false, requestId = 'request-id-000001' } = {}) {
  return (test ? createTest : create)({ env, request: request(`/api/payments/alipay/${test ? 'test-order' : 'orders'}`, { user, method: 'POST',
    headers: { origin: source, 'x-test-role': role, 'x-test-actor': actor, 'x-test-username': username }, data: JSON.stringify({ requestId, amountFen: 1, points: 999 }) }) })
}

function noticeFields(order, extra = {}) {
  return { app_id: settings.ALIPAY_APP_ID, seller_id: settings.ALIPAY_SELLER_ID, out_trade_no: order.id,
    total_amount: '200.00', trade_status: 'TRADE_SUCCESS', trade_no: '202600011100000000000123',
    notify_type: 'trade_status_sync', subject: '税务风控报告积分充值200积分', sign_type: 'RSA2', ...extra }
}

async function notice(env, fields, { mutate, signer = providerKeys.privateKey } = {}) {
  const sign = Buffer.from(await crypto.subtle.sign(rsa.name, signer, encoder.encode(alipaySignContent(fields, true)))).toString('base64')
  const body = new URLSearchParams({ ...fields, sign })
  mutate?.(body)
  return notify({ env, request: request('/api/payments/alipay/notify', { user: '', method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' }, data: body }) })
}

const balance = DB => DB.sqlite.prepare("SELECT balance FROM point_wallets WHERE user_id = 'user'").get().balance

describe('Alipay website recharge', () => {
  it('only advertises checkout with an authenticated personal user, explicit switch, keys, schema and production origin', async () => {
    const DB = database()
    const read = (env, options) => config({ env, request: request('/api/payments/alipay/config', options) }).then(res => res.json())
    expect(await read({ ...settings, DB })).toEqual({ enabled: true, amountFen: 20000, points: 200 })
    for (const [overrides, options] of [[{ ALIPAY_PAY_ENABLED: 'false' }], [{ ALIPAY_PUBLIC_KEY: '' }],
      [{ DB: database(false) }], [{}, { domain: 'https://preview.example.test' }],
      [{}, { user: '' }], [{}, { headers: { 'x-test-actor': 'admin' } }], [{}, { headers: { 'x-test-role': 'admin' } }]]) {
      expect((await read({ ...settings, DB, ...overrides }, options)).enabled).toBe(false)
    }
  })

  it('creates a signed official checkout, with fixed price and a reusable order, without crediting', async () => {
    const env = { ...settings, DB: database() }
    const created = await place(env)
    expect(created.status).toBe(200)
    const { order, checkoutUrl } = await created.json()
    const url = new URL(checkoutUrl)
    const fields = Object.fromEntries(url.searchParams)
    expect(url.origin + url.pathname).toBe('https://openapi.alipay.com/gateway.do')
    expect(fields).toMatchObject({ app_id: settings.ALIPAY_APP_ID, method: 'alipay.trade.page.pay',
      notify_url: `${origin}/api/payments/alipay/notify`, return_url: `${origin}/api/payments/alipay/return` })
    expect(JSON.parse(fields.biz_content)).toMatchObject({ total_amount: '200.00', out_trade_no: order.id, seller_id: settings.ALIPAY_SELLER_ID,
      product_code: 'FAST_INSTANT_TRADE_PAY', time_expire: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d\d:\d\d:\d\d$/) })
    expect(await crypto.subtle.verify(rsa.name, merchantKeys.publicKey, Buffer.from(fields.sign, 'base64'),
      encoder.encode(alipaySignContent(fields)))).toBe(true)
    const retry = await (await place(env, { requestId: 'request-id-000002' })).json()
    expect(retry.order).toEqual(order)
    expect(balance(env.DB)).toBe(7)
  })

  it('limits the pilot and its one-yuan endpoint to the verified Test2 account', async () => {
    const env = { ...settings, ALIPAY_PAY_ENABLED: 'pilot', ALIPAY_PAY_TEST_USER_ID: 'user', DB: database() }
    const read = (env, options) => config({ env, request: request('/api/payments/alipay/config', options) }).then(res => res.json())
    expect(await read(env)).toEqual({ enabled: false, amountFen: 20000, points: 200, test: { amountFen: 100, points: 1 } })
    for (const [options, code] of [[{ user: 'other' }, 403], [{ user: 'other', username: 'Test2' }, 403],
      [{ username: 'renamed' }, 403], [{ role: 'admin' }, 403], [{ actor: 'admin' }, 403],
      [{ source: 'https://other.test' }, 403], [{ user: '' }, 401]]) {
      expect((await place(env, { test: true, ...options })).status).toBe(code)
    }
    expect(await read(env, { user: 'other' })).toEqual({ enabled: false, amountFen: 20000, points: 200 })
    expect((await read({ ...env, ALIPAY_PAY_TEST_USER_ID: '' })).test).toBeUndefined()
    expect((await place({ ...env, ALIPAY_PAY_TEST_USER_ID: '' }, { test: true })).status).toBe(403)
    expect((await place(env)).status).toBe(403)
    expect((await place(env, { user: 'other' })).status).toBe(403)
    const { order, checkoutUrl } = await (await place(env, { test: true })).json()
    expect(order).toMatchObject({ amountFen: 100, points: 1, status: 'pending' })
    expect(JSON.parse(new URL(checkoutUrl).searchParams.get('biz_content'))).toMatchObject({
      total_amount: '1.00', subject: '税务风控报告积分测试充值1积分', out_trade_no: order.id })
    expect((await notice(env, noticeFields(order))).status).toBe(500)
    expect(balance(env.DB)).toBe(7)
    const valid = noticeFields(order, { total_amount: '1.00' })
    const stopped = { ...env, ALIPAY_PAY_ENABLED: 'false', ALIPAY_PAY_TEST_USER_ID: '' }
    expect(await (await notice(stopped, valid)).text()).toBe('success')
    expect(await (await notice(stopped, valid)).text()).toBe('success')
    expect(balance(env.DB)).toBe(8)
    const wallet = await points({ env, request: request('/api/points') }).then(resp => resp.json())
    expect(wallet.transactions).toMatchObject([{ id: order.id, source: 'alipay_recharge', delta: 1 }])
  })

  it('keeps the normal 200-yuan checkout separate after rollout and pins prices to the server', async () => {
    const env = { ...settings, ALIPAY_PAY_TEST_USER_ID: 'user', DB: database() }
    const readOther = await config({ env, request: request('/api/payments/alipay/config', { user: 'other' }) })
    expect(await readOther.json()).toEqual({ enabled: true, amountFen: 20000, points: 200 })
    const standard = (await (await place(env)).json()).order
    expect(standard).toMatchObject({ amountFen: 20000, points: 200 })
    expect((await place(env, { test: true })).status).toBe(409)
    const test = (await (await place(env, { test: true, requestId: 'request-id-000002' })).json()).order
    expect(test.id).not.toBe(standard.id)
    expect((await place(env, { requestId: 'request-id-000002' })).status).toBe(409)
    expect((await (await place(env, { test: true, requestId: 'request-id-000003' })).json()).order).toEqual(test)
    expect((await (await place(env, { requestId: 'request-id-000004' })).json()).order).toEqual(standard)
    expect((await (await place(env, { user: 'other' })).json()).order).toMatchObject({ amountFen: 20000, points: 200 })
    expect((await place(env, { test: true, user: 'other' })).status).toBe(403)
    expect((await notice(env, noticeFields(standard, { total_amount: '1.00' }))).status).toBe(500)
    expect(() => env.DB.sqlite.exec(`INSERT INTO alipay_orders
      (id,user_id,request_id,app_id,seller_id,amount_fen,points,expires_at)
      VALUES ('invalid','user','invalid','app','seller',100,200,'2099-12-01')`)).toThrow(/CHECK constraint/)
  })

  it('delays credit until a signed matching notification and records exactly one wallet transaction', async () => {
    const DB = database()
    const env = { ...settings, DB }
    const { order } = await (await place(env)).json()
    const returned = returnFromCheckout({ request: request(`/api/payments/alipay/return?out_trade_no=${order.id}&trade_status=TRADE_SUCCESS&return_url=https://bad.test`) })
    expect(returned.status).toBe(303)
    expect(returned.headers.get('location')).toBe(`/?alipay_order=${order.id}`)
    expect(balance(DB)).toBe(7)
    const disabled = { ...env, ALIPAY_PAY_ENABLED: 'false' }
    const receipts = await Promise.all([notice(disabled, noticeFields(order)), notice(disabled, noticeFields(order))])
    expect(await Promise.all(receipts.map(resp => resp.text()))).toEqual(['success', 'success'])
    expect(balance(DB)).toBe(207)
    const state = await status({ env, request: request('/status'), params: { id: order.id } })
    expect((await state.json()).order.status).toBe('paid')
    const wallet = await points({ env, request: request('/api/points') }).then(resp => resp.json())
    expect(wallet.transactions).toMatchObject([{ id: order.id, source: 'alipay_recharge', delta: 200 }])
    expect((await notice(env, noticeFields(order, { trade_no: '202600011999000000009876' }))).status).toBe(500)
    expect(balance(DB)).toBe(207)
  })

  it('rejects forged signatures, tampered/duplicate fields and signed mismatches', async () => {
    const env = { ...settings, DB: database() }
    const { order } = await (await place(env)).json()
    const fields = noticeFields(order)
    for (const [extra, options] of [[{}, { signer: merchantKeys.privateKey }],
      [{}, { mutate: form => form.set('total_amount', '300.00') }],
      [{}, { mutate: form => form.append('total_amount', '200.00') }],
      [{ app_id: '2026111111111111' }], [{ seller_id: '2088111111111111' }], [{ total_amount: '199.99' }],
      [{ trade_status: 'UNKNOWN' }], [{ trade_no: 'bad' }], [{ out_trade_no: `ali${'f'.repeat(29)}` }]]) {
      expect((await notice(env, { ...fields, ...extra }, options)).status).toBe(500)
    }
    expect((await notice(env, noticeFields(order, { trade_status: 'WAIT_BUYER_PAY' }))).status).toBe(200)
    expect(balance(env.DB)).toBe(7)
  })

  it('isolates orders between accounts and refuses admin, impersonation, and cross-site checkout', async () => {
    const env = { ...settings, DB: database() }
    expect((await place(env, { role: 'admin' })).status).toBe(403)
    expect((await place(env, { actor: 'admin' })).status).toBe(403)
    expect((await place(env, { source: 'https://other.test' })).status).toBe(403)
    expect((await place(env, { user: '' })).status).toBe(401)
    const { order } = await (await place(env)).json()
    expect((await status({ env, request: request('/status', { user: 'other' }), params: { id: order.id } })).status).toBe(404)
  })

  it('rolls back settlement on wallet failure and accepts a delayed verified payment after expiry', async () => {
    const DB = database()
    const env = { ...settings, DB }
    const { order } = await (await place(env)).json()
    DB.sqlite.exec("UPDATE alipay_orders SET status='expired'; DELETE FROM point_wallets WHERE user_id='user'")
    expect((await notice(env, noticeFields(order))).status).toBe(500)
    expect(DB.sqlite.prepare('SELECT status FROM alipay_orders').get().status).toBe('expired')
    DB.sqlite.exec("INSERT INTO point_wallets VALUES ('user', 7, '')")
    expect((await notice(env, noticeFields(order))).status).toBe(200)
    expect(balance(DB)).toBe(207)
  })

  it('preserves both payment providers in the wallet ledger when both migrations are present', async () => {
    const DB = database()
    DB.sqlite.exec(readFileSync(new URL('../../../../migrations/0011_wechat_recharge.sql', import.meta.url), 'utf8'))
    DB.sqlite.exec(`INSERT INTO wechat_orders (id,user_id,request_id,appid,mchid,amount_fen,points,expires_at)
      VALUES ('wx-order','user','we-request','app','merchant',20000,200,'2099-12-01');
      UPDATE wechat_orders SET status='paid',transaction_id='wx-trade',paid_at=CURRENT_TIMESTAMP;`)
    const env = { ...settings, DB }
    const { order } = await (await place(env)).json()
    await notice(env, noticeFields(order))
    const wallet = await points({ env, request: request('/api/points') }).then(resp => resp.json())
    expect(wallet.balance).toBe(407)
    expect(wallet.transactions.map(item => item.source).sort()).toEqual(['alipay_recharge', 'wechat_recharge'])
  })
})
