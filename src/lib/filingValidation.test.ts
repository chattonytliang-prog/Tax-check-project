import { describe, expect, it } from 'vitest'
import { legacyVatTemplate, validateVatFiling, vatFilingRowsFromArchive } from './filingValidation'
import { duplicatePersonnelRuleCodes, enterpriseRuleLevel, participatesInEnterpriseScoring } from './enterpriseRulePolicy'

const legacy = { 11: '100.00', 12: '60.1', 13: '50.20', 14: '0.05', 15: '0', 16: '0', 17: '110.25', 18: '100.00', 20: '10.25' }
const toRows = (fields: Record<string, unknown>) => Object.entries(fields).map(([row, amount]) => ({ row, amount }))

describe('separate filing validations', () => {
  it('uses cents and prior credit, rather than treating current output minus input as tax due', () => {
    expect(validateVatFiling('legacy', toRows(legacy)).map((row) => row.status)).toEqual(['matched', 'matched', 'matched'])
    expect(validateVatFiling('legacy', toRows({ ...legacy, 20: '10.24' })).at(-1)).toMatchObject({ status: 'difference', actualFen: 1024, expectedFen: 1025 })
  })
  it('distinguishes an explicit zero, absent value, uncertain number and conflicting copies', () => {
    for (const missing of [null, '', '—', '0.001', Infinity, false]) {
      expect(validateVatFiling('legacy', toRows({ ...legacy, 15: missing }))[0]).toMatchObject({ status: 'missing', missing: ['15'] })
    }
    expect(validateVatFiling('legacy', [...toRows(legacy), { row: '17', amount: 8 }]).every((row) => row.status === 'missing')).toBe(true)
  })
  it('uses only the recognized archive template and the current amount column', () => {
    const data = { templateId: legacyVatTemplate, rowNo: '11', currentAmount: 0, cumulativeAmount: 500, currentTax: 99 }
    expect(vatFilingRowsFromArchive([{ data }, { data, confidence: 'low' }, { data: { ...data, templateId: 'vat_other_schedule_pdf_v1' } }])).toEqual([{ row: '11', amount: 0 }])
  })
  it('shows a supported recalculation without treating an empty target as matched', () => {
    const finding = validateVatFiling('legacy', toRows({ ...legacy, 20: '' })).at(-1)
    expect(finding).toMatchObject({ status: 'missing', missing: ['20'], actualFen: undefined, expectedFen: 1025, inputs: [{ row: '17', amountFen: 11025 }, { row: '18', amountFen: 10000 }] })
    expect(validateVatFiling('legacy', toRows({ ...legacy, 18: '' })).at(-1)?.expectedFen).toBeUndefined()
  })
  it('separates pilot rows, preserving add-on deduction, simple calculation and prepayment', () => {
    const entries = toRows({ '0B01': 100, '0B02': 80, '0B03': 5, '0B04': 3, '0B05': 82, '0B06': 82, '0B07': 18, '0B08': 0, '0B09': 5, '0B10': 8, '0B11': 2, '0B20': 19, '0C01': 4, '0C02': 15 })
    expect(validateVatFiling('pilot', entries).every((row) => row.status === 'matched')).toBe(true)
    expect(validateVatFiling('legacy', entries).every((row) => row.status === 'missing')).toBe(true)
  })
  it('keeps unconnected candidates, filing checks, and the suspended ambiguous rule out of enterprise reports', () => {
    expect(['yw-261127-001', 'FILING-VAT-P05', 'ON-058'].every((code) => !participatesInEnterpriseScoring(code))).toBe(true)
    expect(participatesInEnterpriseScoring('R021')).toBe(true)
    expect(enterpriseRuleLevel('R021', '高')).toBe('中')
    expect(enterpriseRuleLevel('R023', '高')).toBe('高')
    expect(duplicatePersonnelRuleCodes(['ON-091','R021','ON-092','R023'])).toEqual(['ON-091','ON-092'])
    expect(duplicatePersonnelRuleCodes(['ON-092','R023'])).toEqual([])
  })
})
