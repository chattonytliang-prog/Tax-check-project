import { describe, expect, it } from 'vitest'
import { reportScopeSummary } from './reportScopeSummary'

describe('reportScopeSummary', () => {
  it('states the reviewed period and data basis', () => {
    expect(reportScopeSummary({ periodLabel: '2025年度', dataBasis: '管理报表' })).toBe(
      '本报告基于2025年度的管理报表生成。',
    )
  })

  it('includes comparison period when available', () => {
    expect(
      reportScopeSummary({
        periodLabel: '2025-01 至 2025-03',
        dataBasis: '申报数据',
        comparisonPeriod: '2024年同期',
      }),
    ).toBe('本报告基于2025-01 至 2025-03的申报数据生成，并参考对比期间2024年同期。')
  })

  it('falls back to neutral wording for incomplete legacy reports', () => {
    expect(reportScopeSummary({ periodLabel: '', dataBasis: '' })).toBe('本报告基于当前选择期间的已录入数据生成。')
  })
})
