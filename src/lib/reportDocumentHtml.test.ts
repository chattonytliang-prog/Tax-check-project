import { describe, expect, it } from 'vitest'
import { professionalReportDocumentHtml } from './reportDocumentHtml'
import type { CompleteStructuredReportShape } from './reportCompatibility'

const structuredReport: CompleteStructuredReportShape = {
  version: 'professional-v1',
  title: '上海测试科技有限公司税务健康报告 <draft>',
  archiveEvidence: {
    sourceFileCount: 9,
    storedSourceFileCount: 7,
    linkedSourceFileCount: 5,
    recordCount: 1729,
  },
  periodEvidenceSources: [{
    sourceFileId: 'source-1',
    fileName: '2025年12月增值税申报表 <已归档>.pdf',
    documentType: 'vat_return',
    periodStart: '2025-12-01',
    periodEnd: '2025-12-31',
    parseStatus: 'parsed',
    stored: true,
    recordCount: 8,
  }],
  clientProfile: [
    { label: '企业名称', value: '上海测试科技有限公司' },
    { label: '统一社会信用代码', value: '91310000TEST' },
  ],
  scope: [
    { label: '审阅期间', value: '2025-01 至 2025-03' },
    { label: '数据来源', value: '管理报表' },
    { label: '规则执行覆盖', value: '已执行 12 / 15 条' },
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
    assessedRuleCount: 12,
    totalRuleCount: 15,
    unassessedRules: [{ name: '银行流水核对', missingFields: ['银行流水'] }],
  },
  taxSummaries: ['增值税存在进销项匹配异常。'],
  keyFindings: [
    {
      id: 'R-TEST',
      ruleCode: 'R-TEST',
      ruleOrigin: '内置规则',
      ruleCondition: '增值税应纳/入库税额 < 增值税应税销售额 × 0.01',
      inputEvidence: [
        { label: '增值税应税销售额', value: '1,234,567.89', basis: '标准资料已形成指标' },
        { label: '增值税应纳/入库税额', value: '8,000', basis: '资料或用户明确值' },
      ],
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
    expect(html).toContain('企业涉税风险初筛报告 · 基于已提供资料')
    expect(html).toContain('上海测试科技有限公司税务健康报告 &lt;draft&gt;')
    expect(html).toContain('高风险')
    expect(html).toContain('报告编号：')
    expect(html).toContain('生成时间：2026-07-02 10:30:00')
    expect(html).toContain('银行流水核对（尚缺：银行流水）')
    expect(html).toContain('RMD-001')
    expect(html).toContain('FND-001')
    expect(html).toContain('待复核')
    expect(html).toContain('整改过程记录、顾问复核意见及客户确认凭据')
    expect(html).toContain('报告生成时归档快照')
    expect(html).toContain('已登记源文件')
    expect(html).toContain('9 个')
    expect(html).toContain('1729 条')
    expect(html).toContain('不代表本报告期间或各风险事项的证据已逐项核验')
    expect(html).toContain('本报告期间可核对来源文件')
    expect(html).toContain('2025年12月增值税申报表 &lt;已归档&gt;.pdf')
    expect(html).toContain('增值税申报主表')
    expect(html).toContain('2025-12-01 至 2025-12-31')
    expect(html).toContain('原件已保存 · 解析完成 · 已入库 8 条')
    expect(html).toContain('列表不代表每个文件均参与全部指标或每项风险判断')
    expect(html).toContain('检查结论覆盖快照')
    expect(html).toContain('可判断检查项')
    expect(html).toContain('12 / 15 项')
    expect(html).toContain('检查范围统计待复核')
    expect(html).toContain('暂未判断，不代表低风险或无风险')
    expect(html).not.toContain('规则执行覆盖')
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

  it('carries known risk-count conflicts into Word and print exports', () => {
    for (const mode of ['word', 'print'] as const) {
      const html = professionalReportDocumentHtml({ structured: structuredReport, risks: [{}, {}] }, mode, 0)
      expect(html).toContain('风险数量待复核，暂勿作为最终结论对外使用。')
      expect(html).toContain('报告摘要 1 项，保存的风险明细 2 项。')
      expect(html).toContain('保存的风险明细 2 项，数据库关联的风险结果 0 项。')
    }
  })

  it('does not invent a count conflict when saved details or database counts are unavailable', () => {
    expect(professionalReportDocumentHtml({ structured: structuredReport }, 'word', 0)).not.toContain('风险数量待复核')
    expect(professionalReportDocumentHtml({ structured: structuredReport, risks: [{}] }, 'word', 1)).not.toContain('风险数量待复核')
  })

  it('keeps legacy report export compatible and sanitized', () => {
    const html = professionalReportDocumentHtml({
      clientName: '历史企业',
      content: '正文 <script>alert(1)</script> Issue R-001 code: R-001',
      createdAt: '2026-07-02 11:00:00',
    }, 'word')

    expect(html).toContain('历史企业历史口径税务风险初筛报告')
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
    expect(html).toContain('标准分析说明')
    expect(html).toContain('本次采用数据（生成时快照）')
    expect(html).toContain('规则编号')
    expect(html).toContain('R-TEST')
    expect(html).toContain('规则来源')
    expect(html).toContain('内置规则')
    expect(html).toContain('生成时命中条件')
    expect(html).toContain('增值税应纳/入库税额 &lt; 增值税应税销售额 × 0.01')
    expect(html).toContain('1,234,567.89')
    expect(html).toContain('标准资料已形成指标')
    expect(html).toContain('不代表来源原件已逐项核验')
    expect(html).toContain('待按建议资料完成原件或明细复核')
    expect(html).toContain('暂无明确补充资料。')
    expect(html).toContain('当前无需要列入整改清单的自动风险事项。')
    expect(html).toContain('<title>历史报告企业涉税风险初筛报告</title>')
  })

  it('renders empty finding summaries and legacy defaults', () => {
    const emptyStructured = {
      ...structuredReport,
      periodEvidenceSources: undefined,
      keyFindings: [],
      detailedFindings: [],
    }
    const structuredHtml = professionalReportDocumentHtml({ structured: emptyStructured }, 'word')
    const legacyHtml = professionalReportDocumentHtml({}, 'word')

    expect(structuredHtml).toContain('当前未形成需要在摘要中重点列示的风险事项。')
    expect(structuredHtml).toContain('当前未命中自动风险事项。')
    expect(structuredHtml).not.toContain('本报告期间可核对来源文件')
    expect(legacyHtml).toContain('<h1>历史报告历史口径税务风险初筛报告</h1>')
    expect(legacyHtml).toContain('生成时间：')
  })
})
