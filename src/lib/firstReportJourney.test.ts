import { describe, expect, it } from 'vitest'
import { assertSameImportClient, findExistingImportClient, summarizeDirectImport } from './firstReportJourney'

describe('direct import journey', () => {
  it('keeps saved, duplicate and failed files separate', () => {
    expect(summarizeDirectImport({
      total: 4,
      processed: 4,
      clientId: null,
      items: [
        { name: 'a.pdf', status: 'saved', records: 39, detail: '' },
        { name: 'b.xls', status: 'saved', records: 8, detail: '' },
        { name: 'a-copy.pdf', status: 'duplicate', records: 0, detail: '' },
        { name: 'bad.pdf', status: 'failed', records: 0, detail: '' },
      ],
    })).toEqual({ saved: 2, duplicate: 1, failed: 1, records: 47 })
  })

  it('accepts the same company with harmless spacing and case differences', () => {
    expect(() => assertSameImportClient(
      { name: '甲乙测试科技有限公司', creditCode: 'TEST123ABC' },
      { name: '（公章）甲乙 测试科技有限公司', creditCode: 'test123abc' },
    )).not.toThrow()
  })

  it('rejects another company even if the tax code is absent', () => {
    expect(() => assertSameImportClient(
      { name: '甲有限公司', creditCode: '' },
      { name: '乙有限公司' },
    )).toThrow(/文件企业/)
  })

  it('rejects a different tax code even if the company name matches', () => {
    expect(() => assertSameImportClient(
      { name: '甲有限公司', creditCode: 'ABC123' },
      { name: '甲有限公司', creditCode: 'XYZ789' },
    )).toThrow(/文件税号/)
  })

  it('does not invent an identity when the source has none', () => {
    expect(() => assertSameImportClient(
      { name: '甲有限公司', creditCode: 'ABC123' },
      {},
    )).not.toThrow()
  })

  const clients = [
    { id: 'a', name: '甲有限公司', creditCode: 'ABC123' },
    { id: 'b', name: '乙有限公司', creditCode: '' },
  ]

  it('reuses an existing company by tax code or name', () => {
    expect(findExistingImportClient(clients, { name: '甲有限公司', creditCode: 'abc123' })?.id).toBe('a')
    expect(findExistingImportClient(clients, { name: '乙有限公司' })?.id).toBe('b')
  })

  it('creates a new company only when there is no identity match', () => {
    expect(findExistingImportClient(clients, { name: '丙有限公司', creditCode: 'XYZ789' })).toBeUndefined()
  })

  it('blocks a tax code conflict instead of creating a duplicate company', () => {
    expect(() => findExistingImportClient(clients, { name: '甲有限公司', creditCode: 'XYZ789' })).toThrow(/文件税号/)
  })

  it('blocks a name conflict on a matching tax code', () => {
    expect(() => findExistingImportClient(clients, { name: '丙有限公司', creditCode: 'ABC123' })).toThrow(/文件企业/)
  })
})
