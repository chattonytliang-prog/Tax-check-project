import { describe, expect, it, vi } from 'vitest'
import { onRequestPost } from './materials.js'

vi.mock('../auth/_auth.js', () => ({
  requireUser: async () => ({ user: { id: 'owner-a' } }),
}))

describe('source material storage requirement', () => {
  it('does not create metadata-only archive entries when direct intake requires R2', async () => {
    const form = new FormData()
    form.append('file', new File(['content'], 'return.pdf', { type: 'application/pdf' }))
    form.append('requireStorage', 'true')
    const prepare = vi.fn()
    const response = await onRequestPost({
      request: new Request('https://example.com/api/assistant/materials', { method: 'POST', body: form }),
      env: { DB: { prepare } },
    })
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('storage is unavailable') })
    expect(prepare).not.toHaveBeenCalled()
  })
})
