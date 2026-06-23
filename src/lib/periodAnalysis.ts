export type AnalysisPeriodType = '' | '年度' | '季度' | '月度' | '年初至今' | '自定义期间'
export type AnalysisQuarter = '' | 'Q1' | 'Q2' | 'Q3' | 'Q4'
export type DataBasis = '' | '申报数据' | '管理报表' | '暂估数据' | '混合口径'

export type PeriodClientFields = {
  analysisPeriodType: AnalysisPeriodType
  analysisYear: string
  analysisQuarter: AnalysisQuarter
  analysisMonth: string
  periodStartDate: string
  periodEndDate: string
  dataBasis: DataBasis
  comparisonPeriod: string
  monthlyRevenue: number
  monthlyCost: number
  monthlyProfit: number
  monthlyInvoice: number
  annualRevenue: number
  consecutive12MonthSales: number
  collectionFlow: number
}

export type PeriodEntry<TSnapshot extends PeriodClientFields = PeriodClientFields> = {
  id: string
  label: string
  analysisPeriodType: AnalysisPeriodType
  analysisYear: string
  analysisQuarter: AnalysisQuarter
  analysisMonth: string
  periodStartDate: string
  periodEndDate: string
  dataBasis: DataBasis
  comparisonPeriod: string
  months: string[]
  snapshot: TSnapshot
  savedAt: string
}

export function monthIndex(month: string) {
  const [year, monthPart] = month.split('-').map(Number)
  if (!year || !monthPart) return Number.NaN
  return year * 12 + monthPart - 1
}

export function monthFromIndex(index: number) {
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}`
}

export function monthsBetween(startMonth: string, endMonth: string) {
  const start = monthIndex(startMonth)
  const end = monthIndex(endMonth)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return []
  return Array.from({ length: end - start + 1 }, (_, index) => monthFromIndex(start + index))
}

export function quarterMonths(year: string, quarter: AnalysisQuarter) {
  const quarterStart: Record<Exclude<AnalysisQuarter, ''>, number> = { Q1: 1, Q2: 4, Q3: 7, Q4: 10 }
  if (!year || !quarter) return []
  const start = quarterStart[quarter]
  return monthsBetween(`${year}-${String(start).padStart(2, '0')}`, `${year}-${String(start + 2).padStart(2, '0')}`)
}

export function getClientPeriodMonths(client: Pick<PeriodClientFields, 'analysisPeriodType' | 'analysisYear' | 'analysisQuarter' | 'analysisMonth' | 'periodStartDate' | 'periodEndDate'>) {
  if (!client.analysisPeriodType) return []
  if (client.analysisPeriodType === '年度') return client.analysisYear ? monthsBetween(`${client.analysisYear}-01`, `${client.analysisYear}-12`) : []
  if (client.analysisPeriodType === '季度') return quarterMonths(client.analysisYear, client.analysisQuarter)
  if (client.analysisPeriodType === '月度') return client.analysisMonth ? [client.analysisMonth] : []
  if (client.analysisPeriodType === '年初至今') {
    const endMonth = client.periodEndDate ? client.periodEndDate.slice(0, 7) : ''
    return client.analysisYear && endMonth ? monthsBetween(`${client.analysisYear}-01`, endMonth) : []
  }
  const startMonth = client.periodStartDate ? client.periodStartDate.slice(0, 7) : ''
  const endMonth = client.periodEndDate ? client.periodEndDate.slice(0, 7) : ''
  return startMonth && endMonth ? monthsBetween(startMonth, endMonth) : []
}

export function areMonthsContinuous(months: string[]) {
  const unique = Array.from(new Set(months)).sort((a, b) => monthIndex(a) - monthIndex(b))
  if (unique.length <= 1) return true
  return unique.every((month, index) => index === 0 || monthIndex(month) === monthIndex(unique[index - 1]) + 1)
}

export function formatMonthRange(months: string[]) {
  const unique = Array.from(new Set(months)).sort((a, b) => monthIndex(a) - monthIndex(b))
  if (!unique.length) return '未覆盖月份'
  if (unique.length === 1) return unique[0]
  return `${unique[0]} 至 ${unique[unique.length - 1]}`
}

export function formatAnalysisPeriod(client: Pick<PeriodClientFields, 'analysisPeriodType' | 'analysisYear' | 'analysisQuarter' | 'analysisMonth' | 'periodStartDate' | 'periodEndDate'>) {
  if (!client.analysisPeriodType) return '未填写'
  if (client.analysisPeriodType === '年度') return `${client.analysisYear || '未填写年度'}年度`
  if (client.analysisPeriodType === '季度') return `${client.analysisYear || '未填写年度'}年${client.analysisQuarter || '未填写季度'}`
  if (client.analysisPeriodType === '月度') return client.analysisMonth || `${client.analysisYear || '未填写年度'}年未填写月份`
  if (client.analysisPeriodType === '年初至今') {
    return `${client.analysisYear || '未填写年度'}年初至今（${client.periodStartDate || '未填写开始'} 至 ${client.periodEndDate || '未填写结束'}）`
  }
  return `${client.periodStartDate || '未填写开始'} 至 ${client.periodEndDate || '未填写结束'}`
}

export function createPeriodEntry<TSnapshot extends PeriodClientFields>(client: PeriodClientFields, snapshot: TSnapshot, savedAt: string): PeriodEntry<TSnapshot> {
  const months = getClientPeriodMonths(client)
  return {
    id: `${client.dataBasis || '未填口径'}-${months.join('_') || client.analysisPeriodType || '未填期间'}`,
    label: `${formatAnalysisPeriod(client)}｜${client.dataBasis || '未填写口径'}`,
    analysisPeriodType: client.analysisPeriodType,
    analysisYear: client.analysisYear,
    analysisQuarter: client.analysisQuarter,
    analysisMonth: client.analysisMonth,
    periodStartDate: client.periodStartDate,
    periodEndDate: client.periodEndDate,
    dataBasis: client.dataBasis,
    comparisonPeriod: client.comparisonPeriod,
    months,
    snapshot,
    savedAt,
  }
}

export function upsertPeriodEntry<TSnapshot extends PeriodClientFields>(entries: Array<PeriodEntry<TSnapshot>>, entry: PeriodEntry<TSnapshot>) {
  const exists = entries.some((item) => item.id === entry.id)
  return exists ? entries.map((item) => (item.id === entry.id ? entry : item)) : [entry, ...entries]
}

export function periodRevenueTotal(entry: PeriodEntry) {
  if (entry.analysisPeriodType === '年度') return Number(entry.snapshot.annualRevenue || 0)
  return Number(entry.snapshot.monthlyRevenue || 0) * Math.max(entry.months.length, 1)
}

export function periodCostTotal(entry: PeriodEntry) {
  return Number(entry.snapshot.monthlyCost || 0) * Math.max(entry.months.length, 1)
}

export function periodProfitTotal(entry: PeriodEntry) {
  return Number(entry.snapshot.monthlyProfit || 0) * Math.max(entry.months.length, 1)
}

export function periodInvoiceTotal(entry: PeriodEntry) {
  return Number(entry.snapshot.monthlyInvoice || 0) * Math.max(entry.months.length, 1)
}

export function summarizePeriodEntries<TEntry extends PeriodEntry>(client: PeriodClientFields, entries: TEntry[]) {
  const months = Array.from(new Set(entries.flatMap((entry) => entry.months))).sort((a, b) => monthIndex(a) - monthIndex(b))
  if (!entries.length || !months.length) return {}
  const first = entries[0]
  const monthCount = Math.max(months.length, 1)
  const sumRevenue = entries.reduce((sum, entry) => sum + periodRevenueTotal(entry), 0)
  const sumCost = entries.reduce((sum, entry) => sum + periodCostTotal(entry), 0)
  const sumProfit = entries.reduce((sum, entry) => sum + periodProfitTotal(entry), 0)
  const sumInvoice = entries.reduce((sum, entry) => sum + periodInvoiceTotal(entry), 0)
  return {
    ...first.snapshot,
    analysisPeriodType: monthCount === 1 ? '月度' : monthCount === 12 && months[0].endsWith('-01') ? '年度' : '自定义期间',
    analysisYear: months[0]?.slice(0, 4) || first.analysisYear,
    analysisMonth: monthCount === 1 ? months[0] : '',
    analysisQuarter: '',
    periodStartDate: `${months[0]}-01`,
    periodEndDate: `${months[months.length - 1]}-31`,
    dataBasis: entries.every((entry) => entry.dataBasis === first.dataBasis) ? first.dataBasis : '混合口径',
    comparisonPeriod: entries.length > 1 ? `${entries.length} 期合并分析` : first.comparisonPeriod,
    monthlyRevenue: Math.round(sumRevenue / monthCount),
    monthlyCost: Math.round(sumCost / monthCount),
    monthlyProfit: Math.round(sumProfit / monthCount),
    monthlyInvoice: Math.round(sumInvoice / monthCount),
    annualRevenue: sumRevenue,
    consecutive12MonthSales: monthCount >= 12 ? sumRevenue : client.consecutive12MonthSales,
    collectionFlow: entries.reduce((sum, entry) => sum + Number(entry.snapshot.collectionFlow || 0), 0),
  }
}

export function findPeriodConsistencyWarnings(entries: PeriodEntry[]) {
  const warnings: string[] = []
  const aggregateEntries = entries.filter((entry) => entry.months.length > 1)
  const monthlyEntries = entries.filter((entry) => entry.analysisPeriodType === '月度')
  aggregateEntries.forEach((aggregate) => {
    const coveredMonths = new Set(aggregate.months)
    const containedMonths = monthlyEntries.filter((entry) => entry.dataBasis === aggregate.dataBasis && entry.months.some((month) => coveredMonths.has(month)))
    if (!containedMonths.length) return
    const monthRevenue = containedMonths.reduce((sum, entry) => sum + periodRevenueTotal(entry), 0)
    const aggregateRevenue = periodRevenueTotal(aggregate)
    const diff = aggregateRevenue - monthRevenue
    const threshold = Math.max(10000, Math.abs(aggregateRevenue) * 0.05)
    if (Math.abs(diff) > threshold) {
      warnings.push(`${aggregate.label} 与已保存月度明细不一致：月度收入合计 ${monthRevenue.toLocaleString()} 元，期间收入 ${aggregateRevenue.toLocaleString()} 元，差异 ${diff.toLocaleString()} 元。`)
    }
  })
  return warnings
}
