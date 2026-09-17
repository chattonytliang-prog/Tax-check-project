import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequestPost as saveReport } from '../reports/index.js'
import { onRequestGet as listReports } from '../reports/index.js'
import { onRequestDelete as deleteReport } from '../reports/[id].js'
import { onRequestGet as getPoints } from './index.js'
import { onRequestPost as adjustPoints } from '../admin/users/[id]/points.js'
import { onRequestPost as generateAiReport } from '../ai/report.js'
import { onRequestPost as generateAiReview } from '../ai/review.js'
import { pointErrorResponse } from '../_points.js'

vi.mock('../auth/_auth.js', () => ({
  requireUser: async (request, db) => {
    const id = request.headers.get('x-test-user')
    const user = await db.prepare('SELECT id, role FROM users WHERE id = ?').bind(id).first()
    return user ? { user } : { response: new Response('', { status: 401 }) }
  },
  requireAdmin: async (request, db) => {
    const actorId = request.headers.get('x-test-actor') || request.headers.get('x-test-user')
    const admin = await db.prepare('SELECT id, role FROM users WHERE id = ?').bind(actorId).first()
    return admin?.role === 'admin'
      ? { admin, user: admin }
      : { response: new Response('', { status: 403 }) }
  },
}))

const databases = []
afterEach(() => {
  for (const db of databases.splice(0)) db.close()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function createDatabase({ legacyReport = false } = {}) {
  const sqlite = new DatabaseSync(':memory:')
  databases.push(sqlite)
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const version of ['0001_initial', '0002_auth', '0003_user_data_isolation', '0004_admin']) {
    sqlite.exec(readFileSync(new URL(`../../../migrations/${version}.sql`, import.meta.url), 'utf8'))
  }
  sqlite.prepare("INSERT INTO users (id, username, password_hash, password_salt) VALUES ('u', 'user', 'x', 'x')").run()
  sqlite.prepare("INSERT INTO users (id, username, password_hash, password_salt, role) VALUES ('a', 'admin', 'x', 'x', 'admin')").run()
  sqlite.prepare("INSERT INTO clients (id, name, payload_json, owner_user_id) VALUES ('c', '客户', '{}', 'u')").run()
  sqlite.prepare("INSERT INTO clients (id, name, payload_json, owner_user_id) VALUES ('ca', '管理员客户', '{}', 'a')").run()
  if (legacyReport) {
    sqlite.prepare("INSERT INTO reports (id, client_id, client_name, content, payload_json, owner_user_id) VALUES ('old', 'c', '客户', '旧报告', '{}', 'u')").run()
  }
  sqlite.exec(readFileSync(new URL('../../../migrations/0009_report_points.sql', import.meta.url), 'utf8'))
  sqlite.exec(readFileSync(new URL('../../../migrations/0010_ai_daily_usage.sql', import.meta.url), 'utf8'))

  const db = {
    prepare(sql) {
      let bindings = []
      return {
        bind(...values) { bindings = values; return this },
        async first() { return sqlite.prepare(sql).get(...bindings) || null },
        async all() { return { results: sqlite.prepare(sql).all(...bindings) } },
        async run() { return sqlite.prepare(sql).run(...bindings) },
      }
    },
    async batch(statements) {
      sqlite.exec('BEGIN')
      try {
        const results = []
        for (const statement of statements) results.push(await statement.run())
        sqlite.exec('COMMIT')
        return results
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
  }
  return { sqlite, db }
}

function request(userId, body, actorId, expectedCostPoints = 0) {
  const payload = body && typeof body === 'object' && Object.hasOwn(body, 'delta') && !Object.hasOwn(body, 'requestId')
    ? { ...body, requestId: crypto.randomUUID() }
    : body
  return new Request('https://example.test/api', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-requested-with': 'tax-workspace',
      'x-test-user': userId,
      ...(expectedCostPoints === null ? {} : { 'x-expected-report-cost': String(expectedCostPoints) }),
      ...(actorId ? { 'x-test-actor': actorId } : {}),
    },
    body: JSON.stringify(payload),
  })
}

function report(id, clientId = 'c') {
  return { id, clientId, clientName: clientId === 'ca' ? '管理员客户' : '客户', content: '报告正文', risks: [] }
}

describe('report points', () => {
  it('rejects a new report whose summary risk count differs from its stored details before charging', async () => {
    const { sqlite, db } = createDatabase()
    const env = { DB: db }
    const inconsistent = {
      ...report('count-mismatch'),
      risks: [{ code: 'R1', name: '风险一', level: '高' }],
      structured: { executiveSummary: { totalRisks: 0 } },
    }
    const response = await saveReport({ request: request('u', inconsistent), env })
    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain('风险数与风险明细不一致')
    expect(sqlite.prepare("SELECT id FROM reports WHERE id = 'count-mismatch'").get()).toBeUndefined()
    expect(sqlite.prepare("SELECT report_id FROM report_entitlements WHERE report_id = 'count-mismatch'").get()).toBeUndefined()
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM report_entitlements WHERE user_id = 'u'").get().count).toBe(0)

    const consistent = { ...inconsistent, structured: { executiveSummary: { totalRisks: 1 } } }
    expect((await saveReport({ request: request('u', consistent), env })).status).toBe(200)
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM risk_results WHERE report_id = 'count-mismatch'").get().count).toBe(1)
  })

  it('maps known billing errors and leaves unrelated errors for the caller', async () => {
    expect(pointErrorResponse(new Error('other error'))).toBeNull()
    const duplicate = pointErrorResponse(new Error('UNIQUE constraint failed: report_entitlements.report_id'))
    expect(duplicate.status).toBe(409)
  })

  it('requires an exact confirmed price and never silently charges after the free slot changes', async () => {
    const { sqlite, db } = createDatabase()
    const env = { DB: db }
    const missingQuote = await saveReport({ request: request('u', report('missing-quote'), undefined, null), env })
    expect(missingQuote.status).toBe(400)
    const badQuote = await saveReport({ request: request('u', report('bad-quote'), undefined, 300), env })
    expect(badQuote.status).toBe(400)
    const adminQuote = await saveReport({ request: request('a', report('admin-quote', 'ca'), undefined, 200), env })
    expect(adminQuote.status).toBe(400)

    const paidWhileFree = await saveReport({ request: request('u', report('paid-while-free'), undefined, 200), env })
    expect(paidWhileFree.status).toBe(409)
    expect((await paidWhileFree.json()).code).toBe('REPORT_PRICE_CHANGED')
    expect(sqlite.prepare("SELECT id FROM reports WHERE id = 'paid-while-free'").get()).toBeUndefined()

    expect((await saveReport({ request: request('u', report('first')), env })).status).toBe(200)
    const staleFreeQuote = await saveReport({ request: request('u', report('next')), env })
    expect(staleFreeQuote.status).toBe(409)
    expect((await staleFreeQuote.json()).code).toBe('REPORT_PRICE_CHANGED')
    expect(sqlite.prepare("SELECT id FROM reports WHERE id = 'next'").get()).toBeUndefined()
    expect(sqlite.prepare("SELECT report_id FROM report_entitlements WHERE report_id = 'next'").get()).toBeUndefined()
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM point_transactions WHERE source = 'report'").get().count).toBe(0)

    expect((await adjustPoints({ request: request('a', { delta: 200, note: '到账' }), env, params: { id: 'u' } })).status).toBe(200)
    const confirmedPaid = await saveReport({ request: request('u', report('next'), undefined, 200), env })
    expect(confirmedPaid.status).toBe(200)
    expect((await confirmedPaid.json()).charged).toBe(true)
    expect(sqlite.prepare("SELECT balance FROM point_wallets WHERE user_id = 'u'").get().balance).toBe(0)
    expect((await saveReport({ request: request('u', report('next'), undefined, null), env })).status).toBe(200)
  })

  it('validates administrator adjustments and exposes wallet state only to its owner', async () => {
    const { sqlite, db } = createDatabase()
    const env = { DB: db }
    const params = { id: 'u' }
    for (const delta of [0, 1.5, 100001, -100001, '200']) {
      expect((await adjustPoints({ request: request('a', { delta, note: '有效原因' }), env, params })).status).toBe(400)
    }
    for (const note of ['', ' ', 'x'.repeat(201), 12]) {
      expect((await adjustPoints({ request: request('a', { delta: 1, note }), env, params })).status).toBe(400)
    }
    for (const requestId of [null, 'not-a-uuid', crypto.randomUUID().toUpperCase()]) {
      expect((await adjustPoints({ request: request('a', { delta: 1, note: '有效原因', requestId }), env, params })).status).toBe(400)
    }
    expect((await adjustPoints({ request: request('a', { delta: 1, note: '有效原因' }), env, params: { id: 'missing' } })).status).toBe(404)
    expect((await adjustPoints({ request: request('a', { delta: 1, note: '有效原因' }), env, params: { id: 'a' } })).status).toBe(400)
    expect((await getPoints({ request: new Request('https://example.test/api', { headers: { 'x-test-user': 'missing' } }), env })).status).toBe(401)
    expect((await getPoints({ request: new Request('https://example.test/api', { headers: { 'x-test-user': 'a' } }), env })).status).toBe(200)
    sqlite.prepare("DELETE FROM point_wallets WHERE user_id = 'u'").run()
    expect((await getPoints({ request: new Request('https://example.test/api', { headers: { 'x-test-user': 'u' } }), env })).status).toBe(503)
    expect((await getPoints({ request: new Request('https://example.test/api', { headers: { 'x-test-user': 'u' } }), env: {} })).status).toBe(500)
    expect((await adjustPoints({ request: request('a', { delta: 1, note: '有效原因' }), env: {}, params })).status).toBe(500)
  })

  it('deduplicates administrator point adjustments by request id and rejects mismatched replays', async () => {
    const { sqlite, db } = createDatabase()
    const env = { DB: db }
    const requestId = crypto.randomUUID()
    const body = { delta: 200, note: '第一笔线下到账', requestId }
    const call = (payload, targetId = 'u', actorId) => adjustPoints({
      request: request('a', payload, actorId), env, params: { id: targetId },
    })
    const first = await call(body)
    expect((await first.json()).replayed).toBe(false)
    const retry = await call(body)
    expect((await retry.json()).replayed).toBe(true)
    expect(sqlite.prepare("SELECT balance FROM point_wallets WHERE user_id = 'u'").get().balance).toBe(200)
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM point_transactions WHERE id = ?').get(requestId).count).toBe(1)

    expect((await call({ ...body, delta: 100 })).status).toBe(409)
    expect((await call({ ...body, note: '另一笔到账' })).status).toBe(409)
    sqlite.prepare("INSERT INTO users (id, username, password_hash, password_salt) VALUES ('u2', 'other', 'x', 'x')").run()
    expect((await call(body, 'u2')).status).toBe(409)
    sqlite.prepare("INSERT INTO users (id, username, password_hash, password_salt, role) VALUES ('a2', 'admin2', 'x', 'x', 'admin')").run()
    expect((await call(body, 'u', 'a2')).status).toBe(409)

    const reportTransactionId = crypto.randomUUID()
    sqlite.prepare("INSERT INTO point_transactions (id, user_id, delta, source, report_id) VALUES (?, 'u', -200, 'report', 'other-report')").run(reportTransactionId)
    expect((await call({ ...body, requestId: reportTransactionId })).status).toBe(409)
  })

  it('recovers a simultaneous duplicate insert after the first request commits', async () => {
    const { sqlite, db } = createDatabase()
    const env = { DB: db }
    const requestId = crypto.randomUUID()
    const originalPrepare = db.prepare.bind(db)
    let firstLookup = true
    db.prepare = (sql) => {
      if (sql.startsWith('SELECT user_id, delta, source, actor_user_id, note') && firstLookup) {
        firstLookup = false
        return { bind() { return this }, async first() { return null } }
      }
      if (sql.startsWith('INSERT INTO point_transactions')) {
        let args
        return {
          bind(...values) { args = values; return this },
          async run() {
            sqlite.prepare(sql).run(...args)
            throw new Error('UNIQUE constraint failed: point_transactions.id')
          },
        }
      }
      return originalPrepare(sql)
    }
    const result = await adjustPoints({
      request: request('a', { delta: 200, note: '并发到账', requestId }), env, params: { id: 'u' },
    })
    expect(result.status).toBe(200)
    expect((await result.json()).replayed).toBe(true)
    expect(sqlite.prepare("SELECT balance FROM point_wallets WHERE user_id = 'u'").get().balance).toBe(200)
  })

  it('does not acknowledge a duplicate insert unless the original transaction can be found', async () => {
    const { db } = createDatabase()
    const originalPrepare = db.prepare.bind(db)
    db.prepare = (sql) => sql.startsWith('INSERT INTO point_transactions')
      ? { bind() { return this }, async run() { throw new Error('UNIQUE constraint failed: point_transactions.id') } }
      : originalPrepare(sql)
    const result = await adjustPoints({
      request: request('a', { delta: 200, note: '未查到原交易' }),
      env: { DB: db }, params: { id: 'u' },
    })
    expect(result.status).toBe(500)
  })
  it('allows one free report, charges 200 points for each later report, and never re-grants the free report after deletion', async () => {
    const { sqlite, db } = createDatabase()
    const env = { DB: db }
    const firstReport = await saveReport({ request: request('u', report('r1')), env })
    expect(firstReport.status).toBe(200)
    expect((await firstReport.json()).charged).toBe(false)
    expect(sqlite.prepare("SELECT balance FROM point_wallets WHERE user_id = 'u'").get().balance).toBe(0)

    const unpaid = await saveReport({ request: request('u', report('r2'), undefined, 200), env })
    expect(unpaid.status).toBe(402)
    expect(sqlite.prepare("SELECT id FROM reports WHERE id = 'r2'").get()).toBeUndefined()
    expect(sqlite.prepare("SELECT report_id FROM report_entitlements WHERE report_id = 'r2'").get()).toBeUndefined()

    const topUp = await adjustPoints({ request: request('a', { delta: 200, note: '线下到账' }), env, params: { id: 'u' } })
    expect(topUp.status).toBe(200)
    expect((await topUp.json()).balance).toBe(200)
    const paidReport = await saveReport({ request: request('u', report('r2'), undefined, 200), env })
    expect(paidReport.status).toBe(200)
    expect((await paidReport.json()).charged).toBe(true)
    const retry = await saveReport({ request: request('u', report('r2')), env })
    expect((await retry.json()).charged).toBe(false)
    expect(sqlite.prepare("SELECT balance FROM point_wallets WHERE user_id = 'u'").get().balance).toBe(0)
    expect(sqlite.prepare("SELECT cost_points FROM report_entitlements WHERE report_id = 'r2'").get().cost_points).toBe(200)

    expect((await saveReport({ request: request('u', report('r2')), env })).status).toBe(200)
    expect((await saveReport({ request: request('u', { ...report('r2'), content: '把旧报告改成新报告' }), env })).status).toBe(409)
    expect((await saveReport({ request: request('u', { ...report('r2'), aiGenerated: true, content: 'AI 润色正文' }), env })).status).toBe(200)
    expect((await saveReport({ request: request('u', { ...report('r2'), aiGenerated: true, content: '再次替换' }), env })).status).toBe(409)
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM point_transactions WHERE source = 'report'").get().count).toBe(1)

    expect((await deleteReport({ request: request('u', {}), env, params: { id: 'r1' } })).status).toBe(200)
    expect((await saveReport({ request: request('u', report('r3'), undefined, 200), env })).status).toBe(402)
    const points = await getPoints({ request: new Request('https://example.test/api', { headers: { 'x-test-user': 'u' } }), env })
    expect((await points.json()).freeReportAvailable).toBe(false)
  })

  it('counts migrated reports, lets administrators report for free, and rejects unauthorized or overdraft adjustments', async () => {
    const { sqlite, db } = createDatabase({ legacyReport: true })
    const env = { DB: db }
    expect(sqlite.prepare("SELECT kind FROM report_entitlements WHERE report_id = 'old'").get().kind).toBe('legacy')
    expect((await saveReport({ request: request('u', report('r1'), undefined, 200), env })).status).toBe(402)
    const adminReport = await saveReport({ request: request('a', report('admin-report', 'ca')), env })
    expect(adminReport.status).toBe(200)
    expect((await adminReport.json()).charged).toBe(false)
    expect(sqlite.prepare("SELECT kind FROM report_entitlements WHERE report_id = 'admin-report'").get().kind).toBe('admin')

    const forbidden = await adjustPoints({ request: request('u', { delta: 200, note: '伪造充值' }), env, params: { id: 'u' } })
    expect(forbidden.status).toBe(403)
    const csrf = await adjustPoints({
      request: new Request('https://example.test/api', {
        method: 'POST',
        headers: { 'x-test-user': 'a', 'content-type': 'application/json' },
        body: JSON.stringify({ delta: 200, note: '跨站表单' }),
      }),
      env,
      params: { id: 'u' },
    })
    expect(csrf.status).toBe(403)
    const overdraft = await adjustPoints({ request: request('a', { delta: -1, note: '调整' }), env, params: { id: 'u' } })
    expect(overdraft.status).toBe(402)
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM point_transactions WHERE user_id = 'u'").get().count).toBe(0)
  })

  it('does not allow AI report generation without a saved authorized report', async () => {
    const { db } = createDatabase()
    const env = { DB: db, DEEPSEEK_API_KEY: 'test' }
    const response = await generateAiReport({
      request: request('u', { reportId: 'unpaid', client: { id: 'c', name: '客户' } }),
      env,
    })
    expect(response.status).toBe(403)
  })

  it('stops repeat AI report calls at the daily limit without charging again', async () => {
    const { db, sqlite } = createDatabase()
    const env = { DB: db, DEEPSEEK_API_KEY: 'test', AI_DAILY_REQUEST_LIMIT: '1' }
    const saved = {
      ...report('ai-limit'),
      aiSource: { client: { id: 'c', name: '客户' }, risks: [] },
    }
    expect((await saveReport({ request: request('u', saved), env })).status).toBe(200)
    const upstream = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '已完成' } }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', upstream)
    expect((await generateAiReport({ request: request('u', { reportId: 'ai-limit' }), env })).status).toBe(200)
    expect((await generateAiReport({ request: request('u', { reportId: 'ai-limit' }), env })).status).toBe(429)
    expect(upstream).toHaveBeenCalledTimes(1)
    expect(sqlite.prepare("SELECT used FROM ai_daily_usage WHERE user_id = 'u'").get().used).toBe(1)
  })

  it('uses only the paid report snapshot for AI and rejects a second AI generation', async () => {
    const { db } = createDatabase()
    const env = { DB: db, DEEPSEEK_API_KEY: 'test' }
    const sourceReport = {
      ...report('snapshot'),
      content: '已保存的原始报告',
      structured: { scope: '已保存的分析范围' },
      aiSource: {
        client: { id: 'c', name: '客户', establishedAt: '2020-01-01' },
        risks: [{ name: '已保存的风险', level: 'high' }],
      },
    }
    expect((await saveReport({ request: request('u', sourceReport), env })).status).toBe(200)

    const upstream = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'AI 生成的内容' } }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', upstream)
    const aiResponse = await generateAiReport({
      request: request('u', {
        reportId: 'snapshot',
        client: { id: 'other', name: '伪造企业' },
        content: '伪造的报告',
        risks: [{ name: '伪造的风险' }],
        structuredReport: { scope: '伪造的分析范围' },
      }),
      env,
    })
    expect(aiResponse.status).toBe(200)
    const prompt = JSON.parse(upstream.mock.calls[0][1].body).messages[1].content
    expect(prompt).toContain('已保存的原始报告')
    expect(prompt).toContain('已保存的风险')
    expect(prompt).toContain('已保存的分析范围')
    expect(prompt).not.toContain('伪造')

    expect((await saveReport({ request: request('u', {
      ...sourceReport,
      aiGenerated: true,
      content: 'AI 生成的内容',
    }), env })).status).toBe(200)
    expect((await generateAiReport({ request: request('u', { reportId: 'snapshot' }), env })).status).toBe(409)
    expect(upstream).toHaveBeenCalledTimes(1)
  })

  it('validates AI authorization and the persisted source snapshot', async () => {
    const { db } = createDatabase()
    const env = { DB: db, DEEPSEEK_API_KEY: 'test' }
    expect((await generateAiReport({ request: request('u', { reportId: 'missing' }), env: { DB: db } })).status).toBe(503)
    expect((await generateAiReport({ request: request('missing', { reportId: 'missing' }), env })).status).toBe(401)
    for (const reportId of [undefined, '', 12]) {
      expect((await generateAiReport({ request: request('u', { reportId }), env })).status).toBe(400)
    }
    expect((await generateAiReport({ request: request('u', null), env })).status).toBe(400)
    expect((await saveReport({ request: request('u', report('legacy')), env })).status).toBe(200)
    expect((await generateAiReport({ request: request('u', { reportId: 'legacy' }), env })).status).toBe(409)
    expect((await generateAiReport({ request: request('a', { reportId: 'legacy' }), env })).status).toBe(403)
    expect((await generateAiReport({ request: request('u', { reportId: 'legacy' }), env: { DEEPSEEK_API_KEY: 'test' } })).status).toBe(500)
  })

  it('handles upstream failures, empty content and establishment facts without changing the saved report', async () => {
    const { db, sqlite } = createDatabase()
    const env = { DB: db, DEEPSEEK_API_KEY: 'test', DEEPSEEK_MODEL: 'test-model' }
    const sourceReport = {
      ...report('ai-errors'),
      aiSource: {
        client: { id: 'c', name: '客户', establishedAt: '2020-01-01' },
        risks: [{ name: '风险', reason: '已知原因', priority: 'high', displayOrder: 1 }],
      },
    }
    expect((await saveReport({ request: request('u', sourceReport), env })).status).toBe(200)
    const body = { reportId: 'ai-errors', aiReview: { checked: true } }
    vi.stubGlobal('fetch', vi.fn(async () => new Response('upstream unavailable', { status: 503 })))
    expect((await generateAiReport({ request: request('u', body), env })).status).toBe(502)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })))
    expect((await generateAiReport({ request: request('u', body), env })).status).toBe(502)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network failed') }))
    const networkFailure = await generateAiReport({ request: request('u', body), env })
    expect(networkFailure.status).toBe(502)
    expect((await networkFailure.json()).error).toContain('无法连接')

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ finish_reason: 'length', message: { content: '未完成' } }],
    }), { status: 200 })))
    const truncated = await generateAiReport({ request: request('u', body), env })
    expect(truncated.status).toBe(502)
    expect((await truncated.json()).error).toContain('截断')

    const upstream = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '成立不足一年。\n已执行规则风险结论。\nIssue R1' } }],
      usage: { total_tokens: 10 },
    }), { status: 200 }))
    vi.stubGlobal('fetch', upstream)
    const success = await generateAiReport({ request: request('u', body), env })
    expect(success.status).toBe(200)
    const result = await success.json()
    expect(result.model).toBe('test-model')
    expect(result.usage.total_tokens).toBe(10)
    expect(result.content).not.toContain('成立不足一年')
    expect(result.content).not.toContain('已执行规则')
    expect(result.content).not.toContain('Issue R1')
    const upstreamBody = JSON.parse(upstream.mock.calls[0][1].body)
    expect(upstreamBody.messages[1].content).toContain('已知原因')
    expect(upstreamBody.thinking).toEqual({ type: 'disabled' })
    expect(upstreamBody.max_tokens).toBe(10000)
    expect(sqlite.prepare("SELECT content FROM reports WHERE id = 'ai-errors'").get().content).toBe('报告正文')
  })

  it('requests non-thinking JSON for optional data review', async () => {
    const { db } = createDatabase()
    const env = { DB: db, DEEPSEEK_API_KEY: 'test' }
    const upstream = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: '{"dataQualityWarnings":[],"nearThresholdWarnings":[],"riskReviewNotes":[]}' } }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', upstream)
    const response = await generateAiReview({ request: request('u', { client: { id: 'c', name: '客户' }, risks: [] }), env })
    expect(response.status).toBe(200)
    const body = JSON.parse(upstream.mock.calls[0][1].body)
    expect(body.thinking).toEqual({ type: 'disabled' })
    expect(body.response_format).toEqual({ type: 'json_object' })
  })

  it('preserves a short-establishment claim only when age is young or unknown', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-17T12:00:00Z'))
    for (const establishedAt of [undefined, 'invalid', '2026-09-20']) {
      const { db } = createDatabase()
      const env = { DB: db, DEEPSEEK_API_KEY: 'test' }
      const sourceReport = {
        ...report('young'),
        aiSource: { client: { id: 'c', name: '客户', establishedAt }, risks: [] },
      }
      expect((await saveReport({ request: request('u', sourceReport), env })).status).toBe(200)
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
        choices: [{ message: { content: '企业成立不足一年。' } }],
      }), { status: 200 })))
      const response = await generateAiReport({ request: request('u', { reportId: 'young' }), env })
      expect(response.status).toBe(200)
      expect((await response.json()).content).toContain('成立不足一年')
    }
  })

  it('rejects changing the saved AI source and a stale concurrent report update', async () => {
    const { db } = createDatabase()
    const env = { DB: db }
    const sourceReport = { ...report('concurrent'), aiSource: { client: { id: 'c', name: '客户' }, risks: [] } }
    expect((await saveReport({ request: request('u', sourceReport), env })).status).toBe(200)
    const changedSource = {
      ...sourceReport,
      aiGenerated: true,
      aiSource: { client: { id: 'c', name: '其他企业' }, risks: [] },
    }
    expect((await saveReport({ request: request('u', changedSource), env })).status).toBe(409)

    const prepare = db.prepare.bind(db)
    db.prepare = (sql) => sql.startsWith('UPDATE reports SET')
      ? { bind() { return this }, async run() { return { changes: 0 } } }
      : prepare(sql)
    const staleUpdate = await saveReport({
      request: request('u', { ...sourceReport, aiGenerated: true, content: '过时的 AI 内容' }),
      env,
    })
    expect(staleUpdate.status).toBe(409)
    expect((await staleUpdate.json()).error).toContain('其他请求更新')
  })

  it('rolls back the report and charge if writing its risk records fails', async () => {
    const { sqlite, db } = createDatabase()
    const env = { DB: db }
    expect((await saveReport({ request: request('u', report('free')), env })).status).toBe(200)
    expect((await adjustPoints({ request: request('a', { delta: 200, note: '到账' }), env, params: { id: 'u' } })).status).toBe(200)
    sqlite.exec("CREATE TRIGGER block_risk BEFORE INSERT ON risk_results BEGIN SELECT RAISE(ABORT, 'risk_write_failed'); END")
    const failed = await saveReport({
      request: request('u', { ...report('rollback'), risks: [{ name: '风险', code: 'R1' }] }, undefined, 200), env,
    })
    expect(failed.status).toBe(500)
    expect(sqlite.prepare("SELECT balance FROM point_wallets WHERE user_id = 'u'").get().balance).toBe(200)
    expect(sqlite.prepare("SELECT report_id FROM report_entitlements WHERE report_id = 'rollback'").get()).toBeUndefined()
    expect(sqlite.prepare("SELECT id FROM reports WHERE id = 'rollback'").get()).toBeUndefined()
  })

  it('rejects unauthorized, malformed, mismatched and cross-owner report saves', async () => {
    const { db, sqlite } = createDatabase()
    const env = { DB: db }
    expect((await saveReport({ request: request('missing', report('x')), env })).status).toBe(401)
    expect((await saveReport({ request: request('u', report('x')), env: {} })).status).toBe(500)
    const valid = report('x')
    for (const invalid of [
      null, {},
      { ...valid, id: 3 }, { ...valid, id: ' ' },
      { ...valid, clientId: 3 }, { ...valid, clientId: ' ' },
      { ...valid, clientName: 3 }, { ...valid, clientName: ' ' },
      { ...valid, content: 3 }, { ...valid, content: ' ' },
      { ...valid, risks: null }, { ...valid, risks: [null] },
      { ...valid, risks: [3] }, { ...valid, risks: [[]] },
    ]) {
      expect((await saveReport({ request: request('u', invalid), env })).status).toBe(400)
    }
    expect((await saveReport({ request: request('u', { ...valid, clientId: 'missing' }), env })).status).toBe(404)
    expect((await saveReport({ request: request('u', { ...valid, clientName: '伪造企业' }), env })).status).toBe(409)
    expect((await saveReport({ request: request('a', report('x', 'ca')), env })).status).toBe(200)
    expect((await saveReport({ request: request('u', valid), env })).status).toBe(409)
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM report_entitlements WHERE user_id = 'u'").get().count).toBe(0)
  })

  it('lists only owned reports and stores explicit and default risk fields', async () => {
    const { db, sqlite } = createDatabase()
    const env = { DB: db }
    expect((await listReports({ request: new Request('https://example.test/api', { headers: { 'x-test-user': 'missing' } }), env })).status).toBe(401)
    expect((await listReports({ request: new Request('https://example.test/api', { headers: { 'x-test-user': 'u' } }), env: {} })).status).toBe(500)
    expect((await saveReport({
      request: request('u', {
        ...report('detailed'), riskLevel: 'high', createdAt: '2026-09-17',
        risks: [{ code: 'R1', name: '风险一', level: 'high' }, {}],
      }), env,
    })).status).toBe(200)
    expect((await saveReport({ request: request('a', report('admin-only', 'ca')), env })).status).toBe(200)
    const listed = await listReports({ request: new Request('https://example.test/api', { headers: { 'x-test-user': 'u' } }), env })
    expect((await listed.json()).reports.map((item) => item.id)).toEqual(['detailed'])
    expect(sqlite.prepare("SELECT risk_level FROM reports WHERE id = 'detailed'").get().risk_level).toBe('high')
    expect(sqlite.prepare("SELECT rule_code, rule_name, risk_level FROM risk_results WHERE report_id = 'detailed' ORDER BY rule_code").all()).toEqual([
      { rule_code: '', rule_name: '', risk_level: '' },
      { rule_code: 'R1', rule_name: '风险一', risk_level: 'high' },
    ])
  })
})
