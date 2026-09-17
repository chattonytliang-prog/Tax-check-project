import { describe, expect, it, vi } from 'vitest'
import { onRequestGet } from './source.js'

vi.mock('../auth/_auth.js', () => ({
  requireUser: async () => ({ user: { id: 'owner-a' } }),
}))
vi.mock('../_tax_data_schema.js', () => ({
  ensureTaxDataIntakeTables: async () => {},
}))

function requestFor(hash) {
  return new Request(`https://example.com/api/tax-data/source?clientId=client-a&fileHash=${hash}`)
}

describe('archived source hash lookup', () => {
  it('rejects malformed hashes before querying files', async () => {
    const prepare = vi.fn()
    const response = await onRequestGet({ request: requestFor('not-a-sha256'), env: { DB: { prepare } } })
    expect(response.status).toBe(400)
    expect(prepare).not.toHaveBeenCalled()
  })

  it.each([['existing', true], [null, false]])('uses owner and client scopes for %s', async (row, duplicate) => {
    const first = vi.fn().mockResolvedValue(row ? { id: row } : null)
    const bind = vi.fn().mockReturnValue({ first })
    const prepare = vi.fn().mockReturnValue({ bind })
    const hash = 'a'.repeat(64)
    const response = await onRequestGet({ request: requestFor(hash), env: { DB: { prepare } } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ duplicate })
    expect(prepare.mock.calls[0][0]).toContain('owner_user_id = ? AND client_id = ? AND file_hash = ?')
    expect(bind).toHaveBeenCalledWith('owner-a', 'client-a', hash)
  })
})
