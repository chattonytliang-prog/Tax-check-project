type ReportFileNameScopeItem = {
  label: string
  value: string
}

type ReportFileNameInput = {
  clientName?: string
  createdAt?: string
  structured?: {
    scope?: ReportFileNameScopeItem[]
  }
}

function safeFilePart(value: string, fallback: string) {
  const text = value
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '')
    .trim()
  return (text || fallback).slice(0, 40)
}

function reportPeriodForFileName(report: ReportFileNameInput) {
  return report.structured?.scope?.find((item) => item.label === '审阅期间')?.value || ''
}

export function reportFileName(report: ReportFileNameInput, extension: string, fallbackDate = new Date().toISOString().slice(0, 10)) {
  const date = report.createdAt?.slice(0, 10).replace(/[/:]/g, '-') || fallbackDate
  const safeClientName = safeFilePart(report.clientName || '', '企业')
  const safePeriod = safeFilePart(reportPeriodForFileName(report), '')
  const periodPart = safePeriod ? `${safePeriod}-` : ''
  return `${safeClientName}-${periodPart}中国税务健康检查报告-${date}.${extension}`
}
