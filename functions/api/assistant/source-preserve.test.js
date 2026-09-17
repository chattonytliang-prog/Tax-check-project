import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequestPost } from './tools.js'

vi.mock('../auth/_auth.js', () => ({
  requireUser: async () => ({ user: { id: 'owner-a' } }),
}))
vi.mock('../_tax_data_schema.js', () => ({
  ensureTaxDataIntakeTables: async () => {},
}))

const opened = []
afterEach(() => {
  for (const sqlite of opened.splice(0)) sqlite.close()
})

describe('source file re-import', () => {
  it('preserves the stored original when a later parsed batch omits its storage key', async () => {
    const sqlite = new DatabaseSync(':memory:')
    opened.push(sqlite)
    sqlite.exec(readFileSync(new URL('../../../migrations/0008_full_tax_data_intake.sql', import.meta.url), 'utf8'))
    sqlite.prepare("INSERT INTO tax_data_import_batches (id, owner_user_id) VALUES ('old', 'owner-a')").run()
    sqlite.prepare(`INSERT INTO tax_data_source_files
      (id, owner_user_id, batch_id, client_id, file_name, document_type, storage_key)
      VALUES ('source-a', 'owner-a', 'old', 'client-a', 'return.pdf', 'vat_return', 'owner-a/archive/source-a/return.pdf')`).run()
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
    }
    const response = await onRequestPost({
      request: new Request('https://example.com/api/assistant/tools', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          allowSave: true,
          toolCalls: [{
            name: 'save_standardized_tax_data',
            arguments: {
              batchId: 'new',
              clientId: 'client-a',
              sourceFiles: [{ id: 'source-a', fileName: 'return.pdf', documentType: 'vat_return', storageKey: '' }],
              records: [],
            },
          }],
        }),
      }),
      env: { DB: db },
    })
    expect(response.status).toBe(200)
    expect(sqlite.prepare("SELECT storage_key FROM tax_data_source_files WHERE id = 'source-a'").get().storage_key)
      .toBe('owner-a/archive/source-a/return.pdf')
  })
})
