import { describe, expect, it } from 'vitest'
import { professionalReportDocumentHtml } from './reportDocumentHtml'
import type { CompleteStructuredReportShape } from './reportCompatibility'

const structuredReport: CompleteStructuredReportShape = {
  version: 'professional-v1',
  title: '上海测试科技有限公司税务健康报告 <draft>',
  clientProfile: [
    { label: '企业名称', value: '上海测试科技有限公司' },
    { label: '统一社会信用代码', value: '91310000TEST' },
  ],
  scope: [
    { label: '审阅期间', value: '2025-01 至 2025-03' },
    { label: '数据来源', value: '管理报表' },
  ],
  executiveSummary: {
    overallLevel: '高',
    totalRisks: 1,
    highRisks: 1,
    mediumRisks: 0,
    lowRisks: 0,
    conclusion: '发现一项需要优先复核的风险。',
  },
  dataQuality: {
    score: 92,
    label: '较完整',
    note: '资料基本完整。',
    missingFields: ['银行流水'],
    suggestedMaterials: ['补充发票台账'],
  },
  taxSummaries: ['增值税存在进销项匹配异常。'],
  keyFindings: [
    {
      id: 'R-TEST',
      title: '进销项差异 <核查>',
      level: '高',
      taxType: '增值税',
      priority: '高优先级',
      scenario: '用于测试导出模板。',
      currentFinding: '销项税额显著高于进项税额。',
      riskAnalysis: '可能存在进项抵扣资料缺口。',
      exposureEstimate: '建议按发票台账复算。',
      recommendation: '补充发票台账。',
      basis: '系统规则',
      legalBasis: '增值税相关规定',
      remediation: '复核进项发票。',
      materials: ['发票台账'],
      deepTemplate: true,
    },
  ],
  detailedFindings: [],
  actionPlan: [{ priority: '高优先级', item: '复核进项发票', ownerHint: '财务负责人牵头' }],
  expertReviewItems: ['核对发票与账务记录'],
  followUpCadence: ['7日内完成资料复核'],
  deliveryChecklist: ['导出报告'],
  clientAcknowledgement: ['确认数据期间'],
  signOffBlock: [{ label: '客户确认', value: '待签收' }],
  disclaimers: ['本报告仅供经营管理和税务风险复核参考。'],
}

describe('professionalReportDocumentHtml', () => {
  it('renders structured reports as escaped professional HTML', () => {
    const html = professionalReportDocumentHtml({
      clientName: '上海测试科技有限公司',
      createdAt: '2026-07-02 10:30:00',
      structured: structuredReport,
    }, 'word')

    expect(html).toContain('<!doctype html>')
    expect(html).toContain('中国税务健康检查报告')
    expect(html).toContain('上海测试科技有限公司税务健康报告 &lt;draft&gt;')
    expect(html).toContain('高风险')
    expect(html).toContain('报告编号：')
    expect(html).toContain('生成时间：2026-07-02 10:30:00')
    expect(html).not.toContain('<draft>')
    expect(html).not.toContain('window.print()')
  })

  it('adds the print script only for print mode', () => {
    const html = professionalReportDocumentHtml({
      clientName: '上海测试科技有限公司',
      structured: structuredReport,
    }, 'print')

    expect(html).toContain('window.print()')
    expect(html).toContain('box-shadow: 0 16px 42px rgba(15, 23, 42, 0.10)')
  })

  it('keeps legacy report export compatible and sanitized', () => {
    const html = professionalReportDocumentHtml({
      clientName: '历史企业',
      content: '正文 <script>alert(1)</script> Issue R-001 code: R-001',
      createdAt: '2026-07-02 11:00:00',
    }, 'word')

    expect(html).toContain('历史企业税务风险体检报告')
    expect(html).toContain('正文 &lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('Issue R-001')
    expect(html).not.toContain('code: R-001')
  })

  it('renders empty sections, detailed findings, and medium/low badges', () => {
    const finding = {
      ...structuredReport.keyFindings[0],
      level: '中' as const,
      deepTemplate: false,
      materials: [],
    }
    const html = professionalReportDocumentHtml({
      structured: {
        ...structuredReport,
        executiveSummary: { ...structuredReport.executiveSummary, overallLevel: '中' },
        keyFindings: [{ ...finding, level: '低' }],
        detailedFindings: [finding, { ...finding, id: 'R-DEEP', deepTemplate: true }],
        taxSummaries: [],
        actionPlan: [],
        expertReviewItems: [],
        followUpCadence: [],
        deliveryChecklist: [],
        clientAcknowledgement: [],
        signOffBlock: [],
        disclaimers: [],
        dataQuality: {
          ...structuredReport.dataQuality,
          missingFields: [],
          suggestedMaterials: [],
        },
      },
    }, 'word')

    expect(html).toContain('中风险')
    expect(html).toContain('低风险')
    expect(html).toContain('标准规则解释')
    expect(html).toContain('暂无明确补充资料。')
    expect(html).toContain('当前无需要列入整改清单的自动风险事项。')
    expect(html).toContain('<title>历史报告税务风险体检报告</title>')
  })

  it('renders empty finding summaries and legacy defaults', () => {
    const emptyStructured = {
      ...structuredReport,
      keyFindings: [],
      detailedFindings: [],
    }
    const structuredHtml = professionalReportDocumentHtml({ structured: emptyStructured }, 'word')
    const legacyHtml = professionalReportDocumentHtml({}, 'word')

    expect(structuredHtml).toContain('当前未形成需要在摘要中重点列示的风险事项。')
    expect(structuredHtml).toContain('当前未命中自动风险事项。')
    expect(legacyHtml).toContain('<h1>历史报告税务风险体检报告</h1>')
    expect(legacyHtml).toContain('生成时间：')
  })
})
