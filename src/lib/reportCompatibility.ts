import type { RiskLevel } from './ruleEngine'

export type CompleteStructuredRiskFindingShape = {
  id: string
  title: string
  level: RiskLevel
  taxType: string
  priority: string
  scenario: string
  currentFinding: string
  riskAnalysis: string
  exposureEstimate: string
  recommendation: string
  basis: string
  legalBasis: string
  remediation: string
  materials: string[]
  deepTemplate: boolean
}

export type CompleteStructuredReportShape = {
  version: 'professional-v1'
  title: string
  clientProfile: Array<{ label: string; value: string }>
  scope: Array<{ label: string; value: string }>
  executiveSummary: {
    overallLevel: RiskLevel
    totalRisks: number
    highRisks: number
    mediumRisks: number
    lowRisks: number
    conclusion: string
  }
  dataQuality: {
    score: number
    label: string
    note: string
    missingFields: string[]
    suggestedMaterials: string[]
  }
  taxSummaries: string[]
  keyFindings: CompleteStructuredRiskFindingShape[]
  detailedFindings: CompleteStructuredRiskFindingShape[]
  actionPlan: Array<{ priority: string; item: string; ownerHint: string }>
  expertReviewItems: string[]
  followUpCadence: string[]
  deliveryChecklist: string[]
  clientAcknowledgement: string[]
  signOffBlock: Array<{ label: string; value: string }>
  disclaimers: string[]
}

export function reportRiskList<T>(report?: { risks?: T[] }): T[]
export function reportRiskList(report?: { risks?: unknown }): unknown[]
export function reportRiskList(report?: { risks?: unknown }): unknown[] {
  return Array.isArray(report?.risks) ? report.risks : []
}

export function reportTextContent(report: { clientName?: string; content?: unknown }) {
  const content = typeof report.content === 'string' ? report.content.trim() : ''
  if (content) return content
  return `${report.clientName || '历史报告'}税务风险体检报告

该历史报告缺少正文内容，系统已切换为兼容预览。请重新生成报告以获得完整正式版本。`
}

export function isCompleteStructuredReport(report?: unknown): report is CompleteStructuredReportShape {
  if (!report || typeof report !== 'object') return false
  const candidate = report as Partial<CompleteStructuredReportShape>
  return Boolean(
    candidate.version === 'professional-v1'
    && typeof candidate.title === 'string'
    && Array.isArray(candidate.clientProfile)
    && Array.isArray(candidate.scope)
    && candidate.executiveSummary
    && typeof candidate.executiveSummary.overallLevel === 'string'
    && typeof candidate.executiveSummary.totalRisks === 'number'
    && typeof candidate.executiveSummary.highRisks === 'number'
    && typeof candidate.executiveSummary.mediumRisks === 'number'
    && typeof candidate.executiveSummary.lowRisks === 'number'
    && typeof candidate.executiveSummary.conclusion === 'string'
    && candidate.dataQuality
    && typeof candidate.dataQuality.score === 'number'
    && typeof candidate.dataQuality.label === 'string'
    && typeof candidate.dataQuality.note === 'string'
    && Array.isArray(candidate.dataQuality.missingFields)
    && Array.isArray(candidate.dataQuality.suggestedMaterials)
    && Array.isArray(candidate.taxSummaries)
    && Array.isArray(candidate.keyFindings)
    && Array.isArray(candidate.detailedFindings)
    && Array.isArray(candidate.actionPlan)
    && Array.isArray(candidate.expertReviewItems)
    && Array.isArray(candidate.followUpCadence)
    && Array.isArray(candidate.deliveryChecklist)
    && Array.isArray(candidate.clientAcknowledgement)
    && Array.isArray(candidate.signOffBlock)
    && Array.isArray(candidate.disclaimers)
  )
}
