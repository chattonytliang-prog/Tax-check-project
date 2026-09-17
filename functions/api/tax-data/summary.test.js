import { describe, expect, it, vi } from 'vitest'
import { classifyVatSlot, onRequestGet } from './summary.js'

vi.mock('../auth/_auth.js', () => ({
  requireUser: async () => ({ user: { id: 'owner-a' } }),
}))
vi.mock('../_tax_data_schema.js', () => ({
  ensureTaxDataIntakeTables: async () => {},
}))

describe('VAT archive slots', () => {
  it('keeps the general return in the main slot despite 附加税费 in its title', () => {
    expect(classifyVatSlot('增值税及附加税费申报表')).toBe('vat-return-main')
    expect(classifyVatSlot('增值税及附加税费申报表附列资料（四）')).toBe('vat-schedule-4')
    expect(classifyVatSlot('增值税及附加税费申报表附列资料（一）')).toBe('vat-other-schedules')
  })
})

describe('archive evidence counts', () => {
  it('counts registered originals separately from stored originals and linked records', async () => {
    const queries = []
    const db = {
      prepare(sql) {
        return {
          bind(...params) {
            queries.push({ sql, params })
            return {
              async all() {
                if (sql.includes('SUM(CASE WHEN COALESCE(storage_key')) return { results: [{ count: 9, stored_count: 7 }] }
                if (sql.includes('COUNT(DISTINCT source_file_id) AS count')) return { results: [{ count: 5 }] }
                if (sql.includes('SELECT COUNT(*) AS count FROM tax_data_standard_records')) return { results: [{ count: 1729 }] }
                return { results: [] }
              },
            }
          },
        }
      },
    }
    const response = await onRequestGet({
      request: new Request('https://example.com/api/tax-data/summary?clientId=client-a'),
      env: { DB: db },
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.stats).toMatchObject({ sourceFileCount: 9, storedSourceFileCount: 7, linkedSourceFileCount: 5, recordCount: 1729 })
    expect(queries.filter(({ sql }) => sql.includes('FROM tax_data_source_files')).map(({ params }) => params)).toContainEqual(['owner-a', 'client-a'])
  })
})
