export type ReportPeriodEvidenceSource = {
  sourceFileId: string
  fileName: string
  documentType: string
  periodStart: string
  periodEnd: string
  parseStatus: string
  stored: boolean
  recordCount: number
}

export type ReportPeriodEvidenceSourceInput = {
  id: string
  fileName: string
  documentType: string
  periodStart: string
  periodEnd: string
  parseStatus: string
  stored: boolean
  recordCount: number
}

export const reportPeriodEvidenceDisclaimer = '这些文件与本报告审阅期间重叠，可供复核；列表不代表每个文件均参与全部指标或每项风险判断，逐字段来源仍以证据明细为准。'

const documentTypeLabels: Record<string, string> = {
  business_license: '营业执照',
  financial_statement: '财务报表',
  account_balance: '科目余额表',
  ledger: '明细账',
  vat_return: '增值税申报主表',
  vat_return_schedule: '增值税申报附表',
  invoice_list: '发票清单',
  payroll: '工资表',
  iit_withholding: '个税扣缴申报',
  social_security: '社保资料',
  housing_fund: '公积金资料',
  bank_statement: '银行流水',
  contract: '合同',
  voucher: '凭证',
  other_material: '其他资料',
}

function monthKey(value: unknown) {
  if (typeof value !== 'string') return ''
  const match = value.trim().match(/^(\d{4})-(0[1-9]|1[0-2])(?:$|-)/)
  return match ? `${match[1]}-${match[2]}` : ''
}

function isValidSource(source: unknown): source is ReportPeriodEvidenceSource {
  if (!source || typeof source !== 'object') return false
  const candidate = source as Partial<ReportPeriodEvidenceSource>
  const startMonth = monthKey(candidate.periodStart)
  const endMonth = monthKey(candidate.periodEnd)
  return typeof candidate.sourceFileId === 'string'
    && Boolean(candidate.sourceFileId.trim())
    && typeof candidate.fileName === 'string'
    && Boolean(candidate.fileName.trim())
    && typeof candidate.documentType === 'string'
    && typeof candidate.parseStatus === 'string'
    && typeof candidate.stored === 'boolean'
    && Number.isSafeInteger(candidate.recordCount)
    && (candidate.recordCount ?? -1) >= 0
    && Boolean(startMonth)
    && Boolean(endMonth)
    && startMonth <= endMonth
}

export function reportPeriodEvidenceSourceList(value: unknown): ReportPeriodEvidenceSource[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.flatMap((source) => {
    if (!isValidSource(source)) return []
    const sourceFileId = source.sourceFileId.trim()
    if (seen.has(sourceFileId)) return []
    seen.add(sourceFileId)
    return [{
      sourceFileId,
      fileName: source.fileName.trim(),
      documentType: source.documentType.trim(),
      periodStart: source.periodStart.trim(),
      periodEnd: source.periodEnd.trim(),
      parseStatus: source.parseStatus.trim(),
      stored: source.stored,
      recordCount: source.recordCount,
    }]
  })
}

export function isValidReportPeriodEvidenceSources(value: unknown) {
  return Array.isArray(value) && reportPeriodEvidenceSourceList(value).length === value.length
}

export function buildReportPeriodEvidenceSources(
  sources: ReportPeriodEvidenceSourceInput[],
  selectedMonths: string[],
) {
  const months = Array.from(new Set(selectedMonths.map(monthKey).filter(Boolean)))
  if (!months.length) return []

  const snapshots = sources.flatMap((source) => {
    const startMonth = monthKey(source.periodStart)
    const endMonth = monthKey(source.periodEnd)
    if (!startMonth || !endMonth || startMonth > endMonth) return []
    if (!months.some((month) => startMonth <= month && month <= endMonth)) return []
    return [{
      sourceFileId: source.id,
      fileName: source.fileName,
      documentType: source.documentType,
      periodStart: source.periodStart,
      periodEnd: source.periodEnd,
      parseStatus: source.parseStatus,
      stored: source.stored,
      recordCount: source.recordCount,
    }]
  })

  return reportPeriodEvidenceSourceList(snapshots).sort((left, right) => (
    left.periodStart.localeCompare(right.periodStart, 'zh-CN')
    || left.fileName.localeCompare(right.fileName, 'zh-CN')
  ))
}

export function reportPeriodEvidenceSourceTypeLabel(documentType: string) {
  return documentTypeLabels[documentType] || documentType || '资料类型未标注'
}

export function reportPeriodEvidenceSourcePeriod(source: ReportPeriodEvidenceSource) {
  return source.periodStart === source.periodEnd
    ? source.periodStart
    : `${source.periodStart} 至 ${source.periodEnd}`
}

export function reportPeriodEvidenceSourceStatus(source: ReportPeriodEvidenceSource) {
  const storage = source.stored ? '原件已保存' : '仅登记索引'
  const records = source.recordCount > 0 ? `已形成 ${source.recordCount} 条标准记录` : '未形成标准记录'
  return `${storage} · ${records}`
}
