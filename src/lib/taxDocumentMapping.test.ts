import { describe, expect, it } from 'vitest'
import { parseLocatedTaxDocument } from './taxDataIntakeParser'
import { taxDocumentLocatorInput } from './taxDocumentMapping'

describe('tax document row mapping', () => {
  const word = [
    '利润表', '编制单位：示例科技有限公司', '所属期间：2025年12月', '金额单位：万元',
    '项目\t本年累计金额\t本期金额', '营业收入\t200.00\t36.50', '营业成本\t100.00\t20.30',
  ]
  const mapping = { kind: 'income_statement', rows: [{ start: 5, end: 5 }, { start: 6, end: 6 }] }

  it('reads the original Word columns in header order and keeps evidence', () => {
    const result = parseLocatedTaxDocument(word, mapping, { label: '正文' })
    expect(result.records[0].payload).toMatchObject({ currentAmount: 365000, cumulativeAmount: 2000000 })
    expect(result.evidenceFields).toContainEqual(expect.objectContaining({
      targetField: 'currentAmount', rowNo: 6, sheetName: '正文', rawValue: '36.50', normalizedValue: '365000',
    }))
    expect(taxDocumentLocatorInput(word)[1]).toBe('')
    expect(taxDocumentLocatorInput(word)[5]).toBe('营业收入\t[金额]\t[金额]')
  })

  it('rejects a proposed form that disagrees with its source', () => {
    expect(() => parseLocatedTaxDocument(word, { ...mapping, kind: 'vat_main' }, { label: '正文' })).toThrow('表型')
    expect(() => parseLocatedTaxDocument(word, {
      ...mapping, rows: [{ start: 5, end: 6 }, { start: 6, end: 6 }],
    }, { label: '正文' })).toThrow('原文数据行')
  })
})
