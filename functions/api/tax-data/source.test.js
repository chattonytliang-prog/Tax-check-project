import { describe, expect, it, vi } from 'vitest'
import { onRequestGet, onRequestPost } from './source.js'

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

  it.each([
    [{ id: 'existing', file_name: 'return.pdf', storage_key: 'r2/key' }, { duplicate: true, sourceFileId: 'existing', fileName: 'return.pdf', stored: true, recordCount: 8 }],
    [null, { duplicate: false, sourceFileId: null, fileName: null, stored: false, recordCount: 0 }],
  ])('uses owner and client scopes for %s', async (row, expected) => {
    const bind = vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(row) })
    const countBind = vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue({ count: 8 }) })
    const prepare = vi.fn().mockImplementation((sql) => sql.includes('tax_data_standard_records') ? { bind: countBind } : { bind })
    const hash = 'a'.repeat(64)
    const response = await onRequestGet({ request: requestFor(hash), env: { DB: { prepare } } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(expected)
    expect(prepare.mock.calls[0][0]).toContain('owner_user_id = ? AND client_id = ? AND file_hash = ?')
    expect(bind).toHaveBeenCalledWith('owner-a', 'client-a', hash)
    if (row) expect(countBind).toHaveBeenCalledWith('owner-a', 'client-a', row.id)
  })
})

describe('archived original restoration', () => {
  it('rejects replacement content that differs from the archived SHA-256', async () => {
    const form = new FormData()
    form.append('sourceFileId', 'source-a')
    form.append('fileName', 'return.pdf')
    form.append('file', new File(['different'], 'return.pdf', { type: 'application/pdf' }))
    const put = vi.fn()
    const db = {
      prepare: () => ({
        bind: () => ({ first: async () => ({ id: 'source-a', client_id: 'client-a', file_name: 'return.pdf', file_hash: 'a'.repeat(64) }) }),
      }),
    }
    const response = await onRequestPost({
      request: new Request('https://example.com/api/tax-data/source', { method: 'POST', body: form }),
      env: { DB: db, MATERIALS_BUCKET: { put } },
    })
    expect(response.status).toBe(400)
    expect(put).not.toHaveBeenCalled()
  })

  it('stores matching content and updates the archived file pointer', async () => {
    const content = new TextEncoder().encode('original content')
    const digest = await crypto.subtle.digest('SHA-256', content)
    const fileHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    const form = new FormData()
    form.append('sourceFileId', 'source-a')
    form.append('fileName', 'return.pdf')
    form.append('file', new File([content], 'return.pdf', { type: 'application/pdf' }))
    const put = vi.fn().mockResolvedValue(undefined)
    const run = vi.fn().mockResolvedValue({})
    const db = {
      prepare: vi.fn((sql) => ({
        bind: vi.fn(() => sql.includes('SELECT')
          ? { first: async () => ({ id: 'source-a', client_id: 'client-a', file_name: 'return.pdf', file_hash: fileHash }) }
          : { run }),
      })),
    }
    const response = await onRequestPost({
      request: new Request('https://example.com/api/tax-data/source', { method: 'POST', body: form }),
      env: { DB: db, MATERIALS_BUCKET: { put } },
    })
    expect(response.status).toBe(200)
    expect(put).toHaveBeenCalledOnce()
    expect(run).toHaveBeenCalledOnce()
    expect(await response.json()).toMatchObject({ ok: true, sourceFileId: 'source-a', stored: true })
  })
})
