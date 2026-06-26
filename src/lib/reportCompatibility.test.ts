import { describe, expect, it } from 'vitest'
import {
  isCompleteStructuredReport,
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

  it('returns an empty risk list for legacy reports without array risks', () => {
    expect(reportRiskList({ risks: undefined })).toEqual([])
    expect(reportRiskList({ risks: 'legacy-risk' })).toEqual([])
  })

  it('preserves valid risk arrays without copying their items', () => {
    const risk = { code: 'R1', level: '高' }
    expect(reportRiskList({ risks: [risk] })).toEqual([risk])
  })

  it('uses trimmed existing report content when available', () => {
    expect(reportTextContent({ clientName: '测试企业', content: '  正文  ' })).toBe('正文')
  })

  it('creates a clear fallback when legacy reports have no body content', () => {
    const content = reportTextContent({ clientName: '苏州异常贸易有限公司' })

    expect(content).toContain('苏州异常贸易有限公司税务风险体检报告')
    expect(content).toContain('该历史报告缺少正文内容')
    expect(content).toContain('兼容预览')
  })

  it('falls back to a historical report title when client name is absent', () => {
    expect(reportTextContent({ content: '' })).toContain('历史报告税务风险体检报告')
  })
})
