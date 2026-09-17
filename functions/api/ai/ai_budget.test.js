import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { aiUpstreamFailure, readAiRequest, reserveAiCall } from '../_ai_budget.js'

const opened = []
afterEach(() => {
  for (const sqlite of opened.splice(0)) sqlite.close()
})

function database() {
  const sqlite = new DatabaseSync(':memory:')
  opened.push(sqlite)
  sqlite.exec('PRAGMA foreign_keys = ON; CREATE TABLE users (id TEXT PRIMARY KEY)')
  sqlite.exec(readFileSync(new URL('../../../migrations/0010_ai_daily_usage.sql', import.meta.url), 'utf8'))
  sqlite.prepare("INSERT INTO users (id) VALUES ('normal'), ('admin')").run()
  return {
    sqlite,
    db: {
      prepare(sql) {
        return {
          bind(...values) {
            return { async run() { return sqlite.prepare(sql).run(...values) } }
          },
        }
      },
    },
  }
}

describe('AI request budget', () => {
  it.each([
    [401, '密钥无效'],
    [402, '服务账户余额不足'],
    [429, '过于频繁'],
    [503, '暂不可用'],
  ])('explains provider status %s without exposing raw responses', async (status, reason) => {
    const response = aiUpstreamFailure(status)
    expect(response.status).toBe(502)
    expect((await response.json()).error).toContain(reason)
  })
  it('rejects oversized and malformed JSON without invoking a model', async () => {
    const declared = await readAiRequest(new Request('https://test.local', {
      method: 'POST', headers: { 'content-length': '99' }, body: '{}',
    }), 10)
    expect(declared.response.status).toBe(413)
    const utf8 = await readAiRequest(new Request('https://test.local', {
      method: 'POST', body: JSON.stringify({ message: '测试' }),
    }), 10)
    expect(utf8.response.status).toBe(413)
    const invalid = await readAiRequest(new Request('https://test.local', { method: 'POST', body: '{' }))
    expect(invalid.response.status).toBe(400)
    const array = await readAiRequest(new Request('https://test.local', { method: 'POST', body: '[]' }))
    expect(array.response.status).toBe(400)
    const valid = await readAiRequest(new Request('https://test.local', { method: 'POST', body: '{"message":"ok"}' }))
    expect(valid.data).toEqual({ message: 'ok' })
  })

  it('atomically caps ordinary users, gives admins a larger cap, and resets by UTC date', async () => {
    const { sqlite, db } = database()
    const env = { AI_DAILY_REQUEST_LIMIT: '2' }
    const firstDay = new Date('2026-09-17T12:00:00Z')
    expect(await reserveAiCall(db, { id: 'normal', role: 'user' }, env, firstDay)).toBeNull()
    expect(await reserveAiCall(db, { id: 'normal', role: 'user' }, env, firstDay)).toBeNull()
    expect((await reserveAiCall(db, { id: 'normal', role: 'user' }, env, firstDay)).status).toBe(429)
    for (let index = 0; index < 6; index += 1) {
      expect(await reserveAiCall(db, { id: 'admin', role: 'admin' }, env, firstDay)).toBeNull()
    }
    expect((await reserveAiCall(db, { id: 'admin', role: 'admin' }, env, firstDay)).status).toBe(429)
    expect(await reserveAiCall(db, { id: 'normal', role: 'user' }, env, new Date('2026-09-18T00:00:00Z'))).toBeNull()
    expect(sqlite.prepare("SELECT used FROM ai_daily_usage WHERE user_id = 'normal' AND usage_date = '2026-09-17'").get().used).toBe(2)
  })

  it('uses a bounded default for invalid configuration', async () => {
    const { db } = database()
    expect(await reserveAiCall(db, { id: 'normal', role: 'user' }, { AI_DAILY_REQUEST_LIMIT: '999999' })).toBeNull()
  })
})
