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
    const quarter = result.sourcePeriods.find((period) => period.analysisQuarter === 'Q2')

    expect(quarter.metrics.monthlyRevenue).toBeCloseTo(8251654.25 / 3)
    expect(quarter.metrics.monthlyCost).toBeCloseTo(7632039.43 / 3)
    expect(quarter.metrics.monthlyProfit).toBeCloseTo(423772.98 / 3)
    expect(result.crossValidation.warnings).toEqual([])
    expect(result.crossValidation.messages.some((message) => message.includes('8,251,654.25'))).toBe(true)
    expect(result.crossValidation.messages.some((message) => message.includes('11,047,283.45'))).toBe(true)
  })

  it('repairs legacy financial records whose current and cumulative columns were reversed', () => {
    const rows = [
      vatMonth('2025-04', 163434.52, 2959063.72),
      vatMonth('2025-05', 148700.90, 3107764.62),
      vatMonth('2025-06', 7939518.83, 11047283.45),
      financialLine('2025-04-01', '2025-06-30', '营业收入', 11047283.45, 8251654.25),
      financialLine('2025-04-01', '2025-06-30', '营业成本', 10215091.75, 7632039.43),
      financialLine('2025-04-01', '2025-06-30', '利润总额', 347817.68, 423772.98),
      citLine('2025-04-01', '2025-06-30', '营业收入', 11047283.45),
    ]
    const result = buildStandardPeriods(rows)
    const quarter = result.sourcePeriods.find((period) => period.analysisQuarter === 'Q2')

    expect(quarter.sourceMetrics.revenueTotal).toBeCloseTo(8251654.25)
    expect(quarter.sourceMetrics.costTotal).toBeCloseTo(7632039.43)
    expect(quarter.sourceMetrics.profitTotal).toBeCloseTo(423772.98)
    expect(result.crossValidation.warnings).toEqual([])
  })

  it('repairs legacy single-column quarter totals only when CIT increments match monthly VAT', () => {
    const rows = [
      citLine('2025-01-01', '2025-03-31', '营业收入', 2795629.20),
      citLine('2025-01-01', '2025-03-31', '营业成本', 2583052.32),
      citLine('2025-01-01', '2025-03-31', '利润总额', -75955.30),
      vatMonth('2025-04', 163434.52, 2959063.72),
      vatMonth('2025-05', 148700.90, 3107764.62),
      vatMonth('2025-06', 7939518.83, 11047283.45),
      financialLine('2025-04-01', '2025-06-30', '营业收入', 11047283.45, null),
      financialLine('2025-04-01', '2025-06-30', '营业成本', 10215091.75, null),
      financialLine('2025-04-01', '2025-06-30', '利润总额', 347817.68, null),
      citLine('2025-04-01', '2025-06-30', '营业收入', 11047283.45),
      citLine('2025-04-01', '2025-06-30', '营业成本', 10215091.75),
      citLine('2025-04-01', '2025-06-30', '利润总额', 347817.68),
    ]
    const result = buildStandardPeriods(rows)
    const quarter = result.sourcePeriods.find((period) => period.analysisQuarter === 'Q2')

    expect(quarter.sourceMetrics.revenueTotal).toBeCloseTo(8251654.25)
    expect(quarter.sourceMetrics.costTotal).toBeCloseTo(7632039.43)
    expect(quarter.sourceMetrics.profitTotal).toBeCloseTo(423772.98)
    expect(result.crossValidation.warnings).toEqual([])
  })

  it('falls back to prior financial and VAT cumulative records when prior CIT totals are missing', () => {
    const rows = [
      vatMonth('2025-03', 2795629.20, 2795629.20),
      financialLine('2025-01-01', '2025-03-31', '营业收入', 2795629.20, null),
      financialLine('2025-01-01', '2025-03-31', '营业成本', 2583052.32, null),
      financialLine('2025-01-01', '2025-03-31', '利润总额', -75955.30, null),
      vatMonth('2025-04', 163434.52, 2959063.72),
      vatMonth('2025-05', 148700.90, 3107764.62),
      vatMonth('2025-06', 7939518.83, 11047283.45),
      financialLine('2025-04-01', '2025-06-30', '营业收入', 11047283.45, null),
      financialLine('2025-04-01', '2025-06-30', '营业成本', 10215091.75, null),
      financialLine('2025-04-01', '2025-06-30', '利润总额', 347817.68, null),
    ]
    const result = buildStandardPeriods(rows)
    const quarter = result.sourcePeriods.find((period) => period.analysisQuarter === 'Q2')

    expect(quarter.sourceMetrics.revenueTotal).toBeCloseTo(8251654.25)
    expect(quarter.sourceMetrics.costTotal).toBeCloseTo(7632039.43)
    expect(quarter.sourceMetrics.profitTotal).toBeCloseTo(423772.98)
    expect(result.crossValidation.warnings).toEqual([])
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
    const annual = result.sourcePeriods[0]

    expect(result.periods).toEqual([])
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
    const quarter = result.sourcePeriods.find((period) => period.analysisYear === '2026' && period.analysisQuarter === 'Q2')

    expect(june.metrics.monthlyRevenue).toBe(70518.69)
    expect(june.metrics.taxableIncome).toBe(0)
    expect(june.metrics.employees).toBe(2)
    expect(june.metrics.payrollTotal).toBe(46790)
    expect(quarter.metrics.monthlyRevenue).toBeCloseTo(640069.59 / 3)
    expect(result.crossValidation.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('职工薪酬口径核对（非文件读取失败）'),
      expect.stringContaining('194,965.44'),
      expect.stringContaining('55,214.77'),
    ]))
  })

  it('converts quarterly cumulative taxable income to the current-quarter amount', () => {
    const result = buildStandardPeriods([
      citLine('2026-01-01', '2026-03-31', '实际利润额', 970211.26),
      citLine('2026-04-01', '2026-06-30', '实际利润额', 837253.90),
    ])

    expect(result.periods).toEqual([])
    expect(result.sourcePeriods.find((period) => period.analysisQuarter === 'Q1').metrics.taxableIncome).toBeCloseTo(970211.26)
    expect(result.sourcePeriods.find((period) => period.analysisQuarter === 'Q2').metrics.taxableIncome).toBeCloseTo(-132957.36)
  })

  it('returns monthly analysis periods only and keeps broader periods as cross-validation evidence', () => {
    const result = buildStandardPeriods([
      vatMonth('2025-01', 100, 100),
      vatMonth('2025-02', 200, 300),
      vatMonth('2025-03', 300, 600),
      financialLine('2025-01-01', '2025-03-31', '营业收入', 600, 600),
      citLine('2025-01-01', '2025-03-31', '营业收入', 600),
      financialLine('2025-01-01', '2025-12-31', '营业收入', 600, 600),
      citLine('2025-01-01', '2025-12-31', '营业收入', 600),
    ])

    expect(result.periods.map((period) => period.analysisMonth)).toEqual(['2025-01', '2025-02', '2025-03'])
    expect(result.periods.every((period) => period.analysisPeriodType === '月度' && period.months.length === 1)).toBe(true)
    expect(result.periods[0].evidencePeriods).toEqual(['2025年Q1', '2025年度'])
    expect(result.sourcePeriods.some((period) => period.analysisPeriodType === '季度')).toBe(true)
    expect(result.sourcePeriods.some((period) => period.analysisPeriodType === '年度')).toBe(true)
  })

  it('standardizes monthly ledger, payroll, social-security and invoice evidence', () => {
    const periodStart = '2025-12-01'
    const periodEnd = '2025-12-31'
    const result = buildStandardPeriods([
      row('ledger', 'ledger_entry', periodStart, periodEnd, { parentAccountCode: '5001', creditAmount: 1000, debitAmount: 0, summary: 'sale' }),
      row('ledger', 'ledger_entry', periodStart, periodEnd, { parentAccountCode: '5401', creditAmount: 0, debitAmount: 600, summary: 'cost' }),
      row('ledger', 'ledger_entry', periodStart, periodEnd, { parentAccountCode: '3103', creditAmount: 400, debitAmount: 0, summary: 'profit close' }),
      row('payroll', 'payroll_line', periodStart, periodEnd, { employeeName: 'A', idNumberMasked: 'A1', grossPay: 200, socialSecurity: 20 }),
      row('payroll', 'payroll_line', periodStart, periodEnd, { employeeName: 'B', idNumberMasked: 'B1', grossPay: 300, socialSecurity: 0 }),
      row('invoice_list', 'input_invoice', periodStart, periodEnd, { invoiceDirection: 'input', amount: 800 }),
      row('invoice_list', 'output_invoice', periodStart, periodEnd, { invoiceDirection: 'output', amount: 1000 }),
    ])
    const month = result.periods[0]

    expect(month.metrics).toMatchObject({
      monthlyRevenue: 1000,
      monthlyCost: 600,
      monthlyProfit: 400,
      employees: 2,
      socialSecurityCount: 1,
      salaryDeclaredCount: 2,
      payrollTotal: 500,
      monthlyInvoice: 1000,
    })
    expect(month.metricCoverage).toEqual(expect.arrayContaining([
      'monthlyRevenue', 'monthlyCost', 'monthlyProfit', 'monthlyInvoice',
      'employees', 'socialSecurityCount', 'salaryDeclaredCount', 'payrollTotal',
    ]))
    expect(month.sourceMetrics.inputInvoiceAmount).toBe(800)
  })
})
