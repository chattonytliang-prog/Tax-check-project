export type StandardPeriodResult = {
  periods: StandardPeriod[]
  sourcePeriods: StandardPeriod[]
  crossValidation: { messages: string[]; warnings: string[] }
}

export type StandardPeriod = {
  id: string
  label: string
  analysisPeriodType: string
  analysisYear: string
  analysisQuarter: string
  analysisMonth: string
  periodStartDate: string
  periodEndDate: string
  months: string[]
  metricCoverage: string[]
  metrics: Record<string, number>
  sourceMetrics: Record<string, number | null>
}

export function buildStandardPeriods(rows: Array<Record<string, unknown>>): StandardPeriodResult
