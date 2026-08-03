function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parsePayload(value) {
  try {
    return JSON.parse(value || '{}')
  } catch {
    return {}
  }
}

function monthIndex(month) {
  const [year, monthPart] = String(month || '').split('-').map(Number)
  if (!year || !monthPart) return Number.NaN
  return year * 12 + monthPart - 1
}

function monthFromIndex(index) {
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}`
}

function monthsBetween(startMonth, endMonth) {
  const start = monthIndex(startMonth)
  const end = monthIndex(endMonth)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return []
  return Array.from({ length: end - start + 1 }, (_, index) => monthFromIndex(start + index))
}

function periodMetadata(periodStart, periodEnd) {
  const months = monthsBetween(String(periodStart).slice(0, 7), String(periodEnd).slice(0, 7))
  const analysisYear = String(periodStart).slice(0, 4)
  const startMonth = Number(String(periodStart).slice(5, 7))
  if (months.length === 1) {
    return { months, analysisPeriodType: '月度', analysisYear, analysisQuarter: '', analysisMonth: months[0] }
  }
  if (months.length === 3 && [1, 4, 7, 10].includes(startMonth)) {
    return { months, analysisPeriodType: '季度', analysisYear, analysisQuarter: `Q${Math.ceil(startMonth / 3)}`, analysisMonth: '' }
  }
  if (months.length === 12 && startMonth === 1) {
    return { months, analysisPeriodType: '年度', analysisYear, analysisQuarter: '', analysisMonth: '' }
  }
  return { months, analysisPeriodType: '自定义期间', analysisYear, analysisQuarter: '', analysisMonth: '' }
}

function labelForPeriod(metadata) {
  if (metadata.analysisPeriodType === '月度') return metadata.analysisMonth
  if (metadata.analysisPeriodType === '季度') return `${metadata.analysisYear}年${metadata.analysisQuarter}`
  if (metadata.analysisPeriodType === '年度') return `${metadata.analysisYear}年度`
  return metadata.months.length ? `${metadata.months[0]} 至 ${metadata.months.at(-1)}` : '标准资料期间'
}

function blankGroup(periodStart, periodEnd) {
  return {
    periodStart,
    periodEnd,
    sourceKinds: new Set(),
    vatMain: {},
    vatScheduleSalesByRow: new Map(),
    financial: {},
    cit: {},
    iitPeople: new Set(),
    iitPayrollTotal: 0,
  }
}

function setValue(target, key, value) {
  const number = numberOrNull(value)
  if (number !== null) target[key] = number
}

function lineName(payload) {
  return String(payload.lineName || payload.itemName || payload.accountName || '').replace(/\s+/g, '')
}

function isVatScheduleOne(formName) {
  return /附列资料[（(]?一[）)]?|附表[（(]?一[）)]?|本期销售情况明细/.test(formName)
}

function consumeRecord(group, row) {
  const payload = parsePayload(row.record_json)
  const type = String(row.record_type || '')
  const subtype = String(row.record_subtype || '')
  const name = lineName(payload)
  const rowNo = String(payload.rowNo || payload.lineCode || '').split('=')[0].trim()
  group.sourceKinds.add(type)

  if (type === 'vat_return') {
    const formName = String(payload.formName || '')
    const isSchedule = /附列资料|附表|减免税|税额抵减/.test(formName)
    if (!isSchedule) {
      if (rowNo === '1') {
        setValue(group.vatMain, 'currentSales', payload.currentAmount)
        setValue(group.vatMain, 'cumulativeSales', payload.cumulativeAmount)
      }
      if (rowNo === '11') setValue(group.vatMain, 'outputTax', payload.currentAmount ?? payload.currentTax)
      if (rowNo === '12') setValue(group.vatMain, 'inputTax', payload.currentAmount ?? payload.currentTax)
      if (rowNo === '19') setValue(group.vatMain, 'taxPayable', payload.currentAmount ?? payload.currentTax)
      if (rowNo === '20') setValue(group.vatMain, 'endingVatCredit', payload.currentAmount ?? payload.currentTax)
    } else if (isVatScheduleOne(formName) && /^([1-9]|1\d)$/.test(rowNo)) {
      const currentAmount = numberOrNull(payload.currentAmount)
      if (currentAmount !== null) {
        const previous = group.vatScheduleSalesByRow.get(rowNo)
        group.vatScheduleSalesByRow.set(rowNo, previous === undefined ? currentAmount : Math.max(previous, currentAmount))
      }
    }
    return
  }

  if (type === 'financial_statement') {
    const statementType = String(payload.statementType || subtype)
    if (statementType === 'income_statement') {
      if (/营业收入合计|营业收入/.test(name) && !/营业外/.test(name)) {
        setValue(group.financial, 'revenueCurrent', payload.currentAmount)
        setValue(group.financial, 'revenueCumulative', payload.cumulativeAmount)
      }
      if (/营业成本合计|营业成本/.test(name) && !/营业外/.test(name)) {
        setValue(group.financial, 'costCurrent', payload.currentAmount)
        setValue(group.financial, 'costCumulative', payload.cumulativeAmount)
      }
      if (/利润总额/.test(name)) {
        setValue(group.financial, 'profitCurrent', payload.currentAmount)
        setValue(group.financial, 'profitCumulative', payload.cumulativeAmount)
      }
    }
    if (statementType === 'balance_sheet' && /资产合计/.test(name)) {
      setValue(group.financial, 'assetsEnding', payload.endingAmount)
    }
    return
  }

  if (type === 'cit_return') {
    const value = payload.cumulativeAmount ?? payload.currentAmount ?? payload.currentTax
    if (/营业收入/.test(name) && !/营业外/.test(name)) setValue(group.cit, 'revenueCumulative', value)
    if (/营业成本/.test(name) && !/营业外/.test(name)) setValue(group.cit, 'costCumulative', value)
    if (/利润总额/.test(name)) setValue(group.cit, 'profitCumulative', value)
    if (/五、应纳税所得额|实际利润额/.test(name)) setValue(group.cit, 'taxableIncome', value)
    if (/已计入成本费用的职工薪酬/.test(name)) setValue(group.cit, 'payrollAccruedCumulative', value)
    if (/实际支付给职工的应付职工薪酬/.test(name)) setValue(group.cit, 'payrollPaidCumulative', value)
    if (/从业人数/.test(name)) setValue(group.cit, 'employees', payload.values?.at?.(-1) ?? value)
    if (/资产总额.*万元/.test(name)) {
      const assetAverage = numberOrNull(payload.values?.at?.(-1) ?? value)
      if (assetAverage !== null) group.cit.assetsAverage = assetAverage * 10000
    }
    return
  }

  if (type === 'iit_withholding') {
    const personName = String(payload.personName || '').trim()
    if (personName) group.iitPeople.add(personName)
    group.iitPayrollTotal += numberOrNull(payload.currentIncome) || 0
  }
}

function scheduleSales(group) {
  if (!group.vatScheduleSalesByRow.size) return null
  return Array.from(group.vatScheduleSalesByRow.values()).reduce((sum, value) => sum + value, 0)
}

function choosePeriodTotals(group, metadata) {
  const isAnnual = metadata.analysisPeriodType === '年度'
  const isAggregate = metadata.months.length > 1
  const vatSales = group.vatMain.currentSales ?? scheduleSales(group)
  const revenue = isAggregate
    ? (isAnnual ? group.financial.revenueCurrent ?? group.financial.revenueCumulative : group.financial.revenueCurrent)
      ?? group.cit.revenueCumulative
      ?? vatSales
    : vatSales ?? group.financial.revenueCurrent ?? group.cit.revenueCumulative
  const cost = isAggregate
    ? (isAnnual ? group.financial.costCurrent ?? group.financial.costCumulative : group.financial.costCurrent) ?? group.cit.costCumulative
    : group.financial.costCurrent ?? group.cit.costCumulative
  const profit = isAggregate
    ? (isAnnual ? group.financial.profitCurrent ?? group.financial.profitCumulative : group.financial.profitCurrent) ?? group.cit.profitCumulative
    : group.financial.profitCurrent ?? group.cit.profitCumulative
  return { revenue: revenue ?? 0, cost: cost ?? 0, profit: profit ?? 0 }
}

function buildPeriod(group) {
  const metadata = periodMetadata(group.periodStart, group.periodEnd)
  const totals = choosePeriodTotals(group, metadata)
  const monthCount = Math.max(metadata.months.length, 1)
  const employees = group.iitPeople.size || group.cit.employees || 0
  const assetsTotal = group.financial.assetsEnding ?? group.cit.assetsAverage ?? 0
  return {
    id: `标准资料-${metadata.months.join('_') || `${group.periodStart}_${group.periodEnd}`}`,
    label: `${labelForPeriod(metadata)}｜标准资料`,
    ...metadata,
    periodStartDate: group.periodStart,
    periodEndDate: group.periodEnd,
    dataBasis: '标准资料',
    comparisonPeriod: '原始资料自动重建',
    savedAt: '源文件归档',
    sourceKinds: Array.from(group.sourceKinds).sort(),
    metrics: {
      monthlyRevenue: totals.revenue / monthCount,
      monthlyCost: totals.cost / monthCount,
      monthlyProfit: totals.profit / monthCount,
      annualRevenue: metadata.analysisPeriodType === '年度' ? totals.revenue : 0,
      consecutive12MonthSales: metadata.analysisPeriodType === '年度' ? totals.revenue : 0,
      taxableSales: metadata.analysisPeriodType === '月度' ? totals.revenue : 0,
      outputTax: group.vatMain.outputTax || 0,
      inputTax: group.vatMain.inputTax || 0,
      vatTaxPayable: group.vatMain.taxPayable || 0,
      endingVatCredit: group.vatMain.endingVatCredit || 0,
      taxableIncome: group.cit.taxableIncome || 0,
      assetsTotal,
      employees,
      employeeAnnualAvg: employees,
      salaryDeclaredCount: group.iitPeople.size,
      payrollTotal: group.iitPayrollTotal,
    },
    sourceMetrics: {
      revenueTotal: totals.revenue,
      costTotal: totals.cost,
      profitTotal: totals.profit,
      vatCurrentSales: group.vatMain.currentSales ?? scheduleSales(group) ?? null,
      vatCumulativeSales: group.vatMain.cumulativeSales ?? null,
      financialRevenueCurrent: group.financial.revenueCurrent ?? null,
      financialRevenueCumulative: group.financial.revenueCumulative ?? null,
      financialCostCurrent: group.financial.costCurrent ?? null,
      financialCostCumulative: group.financial.costCumulative ?? null,
      financialProfitCurrent: group.financial.profitCurrent ?? null,
      financialProfitCumulative: group.financial.profitCumulative ?? null,
      citRevenueCumulative: group.cit.revenueCumulative ?? null,
      citCostCumulative: group.cit.costCumulative ?? null,
      citProfitCumulative: group.cit.profitCumulative ?? null,
      citTaxableIncomeCumulative: group.cit.taxableIncome ?? null,
      citPayrollAccruedCumulative: group.cit.payrollAccruedCumulative ?? null,
      citPayrollPaidCumulative: group.cit.payrollPaidCumulative ?? null,
      assetsEnding: group.financial.assetsEnding ?? group.cit.assetsAverage ?? null,
      iitPayrollTotal: group.iitPayrollTotal,
      iitEmployeeCount: group.iitPeople.size,
    },
  }
}

function closeEnough(left, right) {
  const threshold = Math.max(1, Math.abs(left) * 0.0001)
  return Math.abs(left - right) <= threshold
}

function crossValidate(periods) {
  const messages = []
  const warnings = []
  const periodByStart = new Map(periods.map((period) => [period.periodStartDate, period]))
  const monthly = periods.filter((period) => period.analysisPeriodType === '月度')

  for (const period of periods.filter((item) => item.months.length > 1)) {
    const financialCumulative = period.analysisPeriodType === '年度'
      ? period.sourceMetrics.financialRevenueCurrent ?? period.sourceMetrics.financialRevenueCumulative
      : period.sourceMetrics.financialRevenueCumulative
    const citCumulative = period.sourceMetrics.citRevenueCumulative
    if (financialCumulative !== null && citCumulative !== null) {
      if (closeEnough(financialCumulative, citCumulative)) {
        messages.push(`${labelForPeriod(period)}：财务报表累计收入与企业所得税申报收入一致（${financialCumulative.toLocaleString('zh-CN')} 元）。`)
      } else {
        warnings.push(`${labelForPeriod(period)}：财务报表累计收入 ${financialCumulative.toLocaleString('zh-CN')} 元，与企业所得税申报收入 ${citCumulative.toLocaleString('zh-CN')} 元不一致。`)
      }
    }

    const coveredMonthly = monthly.filter((item) => item.months.some((month) => period.months.includes(month)))
    if (coveredMonthly.length === period.months.length) {
      const vatTotal = coveredMonthly.reduce((sum, item) => sum + Number(item.sourceMetrics.vatCurrentSales || 0), 0)
      const periodRevenue = Number(period.sourceMetrics.revenueTotal || 0)
      if (periodRevenue && closeEnough(vatTotal, periodRevenue)) {
        messages.push(`${labelForPeriod(period)}：增值税本期销售额合计与财务报表本期收入一致（${periodRevenue.toLocaleString('zh-CN')} 元）。`)
      } else if (periodRevenue && vatTotal) {
        warnings.push(`${labelForPeriod(period)}：增值税本期销售额合计 ${vatTotal.toLocaleString('zh-CN')} 元，与财务报表本期收入 ${periodRevenue.toLocaleString('zh-CN')} 元不一致。`)
      }
    } else if (period.sourceMetrics.vatCumulativeSales !== null && financialCumulative !== null) {
      if (closeEnough(period.sourceMetrics.vatCumulativeSales, financialCumulative)) {
        messages.push(`${labelForPeriod(period)}：月度文件未完整覆盖，但期末增值税累计销售额与财务报表累计收入一致。`)
      }
    }

    if (period.analysisPeriodType === '季度' && period.sourceMetrics.iitEmployeeCount > 0) {
      const quarterNumber = Number(String(period.analysisQuarter).slice(1))
      const previousStartMonth = (quarterNumber - 2) * 3 + 1
      const previousStart = quarterNumber > 1
        ? `${period.analysisYear}-${String(previousStartMonth).padStart(2, '0')}-01`
        : ''
      const previous = previousStart ? periodByStart.get(previousStart) : null
      const accrued = period.sourceMetrics.citPayrollAccruedCumulative
      const paid = period.sourceMetrics.citPayrollPaidCumulative
      const previousAccrued = previous?.sourceMetrics.citPayrollAccruedCumulative || 0
      const previousPaid = previous?.sourceMetrics.citPayrollPaidCumulative || 0
      const iitPayroll = period.sourceMetrics.iitPayrollTotal
      if (accrued !== null && iitPayroll > 0) {
        const currentAccrued = accrued - previousAccrued
        if (!closeEnough(currentAccrued, iitPayroll)) {
          warnings.push(`${labelForPeriod(period)}：所得税附报本期计入成本职工薪酬 ${currentAccrued.toLocaleString('zh-CN')} 元，与个税申报工资 ${iitPayroll.toLocaleString('zh-CN')} 元相差 ${(currentAccrued - iitPayroll).toLocaleString('zh-CN')} 元。`)
        }
      }
      if (paid !== null && iitPayroll > 0) {
        const currentPaid = paid - previousPaid
        if (!closeEnough(currentPaid, iitPayroll)) {
          warnings.push(`${labelForPeriod(period)}：所得税附报本期实际支付职工薪酬 ${currentPaid.toLocaleString('zh-CN')} 元，与个税申报工资 ${iitPayroll.toLocaleString('zh-CN')} 元相差 ${(currentPaid - iitPayroll).toLocaleString('zh-CN')} 元。`)
        }
      }
    }
  }
  return { messages: Array.from(new Set(messages)), warnings: Array.from(new Set(warnings)) }
}

function enrichAggregateMetrics(periods) {
  const monthly = periods.filter((period) => period.analysisPeriodType === '月度')
  for (const period of periods.filter((item) => item.months.length > 1)) {
    const contained = monthly.filter((item) => item.months.some((month) => period.months.includes(month)))
    if (!contained.length) continue
    period.metrics.outputTax = contained.reduce((sum, item) => sum + Number(item.metrics.outputTax || 0), 0)
    period.metrics.inputTax = contained.reduce((sum, item) => sum + Number(item.metrics.inputTax || 0), 0)
    period.metrics.vatTaxPayable = contained.reduce((sum, item) => sum + Number(item.metrics.vatTaxPayable || 0), 0)
    period.metrics.taxableSales = contained.reduce((sum, item) => sum + Number(item.metrics.taxableSales || 0), 0)
    period.metrics.employees = contained.reduce((maximum, item) => Math.max(maximum, Number(item.metrics.employees || 0)), Number(period.metrics.employees || 0))
    period.metrics.employeeAnnualAvg = period.metrics.employees
    period.metrics.salaryDeclaredCount = contained.reduce((maximum, item) => Math.max(maximum, Number(item.metrics.salaryDeclaredCount || 0)), Number(period.metrics.salaryDeclaredCount || 0))
    period.metrics.payrollTotal = contained.reduce((sum, item) => sum + Number(item.metrics.payrollTotal || 0), 0)
    period.sourceMetrics.iitPayrollTotal = period.metrics.payrollTotal
    period.sourceMetrics.iitEmployeeCount = period.metrics.salaryDeclaredCount
  }
  return periods
}

function normalizeFinancialColumnOrientation(periods) {
  const monthly = periods.filter((period) => period.analysisPeriodType === '月度')
  for (const period of periods.filter((item) => item.months.length > 1)) {
    const current = period.sourceMetrics.financialRevenueCurrent
    const cumulative = period.sourceMetrics.financialRevenueCumulative
    if (current === null || cumulative === null) continue

    let secondColumnIsAuthoritative = false
    if (period.analysisPeriodType === '年度') {
      const citRevenue = period.sourceMetrics.citRevenueCumulative
      secondColumnIsAuthoritative = citRevenue !== null
        && closeEnough(cumulative, citRevenue)
        && !closeEnough(current, citRevenue)
    } else {
      const coveredMonthly = monthly.filter((item) => item.months.some((month) => period.months.includes(month)))
      if (coveredMonthly.length !== period.months.length) continue
      const vatTotal = coveredMonthly.reduce((sum, item) => sum + Number(item.sourceMetrics.vatCurrentSales || 0), 0)
      secondColumnIsAuthoritative = closeEnough(cumulative, vatTotal) && !closeEnough(current, vatTotal)
    }
    if (!secondColumnIsAuthoritative) continue

    const pairs = [
      ['financialRevenueCurrent', 'financialRevenueCumulative'],
      ['financialCostCurrent', 'financialCostCumulative'],
      ['financialProfitCurrent', 'financialProfitCumulative'],
    ]
    for (const [currentKey, cumulativeKey] of pairs) {
      const first = period.sourceMetrics[currentKey]
      period.sourceMetrics[currentKey] = period.sourceMetrics[cumulativeKey]
      period.sourceMetrics[cumulativeKey] = first
    }
    const monthCount = Math.max(period.months.length, 1)
    period.sourceMetrics.revenueTotal = period.sourceMetrics.financialRevenueCurrent || 0
    period.sourceMetrics.costTotal = period.sourceMetrics.financialCostCurrent || 0
    period.sourceMetrics.profitTotal = period.sourceMetrics.financialProfitCurrent || 0
    period.metrics.monthlyRevenue = period.sourceMetrics.revenueTotal / monthCount
    period.metrics.monthlyCost = period.sourceMetrics.costTotal / monthCount
    period.metrics.monthlyProfit = period.sourceMetrics.profitTotal / monthCount
    if (period.analysisPeriodType === '年度') {
      period.metrics.annualRevenue = period.sourceMetrics.revenueTotal
      period.metrics.consecutive12MonthSales = period.sourceMetrics.revenueTotal
    }
  }
  return periods
}

function normalizeLegacyAggregateTotals(periods) {
  const monthly = periods.filter((period) => period.analysisPeriodType === '月度')
  const periodByStart = new Map(periods.map((period) => [period.periodStartDate, period]))
  for (const period of periods.filter((item) => item.analysisPeriodType === '季度' || item.analysisPeriodType === '年度')) {
    const contained = monthly.filter((item) => item.months.some((month) => period.months.includes(month)))
    if (contained.length !== period.months.length) continue
    const vatTotal = contained.reduce((sum, item) => sum + Number(item.sourceMetrics.vatCurrentSales || 0), 0)
    const revenueCumulative = period.sourceMetrics.citRevenueCumulative
      ?? period.sourceMetrics.financialRevenueCurrent
    if (revenueCumulative === null) continue

    let previous = null
    let previousMonth = null
    if (period.analysisPeriodType === '季度') {
      const quarterNumber = Number(String(period.analysisQuarter).slice(1))
      const previousStartMonth = (quarterNumber - 2) * 3 + 1
      const previousStart = quarterNumber > 1
        ? `${period.analysisYear}-${String(previousStartMonth).padStart(2, '0')}-01`
        : ''
      previous = previousStart ? periodByStart.get(previousStart) : null
      const currentStartIndex = monthIndex(period.months[0])
      previousMonth = monthly.find((item) => monthIndex(item.months[0]) === currentStartIndex - 1) || null
    }
    const previousRevenueCumulative = previous?.sourceMetrics.citRevenueCumulative
      ?? previous?.sourceMetrics.financialRevenueCurrent
      ?? previousMonth?.sourceMetrics.vatCumulativeSales
      ?? 0
    const revenueTotal = revenueCumulative - Number(previousRevenueCumulative)
    if (!closeEnough(revenueTotal, vatTotal)) continue

    const costCumulative = period.sourceMetrics.citCostCumulative
      ?? period.sourceMetrics.financialCostCurrent
    const previousCostCumulative = previous?.sourceMetrics.citCostCumulative
      ?? previous?.sourceMetrics.financialCostCurrent
      ?? 0
    const profitCumulative = period.sourceMetrics.citProfitCumulative
      ?? period.sourceMetrics.financialProfitCurrent
    const previousProfitCumulative = previous?.sourceMetrics.citProfitCumulative
      ?? previous?.sourceMetrics.financialProfitCurrent
      ?? 0
    const costTotal = costCumulative === null ? period.sourceMetrics.costTotal : costCumulative - Number(previousCostCumulative)
    const profitTotal = profitCumulative === null ? period.sourceMetrics.profitTotal : profitCumulative - Number(previousProfitCumulative)
    const monthCount = Math.max(period.months.length, 1)
    period.sourceMetrics.revenueTotal = revenueTotal
    period.sourceMetrics.costTotal = costTotal
    period.sourceMetrics.profitTotal = profitTotal
    period.metrics.monthlyRevenue = revenueTotal / monthCount
    period.metrics.monthlyCost = costTotal / monthCount
    period.metrics.monthlyProfit = profitTotal / monthCount
    if (period.analysisPeriodType === '年度') {
      period.metrics.annualRevenue = revenueTotal
      period.metrics.consecutive12MonthSales = revenueTotal
    }
  }
  return periods
}

function normalizeCumulativeQuarterMetrics(periods) {
  const periodByStart = new Map(periods.map((period) => [period.periodStartDate, period]))
  for (const period of periods.filter((item) => item.analysisPeriodType === '季度')) {
    const cumulative = period.sourceMetrics.citTaxableIncomeCumulative
    if (cumulative === null) continue
    const quarterNumber = Number(String(period.analysisQuarter).slice(1))
    const previousStartMonth = (quarterNumber - 2) * 3 + 1
    const previousStart = quarterNumber > 1
      ? `${period.analysisYear}-${String(previousStartMonth).padStart(2, '0')}-01`
      : ''
    const previous = previousStart ? periodByStart.get(previousStart) : null
    const previousCumulative = previous?.sourceMetrics.citTaxableIncomeCumulative || 0
    period.metrics.taxableIncome = cumulative - previousCumulative
  }
  return periods
}

function hasDetectionEvidence(period) {
  return [
    'vatCurrentSales',
    'vatCumulativeSales',
    'financialRevenueCurrent',
    'financialRevenueCumulative',
    'citRevenueCumulative',
    'citTaxableIncomeCumulative',
    'citPayrollAccruedCumulative',
    'citPayrollPaidCumulative',
    'assetsEnding',
  ].some((field) => period.sourceMetrics[field] !== null)
    || period.sourceMetrics.iitEmployeeCount > 0
    || period.sourceMetrics.iitPayrollTotal !== 0
}

function monthlyAnalysisPeriods(periods) {
  const aggregatePeriods = periods.filter((period) => period.analysisPeriodType !== '月度')
  return periods
    .filter((period) => period.analysisPeriodType === '月度')
    .map((period) => {
      const evidencePeriods = aggregatePeriods
        .filter((aggregate) => aggregate.months.includes(period.analysisMonth))
        .sort((left, right) => left.months.length - right.months.length || left.periodStartDate.localeCompare(right.periodStartDate))
        .map((aggregate) => labelForPeriod(aggregate))
      return {
        ...period,
        comparisonPeriod: evidencePeriods.length
          ? `与${evidencePeriods.join('、')}交叉验证`
          : period.comparisonPeriod,
        evidencePeriods,
      }
    })
}

export function buildStandardPeriods(rows) {
  const groups = new Map()
  for (const row of rows || []) {
    const periodStart = String(row.period_start || '')
    const periodEnd = String(row.period_end || '')
    if (!periodStart || !periodEnd) continue
    const key = `${periodStart}|${periodEnd}`
    const group = groups.get(key) || blankGroup(periodStart, periodEnd)
    consumeRecord(group, row)
    groups.set(key, group)
  }
  const sourcePeriods = enrichAggregateMetrics(normalizeCumulativeQuarterMetrics(normalizeLegacyAggregateTotals(normalizeFinancialColumnOrientation(Array.from(groups.values())
    .map(buildPeriod)
    .filter((period) => period.months.length > 0 && hasDetectionEvidence(period))
    .sort((left, right) => left.periodStartDate.localeCompare(right.periodStartDate) || right.months.length - left.months.length)))))
  return {
    periods: monthlyAnalysisPeriods(sourcePeriods),
    sourcePeriods,
    crossValidation: crossValidate(sourcePeriods),
  }
}
