import { describe, expect, it } from 'vitest'
import { buildStandardPeriods } from './_standard_periods.js'

function row(recordType, recordSubtype, periodStart, periodEnd, payload) {
  return {
    record_type: recordType,
    record_subtype: recordSubtype,
    period_start: periodStart,
    period_end: periodEnd,
    record_json: JSON.stringify(payload),
  }
}

function vatMonth(month, current, cumulative, formName = '增值税及附加税费申报表') {
  const endDay = ['04', '06', '09', '11'].includes(month.slice(5)) ? '30' : '31'
  return row('vat_return', 'vat_return_line', `${month}-01`, `${month}-${endDay}`, {
    formName,
    rowNo: '1',
    itemName: '按适用税率计税销售额',
    currentAmount: current,
    cumulativeAmount: cumulative,
  })
}

function financialLine(periodStart, periodEnd, lineName, currentAmount, cumulativeAmount) {
  return row('financial_statement', 'income_statement', periodStart, periodEnd, {
    statementType: 'income_statement',
    lineName,
    currentAmount,
    cumulativeAmount,
  })
}

function citLine(periodStart, periodEnd, lineName, currentAmount) {
  return row('cit_return', 'quarterly_prepayment', periodStart, periodEnd, {
    lineName,
    itemName: lineName,
    currentAmount,
  })
}

function iitLine(month, personName, currentIncome, taxableIncome = 0) {
  return row('iit_withholding', 'iit_withholding_line', `${month}-01`, `${month}-30`, {
    personName,
    incomeItem: '正常工资薪金',
    currentIncome,
    taxableIncome,
  })
}

describe('buildStandardPeriods', () => {
  it('uses current-quarter financial amounts and cross-checks them against monthly VAT', () => {
    const rows = [
      vatMonth('2025-04', 163434.52, 2959063.72),
      vatMonth('2025-05', 148700.90, 3107764.62),
      vatMonth('2025-06', 7939518.83, 11047283.45),
      financialLine('2025-04-01', '2025-06-30', '营业收入', 8251654.25, 11047283.45),
      financialLine('2025-04-01', '2025-06-30', '营业成本', 7632039.43, 10215091.75),
      financialLine('2025-04-01', '2025-06-30', '利润总额', 423772.98, 347817.68),
      citLine('2025-04-01', '2025-06-30', '营业收入', 11047283.45),
      citLine('2025-04-01', '2025-06-30', '营业成本', 10215091.75),
      citLine('2025-04-01', '2025-06-30', '利润总额', 347817.68),
    ]
    const result = buildStandardPeriods(rows)
    const quarter = result.periods.find((period) => period.analysisQuarter === 'Q2')

    expect(quarter.metrics.monthlyRevenue).toBeCloseTo(8251654.25 / 3)
    expect(quarter.metrics.monthlyCost).toBeCloseTo(7632039.43 / 3)
    expect(quarter.metrics.monthlyProfit).toBeCloseTo(423772.98 / 3)
    expect(result.crossValidation.warnings).toEqual([])
    expect(result.crossValidation.messages.some((message) => message.includes('8,251,654.25'))).toBe(true)
    expect(result.crossValidation.messages.some((message) => message.includes('11,047,283.45'))).toBe(true)
  })

  it('rebuilds a missing December period directly from standard records', () => {
    const result = buildStandardPeriods([
      vatMonth('2025-12', 10452692.10, 29464140.72),
      vatMonth('2025-12', 0, 0, '增值税及附加税费申报表附列资料（四）'),
    ])
    expect(result.periods).toHaveLength(1)
    expect(result.periods[0]).toMatchObject({
      id: '标准资料-2025-12',
      analysisPeriodType: '月度',
      analysisMonth: '2025-12',
      metrics: { monthlyRevenue: 10452692.10 },
    })
  })

  it('uses the current-year column for annual financial statements', () => {
    const result = buildStandardPeriods([
      financialLine('2025-01-01', '2025-12-31', '营业收入', 29464140.72, 17404322.91),
      financialLine('2025-01-01', '2025-12-31', '营业成本', 27576993.09, 16000000),
      financialLine('2025-01-01', '2025-12-31', '利润总额', 990473.06, 800000),
      citLine('2025-01-01', '2025-12-31', '营业收入', 29464140.72),
    ])
    const annual = result.periods[0]

    expect(annual.metrics.annualRevenue).toBeCloseTo(29464140.72)
    expect(annual.sourceMetrics.costTotal).toBeCloseTo(27576993.09)
    expect(annual.sourceMetrics.profitTotal).toBeCloseTo(990473.06)
    expect(result.crossValidation.warnings).toEqual([])
  })

  it('uses VAT schedule one when the June main return is absent and keeps IIT taxable income separate', () => {
    const rows = [
      vatMonth('2026-04', 107798.69, 19142143.23),
      vatMonth('2026-05', 461752.21, 19603895.44),
      vatMonth('2026-06', 70518.69, null, '增值税及附加税费申报表附列资料（一）'),
      financialLine('2026-04-01', '2026-06-30', '营业收入', 640069.59, 19674414.13),
      citLine('2026-04-01', '2026-06-30', '营业收入', 19674414.13),
      citLine('2026-01-01', '2026-03-31', '已计入成本费用的职工薪酬', 140260),
      citLine('2026-01-01', '2026-03-31', '实际支付给职工的应付职工薪酬', 126463.12),
      citLine('2026-04-01', '2026-06-30', '已计入成本费用的职工薪酬', 335225.44),
      citLine('2026-04-01', '2026-06-30', '实际支付给职工的应付职工薪酬', 181677.89),
      ...['2026-04', '2026-05', '2026-06'].flatMap((month) => [
        iitLine(month, '甲', 20000, 5000),
        iitLine(month, '乙', 26790, 9269.64),
      ]),
    ]
    const result = buildStandardPeriods(rows)
    const june = result.periods.find((period) => period.analysisMonth === '2026-06')
    const quarter = result.periods.find((period) => period.analysisYear === '2026' && period.analysisQuarter === 'Q2')

    expect(june.metrics.monthlyRevenue).toBe(70518.69)
    expect(june.metrics.taxableIncome).toBe(0)
    expect(june.metrics.employees).toBe(2)
    expect(june.metrics.payrollTotal).toBe(46790)
    expect(quarter.metrics.monthlyRevenue).toBeCloseTo(640069.59 / 3)
    expect(result.crossValidation.warnings).toContain('2026年Q2：所得税附报本期计入成本职工薪酬 194,965.44 元，与个税申报工资 140,370 元相差 54,595.44 元。')
    expect(result.crossValidation.warnings).toContain('2026年Q2：所得税附报本期实际支付职工薪酬 55,214.77 元，与个税申报工资 140,370 元相差 -85,155.23 元。')
  })

  it('converts quarterly cumulative taxable income to the current-quarter amount', () => {
    const result = buildStandardPeriods([
      citLine('2026-01-01', '2026-03-31', '实际利润额', 970211.26),
      citLine('2026-04-01', '2026-06-30', '实际利润额', 837253.90),
    ])

    expect(result.periods.find((period) => period.analysisQuarter === 'Q1').metrics.taxableIncome).toBeCloseTo(970211.26)
    expect(result.periods.find((period) => period.analysisQuarter === 'Q2').metrics.taxableIncome).toBeCloseTo(-132957.36)
  })
})
