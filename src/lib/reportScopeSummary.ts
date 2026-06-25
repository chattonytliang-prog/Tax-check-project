export type ReportScopeSummaryInput = {
  periodLabel: string
  dataBasis?: string
  comparisonPeriod?: string
}

export function reportScopeSummary({ periodLabel, dataBasis, comparisonPeriod }: ReportScopeSummaryInput) {
  const period = periodLabel.trim() || '当前选择期间'
  const basis = dataBasis?.trim() || '已录入数据'
  const comparison = comparisonPeriod?.trim()

  return comparison
    ? `本报告基于${period}的${basis}生成，并参考对比期间${comparison}。`
    : `本报告基于${period}的${basis}生成。`
}
