import { describe, expect, it } from 'vitest'
import {
  areMonthsContinuous,
  createPeriodEntry,
  findPeriodConsistencyWarnings,
  formatAnalysisPeriod,
  formatMonthRange,
  getClientPeriodMonths,
  monthFromIndex,
  monthIndex,
  monthsBetween,
  periodCostTotal,
  periodInvoiceTotal,
  periodProfitTotal,
  periodRevenueTotal,
  quarterMonths,
  summarizePeriodEntries,
  upsertPeriodEntry,
  type PeriodClientFields,
  type PeriodEntry,
} from './periodAnalysis'

const baseClient: PeriodClientFields = {
  analysisPeriodType: '月度',
  analysisYear: '2023',
  analysisQuarter: '',
  analysisMonth: '2023-01',
  periodStartDate: '',
  periodEndDate: '',
  dataBasis: '申报数据',
  comparisonPeriod: '',
  monthlyRevenue: 100000,
  monthlyCost: 60000,
  monthlyProfit: 20000,
  monthlyInvoice: 90000,
  annualRevenue: 1200000,
  consecutive12MonthSales: 1200000,
  collectionFlow: 100000,
}

function entry(patch: Partial<PeriodClientFields>, savedAt = '2026-06-23'): PeriodEntry {
  const client = { ...baseClient, ...patch }
  return createPeriodEntry(client, client, savedAt)
}

describe('periodAnalysis', () => {
  it('builds month ranges and checks continuity', () => {
    expect(monthIndex('bad-input')).toBeNaN()
    expect(monthFromIndex(2023 * 12)).toBe('2023-01')
    expect(monthsBetween('2023-01', '2023-03')).toEqual(['2023-01', '2023-02', '2023-03'])
    expect(monthsBetween('bad', '2023-01')).toEqual([])
    expect(monthsBetween('2023-01', 'bad')).toEqual([])
    expect(monthsBetween('2023-03', '2023-01')).toEqual([])
    expect(areMonthsContinuous([])).toBe(true)
    expect(areMonthsContinuous(['2023-01'])).toBe(true)
    expect(areMonthsContinuous(['2023-02', '2023-01', '2023-02'])).toBe(true)
    expect(areMonthsContinuous(['2023-01', '2023-03'])).toBe(false)
    expect(formatMonthRange([])).toBe('未覆盖月份')
    expect(formatMonthRange(['2023-07'])).toBe('2023-07')
    expect(formatMonthRange(['2023-03', '2023-01', '2023-02'])).toBe('2023-01 至 2023-03')
  })

  it('maps analysis period types to covered months', () => {
    expect(quarterMonths('', 'Q1')).toEqual([])
    expect(quarterMonths('2023', '')).toEqual([])
    expect(getClientPeriodMonths({ ...baseClient, analysisPeriodType: '' })).toEqual([])
    expect(getClientPeriodMonths({ ...baseClient, analysisPeriodType: '年度', analysisYear: '' })).toEqual([])
    expect(getClientPeriodMonths({ ...baseClient, analysisPeriodType: '年度', analysisYear: '2023' })).toHaveLength(12)
    expect(getClientPeriodMonths({ ...baseClient, analysisPeriodType: '季度', analysisQuarter: '' })).toEqual([])
    expect(getClientPeriodMonths({ ...baseClient, analysisPeriodType: '季度', analysisQuarter: 'Q2' })).toEqual(['2023-04', '2023-05', '2023-06'])
    expect(getClientPeriodMonths({ ...baseClient, analysisPeriodType: '月度', analysisMonth: '' })).toEqual([])
    expect(getClientPeriodMonths({ ...baseClient, analysisPeriodType: '月度', analysisMonth: '2023-05' })).toEqual(['2023-05'])
    expect(getClientPeriodMonths({ ...baseClient, analysisPeriodType: '年初至今', analysisYear: '' })).toEqual([])
    expect(getClientPeriodMonths({ ...baseClient, analysisPeriodType: '年初至今', periodEndDate: '' })).toEqual([])
    expect(getClientPeriodMonths({ ...baseClient, analysisPeriodType: '年初至今', periodEndDate: '2023-05-31' })).toEqual(['2023-01', '2023-02', '2023-03', '2023-04', '2023-05'])
    expect(getClientPeriodMonths({ ...baseClient, analysisPeriodType: '自定义期间', periodStartDate: '', periodEndDate: '2023-06-30' })).toEqual([])
    expect(getClientPeriodMonths({ ...baseClient, analysisPeriodType: '自定义期间', periodStartDate: '2023-04-01', periodEndDate: '' })).toEqual([])
    expect(getClientPeriodMonths({ ...baseClient, analysisPeriodType: '自定义期间', periodStartDate: '2023-04-01', periodEndDate: '2023-06-30' })).toEqual(['2023-04', '2023-05', '2023-06'])
  })

  it('formats period labels and archives entries', () => {
    expect(formatAnalysisPeriod({ ...baseClient, analysisPeriodType: '' })).toBe('未填写')
    expect(formatAnalysisPeriod({ ...baseClient, analysisPeriodType: '年度', analysisYear: '' })).toBe('未填写年度年度')
    expect(formatAnalysisPeriod({ ...baseClient, analysisPeriodType: '季度', analysisQuarter: 'Q1' })).toBe('2023年Q1')
    expect(formatAnalysisPeriod({ ...baseClient, analysisPeriodType: '季度', analysisYear: '', analysisQuarter: '' })).toBe('未填写年度年未填写季度')
    expect(formatAnalysisPeriod({ ...baseClient, analysisPeriodType: '月度', analysisMonth: '2023-08' })).toBe('2023-08')
    expect(formatAnalysisPeriod({ ...baseClient, analysisPeriodType: '月度', analysisMonth: '' })).toBe('2023年未填写月份')
    expect(formatAnalysisPeriod({ ...baseClient, analysisPeriodType: '年初至今', periodStartDate: '2023-01-01', periodEndDate: '2023-05-31' })).toContain('年初至今')
    expect(formatAnalysisPeriod({ ...baseClient, analysisPeriodType: '年初至今', analysisYear: '', periodStartDate: '', periodEndDate: '' })).toContain('未填写开始')
    expect(formatAnalysisPeriod({ ...baseClient, analysisPeriodType: '自定义期间', periodStartDate: '', periodEndDate: '' })).toBe('未填写开始 至 未填写结束')

    const first = entry({ analysisMonth: '2023-01' }, 'now')
    const other = entry({ analysisMonth: '2023-02' }, 'other')
    const replacement = entry({ analysisMonth: '2023-01', monthlyRevenue: 200000 }, 'later')
    const noPeriod = createPeriodEntry({ ...baseClient, analysisPeriodType: '', analysisMonth: '', dataBasis: '' }, { ...baseClient, analysisPeriodType: '', analysisMonth: '', dataBasis: '' }, 'empty')
    const inserted = upsertPeriodEntry([], first)
    expect(inserted).toHaveLength(1)
    expect(upsertPeriodEntry(inserted, entry({ analysisMonth: '2023-02' }))).toHaveLength(2)
    expect(upsertPeriodEntry([other, first], replacement)).toEqual([other, replacement])
    expect(upsertPeriodEntry(inserted, replacement)).toEqual([replacement])
    expect(noPeriod.id).toBe('未填口径-未填期间')
    expect(noPeriod.label).toBe('未填写｜未填写口径')
    expect(periodRevenueTotal(replacement)).toBe(200000)
    expect(periodCostTotal(replacement)).toBe(60000)
    expect(periodProfitTotal(replacement)).toBe(20000)
    expect(periodInvoiceTotal(replacement)).toBe(90000)
    expect(periodRevenueTotal({ ...replacement, months: [], snapshot: { ...replacement.snapshot, monthlyRevenue: 0, annualRevenue: 0 } })).toBe(0)
  })

  it('summarizes continuous period entries for analysis', () => {
    const jan = entry({ analysisMonth: '2023-01', monthlyRevenue: 100000, monthlyCost: 50000, monthlyProfit: 20000, monthlyInvoice: 80000, collectionFlow: 90000 })
    const feb = entry({ analysisMonth: '2023-02', monthlyRevenue: 200000, monthlyCost: 70000, monthlyProfit: 40000, monthlyInvoice: 160000, collectionFlow: 180000 })
    const summary = summarizePeriodEntries(baseClient, [jan, feb])

    expect(summary).toMatchObject({
      analysisPeriodType: '自定义期间',
      analysisYear: '2023',
      periodStartDate: '2023-01-01',
      periodEndDate: '2023-02-31',
      monthlyRevenue: 150000,
      annualRevenue: 300000,
      collectionFlow: 270000,
    })

    const single = summarizePeriodEntries(baseClient, [jan])
    expect(single).toMatchObject({ analysisPeriodType: '月度', analysisMonth: '2023-01', comparisonPeriod: '' })

    const twelveMonths = Array.from({ length: 12 }, (_, index) => entry({
      analysisMonth: `2023-${String(index + 1).padStart(2, '0')}`,
      monthlyRevenue: 100000,
    }))
    expect(summarizePeriodEntries(baseClient, twelveMonths)).toMatchObject({
      analysisPeriodType: '年度',
      annualRevenue: 1200000,
      consecutive12MonthSales: 1200000,
    })

    const mixedBasis = summarizePeriodEntries(baseClient, [jan, { ...feb, dataBasis: '管理报表' }])
    expect(mixedBasis).toMatchObject({ dataBasis: '混合口径' })
    const fallbackYear = summarizePeriodEntries(baseClient, [{ ...jan, months: [''], analysisYear: 'fallback-year' }])
    expect(fallbackYear).toMatchObject({ analysisYear: 'fallback-year' })
    const missingFlow = summarizePeriodEntries(baseClient, [{ ...jan, snapshot: { ...jan.snapshot, collectionFlow: undefined as unknown as number } }])
    expect(missingFlow).toMatchObject({ collectionFlow: 0 })
    expect(summarizePeriodEntries(baseClient, [])).toEqual({})
  })

  it('warns when aggregate periods conflict with monthly detail', () => {
    const annual = entry({ analysisPeriodType: '年度', analysisMonth: '', annualRevenue: 500000 })
    const jan = entry({ analysisMonth: '2023-01', monthlyRevenue: 100000 })
    const feb = entry({ analysisMonth: '2023-02', monthlyRevenue: 200000 })

    expect(findPeriodConsistencyWarnings([annual, jan, feb])[0]).toContain('差异 200,000 元')
    expect(findPeriodConsistencyWarnings([annual])).toEqual([])
    expect(findPeriodConsistencyWarnings([annual, { ...jan, dataBasis: '管理报表' }])).toEqual([])
    expect(findPeriodConsistencyWarnings([entry({ analysisPeriodType: '季度', analysisQuarter: 'Q1', monthlyRevenue: 35000 }), jan])).toEqual([])
  })
})
