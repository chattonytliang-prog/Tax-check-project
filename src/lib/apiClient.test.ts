import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiDelete, apiGet, apiSend } from './apiClient'

function mockFetch(response: Partial<Response> & { jsonBody?: unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: vi.fn().mockResolvedValue(response.jsonBody ?? {}),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('apiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns JSON for successful GET requests', async () => {
    mockFetch({ jsonBody: { ok: true } })

    await expect(apiGet('/api/test')).resolves.toEqual({ ok: true })
  })

  it('sends JSON bodies and returns response JSON', async () => {
    const fetchMock = mockFetch({ jsonBody: { id: 'created' } })

    await expect(apiSend('/api/items', 'POST', { name: '测试' })).resolves.toEqual({ id: 'created' })
    expect(fetchMock).toHaveBeenCalledWith('/api/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '测试' }),
    })
  })

  it('uses backend error messages when write requests fail', async () => {
    mockFetch({ ok: false, status: 400, jsonBody: { detail: '字段缺失' } })

    await expect(apiSend('/api/items', 'PUT', {})).rejects.toThrow('字段缺失')
  })

  it('uses backend error messages when delete requests fail', async () => {
    mockFetch({ ok: false, status: 403, jsonBody: { error: '无权限' } })

    await expect(apiDelete('/api/items/1')).rejects.toThrow('无权限')
  })
})
