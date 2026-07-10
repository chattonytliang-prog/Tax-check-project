import { reportDocumentId } from './reportDocumentId'
import { isCompleteStructuredReport, reportTextContent, type CompleteStructuredReportShape } from './reportCompatibility'
import { escapeHtml, sanitizePublicReportContent } from './reportTextSanitizer'
import type { RiskLevel } from './ruleEngine'

export type ReportDocumentHtmlInput = {
  clientName?: string
  content?: unknown
  createdAt?: string
  structured?: unknown
}
function formatReportDate() {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

const badgeStyles: Record<RiskLevel, { color: string; background: string }> = {
  高: { color: '#b42318', background: '#fef3f2' },
  中: { color: '#b54708', background: '#fffaeb' },
  低: { color: '#027a48', background: '#ecfdf3' },
}

function exportBadgeHtml(level: RiskLevel) {
  const { color, background } = badgeStyles[level]
  return `<span class="risk-badge" style="color:${color};background:${background};border-color:${color};">${level}风险</span>`
}

function exportRows(items: Array<{ label: string; value: string }>) {
  return items.map((item) => `
    <tr>
      <th>${escapeHtml(item.label)}</th>
      <td>${escapeHtml(item.value)}</td>
    </tr>
  `).join('')
}

function exportList(items: string[], emptyText: string, ordered = false) {
  if (!items.length) return `<p class="muted">${escapeHtml(emptyText)}</p>`
  const tag = ordered ? 'ol' : 'ul'
  return `<${tag}>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</${tag}>`
}

function structuredReportHtml(report: CompleteStructuredReportShape) {
  const keyFindings = report.keyFindings.length
    ? report.keyFindings.map((finding, index) => `
      <tr>
        <td class="index">${index + 1}</td>
        <td>
          <strong>${escapeHtml(finding.title)}</strong>
          <p>${escapeHtml(finding.currentFinding)}</p>
        </td>
        <td>${exportBadgeHtml(finding.level)}</td>
        <td>${escapeHtml(finding.priority)}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="4" class="muted">当前未形成需要在摘要中重点列示的风险事项。</td></tr>`

  const detailSections = report.detailedFindings.length
    ? report.detailedFindings.map((finding, index) => `
      <section class="finding">
        <div class="finding-title">
          <span>事项 ${index + 1}</span>
          <h3>${escapeHtml(finding.title)}</h3>
          ${exportBadgeHtml(finding.level)}
        </div>
        <table class="meta-table">
          <tr><th>涉及税种</th><td>${escapeHtml(finding.taxType)}</td><th>整改优先级</th><td>${escapeHtml(finding.priority)}</td></tr>
          <tr><th>模板深度</th><td colspan="3">${finding.deepTemplate ? '顾问级深度模板' : '标准规则解释'}</td></tr>
        </table>
        <h4>事项背景</h4>
        <p>${escapeHtml(finding.scenario)}</p>
        <h4>当前发现</h4>
        <p>${escapeHtml(finding.currentFinding)}</p>
        <h4>潜在税务风险分析</h4>
        <p>${escapeHtml(finding.riskAnalysis)}</p>
        <h4>测算逻辑</h4>
        <p>${escapeHtml(finding.exposureEstimate)}</p>
        <h4>优化建议</h4>
        <p>${escapeHtml(finding.remediation)}</p>
        <h4>政策/规则依据</h4>
        <p>${escapeHtml(finding.legalBasis)}</p>
        <h4>建议补充资料</h4>
        ${exportList(finding.materials, '暂无明确补充资料。')}
      </section>
    `).join('')
    : '<p class="muted">当前未命中自动风险事项。</p>'

  return `
    <section class="cover">
      <p class="eyebrow">中国税务健康检查报告</p>
      <h1>${escapeHtml(report.title)}</h1>
      <div class="cover-grid">
        ${report.scope.slice(0, 4).map((item) => `<span>${escapeHtml(item.label)}：${escapeHtml(item.value)}</span>`).join('')}
      </div>
    </section>

    <section>
      <h2>一、项目背景及工作范围</h2>
      <table class="fact-table">${exportRows(report.clientProfile)}</table>
      <table class="fact-table">${exportRows(report.scope)}</table>
    </section>

    <section>
      <h2>二、报告摘要：我们的观点</h2>
      <table class="summary-table">
        <tr>
          <th>综合风险等级</th>
          <th>命中风险事项</th>
          <th>高 / 中 / 低</th>
          <th>资料完整性</th>
        </tr>
        <tr>
          <td>${exportBadgeHtml(report.executiveSummary.overallLevel)}</td>
          <td>${report.executiveSummary.totalRisks} 项</td>
          <td>${report.executiveSummary.highRisks} / ${report.executiveSummary.mediumRisks} / ${report.executiveSummary.lowRisks}</td>
          <td>${report.dataQuality.score}%（${escapeHtml(report.dataQuality.label)}）</td>
        </tr>
      </table>
      <p class="lead">${escapeHtml(report.executiveSummary.conclusion)}</p>
      <p>${escapeHtml(report.dataQuality.note)}</p>
    </section>

    <section>
      <h2>三、重要事项汇总</h2>
      <table class="finding-table">
        <tr><th>序号</th><th>事项</th><th>等级</th><th>优先级</th></tr>
        ${keyFindings}
      </table>
    </section>

    <section>
      <h2>四、分税种风险摘要</h2>
      ${exportList(report.taxSummaries, '当前未形成分税种风险提示。')}
    </section>

    <section>
      <h2>五、重要事项章节</h2>
      ${detailSections}
    </section>

    <section>
      <h2>六、专家核查清单与资料缺口</h2>
      <h3>建议核查事项</h3>
      ${exportList(report.expertReviewItems, '当前无额外专家核查提示。', true)}
      <h3>建议补充资料</h3>
      ${exportList(report.dataQuality.suggestedMaterials, '暂无明确资料缺口。')}
      <h3>基础检测缺失字段</h3>
      ${exportList(report.dataQuality.missingFields, '无。')}
    </section>

    <section>
      <h2>七、整改优先级</h2>
      ${report.actionPlan.length ? `
        <table class="finding-table">
          <tr><th>序号</th><th>优先级</th><th>事项</th><th>责任建议</th></tr>
          ${report.actionPlan.map((item, index) => `
            <tr>
              <td class="index">${index + 1}</td>
              <td>${escapeHtml(item.priority)}</td>
              <td>${escapeHtml(item.item)}</td>
              <td>${escapeHtml(item.ownerHint)}</td>
            </tr>
          `).join('')}
        </table>
      ` : '<p class="muted">当前无需要列入整改清单的自动风险事项。</p>'}
    </section>

    <section>
      <h2>八、后续跟进节奏</h2>
      ${exportList(report.followUpCadence, '暂无后续跟进建议。', true)}
    </section>

    <section>
      <h2>九、交付资料清单</h2>
      ${exportList(report.deliveryChecklist, '暂无交付资料清单。', true)}
    </section>

    <section>
      <h2>十、客户确认事项</h2>
      ${exportList(report.clientAcknowledgement, '暂无客户确认事项。', true)}
    </section>

    <section>
      <h2>十一、报告签收栏</h2>
      <table class="fact-table">${exportRows(report.signOffBlock)}</table>
    </section>

    <section>
      <h2>十二、责任边界及免责声明</h2>
      ${exportList(report.disclaimers, '无。', true)}
    </section>
  `
}

function legacyReportHtml(report: ReportDocumentHtmlInput) {
  return `<section><h1>${escapeHtml(report.clientName || '历史报告')}税务风险体检报告</h1><pre>${escapeHtml(sanitizePublicReportContent(reportTextContent(report)))}</pre></section>`
}

function reportDocumentFooterHtml(report: ReportDocumentHtmlInput) {
  const generatedAt = report.createdAt || formatReportDate()
  const documentId = reportDocumentId({ clientName: report.clientName, createdAt: generatedAt })
  return `
    <footer class="document-footer">
      <strong>合耀科技 HY AI 税务风控工作台</strong>
      <span>报告编号：${escapeHtml(documentId)}</span>
      <span>报告版本：V1.0</span>
      <span>报告状态：系统初筛版（待顾问复核）</span>
      <span>生成时间：${escapeHtml(generatedAt)}</span>
      <span>本报告仅供经营管理和税务风险复核参考，不替代税务机关认定、专项鉴证或正式法律/税务意见。</span>
    </footer>
  `
}

export function professionalReportDocumentHtml(report: ReportDocumentHtmlInput, mode: 'word' | 'print') {
  const body = isCompleteStructuredReport(report.structured) ? structuredReportHtml(report.structured) : legacyReportHtml(report)
  const printScript = mode === 'print'
    ? '<script>window.addEventListener("load", () => window.setTimeout(() => window.print(), 250));</script>'
    : ''
  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(report.clientName || '历史报告')}税务风险体检报告</title>
        <style>
          @page { size: A4; margin: 18mm 16mm; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            color: #17252b;
            background: #f4f7f8;
            font-family: "Microsoft YaHei", SimSun, Arial, sans-serif;
            font-size: 13px;
            line-height: 1.75;
          }
          main {
            max-width: 960px;
            margin: 0 auto;
            background: #fff;
            box-shadow: ${mode === 'print' ? '0 16px 42px rgba(15, 23, 42, 0.10)' : 'none'};
          }
          .cover {
            min-height: 290px;
            padding: 42px;
            color: #fff;
            background: #07333b;
          }
          .eyebrow {
            margin: 0 0 18px;
            color: #82f1ea;
            font-weight: 800;
            letter-spacing: 0;
          }
          .cover h1 {
            margin: 0 0 28px;
            font-size: 30px;
            line-height: 1.25;
          }
          .cover-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
          }
          .cover-grid span {
            border: 1px solid rgba(255, 255, 255, 0.25);
            padding: 7px 9px;
            color: #e8f7f5;
          }
          section {
            padding: 26px 38px;
            border-top: 1px solid #d9e5e8;
          }
          h1, h2, h3, h4 {
            color: #0b2f38;
            line-height: 1.35;
          }
          h2 {
            margin: 0 0 16px;
            font-size: 21px;
            border-left: 5px solid #0b7784;
            padding-left: 10px;
          }
          h3 { margin: 18px 0 8px; font-size: 16px; }
          h4 { margin: 16px 0 6px; font-size: 14px; }
          p { margin: 8px 0; }
          pre {
            white-space: pre-wrap;
            font-family: "Microsoft YaHei", SimSun, Arial, sans-serif;
            font-size: 13px;
            line-height: 1.75;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0 16px;
          }
          th, td {
            border: 1px solid #d9e5e8;
            padding: 8px 10px;
            vertical-align: top;
            text-align: left;
          }
          th {
            background: #eef7f8;
            color: #25424a;
            font-weight: 800;
          }
          .fact-table th { width: 24%; }
          .summary-table td {
            font-size: 15px;
            font-weight: 800;
          }
          .finding-table .index {
            width: 46px;
            text-align: center;
            font-weight: 900;
          }
          .finding-table p {
            margin: 4px 0 0;
            color: #4d6269;
          }
          .finding {
            margin: 16px 0;
            padding: 18px;
            border: 1px solid #d9e5e8;
            page-break-inside: avoid;
          }
          .finding-title {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 10px;
          }
          .finding-title span {
            color: #667f87;
            font-size: 12px;
            font-weight: 800;
          }
          .finding-title h3 {
            margin: 2px 0 0;
            flex: 1;
          }
          .risk-badge {
            display: inline-block;
            border: 1px solid;
            border-radius: 999px;
            padding: 3px 8px;
            font-size: 12px;
            font-weight: 900;
            white-space: nowrap;
          }
          .lead { font-size: 15px; font-weight: 800; color: #18343c; }
          .muted { color: #637982; }
          li { margin: 4px 0; }
          .document-footer {
            display: grid;
            gap: 4px;
            padding: 18px 38px 24px;
            border-top: 1px solid #d9e5e8;
            color: #526970;
            font-size: 12px;
            background: #f7fbfb;
          }
          .document-footer strong {
            color: #0b2f38;
            font-size: 13px;
          }
          @media print {
            body { background: #fff; }
            main { max-width: none; box-shadow: none; }
            .cover { page-break-after: always; }
            .document-footer { background: #fff; }
          }
        </style>
      </head>
      <body>
        <main>${body}${reportDocumentFooterHtml(report)}</main>
        ${printScript}
      </body>
    </html>`
}
