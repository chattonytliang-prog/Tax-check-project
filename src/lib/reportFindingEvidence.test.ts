import { describe, expect, it } from 'vitest'
import {
  buildReportFindingInputEvidence,
  reportFindingInputEvidenceList,
} from './reportFindingEvidence'

describe('report finding input evidence', () => {
  it('freezes composite-condition values with honest data-basis labels', () => {
    const result = buildReportFindingInputEvidence({
      condition: {
        all: [
          { field: 'taxableSales', operator: '>', value: 0 },
          { field: 'vatTaxPayable', operator: '<', value: 0, compareField: 'taxableSales', multiplier: 0.01 },
          { field: 'unbilledIncome', operator: '=', value: true },
        ],
      },
      requiredFields: ['taxableSales', 'monthlyRevenue', 'unknownField'],
      values: {
        taxableSales: 1234567.89,
        vatTaxPayable: 8000,
        unbilledIncome: true,
        monthlyRevenue: 100000,
        unknownField: 1,
      },
      standardMetricCoverage: ['taxableSales'],
      explicitFields: { vatTaxPayable: true },
      autoDerivedSources: { monthlyRevenue: '季度收入 / 3' },
    })

    expect(result).toEqual([
      { label: '增值税应税销售额', value: '1,234,567.89', basis: '标准资料已形成指标' },
      { label: '增值税应纳/入库税额', value: '8,000', basis: '资料或用户明确值' },
      { label: '存在未开票收入', value: '是', basis: '企业档案或已选期间数据' },
      { label: '月收入', value: '100,000', basis: '系统推导（季度收入 / 3）' },
    ])
  })

  it('uses approved additional labels and omits blank or unknown inputs', () => {
    expect(buildReportFindingInputEvidence({
      requiredFields: ['customKnown', 'monthlyInvoice', 'unknownField'],
      values: { customKnown: ' 已确认 ', monthlyInvoice: '', unknownField: 'internal' },
      additionalLabels: { customKnown: '自定义已确认字段' },
    })).toEqual([
      { label: '自定义已确认字段', value: '已确认', basis: '企业档案或已选期间数据' },
    ])
  })

  it('renders false booleans and tolerates absent values and field lists', () => {
    expect(buildReportFindingInputEvidence({
      condition: { field: 'privateAccountCollection', operator: '=', value: false },
      values: { privateAccountCollection: false },
    })).toEqual([
      { label: '个人账户收款', value: '否', basis: '企业档案或已选期间数据' },
    ])
    expect(buildReportFindingInputEvidence({
      condition: { field: 'taxpayerType', operator: '=', value: '一般纳税人' },
      values: { taxpayerType: undefined },
    })).toEqual([])
    expect(buildReportFindingInputEvidence({ values: {} })).toEqual([])
  })

  it('returns only complete saved evidence rows for legacy-safe rendering', () => {
    const valid = { label: '月收入', value: '100,000', basis: '标准资料已形成指标' }
    expect(reportFindingInputEvidenceList([valid, null, {}, { ...valid, basis: '' }])).toEqual([valid])
    expect(reportFindingInputEvidenceList('legacy')).toEqual([])
  })
})
