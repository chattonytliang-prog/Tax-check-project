import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiDelete, apiGet, apiSend, apiUpload } from './apiClient'

function mockFetch(response: Partial<Response> & { jsonBody?: unknown; jsonError?: Error }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: response.jsonError
      ? vi.fn().mockRejectedValue(response.jsonError)
      : vi.fn().mockResolvedValue(response.jsonBody ?? {}),
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

  it('uploads form data without adding JSON headers', async () => {
    const fetchMock = mockFetch({ jsonBody: { stored: true } })
    const formData = new FormData()
    formData.append('name', '资料')

    await expect(apiUpload('/api/files', formData)).resolves.toEqual({ stored: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/files', { method: 'POST', body: formData })
  })

  it('falls back to response status when an error body has no message', async () => {
    mockFetch({ ok: false, status: 422, jsonBody: {} })

    await expect(apiSend('/api/items', 'POST', {})).rejects.toThrow('API request failed: 422')
  })

  it('falls back to response status when an error body is not JSON', async () => {
    mockFetch({ ok: false, status: 500, jsonError: new Error('invalid json') })

    await expect(apiGet('/api/items')).rejects.toThrow('API request failed: 500')
  })
})
