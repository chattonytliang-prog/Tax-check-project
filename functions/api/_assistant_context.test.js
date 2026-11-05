import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { boundToolOutput, estimateTokens, fitStepMessages, prepareAssistantContext, userAgreements } from './_assistant_context.js'
import { runAssistant } from './_assistant_runtime.js'
import { archiveQuestionWithHistory } from './ai/_archived_sources.js'
import { onRequestPost as saveMemory } from './assistant/memory.js'

vi.mock('./auth/_auth.js', () => ({ requireUser: async () => ({ user: { id: 'a' } }) }))

let sqlite, db, env
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES ('a'),('b');
    CREATE TABLE clients(id TEXT PRIMARY KEY, owner_user_id TEXT, name TEXT);
    INSERT INTO clients VALUES ('client-a','a','甲公司'),('client-b','b','乙公司');
    CREATE TABLE assistant_customer_memories(id TEXT PRIMARY KEY, owner_user_id TEXT, client_id TEXT, client_name TEXT, memory_key TEXT, memory_value TEXT, source TEXT, confidence TEXT, created_at TEXT, updated_at TEXT);
    INSERT INTO assistant_customer_memories(owner_user_id,client_id,memory_key,memory_value,source,confidence,updated_at) VALUES ('a','client-a','金额口径','金额以元为单位','用户确认','high','2026-11-05'),
      ('b','client-b','私有信息','其他账号不可见的记忆','用户确认','high','2026-11-05');`)
  for (const name of ['0005_assistant_threads', '0010_ai_daily_usage', '0013_assistant_artifacts', '0014_assistant_context']) {
    sqlite.exec(readFileSync(new URL(`../../migrations/${name}.sql`, import.meta.url), 'utf8'))
  }
  sqlite.prepare('INSERT INTO assistant_threads(id,owner_user_id,title,payload_json) VALUES (?,?,?,?)')
    .run('thread-a', 'a', '测试', JSON.stringify({ clientId: 'client-a' }))
  db = { prepare(sql) {
    let values = []
    return { bind(...args) { values = args; return this },
      run: async () => sqlite.prepare(sql).run(...values), first: async () => sqlite.prepare(sql).get(...values), all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
    }
  }, batch: async (statements) => Promise.all(statements.map((statement) => statement.run())) }
  env = { DEEPSEEK_API_KEY: 'fake-test-only' }
})
afterEach(() => { vi.unstubAllGlobals(); sqlite.close() })
const completion = (content) => Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }] })
const options = (history = []) => ({ db, env, user: { id: 'a' }, threadId: 'thread-a', requestId: 'turn', history, message: '继续按之前的要求处理' })
const longHistory = () => [
  { role: 'user', content: '以后金额统一保留四位小数。' },
  { role: 'user', content: `${'这是一段长说明。'.repeat(350)}不要用累计金额替代本期金额。` },
  ...Array.from({ length: 28 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `第 ${index + 1} 条后续交流` })),
]

describe('automatic assistant context', () => {
  it('keeps twelve short messages verbatim, including the earliest agreement', async () => {
    const history = Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `消息 ${index}` }))
    const fetch = vi.fn(async () => completion('完成'))
    vi.stubGlobal('fetch', fetch)
    await runAssistant(options(history))
    const sent = JSON.parse(fetch.mock.calls[0][1].body)
    expect(sent.messages.filter((entry) => entry.role !== 'system')).toHaveLength(13)
    expect(sent.messages.some((entry) => entry.content === '消息 0')).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('summarizes before truncating, pins user agreements, and reuses a saved checkpoint on a short follow-up', async () => {
    const fetch = vi.fn(async (_url, init) => JSON.parse(init.body).messages[0].content.includes('对话上下文整理器')
      ? completion('用户要求金额四位小数，不能使用累计金额替代本期金额。') : completion('继续处理。'))
    vi.stubGlobal('fetch', fetch)
    const history = longHistory()
    const first = await runAssistant(options(history))
    expect(first.context.summaryUpdated).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
    const prompt = JSON.parse(fetch.mock.calls[1][1].body).messages[0].content
    expect(prompt).toContain('以后金额统一保留四位小数')
    expect(prompt).toContain('不要用累计金额替代本期金额')
    expect(prompt).toContain('金额以元为单位')
    expect(prompt).not.toContain('其他账号不可见的记忆')
    const row = sqlite.prepare('SELECT * FROM assistant_context').get()
    expect(row.covered_count).toBeGreaterThan(0)
    expect(sqlite.prepare('SELECT used FROM ai_daily_usage').get().used).toBe(2)
    fetch.mockClear()
    const next = await runAssistant(options([...history, { role: 'assistant', content: first.answer }, { role: 'user', content: '再继续' }]))
    expect(next.context.summaryUpdated).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetch.mock.calls[0][1].body).messages[0].content).toContain(row.summary)
  })

  it('invalidates a summary after editing an earlier user message', async () => {
    let summary = '用户要求金额四位小数。'
    const fetch = vi.fn(async (_url, init) => JSON.parse(init.body).messages[0].content.includes('对话上下文整理器') ? completion(summary) : completion('完成'))
    vi.stubGlobal('fetch', fetch)
    const history = longHistory()
    await runAssistant(options(history))
    summary = '用户改为金额两位小数。'
    const edited = [{ role: 'user', content: '以后金额统一保留两位小数。' }, ...history.slice(1)]
    fetch.mockClear()
    await runAssistant(options(edited))
    expect(fetch).toHaveBeenCalledTimes(2)
    const summaryRequest = JSON.parse(fetch.mock.calls[0][1].body)
    expect(summaryRequest.messages.at(-1).content).not.toContain('四位小数')
    expect(sqlite.prepare('SELECT summary FROM assistant_context').get().summary).toContain('两位小数')
  })

  it('keeps original history searchable and does not advance the checkpoint when summarization fails', async () => {
    const fetch = vi.fn(async (_url, init) => JSON.parse(init.body).messages[0].content.includes('对话上下文整理器')
      ? Response.json({ error: { message: 'unavailable' } }, { status: 503 }) : completion('可以继续'))
    vi.stubGlobal('fetch', fetch)
    const result = await runAssistant(options(longHistory()))
    expect(result.answer).toBe('可以继续')
    expect(result.context.summaryDeferred).toBe(true)
    expect(sqlite.prepare('SELECT covered_count FROM assistant_context').get()).toBeUndefined()
    const sent = JSON.parse(fetch.mock.calls[1][1].body)
    expect(sent.messages[0].content).toContain('以后金额统一保留四位小数')
    expect(sent.tools.map((entry) => entry.function.name)).toContain('search_conversation')
    expect(sent.tools.map((entry) => entry.function.name)).toContain('read_conversation')
  })

  it('reserves the remaining daily call for the answer before optional summarization', async () => {
    env.AI_DAILY_REQUEST_LIMIT = '1'
    const fetch = vi.fn(async () => completion('继续按此前约定处理'))
    vi.stubGlobal('fetch', fetch)
    const result = await runAssistant(options(longHistory()))
    expect(result.answer).toContain('此前约定')
    expect(result.context.summaryDeferred).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetch.mock.calls[0][1].body).messages[0].content).not.toContain('你是对话上下文整理器')
    expect(sqlite.prepare('SELECT used FROM ai_daily_usage').get().used).toBe(1)
  })

  it('retains early agreements when manually writing company memory and preserves the original transcript', async () => {
    const history = longHistory()
    const payload = { id: 'thread-a', clientId: 'client-a', attachmentIds: ['uploaded-a'], messages: history }
    sqlite.prepare('UPDATE assistant_threads SET payload_json = ? WHERE id = ?').run(JSON.stringify(payload), 'thread-a')
    let memoryPrompt
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body)
      if (body.messages[0].content.includes('对话上下文整理器')) return completion('用户要求金额统一保留四位小数。')
      memoryPrompt = JSON.parse(body.messages.at(-1).content)
      return completion(JSON.stringify({ summary: '已记录金额格式约定。', memories: [{ key: 'decimal_places', value: '金额统一保留四位小数', confidence: 'high' }] }))
    }))
    const response = await saveMemory({ env: { ...env, DB: db }, request: new Request('https://test.local/api/assistant/memory', {
      method: 'POST', body: JSON.stringify({ threadId: 'thread-a', client: { id: 'client-a', name: '甲公司' }, messages: history }),
    }) })
    const result = await response.json()
    expect(response.status, JSON.stringify(result)).toBe(200)
    expect(memoryPrompt.context.userAgreements.join('\n')).toContain('以后金额统一保留四位小数')
    expect(memoryPrompt.context.userAgreements.join('\n')).toContain('不要用累计金额替代本期金额')
    expect(sqlite.prepare("SELECT memory_value FROM assistant_customer_memories WHERE memory_key='decimal_places'").get().memory_value).toContain('四位小数')
    expect(JSON.parse(sqlite.prepare('SELECT payload_json FROM assistant_threads').get().payload_json)).toEqual(payload)
    sqlite.prepare('DELETE FROM assistant_threads WHERE id = ?').run('thread-a')
    expect(sqlite.prepare('SELECT * FROM assistant_context').get()).toBeUndefined()
  })

  it('rejects cross-account context before reading memory or calling a model', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(prepareAssistantContext({ ...options(), user: { id: 'b' } })).rejects.toThrow('当前对话不可用')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not overwrite a newer checkpoint when overlapping summary requests finish out of order', async () => {
    const pending = []
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => pending.push(resolve))))
    const first = prepareAssistantContext(options(longHistory()))
    await vi.waitFor(() => expect(pending).toHaveLength(1))
    const changed = longHistory()
    changed[0] = { role: 'user', content: '以后金额统一保留两位小数。' }
    const second = prepareAssistantContext(options(changed))
    await vi.waitFor(() => expect(pending).toHaveLength(2))
    pending[1](completion('后发请求：按两位小数。'))
    await second
    pending[0](completion('先发请求：按四位小数。'))
    await first
    expect(sqlite.prepare('SELECT summary FROM assistant_context').get().summary).toBe('后发请求：按两位小数。')
  })

  it('can retrieve the original tail of a long historical message through consecutive tools', async () => {
    const history = longHistory()
    history[1].content = `${'历史正文'.repeat(1500)}指定部门：研发部。`
    let mainStep = 0
    const fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body)
      if (body.messages[0].content.includes('对话上下文整理器')) return completion('用户正在按部门处理数据。')
      const toolCall = (name, input) => Response.json({ choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: '', tool_calls: [{ id: `history-${mainStep}`, type: 'function', function: { name, arguments: JSON.stringify(input) } }] } }] })
      if (mainStep++ === 0) return toolCall('search_conversation', { query: '研发部' })
      const output = JSON.parse(body.messages.findLast((entry) => entry.role === 'tool').content)
      if (mainStep === 2) {
        expect(output.messages[0]).toMatchObject({ index: 1, role: 'user' })
        expect(output.messages[0].content).toContain('指定部门：研发部')
        return toolCall('read_conversation', { index: 1, offset: 5900 })
      }
      expect(output.content).toContain('指定部门：研发部')
      return completion('已找回原约定：指定部门为研发部。')
    })
    vi.stubGlobal('fetch', fetch)
    const result = await runAssistant(options(history))
    expect(result.answer).toContain('研发部')
    expect(result.toolSteps.map((entry) => entry.name)).toEqual(['search_conversation', 'read_conversation'])
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('folds earlier tool exchanges without leaving orphan results', () => {
    const messages = [{ role: 'user', content: '继续处理' }]
    for (let index = 0; index < 6; index += 1) messages.push(
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: `call-${index}`, toolName: 'read_source', input: { sourceId: 'source-a' } }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: `call-${index}`, toolName: 'read_source', output: { type: 'json', value: '原文'.repeat(1900) } }] },
    )
    const fitted = fitStepMessages(messages, '金额统一保留四位小数', {})
    expect(estimateTokens(fitted)).toBeLessThan(32_000)
    const calls = fitted.filter((entry) => entry.role === 'assistant').flatMap((entry) => entry.content.map((part) => part.toolCallId))
    const results = fitted.filter((entry) => entry.role === 'tool').flatMap((entry) => entry.content.map((part) => part.toolCallId))
    expect(calls).toEqual(['call-5'])
    expect(results).toEqual(calls)
  })

  it('does not skip unread source blocks when shortening a tool response', () => {
    const bounded = boundToolOutput({ offset: 0, totalSections: 8, nextOffset: null, sections: Array.from({ length: 8 }, () => ({ label: '正文', text: '原文'.repeat(900) })) })
    expect(bounded.contextTrimmed).toBe(true)
    expect(bounded.nextOffset).toBe(bounded.sections.length)
    expect(bounded.sections.length).toBeLessThan(8)
  })

  it('inherits the year for a short month follow-up while honoring explicit scope changes', () => {
    const history = [{ role: 'user', content: '请核对2026年2月的手续费' }]
    expect(archiveQuestionWithHistory('那3月呢？', history)).toContain('2026年3月')
    expect(archiveQuestionWithHistory('原文怎么写？', history)).toContain('2026年2月')
    expect(archiveQuestionWithHistory('比较2025年3月', history)).toBe('比较2025年3月')
    expect(archiveQuestionWithHistory('查询全部期间', history)).toBe('查询全部期间')
    expect(archiveQuestionWithHistory('原文怎么写？', [...history, { role: 'user', content: '那3月呢？' }])).toContain('2026年3月')
    expect(archiveQuestionWithHistory('继续', [...history, { role: 'user', content: '查询全部期间' }])).toBe('继续')
    expect(archiveQuestionWithHistory('原文怎么写？', [{ role: 'user', content: '比较2026年1月到3月' }])).toContain('2026年1月到3月')
  })

  it('keeps the latest repeated agreement after an intervening correction', () => {
    const agreements = userAgreements([
      { role: 'user', content: '以后统一保留四位小数。' },
      { role: 'user', content: '以后统一保留两位小数。' },
      { role: 'user', content: '以后统一保留四位小数。' },
    ])
    expect(agreements.at(-1)).toBe('以后统一保留四位小数。')
  })
})
