import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequestPost } from './excel-mapping.js'

vi.mock('../auth/_auth.js', () => ({
  requireUser: async () => ({ user: { id: 'user-a', role: 'user' } }),
}))
vi.mock('../_ai_budget.js', async (load) => ({
  ...await load(),
  reserveAiCall: async () => null,
}))

function requestMapping(headers, mapping) {
  const fetch = vi.fn(async () => Response.json({
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ mapping }) } }],
  }))
  vi.stubGlobal('fetch', fetch)
  const request = new Request('http://localhost/api/ai/excel-mapping', {
    method: 'POST',
    body: JSON.stringify({ headers, rows: ['private cell value'] }),
  })
  return { response: onRequestPost({ request, env: { DB: {}, DEEPSEEK_API_KEY: 'test' } }), fetch }
}

afterEach(() => vi.unstubAllGlobals())

describe('AI Excel mapping', () => {
  it('sends only the headers and returns an allowed column mapping', async () => {
    const headers = ['科目描述', '当月发生额']
    const mapping = { kind: 'income_statement', columns: { lineName: 0, currentAmount: 1 } }
    const { response, fetch } = requestMapping(headers, mapping)
    expect(await (await response).json()).toEqual({ mapping })
    const prompt = JSON.parse(fetch.mock.calls[0][1].body).messages[1].content
    expect(JSON.parse(prompt).headers).toEqual(headers)
    expect(prompt).not.toContain('private cell value')
  })

  it('rejects invented source columns and arbitrary destination fields', async () => {
    for (const columns of [{ currentAmount: 7 }, { unexpected: 0 }]) {
      const { response } = requestMapping(['科目描述', '当月发生额'], { kind: 'income_statement', columns })
      expect((await response).status).toBe(502)
    }
  })
})
