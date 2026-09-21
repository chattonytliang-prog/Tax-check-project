import { describe, expect, it } from 'vitest'
import {
  isCompleteStructuredReport,
  reportRiskCountMismatch,
  reportRiskStorageMismatch,
  reportRiskList,
  reportTextContent,
  type CompleteStructuredReportShape,
} from './reportCompatibility'

const completeReport: CompleteStructuredReportShape = {
  version: 'professional-v1',
  title: '测试报告',
  clientProfile: [{ label: '企业名称', value: '测试企业' }],
  scope: [{ label: '报告版本', value: 'V1.0' }],
  executiveSummary: {
    overallLevel: '低',
    totalRisks: 0,
    highRisks: 0,
    mediumRisks: 0,
    lowRisks: 0,
    conclusion: '未识别明显风险。',
  },
  dataQuality: {
    score: 100,
    label: '完整',
    note: '资料完整。',
    missingFields: [],
    suggestedMaterials: [],
  },
  taxSummaries: [],
  keyFindings: [],
  detailedFindings: [],
  actionPlan: [],
  expertReviewItems: [],
  followUpCadence: [],
  deliveryChecklist: [],
  clientAcknowledgement: [],
  signOffBlock: [],
  disclaimers: [],
}

describe('reportCompatibility', () => {
  it('keeps complete professional structured reports renderable', () => {
    expect(isCompleteStructuredReport(completeReport)).toBe(true)
    expect(isCompleteStructuredReport({
      ...completeReport,
      archiveEvidence: { sourceFileCount: 9, storedSourceFileCount: 7, linkedSourceFileCount: 5, recordCount: 1729 },
    })).toBe(true)
  })

  it('rejects empty or non-object structured report payloads', () => {
    expect(isCompleteStructuredReport()).toBe(false)
    expect(isCompleteStructuredReport(null)).toBe(false)
    expect(isCompleteStructuredReport('legacy-report')).toBe(false)
  })

  it('rejects legacy partial structured reports before preview rendering', () => {
    expect(isCompleteStructuredReport({
      version: 'professional-v1',
      title: '旧报告',
      scope: [],
      executiveSummary: completeReport.executiveSummary,
    })).toBe(false)
  })

  it('rejects reports with missing nested array fields', () => {
    const partial = {
      ...completeReport,
      dataQuality: {
        score: 80,
        label: '一般',
        note: '缺少 suggestedMaterials。',
        missingFields: [],
      },
    }

    expect(isCompleteStructuredReport(partial)).toBe(false)
  })

  it('rejects contradictory saved archive snapshots without breaking reports that predate the field', () => {
    expect(isCompleteStructuredReport(completeReport)).toBe(true)
    expect(isCompleteStructuredReport({
      ...completeReport,
      archiveEvidence: { sourceFileCount: 2, storedSourceFileCount: 3, linkedSourceFileCount: 1, recordCount: 1 },
    })).toBe(false)
  })

  it('accepts valid period source snapshots and rejects malformed saved rows', () => {
    const periodEvidenceSources = [{
      sourceFileId: 'source-1',
      fileName: '2025年12月申报表.pdf',
      documentType: 'vat_return',
      periodStart: '2025-12-01',
      periodEnd: '2025-12-31',
      parseStatus: 'parsed',
      stored: true,
      recordCount: 8,
    }]
    expect(isCompleteStructuredReport({ ...completeReport, periodEvidenceSources })).toBe(true)
    expect(isCompleteStructuredReport({
      ...completeReport,
      periodEvidenceSources: [{ ...periodEvidenceSources[0], recordCount: -1 }],
    })).toBe(false)
  })

  it('returns an empty risk list for legacy reports without array risks', () => {
    expect(reportRiskList({ risks: undefined })).toEqual([])
    expect(reportRiskList({ risks: 'legacy-risk' })).toEqual([])
  })

  it('preserves valid risk arrays without copying their items', () => {
    const risk = { code: 'R1', level: '高' }
    expect(reportRiskList({ risks: [risk] })).toEqual([risk])
  })

  it('only flags a mismatch within the same saved report', () => {
    expect(reportRiskCountMismatch()).toBeNull()
    expect(reportRiskCountMismatch({ risks: [{}], structured: { executiveSummary: { totalRisks: 2 } } })).toBeNull()
    expect(reportRiskCountMismatch({ risks: [], structured: completeReport })).toBeNull()
    expect(reportRiskCountMismatch({ risks: [{}], structured: completeReport })).toEqual({ summaryCount: 0, detailCount: 1 })
  })

  it('separately flags database risk rows that differ from saved report details', () => {
    const report = { risks: [{}, {}] }
    expect(reportRiskStorageMismatch(report, undefined)).toBeNull()
    expect(reportRiskStorageMismatch(report, -1)).toBeNull()
    expect(reportRiskStorageMismatch(report, 2)).toBeNull()
    expect(reportRiskStorageMismatch(report, 1)).toEqual({ detailCount: 2, storedCount: 1 })
  })

  it('uses trimmed existing report content when available', () => {
    expect(reportTextContent({ clientName: '测试企业', content: '  正文  ' })).toBe('正文')
  })

  it('creates a clear fallback when legacy reports have no body content', () => {
    const content = reportTextContent({ clientName: '苏州异常贸易有限公司' })

    expect(content).toContain('苏州异常贸易有限公司历史口径税务风险初筛报告')
    expect(content).toContain('该历史报告缺少正文内容')
    expect(content).toContain('兼容预览')
  })

  it('falls back to a historical report title when client name is absent', () => {
    expect(reportTextContent({ content: '' })).toContain('历史报告历史口径税务风险初筛报告')
  })
})
