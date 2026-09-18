import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import { classifyVatSlot, onRequestGet } from './summary.js'
import { taxDataIntakeMigration } from '../_tax_data_schema.js'

vi.mock('../auth/_auth.js', () => ({
  requireUser: async () => ({ user: { id: 'owner-a' } }),
}))
vi.mock('../_tax_data_schema.js', async (importOriginal) => ({
  ...await importOriginal(),
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
    const sources = Array.from({ length: 9 }, (_, index) => ({
      id: `source-${index + 1}`,
      file_name: `文件${index + 1}.xlsx`,
      document_type: 'account_balance',
      period_start: '2025-01-01',
      period_end: '2025-01-31',
      parse_status: index === 1 || index === 6 ? 'pending' : index === 2 ? 'failed' : index === 3 || index === 4 || index === 7 ? 'needs_confirmation' : 'parsed',
      storage_key: index < 7 ? `archive/${index + 1}` : '',
      evidence_json: index === 4 || index === 7
        ? JSON.stringify({ templateMatches: [{ validations: [{ blocking: true, status: 'failed', detail: index === 4 ? '第 4 行交易日期无效' : '缺少必需表头' }] }] })
        : '{}',
      created_at: '2025-02-01',
    }))
    const db = {
      prepare(sql) {
        return {
          bind(...params) {
            queries.push({ sql, params })
            return {
              async all() {
                if (sql.includes('FROM tax_data_source_files')) return { results: sources }
                if (sql.includes('GROUP BY source_file_id')) return { results: sources.slice(0, 5).map((source) => ({ source_file_id: source.id, count: 2 })) }
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
    expect(body.sourceFiles).toHaveLength(9)
    expect(body.sourceFiles[0]).toMatchObject({ stored: true, recordCount: 2, reviewNote: '' })
    expect(body.sourceFiles[1]).toMatchObject({ stored: true, recordCount: 2, reviewNote: expect.stringContaining('状态仍为待处理') })
    expect(body.sourceFiles[2]).toMatchObject({ stored: true, recordCount: 2, reviewNote: expect.stringContaining('解析状态为失败') })
    expect(body.sourceFiles[3]).toMatchObject({ stored: true, recordCount: 2, reviewNote: expect.stringContaining('仍待人工确认') })
    expect(body.sourceFiles[4]).toMatchObject({ stored: true, recordCount: 2, reviewNote: '第 4 行交易日期无效' })
    expect(body.sourceFiles[6]).toMatchObject({ stored: true, recordCount: 0, reviewNote: '源文件已登记，尚待解析；未形成标准记录。' })
    expect(body.sourceFiles[7]).toMatchObject({ stored: false, recordCount: 0, reviewNote: '缺少必需表头' })
    expect(body.sourceFiles[8]).toMatchObject({ stored: false, recordCount: 0, reviewNote: expect.stringContaining('尚无标准记录') })
    expect(queries.filter(({ sql }) => sql.includes('FROM tax_data_source_files')).map(({ params }) => params)).toContainEqual(['owner-a', 'client-a'])
    expect(queries.filter(({ sql }) => sql.includes('GROUP BY source_file_id')).map(({ params }) => params)).toContainEqual(['owner-a', 'client-a'])
  })

  it('lists only this owner and client, with per-file stored and standardized counts', async () => {
    const sqlite = new DatabaseSync(':memory:')
    try {
      for (const statement of taxDataIntakeMigration.statements) sqlite.exec(statement)
      sqlite.prepare("INSERT INTO tax_data_import_batches (id, owner_user_id) VALUES (?, ?)").run('batch-a', 'owner-a')
      sqlite.prepare("INSERT INTO tax_data_import_batches (id, owner_user_id) VALUES (?, ?)").run('batch-b', 'owner-b')
      const insertSource = sqlite.prepare(`INSERT INTO tax_data_source_files
        (id, owner_user_id, batch_id, client_id, file_name, document_type, parse_status, storage_key, evidence_json)
        VALUES (?, ?, ?, ?, ?, 'account_balance', ?, ?, ?)`)
      insertSource.run('stored', 'owner-a', 'batch-a', 'client-a', '已入库.xls', 'parsed', 'archive/stored', '{}')
      insertSource.run('pending', 'owner-a', 'batch-a', 'client-a', '待确认.xls', 'needs_confirmation', null,
        JSON.stringify({ templateMatches: [{ validations: [{ blocking: true, status: 'failed', detail: '缺少必需表头' }] }] }))
      insertSource.run('other-client', 'owner-a', 'batch-a', 'client-b', '其他客户.xls', 'parsed', null, '{}')
      insertSource.run('other-owner', 'owner-b', 'batch-b', 'client-a', '其他用户.xls', 'parsed', null, '{}')
      const insertRecord = sqlite.prepare(`INSERT INTO tax_data_standard_records
        (id, owner_user_id, batch_id, client_id, source_file_id, record_type, period_start, period_end, record_json)
        VALUES (?, ?, ?, ?, ?, 'account_balance', '2025-01-01', '2025-01-31', '{}')`)
      insertRecord.run('record-1', 'owner-a', 'batch-a', 'client-a', 'stored')
      insertRecord.run('record-2', 'owner-a', 'batch-a', 'client-a', 'stored')
      insertRecord.run('record-other', 'owner-b', 'batch-b', 'client-a', 'other-owner')
      const db = {
        prepare(sql) {
          let values = []
          return {
            bind(...params) { values = params; return this },
            async all() { return { results: sqlite.prepare(sql).all(...values) } },
          }
        },
      }
      const response = await onRequestGet({
        request: new Request('https://example.com/api/tax-data/summary?clientId=client-a'),
        env: { DB: db },
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.sourceFiles).toHaveLength(2)
      expect(body.stats).toMatchObject({ sourceFileCount: 2, storedSourceFileCount: 1, linkedSourceFileCount: 1, recordCount: 2 })
      expect(body.sourceFiles.find((source) => source.id === 'stored')).toMatchObject({ stored: true, recordCount: 2 })
      expect(body.sourceFiles.find((source) => source.id === 'pending')).toMatchObject({ stored: false, recordCount: 0, reviewNote: '缺少必需表头' })
    } finally {
      sqlite.close()
    }
  })
})
