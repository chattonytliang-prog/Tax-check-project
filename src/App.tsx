import { useEffect, useMemo, useRef, useState } from 'react'
import type { EChartsOption } from 'echarts'
import type { EChartsType } from 'echarts/core'
import type * as ThreeNamespace from 'three'
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Folder,
  FolderOpen,
  Gauge,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCcw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCog,
  Printer,
} from 'lucide-react'
import {
  builtInRuleConditions,
  conditionFields,
  conditionSummary,
  emptyRuleCondition,
  evaluateCondition,
  evaluateRuleExecution,
  isExecutableCondition,
  isSimpleCondition,
  type ClientSnapshot,
  type RuleCondition,
  type RuleExecutionResult,
  type RiskLevel,
  type SimpleRuleCondition,
} from './lib/ruleEngine'
import { advancedCandidateRuleConfigs, type AdvancedCandidateRuleConfig } from './lib/advancedCandidateRuleConfigs'
import { reportClientAcknowledgement } from './lib/reportClientAcknowledgement'
import { reportDeliveryChecklist } from './lib/reportDeliveryChecklist'
import { reportDocumentId } from './lib/reportDocumentId'
import { professionalReportDocumentHtml } from './lib/reportDocumentHtml'
import { reportFileName } from './lib/reportFileName'
import { reportFollowUpCadence } from './lib/reportFollowUpCadence'
import {
  isCompleteStructuredReport,
  reportRiskList,
  reportTextContent,
  type CompleteStructuredReportShape,
  type CompleteStructuredRiskFindingShape,
} from './lib/reportCompatibility'
import { reportReviewAction } from './lib/reportReviewAction'
import { deepReportRuleTemplates } from './lib/reportRuleTemplates'
import { reportSignOffBlock } from './lib/reportSignOffBlock'
import { reportScopeSummary } from './lib/reportScopeSummary'
import { publicRiskBasis, publicRiskReason, sanitizePublicReportContent } from './lib/reportTextSanitizer'
import {
  clientImportFieldLabels,
  createClientImportTemplateCsv,
  decodeClientImportText,
  parseClientImportText,
  parseClientImportWorkbook,
  type ImportMappingPreview,
  type ParsedClientImport,
} from './lib/clientImportParser'
import { extractPdfTextPages } from './lib/pdfTextExtractor'
import { parseTaxDataPdfText, type ParsedTaxDataIntake } from './lib/taxDataIntakeParser'
import { binaryAssistantReplyMessage, hasDirectIntakeAuthorization, instantAssistantReply, isArchiveChecklistQuestion, isBinaryAssistantQuestion } from './lib/assistantIntakeIntent'
import {
  classifyIntakeMaterial,
  detectIntakePeriod,
  type IntakeClassification,
  type IntakeDocumentType,
  type IntakePeriodType,
} from './lib/intakeClassifier'
import {
  buildIntakeConfirmationQuestions,
  type IntakeConfirmationQuestion,
} from './lib/intakeConfirmationQuestions'
import {
  areMonthsContinuous,
  createPeriodEntry,
  findPeriodConsistencyWarnings,
  formatAnalysisPeriod,
  formatMonthRange,
  getClientPeriodMonths,
  monthFromIndex,
  monthIndex,
  monthsBetween,
  quarterMonths,
  summarizePeriodEntries,
  upsertPeriodEntry,
  type AnalysisPeriodType,
  type AnalysisQuarter,
  type DataBasis,
  type PeriodEntry,
} from './lib/periodAnalysis'
import { apiDelete, apiGet, apiSend, apiUpload } from './lib/apiClient'
import { explicitDerivedMetadata } from './lib/explicitDerivedFields'
import './App.css'

type Page = 'dashboard' | 'assistant' | 'clients' | 'form' | 'result' | 'report' | 'reports' | 'rules' | 'admin'
type RiskDetectionStep = 'client' | 'period' | 'confirm' | 'result'
type TaxpayerType = '' | '小规模纳税人' | '一般纳税人' | '个体工商户'
type ProjectScope = '单主体' | '集团项目'
type EntityRole = '单体企业' | '集团总部' | '经营主体' | '关联主体' | '个体户/个人独资'
type RulePageSize = 10 | 20 | 50 | 'all'
type ClientManualDerivedFields = Record<string, boolean>
type ClientManualDerivedReasons = Record<string, string>
type IntakeRequirement = 'required' | 'recommended' | 'conditional' | 'optional' | 'computed'

type ClientPeriodEntry = PeriodEntry<Client>

const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

const customIndustryOption = '其他手动填写'
const customIndustryPrefix = '其他：'
const mainstreamIndustryOptions = [
  '农林牧渔',
  '制造业',
  '建筑业',
  '批发和零售',
  '住宿和餐饮',
  '交通运输、仓储和邮政',
  '信息传输、软件和信息技术服务',
  '金融业',
  '房地产业',
  '租赁和商务服务',
  '科学研究和技术服务',
  '水利、环境和公共设施管理',
  '居民服务、修理和其他服务',
  '教育',
  '卫生和社会工作',
  '文化、体育和娱乐',
  '电子商务',
  '互联网/直播自媒体',
  '物流',
  '进出口贸易',
]

function isCustomIndustry(industry: string) {
  return industry.startsWith(customIndustryPrefix)
}

function getIndustrySelectValue(industry: string) {
  return isCustomIndustry(industry) ? customIndustryOption : industry
}

function getCustomIndustryValue(industry: string) {
  return isCustomIndustry(industry) ? industry.slice(customIndustryPrefix.length) : ''
}

function hasValidIndustry(industry: string) {
  return isCustomIndustry(industry) ? Boolean(getCustomIndustryValue(industry).trim()) : Boolean(industry)
}

type Client = {
  id: string
  name: string
  projectScope: ProjectScope
  groupName: string
  entityRole: EntityRole
  creditCode: string
  region: string
  industry: string
  taxpayerType: TaxpayerType
  establishedAt: string
  analysisPeriodType: AnalysisPeriodType
  analysisYear: string
  analysisQuarter: AnalysisQuarter
  analysisMonth: string
  periodStartDate: string
  periodEndDate: string
  dataBasis: DataBasis
  comparisonPeriod: string
  periodEntries: ClientPeriodEntry[]
  monthlyRevenue: number
  monthlyInvoice: number
  monthlyCost: number
  monthlyProfit: number
  annualRevenue: number
  consecutive12MonthSales: number
  platformRevenue: number
  collectionFlow: number
  employees: number
  socialSecurityCount: number
  salaryDeclaredCount: number
  laborCount: number
  payrollTotal: number
  entertainmentExpense: number
  adExpense: number
  welfareExpense: number
  unionExpense: number
  educationExpense: number
  taxableIncome: number
  assetsTotal: number
  employeeAnnualAvg: number
  privateAccountCollection: boolean
  unbilledIncome: boolean
  largeExpenseNoInvoice: boolean
  serviceFeeInvoices: boolean
  relatedTransactions: boolean
  longTermZeroDeclaration: boolean
  longTermLoss: boolean
  inventoryAbnormal: boolean
  purchaseSalesMismatch: boolean
  relatedEntitiesNearThreshold: boolean
  nearVatExemption: boolean
  prepaidLongTerm: boolean
  supplierNoInput: boolean
  invoiceNameMismatch: boolean
  fundsReturn: boolean
  abnormalInvoice: boolean
  nonFinancialInterestAbnormal: boolean
  intercompanyManagementFee: boolean
  relatedPricingAbnormal: boolean
  salarySplit: boolean
  noIitWithholding: boolean
  individualVendorRelated: boolean
  smallProfitEnjoyed: boolean
  taxBenefitDataMissing: boolean
  rdDeductionEnjoyed: boolean
  rdDocsInsufficient: boolean
  agencyComplianceRisk: boolean
  previousQuarterEmployees: number
  quarterRevenue: number
  previousQuarterRevenue: number
  quarterCostExpense: number
  previousQuarterCostExpense: number
  ytdRevenue: number
  ytdCostExpense: number
  ytdProfit: number
  peopleRelatedExpense: number
  rentalArea: number
  subleaseArea: number
  monthlyMealBenefitExpense: number
  decorationExpense: number
  ebitProfit: number
  previousYearEbitProfit: number
  budgetEbitProfit: number
  budgetRevenue: number
  previousYearRevenue: number
  mainBusinessRevenue: number
  mainBusinessCost: number
  goodsSalesRevenue: number
  goodsCost: number
  redVatSpecialInvoiceAmount: number
  outputTax: number
  inputTax: number
  vatTaxPayable: number
  taxableSales: number
  theoreticalVatTax: number
  budgetVatTax: number
  priorTaxableSales: number
  priorVatTaxPayable: number
  vatRateSpread: number
  advertisingServiceRevenue: number
  cultureConstructionFeePaid: number
  otherReceivableAgencyBalance: number
  nonOperatingExpense: number
  nonOperatingIncome: number
  endingVatCredit: number
  nonPayrollPersonalPayment: number
  manualDerivedFields: ClientManualDerivedFields
  manualDerivedReasons: ClientManualDerivedReasons
}

type RiskRule = {
  code: string
  name: string
  taxType: string
  level: RiskLevel
  basis: string
  caseRef: string
  trigger: (client: Client) => boolean
  reason: (client: Client) => string
  suggestion: string
  materials: string[]
  conditionJson?: RuleCondition
  requiredFields?: string[]
}

type RiskResult = RiskRule & {
  triggeredAt: string
}

type SkippedRule = {
  rule: RiskRule
  execution: RuleExecutionResult
}

type AiReview = {
  dataQualityWarnings: string[]
  nearThresholdWarnings: string[]
  riskReviewNotes: string[]
}

type AiAssistantSuggestion = {
  target: string
  field: string
  label: string
  value: unknown
  confidence: string
  source: string
  note: string
}

type AiAssistantToolCall = {
  name:
    | 'create_cleaning_draft'
    | 'update_cleaning_draft'
    | 'save_cleaning_draft'
    | 'create_or_update_company'
    | 'save_period_data'
    | 'attach_source_material'
    | 'save_customer_memory'
    | 'create_import_audit_log'
    | 'save_standardized_tax_data'
    | 'save_current_draft'
    | 'ask_missing_fields'
    | 'run_basic_compliance'
    | 'run_risk_detection'
    | 'generate_report'
    | 'explain_current_report'
  arguments: Record<string, unknown>
  reason: string
  requiresConfirmation: boolean
}

type AiAssistantMissingField = {
  field: string
  label: string
  question: string
}

type AiAssistantResponse = {
  answer: string
  draftPatch?: Partial<Client>
  missingFields?: AiAssistantMissingField[]
  toolCalls?: AiAssistantToolCall[]
  suggestions: AiAssistantSuggestion[]
  followUps: string[]
  clientVerified?: boolean
  model: string
  usage?: unknown
}

type AiAssistantMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  response?: AiAssistantResponse
}

type AiAssistantTargetMode = 'auto' | 'new' | 'existing'

type AssistantRawMaterial = {
  id: string
  name: string
  sourceType: string
  documentType?: IntakeDocumentType
  classificationConfidence?: IntakeClassification['confidence']
  classificationReasons?: string[]
  sourceSystem?: string
  requiresSpecializedParser?: boolean
  periodType?: IntakePeriodType
  periodStart?: string
  periodEnd?: string
  periodEvidence?: string
  size?: number
  contentType?: string
  objectKey?: string
  storageStatus?: 'stored' | 'metadata_only' | 'local_only'
  confirmationQuestions?: IntakeConfirmationQuestion[]
  uploadedAt: string
}

type AssistantDraftChange = {
  id: string
  at: string
  source: string
  detail: string
}

type AiAssistantDraft = {
  id: string
  targetMode: Exclude<AiAssistantTargetMode, 'auto'>
  client: Client
  labels: string[]
  mappings: ImportMappingPreview[]
  unmappedHeaders: string[]
  detectedTables: string[]
  sourceType: string
  fileName?: string
  rawMaterials: AssistantRawMaterial[]
  changeLog: AssistantDraftChange[]
  updatedAt: string
  missingSaveLabels: string[]
  confirmationQuestions: IntakeConfirmationQuestion[]
  taxDataRecordCounts?: Record<string, number>
  taxDataWarnings?: string[]
}

type AssistantThread = {
  id: string
  title: string
  messages: AiAssistantMessage[]
  drafts: AiAssistantDraft[]
  latestMaterialSummary?: AssistantMaterialSummary
  createdAt: string
  updatedAt: string
}

type AssistantMaterialSummary = {
  fileName?: string
  sourceType: string
  documentType?: IntakeDocumentType
  classificationConfidence?: IntakeClassification['confidence']
  classificationReasons?: string[]
  sourceSystem?: string
  requiresSpecializedParser?: boolean
  periodType?: IntakePeriodType
  periodStart?: string
  periodEnd?: string
  periodEvidence?: string
  detectedTables: string[]
  mappedFields: Array<{ source: string; field: string; label: string }>
  unmappedHeaders: string[]
  patchPreview: Record<string, unknown>
  confirmationQuestions?: IntakeConfirmationQuestion[]
}

type AssistantDraftApplyResult = {
  status: 'saved' | 'draft'
  message: string
  client?: Client
}

type TaxDataSlot = {
  id: string
  slotId: string
  group: string
  name: string
  status: 'collected' | 'missing'
  periodType: 'month' | 'quarter' | 'year' | 'range'
  parserType: string
  standardTemplate: string
  description: string
  periodStart: string
  periodEnd: string
  periodLabel: string
  recordCount: number
  sourceFileCount: number
  keyValues: Array<[string, string]>
  validationMessages: string[]
  sourceFiles: Array<{
    id: string
    file_name: string
    document_type: string
    period_start: string
    period_end: string
    parse_status?: string
    auto_import_eligible?: boolean
    template_matches?: Array<{
      templateId: string
      templateName: string
      version: number
      matched: boolean
      autoImportEligible: boolean
    }>
  }>
}

type TaxDataSummary = {
  clientId: string
  slots: TaxDataSlot[]
  slotCatalog?: Array<Pick<TaxDataSlot, 'group' | 'name' | 'periodType' | 'parserType' | 'standardTemplate' | 'description'> & { id?: string; slotId?: string }>
  missingSlots: string[]
  pendingConfirmationCount?: number
  stats: {
    collectedSlotCount: number
    totalSlotCount: number
    recordCount: number
  }
}

function taxDataCatalogSlotId(item: { id?: string; slotId?: string }) {
  return item.slotId || item.id || ''
}

type TaxDataDetail = {
  sources: Array<{
    id: string
    file_name: string
    content_type?: string
    file_size?: number
    document_type: string
    period_start: string
    period_end: string
    parse_status: string
    stored: boolean
    created_at: string
  }>
  records: Array<{
    id: string
    source_file_id: string
    record_type: string
    record_subtype?: string
    period_start: string
    period_end: string
    confidence: string
    data: Record<string, unknown>
  }>
  evidence: Array<{
    source_file_id: string
    target_id?: string
    target_field: string
    raw_value?: string
    normalized_value?: string
    confidence: string
    sheet_name?: string
    row_no?: number
    column_no?: number
    page_no?: number
    note?: string
  }>
  totalRecords: number
  truncated: boolean
}

function displayTaxDataValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'number') return value.toLocaleString('zh-CN', { maximumFractionDigits: 6 })
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function readableImportedText(value: unknown, fallback = '') {
  const text = String(value ?? '')
    .replace(/\?{2,}/g, '')
    .replace(/\uFFFD+/g, '')
    .replace(/[|｜·/\s-]+$/g, '')
    .trim()
  return text || fallback
}

function periodEntryDisplayLabel(entry: PeriodEntry) {
  return readableImportedText(entry.label, `${formatMonthRange(entry.months)} 数据`)
}

function sourceFileActionLabel(fileName: string) {
  return fileName.toLowerCase().endsWith('.pdf') ? '预览源文件' : '下载源文件'
}

function recordValue(data: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') return data[key]
  }
  return null
}

function taxDataAmount(value: unknown) {
  if (value === null || value === undefined || value === '' || value === '-') return '-'
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(value)
}

type StandardStatementLine = { section?: string; rowNo?: string; name?: string }

const smallEnterpriseBalanceAssets: StandardStatementLine[] = [
  { section: '流动资产' },
  ...['货币资金|1', '短期投资|2', '应收票据|3', '应收账款|4', '预付账款|5', '应收股利|6', '应收利息|7', '其他应收款|8', '存货|9', '其中：原材料|10', '在产品|11', '库存商品|12', '周转材料|13', '其他流动资产|14', '流动资产合计|15'].map((item) => { const [name, rowNo] = item.split('|'); return { name, rowNo } }),
  { section: '非流动资产' },
  ...['长期债券投资|16', '长期股权投资|17', '固定资产原价|18', '减：累计折旧|19', '固定资产账面价值|20', '在建工程|21', '工程物资|22', '固定资产清理|23', '生产性生物资产|24', '无形资产|25', '开发支出|26', '长期待摊费用|27', '其他非流动资产|28', '非流动资产合计|29', '资产总计|30'].map((item) => { const [name, rowNo] = item.split('|'); return { name, rowNo } }),
]

const smallEnterpriseBalanceLiabilities: StandardStatementLine[] = [
  { section: '流动负债' },
  ...['短期借款|31', '应付票据|32', '应付账款|33', '预收账款|34', '应付职工薪酬|35', '应交税费|36', '应付利息|37', '应付利润|38', '其他应付款|39', '其他流动负债|40', '流动负债合计|41'].map((item) => { const [name, rowNo] = item.split('|'); return { name, rowNo } }),
  { section: '非流动负债' },
  ...['长期借款|42', '长期应付款|43', '递延收益|44', '其他非流动负债|45', '非流动负债合计|46', '负债合计|47'].map((item) => { const [name, rowNo] = item.split('|'); return { name, rowNo } }),
  { section: '所有者权益（或股东权益）' },
  ...['实收资本（或股本）|48', '资本公积|49', '盈余公积|50', '未分配利润|51', '所有者权益（或股东权益）合计|52', '负债和所有者权益（或股东权益）总计|53'].map((item) => { const [name, rowNo] = item.split('|'); return { name, rowNo } }),
]

const smallEnterpriseIncomeLines: StandardStatementLine[] = [
  ...['一、营业收入|1', '减：营业成本|2', '税金及附加|3', '其中：消费税|4', '营业税|5', '城市维护建设税|6', '资源税|7', '土地增值税|8', '城镇土地使用税、房产税、车船税、印花税|9', '教育费附加、矿产资源补偿费、排污费|10', '销售费用|11', '其中：商品维修费|12', '广告费和业务宣传费|13', '管理费用|14', '其中：开办费|15', '业务招待费|16', '研究费用|17', '财务费用|18', '其中：利息费用（收入以“-”号填列）|19', '加：投资收益（损失以“-”号填列）|20', '二、营业利润（亏损以“-”号填列）|21', '加：营业外收入|22', '其中：政府补助|23', '减：营业外支出|24', '其中：坏账损失|25', '无法收回的长期债券投资损失|26', '无法收回的长期股权投资损失|27', '自然灾害等不可抗力因素造成的损失|28', '税收滞纳金|29', '三、利润总额（亏损总额以“-”号填列）|30', '减：所得税费用|31', '四、净利润（净亏损以“-”号填列）|32'].map((item) => { const [name, rowNo] = item.split('|'); return { name, rowNo } }),
]

const smallEnterpriseCashFlowLines: StandardStatementLine[] = [
  { section: '一、经营活动产生的现金流量' },
  ...['销售产成品、商品、提供劳务收到的现金|1', '收到其他与经营活动有关的现金|2', '购买原材料、商品、接受劳务支付的现金|3', '支付的职工薪酬|4', '支付的税费|5', '支付其他与经营活动有关的现金|6', '经营活动产生的现金流量净额|7'].map((item) => { const [name, rowNo] = item.split('|'); return { name, rowNo } }),
  { section: '二、投资活动产生的现金流量' },
  ...['收回短期投资、长期债券投资和长期股权投资收到的现金|8', '取得投资收益收到的现金|9', '处置固定资产、无形资产和其他非流动资产收回的现金净额|10', '短期投资、长期债券投资和长期股权投资支付的现金|11', '购建固定资产、无形资产和其他非流动资产支付的现金|12', '投资活动产生的现金流量净额|13'].map((item) => { const [name, rowNo] = item.split('|'); return { name, rowNo } }),
  { section: '三、筹资活动产生的现金流量' },
  ...['取得借款收到的现金|14', '吸收投资者投资收到的现金|15', '偿还借款本金支付的现金|16', '偿还借款利息支付的现金|17', '分配利润支付的现金|18', '筹资活动产生的现金流量净额|19', '四、现金净增加额|20', '加：期初现金余额|21', '五、期末现金余额|22'].map((item) => { const [name, rowNo] = item.split('|'); return { name, rowNo } }),
]

function normalizedStatementName(value: unknown) {
  return String(value ?? '').replace(/[\s：:（）()“”"'、，,。·-]/g, '')
}

function findStatementRecord(records: TaxDataDetail['records'], line: StandardStatementLine) {
  const target = normalizedStatementName(line.name)
  const byLineCode = line.rowNo ? records.find((record) => (
    String(recordValue(record.data, 'line_code', 'lineCode') ?? '').trim() === line.rowNo
  )) : undefined
  if (byLineCode) return byLineCode
  return records.find((record) => {
    const name = normalizedStatementName(recordValue(record.data, 'line_name', 'lineName', 'item_name', 'itemName'))
    return name === target
  })
}

function statementAmount(record: TaxDataDetail['records'][number] | undefined, type: 'ending' | 'beginning' | 'current' | 'cumulative') {
  if (!record) return '-'
  const keys = type === 'ending' ? ['ending_amount', 'endingAmount']
    : type === 'beginning' ? ['beginning_amount', 'beginningAmount']
      : type === 'current' ? ['current_amount', 'currentAmount']
        : ['cumulative_amount', 'cumulativeAmount']
  return taxDataAmount(recordValue(record.data, ...keys))
}

function statementLineClass(line: StandardStatementLine) {
  const name = line.name || ''
  if (/^[一二三四五]、|合计|净额|利润总额|净利润|营业利润|期末现金余额|现金净增加额/.test(name)) return 'statement-total-row'
  if (/其中|消费税|营业税|城市维护建设税|资源税|土地增值税|城镇土地使用税|教育费附加|广告费|业务招待费|研究费用|利息费用|政府补助|坏账损失|无法收回|自然灾害|税收滞纳金/.test(name)) return 'statement-detail-row'
  return ''
}

function TaxDataRecordView({ slot, detail }: { slot: TaxDataSlot; detail: TaxDataDetail }) {
  const records = detail.records
  const isFinancialStatement = slot.slotId.startsWith('financial-')
  if (!records.length && !isFinancialStatement) return <p className="tax-data-detail-status">该归档已有汇总记录，但没有可展示的标准明细。</p>

  if (slot.slotId === 'vat-return-main') {
    const rows = records.map((record) => ({
      id: record.id,
      rowNo: recordValue(record.data, 'row_no', 'rowNo'),
      name: recordValue(record.data, 'item_name', 'itemName'),
      currentAmount: recordValue(record.data, 'current_amount', 'currentAmount'),
      cumulativeAmount: recordValue(record.data, 'cumulative_amount', 'cumulativeAmount'),
      currentTax: recordValue(record.data, 'current_tax', 'currentTax'),
      cumulativeTax: recordValue(record.data, 'cumulative_tax', 'cumulativeTax'),
    }))
    const vatGroup = (rowNo: unknown) => {
      const number = Number(String(rowNo).match(/^\d+/)?.[0] || 0)
      if (number <= 10) return '销售额'
      if (number <= 24) return '税款计算'
      if (number <= 38) return '税款缴纳'
      return '附加税费'
    }
    const groups = rows.reduce<Array<{ name: string; rows: typeof rows }>>((result, row) => {
      const name = vatGroup(row.rowNo)
      const current = result[result.length - 1]
      if (current?.name === name) current.rows.push(row)
      else result.push({ name, rows: [row] })
      return result
    }, [])
    return <section className="standard-financial-statement vat-return-statement">
      <header><h3>{slot.name}</h3><strong>（一般纳税人适用）</strong><p>税款所属期：{slot.periodLabel}</p><span>金额单位：元（列至角分）</span></header>
      <div className="tax-data-table-wrap financial-statement-table-wrap">
        <table className="tax-data-detail-table vat-return-table">
          <thead><tr><th rowSpan={2}>分类</th><th rowSpan={2}>项目</th><th rowSpan={2}>栏次</th><th colSpan={2}>一般项目</th><th colSpan={2}>即征即退项目</th></tr><tr><th>本月数</th><th>本年累计</th><th>本月数</th><th>本年累计</th></tr></thead>
          <tbody>{groups.flatMap((group) => group.rows.map((row, index) => <tr key={row.id}>{index === 0 ? <td className="vat-group-cell" rowSpan={group.rows.length}>{group.name}</td> : null}<td>{displayTaxDataValue(row.name)}</td><td>{displayTaxDataValue(row.rowNo)}</td><td className="amount-cell">{taxDataAmount(row.currentAmount)}</td><td className="amount-cell">{taxDataAmount(row.cumulativeAmount)}</td><td className="amount-cell">{taxDataAmount(row.currentTax)}</td><td className="amount-cell">{taxDataAmount(row.cumulativeTax)}</td></tr>))}</tbody>
        </table>
      </div>
      <footer>标准表式：增值税及附加税费申报表 · 数据来源：客户上传原始资料</footer>
    </section>
  }


  if (slot.slotId === 'vat-schedule-4') {
    return <section className="standard-financial-statement vat-return-statement">
      <header><h3>增值税及附加税费申报表附列资料（四）</h3><strong>（税额抵减情况表）</strong><p>税款所属期：{slot.periodLabel}</p><span>金额单位：元（列至角分）</span></header>
      <div className="tax-data-table-wrap financial-statement-table-wrap"><table className="tax-data-detail-table vat-schedule-table">
        <thead><tr><th>序号</th><th>抵减项目</th><th>期初余额</th><th>本期发生额</th><th>本期应抵减税额</th><th>本期实际抵减税额</th><th>期末余额</th></tr></thead>
        <tbody>{records.map((record) => <tr key={record.id}><td>{displayTaxDataValue(recordValue(record.data, 'row_no', 'rowNo'))}</td><td>{displayTaxDataValue(recordValue(record.data, 'item_name', 'itemName'))}</td><td className="amount-cell">{taxDataAmount(recordValue(record.data, 'beginning_amount', 'beginningAmount'))}</td><td className="amount-cell">{taxDataAmount(recordValue(record.data, 'current_amount', 'currentAmount'))}</td><td className="amount-cell">{taxDataAmount(recordValue(record.data, 'current_tax', 'currentTax'))}</td><td className="amount-cell">{taxDataAmount(recordValue(record.data, 'actual_credit', 'actualCredit', 'cumulative_tax', 'cumulativeTax'))}</td><td className="amount-cell">{taxDataAmount(recordValue(record.data, 'ending_amount', 'endingAmount'))}</td></tr>)}</tbody>
      </table></div>
      <footer>标准表式：税额抵减情况表 · 数据来源：客户上传原始资料</footer>
    </section>
  }

  if (slot.slotId === 'financial-balance-sheet') {
    const rowCount = Math.max(smallEnterpriseBalanceAssets.length, smallEnterpriseBalanceLiabilities.length)
    const rows = Array.from({ length: rowCount }, (_, index) => [smallEnterpriseBalanceAssets[index], smallEnterpriseBalanceLiabilities[index]] as const)
    const renderBalanceSide = (line: StandardStatementLine | undefined) => {
      if (!line) return <><td /><td /><td /><td /></>
      if (line.section) return <td className="statement-section" colSpan={4}>{line.section}：</td>
      const record = findStatementRecord(records, line)
      return <>
        <td className="statement-name">{line.name}</td>
        <td className="statement-row-no">{line.rowNo}</td>
        <td className="amount-cell">{statementAmount(record, 'ending')}</td>
        <td className="amount-cell">{statementAmount(record, 'beginning')}</td>
      </>
    }
    return <section className="standard-financial-statement">
      <header><h3>资产负债表</h3><p>编制单位：{readableImportedText(detail.sources[0]?.file_name.replace(/20\d{2}.*$/, ''), '当前企业')} · {slot.periodLabel}</p><span>会小企 01 表 · 金额单位：元</span></header>
      <div className="tax-data-table-wrap financial-statement-table-wrap">
        <table className="tax-data-detail-table financial-statement-table balance-sheet-table">
          <thead><tr><th>资产</th><th>行次</th><th>期末余额</th><th>年初余额</th><th>负债和所有者权益</th><th>行次</th><th>期末余额</th><th>年初余额</th></tr></thead>
          <tbody>{rows.map(([asset, liability], index) => <tr key={index}>{renderBalanceSide(asset)}{renderBalanceSide(liability)}</tr>)}</tbody>
        </table>
      </div>
      <footer>标准表式：小企业会计准则 · 数据来源：客户上传原始资料</footer>
    </section>
  }

  const statementLines = slot.slotId === 'financial-income-statement' ? smallEnterpriseIncomeLines
    : slot.slotId === 'financial-cash-flow' ? smallEnterpriseCashFlowLines
      : null
  if (statementLines) return <section className="standard-financial-statement">
    <header>
      <h3>{slot.name}</h3>
      <p>会计期间：{slot.periodLabel}</p>
      <span>{slot.slotId === 'financial-income-statement' ? '会小企 02 表' : '会小企 03 表'} · 金额单位：元</span>
    </header>
    <div className="tax-data-table-wrap financial-statement-table-wrap">
      <table className="tax-data-detail-table financial-statement-table">
        <thead><tr><th>项目</th><th>行次</th><th>本年累计金额</th><th>本期金额</th></tr></thead>
        <tbody>{statementLines.map((line, index) => {
          if (line.section) return <tr key={`${line.section}-${index}`}><td className="statement-section" colSpan={4}>{line.section}：</td></tr>
          const record = findStatementRecord(records, line)
          return <tr key={line.rowNo} className={statementLineClass(line)}><td className="statement-name">{line.name}</td><td className="statement-row-no">{line.rowNo}</td><td className="amount-cell">{statementAmount(record, 'cumulative')}</td><td className="amount-cell">{statementAmount(record, 'current')}</td></tr>
        })}</tbody>
      </table>
    </div>
    <footer>标准表式：小企业会计准则 · 数据来源：客户上传原始资料</footer>
  </section>

  const configurations: Record<string, Array<[string, string[]]>> = {
    'account-balance': [['科目编码', ['account_code', 'accountCode']], ['科目名称', ['account_name', 'accountName']], ['期初借方', ['opening_debit', 'openingDebit']], ['期初贷方', ['opening_credit', 'openingCredit']], ['本期借方', ['current_debit', 'currentDebit']], ['本期贷方', ['current_credit', 'currentCredit']], ['期末借方', ['ending_debit', 'endingDebit']], ['期末贷方', ['ending_credit', 'endingCredit']]],
    ledger: [['日期', ['entry_date', 'entryDate']], ['凭证号', ['voucher_no', 'voucherNo']], ['科目', ['account_name', 'accountName']], ['摘要', ['summary']], ['借方金额', ['debit_amount', 'debitAmount']], ['贷方金额', ['credit_amount', 'creditAmount']], ['余额', ['balance_amount', 'balanceAmount']]],
    payroll: [['员工', ['employee_name', 'employeeName']], ['应发工资', ['gross_pay', 'grossPay']], ['社保', ['social_security', 'socialSecurity']], ['公积金', ['housing_fund', 'housingFund']], ['应纳税所得额', ['taxable_income', 'taxableIncome']], ['代扣个税', ['tax_withheld', 'taxWithheld']]],
    'iit-withholding': [['人员', ['person_name', 'personName']], ['所得项目', ['income_item', 'incomeItem']], ['本期收入', ['current_income', 'currentIncome']], ['累计收入', ['cumulative_income', 'cumulativeIncome']], ['应纳税所得额', ['taxable_income', 'taxableIncome']], ['已扣缴税额', ['tax_withheld', 'taxWithheld']]],
    'invoice-output': [['开票日期', ['invoice_date', 'invoiceDate']], ['发票号码', ['invoice_no', 'invoiceNo']], ['购方名称', ['counterparty_name', 'counterpartyName']], ['商品或服务', ['goods_name', 'goodsName']], ['金额', ['amount']], ['税额', ['tax_amount', 'taxAmount']], ['状态', ['invoice_status', 'invoiceStatus']]],
    'invoice-input': [['开票日期', ['invoice_date', 'invoiceDate']], ['发票号码', ['invoice_no', 'invoiceNo']], ['销方名称', ['counterparty_name', 'counterpartyName']], ['商品或服务', ['goods_name', 'goodsName']], ['金额', ['amount']], ['税额', ['tax_amount', 'taxAmount']], ['状态', ['invoice_status', 'invoiceStatus']]],
  }
  const columns = configurations[slot.slotId]
  if (!columns) return <p className="tax-data-detail-status">该类资料已完成归档，当前没有可视化明细模板。</p>
  const amountLabels = /金额|余额|工资|社保|公积金|所得额|税额/
  return <div className="tax-data-table-wrap">
    <table className="tax-data-detail-table business-table">
      <thead><tr>{columns.map(([label]) => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{records.map((record) => <tr key={record.id}>{columns.map(([label, keys]) => {
        const value = recordValue(record.data, ...keys)
        return <td key={label}>{amountLabels.test(label) ? taxDataAmount(value) : displayTaxDataValue(value)}</td>
      })}</tr>)}</tbody>
    </table>
    {detail.truncated ? <p className="section-helper">当前展示前 500 条，完整记录仍保存在系统中。</p> : null}
  </div>
}

function taxDataSheetPattern(slotId: string) {
  if (slotId === 'financial-balance-sheet') return /资产负债/
  if (slotId === 'financial-income-statement') return /利润|损益/
  if (slotId === 'financial-cash-flow') return /现金流量/
  if (slotId === 'account-balance') return /科目余额|余额表/
  if (slotId === 'ledger') return /明细账|序时账/
  if (slotId === 'payroll') return /工资|薪酬/
  if (slotId === 'iit-withholding') return /个税|所得|申报/
  if (slotId.startsWith('invoice-')) return /发票|开票/
  return /.*/
}

function comparableRecordName(data: Record<string, unknown>) {
  return String(recordValue(data, 'line_name', 'lineName', 'item_name', 'itemName', 'account_name', 'accountName', 'employee_name', 'employeeName', 'person_name', 'personName', 'invoice_no', 'invoiceNo') || '').trim()
}

function numericValues(data: Record<string, unknown>) {
  return Object.entries(data).flatMap(([key, value]) => {
    if (/row|code|date|rate/i.test(key) || value === null || value === undefined || value === '') return []
    const number = Number(String(value).replace(/,/g, ''))
    return Number.isFinite(number) ? [number] : []
  })
}

function rawCellNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const normalized = String(value ?? '').replace(/,/g, '').replace(/[¥￥%]/g, '').trim()
  if (!normalized || !/^-?\d+(?:\.\d+)?$/.test(normalized)) return null
  return Number(normalized)
}

function RawWorkbookComparison({ slot, detail }: { slot: TaxDataSlot; detail: TaxDataDetail }) {
  const source = detail.sources.find((item) => item.stored && /\.xlsx?$/i.test(item.file_name))
  const [sheets, setSheets] = useState<Array<{ name: string; rows: unknown[][] }>>([])
  const [sheetName, setSheetName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!source) return null
  const selectedSheet = sheets.find((sheet) => sheet.name === sheetName) || sheets[0]
  const comparisons = selectedSheet ? detail.records.map((record) => {
    const name = comparableRecordName(record.data)
    const normalizedName = normalizedStatementName(name)
    const rowIndex = normalizedName ? selectedSheet.rows.findIndex((row) => row.some((cell) => (
      normalizedStatementName(cell) === normalizedName
    ))) : -1
    const rawRow = rowIndex >= 0 ? selectedSheet.rows[rowIndex] : []
    const rawNumbers = rawRow.map(rawCellNumber).filter((value): value is number => value !== null)
    const expectedNumbers = numericValues(record.data)
    const valuesMatch = expectedNumbers.every((expected) => rawNumbers.some((actual) => Math.abs(actual - expected) < 0.005))
    return { id: record.id, name: name || `记录 ${record.id}`, rowIndex, matched: rowIndex >= 0 && valuesMatch }
  }) : []
  const matchedCount = comparisons.filter((item) => item.matched).length
  const unmatched = comparisons.filter((item) => !item.matched)

  const loadWorkbook = async () => {
    if (loading || sheets.length) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/tax-data/source?sourceFileId=${encodeURIComponent(source.id)}`, { credentials: 'same-origin' })
      if (!response.ok) throw new Error('原始文件读取失败')
      const XLSX = await import('@e965/xlsx')
      const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array', cellDates: true })
      const parsedSheets = workbook.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false }).slice(0, 500).map((row) => row.slice(0, 50)),
      }))
      const preferred = parsedSheets.find((sheet) => taxDataSheetPattern(slot.slotId).test(sheet.name)) || parsedSheets[0]
      setSheets(parsedSheets)
      setSheetName(preferred?.name || '')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '原始表格解析失败')
    } finally {
      setLoading(false)
    }
  }

  return <section className="tax-data-detail-section raw-workbook-section">
    <div className="panel-title">
      <div><h3>原始表格与差异核对</h3><p className="section-helper">在线读取客户原始 Excel，并自动对应当前标准化表；待复核项以原始文件为准。</p></div>
      {!sheets.length ? <button type="button" className="secondary-button compact-button" onClick={() => void loadWorkbook()} disabled={loading}>{loading ? '正在读取...' : '在线核对原表'}</button> : null}
    </div>
    {error ? <p className="period-warning">{error}</p> : null}
    {selectedSheet ? <>
      <div className="raw-workbook-toolbar">
        <label>原始工作表<select value={selectedSheet.name} onChange={(event) => setSheetName(event.target.value)}>{sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}</select></label>
        <strong>{matchedCount}/{comparisons.length} 行自动对应通过</strong>
        <span className={unmatched.length ? 'has-difference' : 'all-matched'}>{unmatched.length ? `${unmatched.length} 行待复核` : '全部自动对应通过'}</span>
      </div>
      {unmatched.length ? <div className="tax-data-difference-list"><strong>需要复核</strong>{unmatched.slice(0, 20).map((item) => <span key={item.id}>{item.name}{item.rowIndex < 0 ? '：原表未找到对应项目' : '：对应行数值不一致'}</span>)}</div> : null}
      <div className="tax-data-table-wrap raw-workbook-table-wrap">
        <table className="tax-data-detail-table raw-workbook-table"><tbody>{selectedSheet.rows.map((row, rowIndex) => <tr key={rowIndex}><th>{rowIndex + 1}</th>{row.map((cell, cellIndex) => <td key={cellIndex}>{displayTaxDataValue(cell)}</td>)}</tr>)}</tbody></table>
      </div>
    </> : null}
  </section>
}

function PdfSourceReview({ detail }: { detail: TaxDataDetail }) {
  const source = detail.sources.find((item) => item.stored && /\.pdf$/i.test(item.file_name))
  if (!source) return null
  return <section className="tax-data-detail-section source-review-section">
    <div className="panel-title">
      <div><h3>原始资料复核</h3><p className="section-helper">并排打开客户原始 PDF，与当前标准电子表逐项核对。</p></div>
      <a className="secondary-button compact-button" href={`/api/tax-data/source?sourceFileId=${encodeURIComponent(source.id)}`} target="_blank" rel="noreferrer">在线核对原表</a>
    </div>
  </section>
}

function taxDataSlotCoversMonth(slot: TaxDataSlot, month: string) {
  if (slot.status !== 'collected' || !month) return false
  const startMonth = (slot.periodStart || slot.periodEnd).slice(0, 7)
  const endMonth = (slot.periodEnd || slot.periodStart).slice(0, 7)
  return Boolean(startMonth && endMonth && startMonth <= month && month <= endMonth)
}

const taxDataFolderOrder = [
  '增值税资料',
  '企业所得税资料',
  '个人所得税与薪酬',
  '财务报表',
  '账簿资料',
  '发票资料',
  '其他支撑资料',
]

function taxDataPeriodTypeLabel(periodType: TaxDataSlot['periodType']) {
  if (periodType === 'quarter') return '按季度'
  if (periodType === 'year') return '按年度'
  if (periodType === 'range') return '按期间'
  return '按月'
}

function taxDataHasElectronicTemplate(slot: TaxDataSlot) {
  return slot.parserType.includes('fixed')
}

function EmptyElectronicTemplate({ slot }: { slot: TaxDataSlot }) {
  const vatSchedules = slot.slotId === 'vat-other-schedules'
    ? ['增值税及附加税费申报表附列资料（一）', '增值税及附加税费申报表附列资料（二）', '增值税及附加税费申报表附列资料（三）', '增值税减免税申报明细表']
    : []
  return <section className="empty-electronic-template">
    <header><h3>{slot.name}</h3><p>{slot.periodLabel || '当前期间'} · 标准电子表</p><span>状态：尚未收录</span></header>
    {vatSchedules.length ? (
      <table className="tax-data-detail-table"><thead><tr><th>标准表单</th><th>收录状态</th></tr></thead><tbody>{vatSchedules.map((name) => <tr key={name}><td>{name}</td><td>待上传</td></tr>)}</tbody></table>
    ) : (
      <table className="tax-data-detail-table"><thead><tr><th>行次</th><th>项目</th><th>本期金额</th><th>累计金额</th></tr></thead><tbody><tr><td colSpan={4}>尚未上传本期原始资料，当前仅展示标准电子表入口。</td></tr></tbody></table>
    )}
  </section>
}

function taxDataParserTypeLabel(parserType: string) {
  if (parserType === 'source_evidence') return '原始证据'
  if (parserType.includes('fixed')) return '标准模板'
  return '字段映射'
}

type ManagedRule = {
  code: string
  name: string
  taxType: string
  level: RiskLevel
  basis: string
  suggestion: string
  enabled: boolean
  conditionText: string
  conditionJson: RuleCondition
  requiredFields: string[]
  materials: string[]
  createdAt?: string
  updatedAt?: string
}

type StructuredRiskFinding = CompleteStructuredRiskFindingShape
type StructuredReport = CompleteStructuredReportShape

type Report = {
  id: string
  clientId: string
  clientName: string
  riskLevel: RiskLevel
  createdAt: string
  risks: RiskResult[]
  content: string
  structured?: StructuredReport
  aiReview?: AiReview
  aiGenerated?: boolean
  aiModel?: string
}

type AuthUser = {
  id: string
  username: string
  role: 'user' | 'admin'
  actor: {
    id: string
    username: string
    role: 'user' | 'admin'
  } | null
}

type AdminUser = {
  id: string
  username: string
  role: 'user' | 'admin'
  disabledAt: string | null
  createdAt: string
  clientsCount: number
  reportsCount: number
}

const emptyClient: Client = {
  id: '',
  name: '',
  projectScope: '单主体',
  groupName: '',
  entityRole: '单体企业',
  creditCode: '',
  region: '上海',
  industry: '商贸',
  taxpayerType: '小规模纳税人',
  establishedAt: '2024-01-01',
  analysisPeriodType: '年度',
  analysisYear: '2024',
  analysisQuarter: '',
  analysisMonth: '',
  periodStartDate: '2024-01-01',
  periodEndDate: '2024-12-31',
  dataBasis: '申报数据',
  comparisonPeriod: '',
  periodEntries: [],
  monthlyRevenue: 98000,
  monthlyInvoice: 76000,
  monthlyCost: 52000,
  monthlyProfit: 12000,
  annualRevenue: 1180000,
  consecutive12MonthSales: 1180000,
  platformRevenue: 0,
  collectionFlow: 98000,
  employees: 8,
  socialSecurityCount: 5,
  salaryDeclaredCount: 8,
  laborCount: 0,
  payrollTotal: 420000,
  entertainmentExpense: 0,
  adExpense: 0,
  welfareExpense: 0,
  unionExpense: 0,
  educationExpense: 0,
  taxableIncome: 240000,
  assetsTotal: 1800000,
  employeeAnnualAvg: 8,
  privateAccountCollection: false,
  unbilledIncome: false,
  largeExpenseNoInvoice: false,
  serviceFeeInvoices: false,
  relatedTransactions: false,
  longTermZeroDeclaration: false,
  longTermLoss: false,
  inventoryAbnormal: false,
  purchaseSalesMismatch: false,
  relatedEntitiesNearThreshold: false,
  nearVatExemption: false,
  prepaidLongTerm: false,
  supplierNoInput: false,
  invoiceNameMismatch: false,
  fundsReturn: false,
  abnormalInvoice: false,
  nonFinancialInterestAbnormal: false,
  intercompanyManagementFee: false,
  relatedPricingAbnormal: false,
  salarySplit: false,
  noIitWithholding: false,
  individualVendorRelated: false,
  smallProfitEnjoyed: true,
  taxBenefitDataMissing: false,
  rdDeductionEnjoyed: false,
  rdDocsInsufficient: false,
  agencyComplianceRisk: false,
  previousQuarterEmployees: 8,
  quarterRevenue: 294000,
  previousQuarterRevenue: 280000,
  quarterCostExpense: 156000,
  previousQuarterCostExpense: 148000,
  ytdRevenue: 1180000,
  ytdCostExpense: 720000,
  ytdProfit: 240000,
  peopleRelatedExpense: 0,
  rentalArea: 120,
  subleaseArea: 0,
  monthlyMealBenefitExpense: 0,
  decorationExpense: 0,
  ebitProfit: 260000,
  previousYearEbitProfit: 240000,
  budgetEbitProfit: 250000,
  budgetRevenue: 1200000,
  previousYearRevenue: 980000,
  mainBusinessRevenue: 1180000,
  mainBusinessCost: 720000,
  goodsSalesRevenue: 0,
  goodsCost: 0,
  redVatSpecialInvoiceAmount: 0,
  outputTax: 0,
  inputTax: 0,
  vatTaxPayable: 0,
  taxableSales: 1180000,
  theoreticalVatTax: 0,
  budgetVatTax: 0,
  priorTaxableSales: 980000,
  priorVatTaxPayable: 0,
  vatRateSpread: 0,
  advertisingServiceRevenue: 0,
  cultureConstructionFeePaid: 0,
  otherReceivableAgencyBalance: 0,
  nonOperatingExpense: 0,
  nonOperatingIncome: 0,
  endingVatCredit: 0,
  nonPayrollPersonalPayment: 0,
  manualDerivedFields: {},
  manualDerivedReasons: {},
}

const blankClient: Client = {
  ...emptyClient,
  region: '',
  industry: '',
  taxpayerType: '',
  establishedAt: '',
  analysisPeriodType: '',
  analysisYear: '',
  analysisQuarter: '',
  analysisMonth: '',
  periodStartDate: '',
  periodEndDate: '',
  dataBasis: '管理报表',
  comparisonPeriod: '',
  periodEntries: [],
  monthlyRevenue: 0,
  monthlyInvoice: 0,
  monthlyCost: 0,
  monthlyProfit: 0,
  annualRevenue: 0,
  consecutive12MonthSales: 0,
  collectionFlow: 0,
  employees: 0,
  socialSecurityCount: 0,
  salaryDeclaredCount: 0,
  payrollTotal: 0,
  taxableIncome: 0,
  assetsTotal: 0,
  employeeAnnualAvg: 0,
  smallProfitEnjoyed: false,
  previousQuarterEmployees: 0,
  quarterRevenue: 0,
  previousQuarterRevenue: 0,
  quarterCostExpense: 0,
  previousQuarterCostExpense: 0,
  ytdRevenue: 0,
  ytdCostExpense: 0,
  ytdProfit: 0,
  peopleRelatedExpense: 0,
  rentalArea: 0,
  subleaseArea: 0,
  monthlyMealBenefitExpense: 0,
  decorationExpense: 0,
  ebitProfit: 0,
  previousYearEbitProfit: 0,
  budgetEbitProfit: 0,
  budgetRevenue: 0,
  previousYearRevenue: 0,
  mainBusinessRevenue: 0,
  mainBusinessCost: 0,
  goodsSalesRevenue: 0,
  goodsCost: 0,
  redVatSpecialInvoiceAmount: 0,
  outputTax: 0,
  inputTax: 0,
  vatTaxPayable: 0,
  taxableSales: 0,
  theoreticalVatTax: 0,
  budgetVatTax: 0,
  priorTaxableSales: 0,
  priorVatTaxPayable: 0,
  vatRateSpread: 0,
  advertisingServiceRevenue: 0,
  cultureConstructionFeePaid: 0,
  otherReceivableAgencyBalance: 0,
  nonOperatingExpense: 0,
  nonOperatingIncome: 0,
  endingVatCredit: 0,
  nonPayrollPersonalPayment: 0,
}

const blankDraftClient = () => deriveClientMetrics({ ...blankClient, id: crypto.randomUUID() })

function clientFromReport(report: Report): Client {
  return deriveClientMetrics({
    ...blankClient,
    id: report.clientId || report.id,
    name: report.clientName || '历史报告',
    periodEntries: [],
  })
}

const demoPeriodMonths = monthsBetween('2024-01', '2025-12')

function demoSavedAt(index: number) {
  const hour = String(10 + Math.floor(index / 60)).padStart(2, '0')
  const minute = String(index % 60).padStart(2, '0')
  return `2026/06/23 ${hour}:${minute}:00`
}

function attachDemoPeriods(client: Client): Client {
  const baseClient = deriveClientMetrics({
    ...client,
    analysisPeriodType: '月度',
    analysisYear: '2025',
    analysisMonth: '2025-12',
    periodStartDate: '',
    periodEndDate: '',
    periodEntries: [],
  })
  const periodEntries = demoPeriodMonths.map((month, index) => {
    const snapshot = deriveClientMetrics({
      ...baseClient,
      analysisYear: month.slice(0, 4),
      analysisMonth: month,
      periodEntries: [],
    })
    return createPeriodEntry(snapshot, snapshot, demoSavedAt(index))
  })
  return { ...baseClient, periodEntries }
}

function createDemoClient(seed: Partial<Client>): Client {
  return attachDemoPeriods({
    ...emptyClient,
    id: crypto.randomUUID(),
    projectScope: '单主体',
    entityRole: '单体企业',
    taxpayerType: '一般纳税人',
    analysisPeriodType: '月度',
    analysisYear: '2025',
    analysisMonth: '2025-01',
    dataBasis: '申报数据',
    periodEntries: [],
    ...seed,
  })
}

function createDemoClients(): Client[] {
  return [
    createDemoClient({
      name: '低风险测试案例-上海稳健科技有限公司',
      creditCode: 'TESTLOW202501',
      region: '上海',
      industry: '软件和信息技术服务',
      monthlyRevenue: 200000,
      monthlyInvoice: 200000,
      monthlyCost: 120000,
      monthlyProfit: 50000,
      annualRevenue: 2400000,
      consecutive12MonthSales: 2400000,
      collectionFlow: 200000,
      employees: 20,
      socialSecurityCount: 20,
      salaryDeclaredCount: 20,
      payrollTotal: 1200000,
      taxableIncome: 600000,
      assetsTotal: 12000000,
      employeeAnnualAvg: 20,
      previousQuarterEmployees: 20,
      budgetEbitProfit: 600000,
      previousYearEbitProfit: 600000,
      budgetRevenue: 2400000,
      previousYearRevenue: 2400000,
      theoreticalVatTax: 120000,
      budgetVatTax: 120000,
      priorTaxableSales: 2300000,
      priorVatTaxPayable: 115000,
      outputTax: 260000,
      inputTax: 140000,
      vatTaxPayable: 120000,
      rentalArea: 180,
    }),
    createDemoClient({
      name: '中风险测试案例-杭州临界商贸有限公司',
      creditCode: 'TESTMID2025Q1',
      region: '浙江',
      industry: '商贸服务',
      taxpayerType: '小规模纳税人',
      analysisPeriodType: '季度',
      analysisYear: '2025',
      analysisQuarter: 'Q1',
      dataBasis: '管理报表',
      monthlyRevenue: 95000,
      monthlyInvoice: 92000,
      monthlyCost: 62000,
      monthlyProfit: 18000,
      annualRevenue: 1140000,
      consecutive12MonthSales: 1140000,
      collectionFlow: 100000,
      nearVatExemption: true,
      prepaidLongTerm: true,
      largeExpenseNoInvoice: true,
      employees: 8,
      socialSecurityCount: 8,
      salaryDeclaredCount: 8,
      payrollTotal: 480000,
      taxableIncome: 216000,
      assetsTotal: 4800000,
      employeeAnnualAvg: 8,
      previousQuarterEmployees: 8,
      budgetEbitProfit: 216000,
      previousYearEbitProfit: 216000,
      budgetRevenue: 1140000,
      previousYearRevenue: 1140000,
      theoreticalVatTax: 34200,
      budgetVatTax: 34200,
      priorTaxableSales: 1080000,
      priorVatTaxPayable: 32400,
      outputTax: 34200,
      inputTax: 0,
      vatTaxPayable: 34200,
      rentalArea: 90,
    }),
    createDemoClient({
      name: '高风险测试案例-苏州异常贸易有限公司',
      creditCode: 'TESTHIGH2025Y',
      region: '江苏',
      industry: '大宗贸易',
      analysisPeriodType: '年度',
      analysisYear: '2025',
      periodStartDate: '2025-01-01',
      periodEndDate: '2025-12-31',
      dataBasis: '混合口径',
      monthlyRevenue: 420000,
      monthlyInvoice: 180000,
      monthlyCost: 390000,
      monthlyProfit: 8000,
      annualRevenue: 5040000,
      consecutive12MonthSales: 5040000,
      collectionFlow: 560000,
      employees: 18,
      socialSecurityCount: 9,
      salaryDeclaredCount: 18,
      payrollTotal: 1260000,
      taxableIncome: 96000,
      assetsTotal: 18000000,
      employeeAnnualAvg: 18,
      previousQuarterEmployees: 18,
      privateAccountCollection: true,
      unbilledIncome: true,
      serviceFeeInvoices: true,
      supplierNoInput: true,
      purchaseSalesMismatch: true,
      fundsReturn: true,
      abnormalInvoice: true,
      budgetEbitProfit: 96000,
      previousYearEbitProfit: 96000,
      budgetRevenue: 5040000,
      previousYearRevenue: 5040000,
      theoreticalVatTax: 260000,
      budgetVatTax: 260000,
      priorTaxableSales: 4800000,
      priorVatTaxPayable: 240000,
      outputTax: 655200,
      inputTax: 395200,
      vatTaxPayable: 260000,
      rentalArea: 160,
    }),
  ]
}

const emptyManagedRule: ManagedRule = {
  code: '',
  name: '',
  taxType: '',
  level: '中',
  basis: '',
  suggestion: '',
  enabled: true,
  conditionText: '',
  conditionJson: emptyRuleCondition,
  requiredFields: [],
  materials: [],
}

const pctDiff = (a: number, b: number) => {
  if (!b) return a > 0 ? 1 : 0
  return (a - b) / b
}

const rules: RiskRule[] = [
  {
    code: 'R001',
    name: '小规模纳税人连续 12 个月销售额超 500 万未登记',
    taxType: '增值税',
    level: '高',
    basis: '增值税一般纳税人登记标准；连续 12 个月或 4 个季度累计应征增值税销售额口径。',
    caseRef: '江苏税务拆分经营、隐匿收入、逃避一般纳税人登记典型案例。',
    trigger: (c) => c.taxpayerType === '小规模纳税人' && c.consecutive12MonthSales > 5_000_000,
    reason: (c) => `连续 12 个月销售额为 ${money(c.consecutive12MonthSales)}，已超过 500 万元标准，但纳税人类型仍为小规模纳税人。`,
    suggestion: '复核连续期间销售额、未开票收入及一般纳税人登记时点，必要时及时办理登记和申报调整。',
    materials: ['连续 12 个月销售台账', '开票明细', '未开票收入明细', '申报表'],
  },
  {
    code: 'R002',
    name: '关联主体拆分经营规避一般纳税人登记',
    taxType: '增值税、企业所得税',
    level: '高',
    basis: '税务部门对关联主体拆分经营、隐匿收入的公开稽查口径。',
    caseRef: '江苏税务 2026 年典型案例。',
    trigger: (c) => c.relatedEntitiesNearThreshold,
    reason: () => '存在多个关联主体销售额接近 500 万元、业务和人员可能重合的情况。',
    suggestion: '核查商业实质、人员独立性、资金流、合同流和货物流，避免被认定为人为拆分经营。',
    materials: ['关联主体清单', '股东/法人关系', '银行流水', '合同和物流资料'],
  },
  {
    code: 'R003',
    name: '小规模月销售额长期卡在 10 万元免税临界点附近',
    taxType: '增值税',
    level: '中',
    basis: '小规模纳税人月销售额 10 万元以下免征增值税政策。',
    caseRef: '小规模优惠适用风险。',
    trigger: (c) => c.taxpayerType !== '一般纳税人' && c.nearVatExemption,
    reason: () => '月销售额长期接近 10 万元免税临界点，且可能存在未开票收入或收款差异。',
    suggestion: '复核收入确认节奏和全部收款渠道，避免为享受免税政策人为调节收入。',
    materials: ['月度销售台账', '收款流水', '开票明细'],
  },
  {
    code: 'R004',
    name: '实际收款或经营流水显著高于开票金额',
    taxType: '增值税、企业所得税',
    level: '高',
    basis: '税收征管法关于不申报、少缴税款责任。',
    caseRef: '网络主播平台收入与申报收入不匹配案例。',
    trigger: (c) => pctDiff(c.collectionFlow, c.monthlyInvoice) > 0.2,
    reason: (c) => `月收款流水 ${money(c.collectionFlow)}，月开票金额 ${money(c.monthlyInvoice)}，差异超过 20%。`,
    suggestion: '核对银行、微信、支付宝、平台等全部收款渠道，确认未开票收入是否已依法申报。',
    materials: ['银行流水', '第三方支付流水', '开票明细', '纳税申报表'],
  },
  {
    code: 'R005',
    name: '个人账户收取经营款',
    taxType: '增值税、企业所得税、个人所得税',
    level: '高',
    basis: '税收征管法；公开私户收款隐匿收入案例。',
    caseRef: '网络主播、加油站、医美等私户收款案例。',
    trigger: (c) => c.privateAccountCollection,
    reason: () => '存在法人、股东、员工或亲属个人账户收取企业经营款的情况。',
    suggestion: '梳理个人账户收款明细并进行账税一致性复核，推动经营收款回归企业账户。',
    materials: ['个人账户流水', '付款凭证', '企业收入台账'],
  },
  {
    code: 'R006',
    name: '长期零申报但存在经营迹象',
    taxType: '增值税、企业所得税',
    level: '高',
    basis: '税收征管法关于不申报、少缴税款责任。',
    caseRef: '零申报与经营事实不匹配风险。',
    trigger: (c) => c.longTermZeroDeclaration && (c.employees > 0 || c.collectionFlow > 0 || c.monthlyInvoice > 0),
    reason: (c) => `企业标记为长期零申报，但存在 ${c.employees} 名员工或 ${money(c.collectionFlow)} 收款流水。`,
    suggestion: '核查收入、成本、费用和申报记录，确认是否存在应申报未申报。',
    materials: ['申报记录', '员工名册', '流水明细', '租赁合同'],
  },
  {
    code: 'R007',
    name: '预收款或其他应付款长期挂账未确认收入',
    taxType: '增值税、企业所得税',
    level: '中',
    basis: '收入确认和税收征管相关规则。',
    caseRef: '预收账款长期挂账隐匿收入风险。',
    trigger: (c) => c.prepaidLongTerm,
    reason: () => '存在预收账款或其他应付款长期挂账，可能已有商品或服务交付。',
    suggestion: '复核合同履约节点、交付记录和收入确认时点，避免延迟申报收入。',
    materials: ['合同', '交付验收记录', '预收款明细'],
  },
  {
    code: 'R008',
    name: '成本费用无合法有效税前扣除凭证',
    taxType: '企业所得税',
    level: '中',
    basis: '企业所得税税前扣除凭证管理办法：真实性、合法性、关联性。',
    caseRef: '税前扣除凭证不合规风险。',
    trigger: (c) => c.largeExpenseNoInvoice,
    reason: () => '存在大额成本费用缺少发票或其他合规税前扣除凭证。',
    suggestion: '补充合同、付款记录、验收记录、发票或其他合规凭证，汇算清缴前完成复核。',
    materials: ['费用明细', '合同', '付款凭证', '发票或收款凭证'],
  },
  {
    code: 'R009',
    name: '大额咨询费/服务费/营销费集中取得发票',
    taxType: '增值税、企业所得税',
    level: '高',
    basis: '发票管理办法；税前扣除凭证管理办法。',
    caseRef: '江苏税务涉税中介虚列成本案例。',
    trigger: (c) => c.serviceFeeInvoices,
    reason: () => '存在短期集中取得咨询费、服务费、营销费发票，需复核服务真实性。',
    suggestion: '核查服务成果、合同、付款、人员参与和业务实质，避免虚列成本或接受虚开发票。',
    materials: ['服务合同', '服务成果', '付款流水', '开票方资料'],
  },
  {
    code: 'R010',
    name: '开票方只有销项、几乎无进项',
    taxType: '增值税、企业所得税',
    level: '高',
    basis: '发票管理办法；异常开票主体识别逻辑。',
    caseRef: '涉税中介案例中个体户仅有销售发票且流向集中。',
    trigger: (c) => c.supplierNoInput,
    reason: () => '主要供应商可能只有销项、缺少进项或真实经营能力。',
    suggestion: '复核供应商人员、场地、进货、物流和纳税状态，必要时暂停抵扣或税前扣除。',
    materials: ['供应商工商信息', '供应商发票流', '物流和验收资料'],
  },
  {
    code: 'R011',
    name: '发票品名与经营范围或实际业务明显不符',
    taxType: '增值税、企业所得税',
    level: '高',
    basis: '发票管理办法；司法解释关于虚列支出、虚抵进项。',
    caseRef: '异常发票品名风险。',
    trigger: (c) => c.invoiceNameMismatch,
    reason: () => '采购发票品名与企业经营范围、收入品类或库存品类明显不匹配。',
    suggestion: '核查发票品名、合同内容和实际交易资料，确认交易真实性。',
    materials: ['发票明细', '采购合同', '入库单', '经营范围'],
  },
  {
    code: 'R012',
    name: '进销品类严重不匹配',
    taxType: '增值税、企业所得税',
    level: '高',
    basis: '发票及业务真实性监管逻辑。',
    caseRef: '进销背离、虚开风险案例。',
    trigger: (c) => c.purchaseSalesMismatch,
    reason: () => '销售品类与采购品类长期无法形成合理对应关系。',
    suggestion: '核查库存、物流、合同、收付款和商品流，形成完整业务证据链。',
    materials: ['采购明细', '销售明细', '出入库单', '物流单据'],
  },
  {
    code: 'R013',
    name: '采购付款后资金回流',
    taxType: '增值税、企业所得税',
    level: '高',
    basis: '发票管理办法；虚开发票案件资金回流特征。',
    caseRef: '公开虚开案件中的资金异常回流。',
    trigger: (c) => c.fundsReturn,
    reason: () => '采购付款后资金经供应商、个人账户或关联方回流。',
    suggestion: '重点核查交易真实性和资金闭环，排查购买发票、虚列成本风险。',
    materials: ['银行流水', '供应商收款记录', '关联方流水'],
  },
  {
    code: 'R014',
    name: '作废、红冲、异常或重复发票仍入账',
    taxType: '增值税、企业所得税',
    level: '高',
    basis: '发票管理办法；税前扣除凭证管理办法。',
    caseRef: '异常发票入账抵扣风险。',
    trigger: (c) => c.abnormalInvoice,
    reason: () => '存在作废、红冲、异常或重复发票仍用于入账、抵扣或扣除。',
    suggestion: '核验发票状态，调整进项税额或成本费用并补充说明。',
    materials: ['发票查验结果', '入账凭证', '进项抵扣明细'],
  },
  {
    code: 'R015',
    name: '业务招待费税前扣除超限',
    taxType: '企业所得税',
    level: '中',
    basis: '企业所得税法实施条例：业务招待费按发生额 60% 且不超过销售收入 5‰ 扣除。',
    caseRef: '汇算清缴纳税调增风险。',
    trigger: (c) => Math.min(c.entertainmentExpense * 0.6, c.annualRevenue * 0.005) < c.entertainmentExpense,
    reason: (c) => `业务招待费 ${money(c.entertainmentExpense)}，需按发生额 60% 与销售收入 5‰ 孰低测算。`,
    suggestion: '汇算清缴时准确测算可扣除限额，对超限部分纳税调增。',
    materials: ['业务招待费明细', '销售收入明细', '汇算清缴底稿'],
  },
  {
    code: 'R016',
    name: '广告费和业务宣传费税前扣除超限',
    taxType: '企业所得税',
    level: '中',
    basis: '企业所得税法实施条例：一般行业广告和业务宣传费不超过销售收入 15%。',
    caseRef: '广告宣传费扣除超限风险。',
    trigger: (c) => c.adExpense > c.annualRevenue * 0.15,
    reason: (c) => `广告宣传费 ${money(c.adExpense)}，超过年销售收入 ${money(c.annualRevenue)} 的 15%。`,
    suggestion: '区分当期扣除和以后年度结转，避免全额当期扣除。',
    materials: ['广告合同', '投放记录', '费用明细'],
  },
  {
    code: 'R017',
    name: '职工福利费、工会经费、职工教育经费超限',
    taxType: '企业所得税',
    level: '中',
    basis: '企业所得税法实施条例：福利费 14%、工会经费 2%、职工教育经费按适用比例扣除。',
    caseRef: '工资薪金相关费用扣除超限风险。',
    trigger: (c) =>
      c.welfareExpense > c.payrollTotal * 0.14 ||
      c.unionExpense > c.payrollTotal * 0.02 ||
      c.educationExpense > c.payrollTotal * 0.08,
    reason: (c) => `工资薪金总额 ${money(c.payrollTotal)}，相关职工费用存在超限可能。`,
    suggestion: '按工资薪金总额测算扣除限额，对超限部分纳税调增或结转。',
    materials: ['工资表', '福利费明细', '工会经费凭证', '教育经费明细'],
  },
  {
    code: 'R018',
    name: '非金融企业借款利息扣除异常',
    taxType: '企业所得税',
    level: '中',
    basis: '企业所得税法实施条例关于非金融企业借款利息扣除规则。',
    caseRef: '关联方和民间借贷利息扣除风险。',
    trigger: (c) => c.nonFinancialInterestAbnormal,
    reason: () => '存在非金融企业或个人借款利息异常，可能缺少合同、流水或合理利率依据。',
    suggestion: '补充借款合同、资金流水、利率依据和发票/凭证，复核税前扣除金额。',
    materials: ['借款合同', '银行流水', '利率说明', '利息凭证'],
  },
  {
    code: 'R019',
    name: '企业之间支付管理费异常',
    taxType: '企业所得税',
    level: '中',
    basis: '企业所得税法实施条例第四十九条。',
    caseRef: '关联企业费用转移风险。',
    trigger: (c) => c.intercompanyManagementFee,
    reason: () => '存在企业之间支付管理费，可能缺少真实服务内容或分摊依据。',
    suggestion: '复核服务实质、分摊方法、合同和成果，避免不合规税前扣除。',
    materials: ['管理服务合同', '分摊依据', '服务成果'],
  },
  {
    code: 'R020',
    name: '关联交易价格或利润率明显异常',
    taxType: '企业所得税、增值税',
    level: '高',
    basis: '税收征管法；关联交易和编造虚假计税依据风险。',
    caseRef: '转移利润、关联交易不公允风险。',
    trigger: (c) => c.relatedPricingAbnormal,
    reason: () => '关联采购、销售价格或利润率明显偏离市场水平。',
    suggestion: '补充市场价格依据、定价政策和关联交易资料，复核是否存在利润转移。',
    materials: ['关联交易合同', '定价说明', '可比价格资料'],
  },
  {
    code: 'R021',
    name: '工资申报人数与社保人数不一致',
    taxType: '个人所得税、社保费、企业所得税',
    level: '高',
    basis: '扣缴义务和社保费征管趋势。',
    caseRef: '税务、人社联合合规缴纳社保案例。',
    trigger: (c) => Math.abs(c.salaryDeclaredCount - c.socialSecurityCount) >= 3,
    reason: (c) => `工资申报人数 ${c.salaryDeclaredCount} 人，社保缴纳人数 ${c.socialSecurityCount} 人，差异较大。`,
    suggestion: '解释劳务、退休返聘、实习等特殊情形，复核个税扣缴和社保缴纳一致性。',
    materials: ['工资表', '社保缴纳清单', '劳动合同', '劳务协议'],
  },
  {
    code: 'R022',
    name: '工资通过报销、劳务费或个体户发票拆分发放',
    taxType: '个人所得税、企业所得税、增值税',
    level: '高',
    basis: '司法解释关于转换收入性质、虚列支出；骗享税费优惠典型案件。',
    caseRef: '员工工资伪造成个体户咨询收入案例。',
    trigger: (c) => c.salarySplit,
    reason: () => '同一员工或团队可能同时取得工资、报销、劳务费或个体户服务费。',
    suggestion: '按收入实质复核是否属于工资薪金，避免应扣未扣个税和虚开发票风险。',
    materials: ['工资表', '报销单', '劳务合同', '个体户发票'],
  },
  {
    code: 'R023',
    name: '劳务报酬或佣金未履行个税扣缴',
    taxType: '个人所得税',
    level: '高',
    basis: '个人所得税法实施条例；征管法关于扣缴义务人责任。',
    caseRef: '平台、MCN、佣金扣缴风险。',
    trigger: (c) => c.noIitWithholding,
    reason: () => '向自然人支付劳务费、佣金、推广费等，但可能无扣缴申报记录。',
    suggestion: '补充自然人身份、合同、付款和扣缴申报资料，复核应扣未扣责任。',
    materials: ['自然人信息', '付款明细', '扣缴申报记录'],
  },
  {
    code: 'R024',
    name: '平台销售/直播数据与申报收入不匹配',
    taxType: '增值税、个人所得税、企业所得税',
    level: '高',
    basis: '互联网平台企业涉税信息报送规定；税务部门网络主播案例。',
    caseRef: '平台收入、个人账户收款、申报收入严重不匹配案例。',
    trigger: (c) => c.platformRevenue > 0 && pctDiff(c.platformRevenue, c.monthlyRevenue) > 0.2,
    reason: (c) => `平台收入 ${money(c.platformRevenue)}，月收入 ${money(c.monthlyRevenue)}，差异超过 20%。`,
    suggestion: '导出平台收入明细，与申报收入、收款流水、开票数据逐项核对。',
    materials: ['平台后台收入', '订单明细', '佣金明细', '申报表'],
  },
  {
    code: 'R025',
    name: '个体户或个人独资企业承接原企业员工/股东服务',
    taxType: '个人所得税、企业所得税、增值税',
    level: '高',
    basis: '涉税中介虚列成本案例；骗享小规模优惠案例。',
    caseRef: '关联个体户开具服务费发票风险。',
    trigger: (c) => c.individualVendorRelated,
    reason: () => '供应商可能为员工、离职员工、股东或亲属设立的个体户/工作室。',
    suggestion: '核查服务真实性和人员关系，避免转换收入性质、虚构服务或虚列成本。',
    materials: ['供应商工商信息', '人员关系说明', '服务成果'],
  },
  {
    code: 'R026',
    name: '小型微利企业优惠条件不匹配',
    taxType: '企业所得税',
    level: '中',
    basis: '小型微利企业条件：应纳税所得额、从业人数、资产总额等。',
    caseRef: '小微优惠条件错配风险。',
    trigger: (c) =>
      c.smallProfitEnjoyed && (c.taxableIncome > 3_000_000 || c.employeeAnnualAvg > 300 || c.assetsTotal > 50_000_000),
    reason: (c) =>
      `企业享受小型微利优惠，但应纳税所得额 ${money(c.taxableIncome)}、人数 ${c.employeeAnnualAvg}、资产 ${money(c.assetsTotal)} 需复核。`,
    suggestion: '复核汇算清缴基础信息，确认是否满足小型微利企业条件。',
    materials: ['年度申报表', '资产负债表', '员工人数测算表'],
  },
  {
    code: 'R027',
    name: '骗享或不当享受税费优惠',
    taxType: '增值税、企业所得税、个人所得税',
    level: '高',
    basis: '税务总局骗享税费优惠典型案件；司法解释关于提供虚假材料骗取优惠。',
    caseRef: '利用小规模、即征即退等政策骗享优惠案例。',
    trigger: (c) => c.taxBenefitDataMissing,
    reason: () => '企业享受税费优惠，但资格资料或业务真实性资料不足。',
    suggestion: '逐项核查政策条件、备案或留存资料和业务实质。',
    materials: ['优惠政策适用说明', '备案资料', '业务真实性资料'],
  },
  {
    code: 'R028',
    name: '研发费用加计扣除资料不足或费用归集异常',
    taxType: '企业所得税',
    level: '中',
    basis: '研发费用加计扣除政策及资料留存要求。',
    caseRef: '江苏税务提示研发费用加计扣除适用不规范风险。',
    trigger: (c) => c.rdDeductionEnjoyed && c.rdDocsInsufficient,
    reason: () => '企业享受研发费用加计扣除，但研发项目、工时、材料、成果资料可能不足。',
    suggestion: '补充项目立项、人员工时、费用归集、成果证明等资料。',
    materials: ['研发立项书', '工时记录', '费用归集表', '成果资料'],
  },
  {
    code: 'R029',
    name: '库存、销售、采购数据异常',
    taxType: '增值税、企业所得税',
    level: '中',
    basis: '税前扣除真实性原则、货物流与发票流匹配监管逻辑。',
    caseRef: '库存、进销、发票流不匹配风险。',
    trigger: (c) => c.inventoryAbnormal,
    reason: () => '存在库存为负、采购销售不匹配、账实不符或异常库存变化。',
    suggestion: '核查出入库、物流、盘点和发票资料，补齐货物流证据。',
    materials: ['库存台账', '盘点表', '入库单', '出库单'],
  },
  {
    code: 'R030',
    name: '涉税服务或内部人员协助虚列成本/恶意筹划',
    taxType: '综合风险',
    level: '高',
    basis: '涉税专业服务监管和公开涉税中介处罚案例。',
    caseRef: '江苏税务涉税中介虚列成本案例；税务总局新闻发布会。',
    trigger: (c) => c.agencyComplianceRisk,
    reason: () => '涉税服务人员或企业内部人员可能存在批量使用空壳主体、设计虚列成本方案等风险。',
    suggestion: '建立业务准入、异常开票、服务成果留痕和内部审核机制。',
    materials: ['业务准入资料', '服务底稿', '异常开票记录', '内部审核记录'],
  },
]

const candidateRules: RiskRule[] = [
  {
    code: 'ON-001',
    name: '主体无人员或人员变动异常',
    taxType: '通用财务/经营',
    level: '中',
    basis: '脱敏税务风险预警指标：期末人数为 0，或本期人数较上期下降 50% 以上。',
    caseRef: '自动检测候选：人员人数、上季度末人数。',
    conditionJson: { any: [{ field: 'employees', operator: '<=', value: 0 }, { field: 'employees', operator: '<', value: 0, compareField: 'previousQuarterEmployees', multiplier: 0.5 }] },
    requiredFields: ['previousQuarterEmployees'],
    trigger: (c) => c.employees <= 0 || c.employees < c.previousQuarterEmployees * 0.5,
    reason: (c) => `当前员工人数 ${c.employees} 人，上季度末人数 ${c.previousQuarterEmployees} 人，存在无人员或人员下降异常。`,
    suggestion: '复核人员花名册、社保、工资申报和主体经营实质；如为持证或持续经营主体，应补充人员安排说明。',
    materials: ['员工花名册', '社保清单', '工资申报明细', '主体经营说明'],
  },
  {
    code: 'ON-002',
    name: '主体无人员但有人员相关成本费用支出',
    taxType: '通用财务/经营',
    level: '中',
    basis: '脱敏税务风险预警指标：本季度平均人数为 0，但发生与人员相关的房租、装修、办公、培训、差旅、会议、招待等费用。',
    caseRef: '自动检测候选：人员人数、人员相关成本费用。',
    conditionJson: { all: [{ field: 'employees', operator: '<=', value: 0 }, { field: 'peopleRelatedExpense', operator: '>', value: 0 }] },
    trigger: (c) => c.employees <= 0 && c.peopleRelatedExpense > 0,
    reason: (c) => `当前员工人数为 ${c.employees}，但人员相关成本费用为 ${money(c.peopleRelatedExpense)}。`,
    suggestion: '复核费用性质、服务对象、租赁和装修用途，排除空壳主体挂费用或费用分摊不合理。',
    materials: ['费用明细', '租赁合同', '装修合同', '办公差旅培训凭证'],
  },
  {
    code: 'ON-003',
    name: '主体有费用，无收入',
    taxType: '通用财务/经营',
    level: '中',
    basis: '脱敏税务风险预警指标：本年累计收入为 0，本年累计成本费用大于 0。',
    caseRef: '检查清单：YTD 收入、YTD 成本费用。',
    conditionJson: { all: [{ field: 'ytdRevenue', operator: '<=', value: 0 }, { field: 'ytdCostExpense', operator: '>', value: 0 }] },
    trigger: (c) => c.ytdRevenue <= 0 && c.ytdCostExpense > 0,
    reason: (c) => `本年累计收入 ${money(c.ytdRevenue)}，本年累计成本费用 ${money(c.ytdCostExpense)}。`,
    suggestion: '复核主体是否仍有经营职能、费用归属是否准确，必要时补充转让定价或成本分摊说明。',
    materials: ['利润表', '费用明细', '主体职能说明', '关联交易资料'],
  },
  {
    code: 'ON-004',
    name: '人均租房面积',
    taxType: '通用财务/经营',
    level: '中',
    basis: '脱敏税务风险预警指标：无人员但有租房面积，或人均租房面积不在合理范围。',
    caseRef: '自动检测候选：租赁面积、人员人数。',
    conditionJson: { any: [{ all: [{ field: 'employees', operator: '<=', value: 0 }, { field: 'rentalArea', operator: '>', value: 0 }] }, { field: 'rentalArea', operator: '>', value: 0, compareField: 'employees', multiplier: 20 }] },
    trigger: (c) => (c.employees <= 0 && c.rentalArea > 0) || c.rentalArea > c.employees * 20,
    reason: (c) => `当前员工人数 ${c.employees} 人，承租面积 ${c.rentalArea} 平方米。`,
    suggestion: '复核承租面积、转租面积和实际办公人员，说明超额面积用途或调整费用归属。',
    materials: ['租赁合同', '办公场地清单', '转租协议', '员工花名册'],
  },
  {
    code: 'ON-005',
    name: '福利费分析',
    taxType: '企业所得税',
    level: '中',
    basis: '企业所得税税前扣除限额：职工福利费不超过工资薪金总额 14%。',
    caseRef: '自动检测候选：工资薪金、福利费。',
    conditionJson: { field: 'welfareExpense', operator: '>', value: 0, compareField: 'payrollTotal', multiplier: 0.14 },
    requiredFields: ['payrollTotal'],
    trigger: (c) => c.welfareExpense > c.payrollTotal * 0.14,
    reason: (c) => `职工福利费 ${money(c.welfareExpense)}，工资薪金总额 ${money(c.payrollTotal)}，超过 14% 限额。`,
    suggestion: '汇算清缴时测算福利费扣除限额，对超限部分纳税调增。',
    materials: ['工资薪金明细', '福利费明细', '汇算清缴底稿'],
  },
  {
    code: 'ON-006',
    name: '人均福利性质餐费超出合理范围',
    taxType: '通用财务/经营',
    level: '中',
    basis: '脱敏税务风险预警指标：福利性质餐费按人数测算明显偏高。',
    caseRef: '检查清单：福利性质餐费、人员人数。',
    conditionJson: { field: 'monthlyMealBenefitExpense', operator: '>', value: 0, compareField: 'employees', multiplier: 800 },
    trigger: (c) => c.monthlyMealBenefitExpense > c.employees * 800,
    reason: (c) => `月福利性质餐费 ${money(c.monthlyMealBenefitExpense)}，当前员工人数 ${c.employees} 人。`,
    suggestion: '复核餐费性质、报销对象和发票真实性，区分业务招待费、福利费和个人消费。',
    materials: ['餐费明细', '报销单', '员工名单', '发票样本'],
  },
  {
    code: 'ON-007',
    name: '不合理装修费用',
    taxType: '通用财务/经营',
    level: '中',
    basis: '脱敏税务风险预警指标：装修费用与租赁面积、使用场景不匹配。',
    caseRef: '检查清单：装修费用、租赁面积。',
    conditionJson: { field: 'decorationExpense', operator: '>', value: 0, compareField: 'rentalArea', multiplier: 3000 },
    trigger: (c) => c.decorationExpense > c.rentalArea * 3000,
    reason: (c) => `装修费用 ${money(c.decorationExpense)}，承租面积 ${c.rentalArea} 平方米。`,
    suggestion: '复核装修合同、工程验收和资本化/费用化处理，说明单位面积装修成本偏高原因。',
    materials: ['装修合同', '工程验收单', '付款流水', '租赁合同'],
  },
  {
    code: 'ON-008',
    name: '主体EBIT利润率年度波动',
    taxType: '通用财务/经营',
    level: '中',
    basis: '脱敏税务风险预警指标：EBIT 利润较上年明显波动。',
    caseRef: '自动检测候选：EBIT 利润、上年 EBIT 利润。',
    conditionJson: { any: [{ field: 'ebitProfit', operator: '>', value: 0, compareField: 'previousYearEbitProfit', multiplier: 1.3 }, { field: 'ebitProfit', operator: '<', value: 0, compareField: 'previousYearEbitProfit', multiplier: 0.7 }] },
    requiredFields: ['previousYearEbitProfit'],
    trigger: (c) => c.ebitProfit > c.previousYearEbitProfit * 1.3 || c.ebitProfit < c.previousYearEbitProfit * 0.7,
    reason: (c) => `EBIT 利润 ${money(c.ebitProfit)}，上年 EBIT 利润 ${money(c.previousYearEbitProfit)}。`,
    suggestion: '复核收入、成本、费用和关联交易变化，解释利润率异常波动原因。',
    materials: ['利润表', '管理报表', '关联交易明细', '成本费用明细'],
  },
  {
    code: 'ON-009',
    name: '主体利润率情况',
    taxType: '通用财务/经营',
    level: '中',
    basis: '脱敏税务风险预警指标：主体亏损或利润率明显偏低。',
    caseRef: '检查清单：YTD 收入、YTD 利润。',
    conditionJson: { any: [{ field: 'ytdProfit', operator: '<', value: 0 }, { field: 'ytdProfit', operator: '<', value: 0, compareField: 'ytdRevenue', multiplier: 0.03 }] },
    trigger: (c) => c.ytdProfit < 0 || c.ytdProfit < c.ytdRevenue * 0.03,
    reason: (c) => `本年累计收入 ${money(c.ytdRevenue)}，本年累计利润 ${money(c.ytdProfit)}。`,
    suggestion: '复核主体职能、利润结构、亏损原因和关联交易定价是否合理。',
    materials: ['利润表', '管理报表', '亏损说明', '关联交易资料'],
  },
  {
    code: 'ON-010',
    name: '主体EBIT预实差异',
    taxType: '通用财务/经营',
    level: '中',
    basis: '脱敏税务风险预警指标：EBIT 实际值与预算值差异超过合理范围。',
    caseRef: '自动检测候选：EBIT 利润、预算 EBIT 利润。',
    conditionJson: { any: [{ field: 'ebitProfit', operator: '>', value: 0, compareField: 'budgetEbitProfit', multiplier: 1.2 }, { field: 'ebitProfit', operator: '<', value: 0, compareField: 'budgetEbitProfit', multiplier: 0.8 }] },
    requiredFields: ['budgetEbitProfit'],
    trigger: (c) => c.ebitProfit > c.budgetEbitProfit * 1.2 || c.ebitProfit < c.budgetEbitProfit * 0.8,
    reason: (c) => `EBIT 利润 ${money(c.ebitProfit)}，预算 EBIT 利润 ${money(c.budgetEbitProfit)}。`,
    suggestion: '复核预算口径、实际收入成本费用和异常调整事项。',
    materials: ['预算表', '利润表', '预算差异分析'],
  },
  {
    code: 'ON-011',
    name: '主体营业收入预实差异',
    taxType: '通用财务/经营',
    level: '中',
    basis: '脱敏税务风险预警指标：营业收入实际值与预算值差异超过合理范围。',
    caseRef: '自动检测候选：收入、预算收入。',
    conditionJson: { any: [{ field: 'ytdRevenue', operator: '>', value: 0, compareField: 'budgetRevenue', multiplier: 1.2 }, { field: 'ytdRevenue', operator: '<', value: 0, compareField: 'budgetRevenue', multiplier: 0.8 }] },
    requiredFields: ['budgetRevenue'],
    trigger: (c) => c.ytdRevenue > c.budgetRevenue * 1.2 || c.ytdRevenue < c.budgetRevenue * 0.8,
    reason: (c) => `本年累计收入 ${money(c.ytdRevenue)}，预算收入 ${money(c.budgetRevenue)}。`,
    suggestion: '核对收入确认、预算口径、未开票收入和关联交易安排。',
    materials: ['预算表', '收入明细', '开票明细', '合同台账'],
  },
  {
    code: 'ON-012',
    name: '主营业务利润率',
    taxType: '通用财务/经营',
    level: '中',
    basis: '脱敏税务风险预警指标：主营业务利润率偏低。',
    caseRef: '检查清单：主营业务收入、主营业务成本、本年利润。',
    conditionJson: { field: 'ytdProfit', operator: '<', value: 0, compareField: 'mainBusinessRevenue', multiplier: 0.05 },
    trigger: (c) => c.ytdProfit < c.mainBusinessRevenue * 0.05,
    reason: (c) => `本年利润 ${money(c.ytdProfit)}，主营业务收入 ${money(c.mainBusinessRevenue)}。`,
    suggestion: '复核主营成本归集、收入确认和关联交易定价，说明低毛利或低利润原因。',
    materials: ['主营收入明细', '主营成本明细', '利润表'],
  },
  {
    code: 'ON-013',
    name: '商品毛利率（商品销售相关）',
    taxType: '通用财务/经营',
    level: '中',
    basis: '脱敏税务风险预警指标：商品销售毛利率偏低或成本收入倒挂。',
    caseRef: '自动检测候选：商品销售收入、商品销售成本。',
    conditionJson: { field: 'goodsSalesRevenue', operator: '<', value: 0, compareField: 'goodsCost', multiplier: 1.05 },
    trigger: (c) => c.goodsSalesRevenue > 0 && c.goodsSalesRevenue < c.goodsCost * 1.05,
    reason: (c) => `商品销售收入 ${money(c.goodsSalesRevenue)}，商品销售成本 ${money(c.goodsCost)}。`,
    suggestion: '复核进销价格、库存结转、促销折扣和关联交易定价。',
    materials: ['商品销售明细', '采购成本明细', '库存台账'],
  },
  {
    code: 'ON-014',
    name: '主体开具增值税专用发票红字发票',
    taxType: '增值税',
    level: '中',
    basis: '脱敏税务风险预警指标：红字专票金额占销项税额或销售额比例偏高。',
    caseRef: '自动检测候选：红字发票金额、销项税额。',
    conditionJson: { field: 'redVatSpecialInvoiceAmount', operator: '>', value: 0, compareField: 'outputTax', multiplier: 0.2 },
    trigger: (c) => c.redVatSpecialInvoiceAmount > c.outputTax * 0.2,
    reason: (c) => `红字专票金额 ${money(c.redVatSpecialInvoiceAmount)}，销项税额 ${money(c.outputTax)}。`,
    suggestion: '复核红字发票原因、退货折让依据和跨期收入调整。',
    materials: ['红字发票清单', '销售合同', '退货折让资料'],
  },
  {
    code: 'ON-015',
    name: '增值税实际税负率与理论值偏离',
    taxType: '增值税',
    level: '中',
    basis: '脱敏税务风险预警指标：实际增值税税额与理论税额差异较大。',
    caseRef: '自动检测候选：增值税税额、理论税额。',
    conditionJson: { any: [{ field: 'vatTaxPayable', operator: '>', value: 0, compareField: 'theoreticalVatTax', multiplier: 1.3 }, { field: 'vatTaxPayable', operator: '<', value: 0, compareField: 'theoreticalVatTax', multiplier: 0.7 }] },
    requiredFields: ['theoreticalVatTax'],
    trigger: (c) => c.vatTaxPayable > c.theoreticalVatTax * 1.3 || c.vatTaxPayable < c.theoreticalVatTax * 0.7,
    reason: (c) => `实际增值税税额 ${money(c.vatTaxPayable)}，理论税额 ${money(c.theoreticalVatTax)}。`,
    suggestion: '复核销项、进项、进项转出、税率适用和优惠政策是否准确。',
    materials: ['增值税申报表', '销项明细', '进项明细', '理论税负测算表'],
  },
  {
    code: 'ON-016',
    name: '增值税入库税金的预实差异',
    taxType: '增值税',
    level: '中',
    basis: '脱敏税务风险预警指标：增值税入库税金实际值与预算值偏离。',
    caseRef: '自动检测候选：增值税税额、预算增值税。',
    conditionJson: { any: [{ field: 'vatTaxPayable', operator: '>', value: 0, compareField: 'budgetVatTax', multiplier: 1.2 }, { field: 'vatTaxPayable', operator: '<', value: 0, compareField: 'budgetVatTax', multiplier: 0.8 }] },
    requiredFields: ['budgetVatTax'],
    trigger: (c) => c.vatTaxPayable > c.budgetVatTax * 1.2 || c.vatTaxPayable < c.budgetVatTax * 0.8,
    reason: (c) => `实际增值税税额 ${money(c.vatTaxPayable)}，预算增值税 ${money(c.budgetVatTax)}。`,
    suggestion: '复核预算口径、收入变化、进项抵扣和税金入库情况。',
    materials: ['预算表', '增值税申报表', '税款入库记录'],
  },
  {
    code: 'ON-017',
    name: '主体增值税税额与应税销售额同步增长系数',
    taxType: '增值税',
    level: '中',
    basis: '脱敏税务风险预警指标：税额变化与应税销售额变化不同步。',
    caseRef: '自动检测候选：本期/上期税额和应税销售额。',
    conditionJson: { any: [{ all: [{ field: 'vatTaxPayable', operator: '>', value: 0, compareField: 'priorVatTaxPayable', multiplier: 1.3 }, { field: 'taxableSales', operator: '<=', value: 0, compareField: 'priorTaxableSales', multiplier: 1.1 }] }, { all: [{ field: 'vatTaxPayable', operator: '<', value: 0, compareField: 'priorVatTaxPayable', multiplier: 0.7 }, { field: 'taxableSales', operator: '>=', value: 0, compareField: 'priorTaxableSales', multiplier: 0.9 }] }] },
    requiredFields: ['priorVatTaxPayable', 'priorTaxableSales'],
    trigger: (c) => (c.vatTaxPayable > c.priorVatTaxPayable * 1.3 && c.taxableSales <= c.priorTaxableSales * 1.1) || (c.vatTaxPayable < c.priorVatTaxPayable * 0.7 && c.taxableSales >= c.priorTaxableSales * 0.9),
    reason: (c) => `本期税额 ${money(c.vatTaxPayable)}、上期税额 ${money(c.priorVatTaxPayable)}；本期应税销售额 ${money(c.taxableSales)}、上期 ${money(c.priorTaxableSales)}。`,
    suggestion: '复核税率、进项抵扣、进项转出、收入结构和跨期申报情况。',
    materials: ['本期增值税申报表', '上期增值税申报表', '销项明细', '进项明细'],
  },
  {
    code: 'ON-018',
    name: '主体进销项税率差',
    taxType: '增值税',
    level: '中',
    basis: '脱敏税务风险预警指标：进项与销项税率差异偏大。',
    caseRef: '检查清单：进销项税率差。',
    conditionJson: { field: 'vatRateSpread', operator: '>', value: 0.03 },
    trigger: (c) => c.vatRateSpread > 0.03,
    reason: (c) => `录入的进销项税率差为 ${(c.vatRateSpread * 100).toFixed(2)}%。`,
    suggestion: '复核不同税率业务、免税/简易计税、进项抵扣范围和税率适用准确性。',
    materials: ['销项发票明细', '进项发票明细', '税率适用说明'],
  },
  {
    code: 'ON-019',
    name: '职工教育经费分析',
    taxType: '企业所得税',
    level: '中',
    basis: '企业所得税税前扣除限额：职工教育经费按适用比例扣除，当前按 8% 预警。',
    caseRef: '自动检测候选：工资薪金、职工教育经费。',
    conditionJson: { field: 'educationExpense', operator: '>', value: 0, compareField: 'payrollTotal', multiplier: 0.08 },
    requiredFields: ['payrollTotal'],
    trigger: (c) => c.educationExpense > c.payrollTotal * 0.08,
    reason: (c) => `职工教育经费 ${money(c.educationExpense)}，工资薪金总额 ${money(c.payrollTotal)}，超过 8% 预警线。`,
    suggestion: '区分可当期扣除和结转以后年度扣除金额，保留培训真实性资料。',
    materials: ['工资薪金明细', '培训合同', '培训记录', '教育经费明细'],
  },
  {
    code: 'ON-020',
    name: '广宣费分析',
    taxType: '企业所得税',
    level: '中',
    basis: '企业所得税税前扣除限额：一般行业广告和业务宣传费不超过销售收入 15%。',
    caseRef: '自动检测候选：收入、广告宣传费。',
    conditionJson: { field: 'adExpense', operator: '>', value: 0, compareField: 'annualRevenue', multiplier: 0.15 },
    requiredFields: ['annualRevenue'],
    trigger: (c) => c.adExpense > c.annualRevenue * 0.15,
    reason: (c) => `广告宣传费 ${money(c.adExpense)}，年销售收入 ${money(c.annualRevenue)}，超过 15% 预警线。`,
    suggestion: '测算可扣除限额，区分广告宣传、业务招待和赞助支出。',
    materials: ['广告合同', '投放记录', '广告宣传费明细', '销售收入明细'],
  },
  {
    code: 'ON-021',
    name: '业务招待费分析',
    taxType: '企业所得税',
    level: '中',
    basis: '企业所得税税前扣除限额：业务招待费按发生额 60% 且不超过销售收入 5‰。',
    caseRef: '自动检测候选：收入、业务招待费。',
    conditionJson: { field: 'entertainmentExpense', operator: '>', value: 0, compareField: 'annualRevenue', multiplier: 0.005 },
    requiredFields: ['annualRevenue'],
    trigger: (c) => c.entertainmentExpense > c.annualRevenue * 0.005,
    reason: (c) => `业务招待费 ${money(c.entertainmentExpense)}，年销售收入 ${money(c.annualRevenue)}，超过收入 5‰ 预警线。`,
    suggestion: '按税法限额重新测算可扣除金额，对超限部分做纳税调整。',
    materials: ['业务招待费明细', '销售收入明细', '汇算清缴底稿'],
  },
  {
    code: 'ON-022',
    name: '文建费理论值与实际值差异',
    taxType: '文化事业建设费',
    level: '中',
    basis: '脱敏税务风险预警指标：文化事业建设费实缴额与理论值偏离。',
    caseRef: '检查清单：广告服务收入、文建费实缴。',
    conditionJson: { field: 'cultureConstructionFeePaid', operator: '<', value: 0, compareField: 'advertisingServiceRevenue', multiplier: 0.03 },
    trigger: (c) => c.advertisingServiceRevenue > 0 && c.cultureConstructionFeePaid < c.advertisingServiceRevenue * 0.03,
    reason: (c) => `广告服务收入 ${money(c.advertisingServiceRevenue)}，文化事业建设费实缴 ${money(c.cultureConstructionFeePaid)}。`,
    suggestion: '复核文化事业建设费计费收入、扣除项目和实际申报入库金额。',
    materials: ['广告服务收入明细', '文建费申报表', '扣除项目明细'],
  },
  {
    code: 'ON-023',
    name: '主体主营业务收入同比及环比波动',
    taxType: '通用财务/经营',
    level: '中',
    basis: '脱敏税务风险预警指标：主营业务收入同比或环比波动较大。',
    caseRef: '自动检测候选：本年累计收入、上年同期收入。',
    conditionJson: { any: [{ field: 'ytdRevenue', operator: '>', value: 0, compareField: 'previousYearRevenue', multiplier: 1.3 }, { field: 'ytdRevenue', operator: '<', value: 0, compareField: 'previousYearRevenue', multiplier: 0.7 }] },
    requiredFields: ['previousYearRevenue'],
    trigger: (c) => c.ytdRevenue > c.previousYearRevenue * 1.3 || c.ytdRevenue < c.previousYearRevenue * 0.7,
    reason: (c) => `本年累计收入 ${money(c.ytdRevenue)}，上年同期收入 ${money(c.previousYearRevenue)}。`,
    suggestion: '复核收入确认、客户变化、业务模式变化和跨期调整。',
    materials: ['收入明细', '上年同期收入明细', '合同台账'],
  },
  {
    code: 'ON-024',
    name: '其他应收款-代收代付余额',
    taxType: '通用财务/经营',
    level: '中',
    basis: '脱敏税务风险预警指标：其他应收款中代收代付余额长期存在或金额较大。',
    caseRef: '检查清单：其他应收代收代付余额。',
    conditionJson: { field: 'otherReceivableAgencyBalance', operator: '>', value: 0 },
    trigger: (c) => c.otherReceivableAgencyBalance > 0,
    reason: (c) => `其他应收代收代付余额为 ${money(c.otherReceivableAgencyBalance)}。`,
    suggestion: '复核代收代付业务实质、合同依据、资金流和是否存在收入费用错列。',
    materials: ['其他应收款明细', '代收代付协议', '银行流水'],
  },
  {
    code: 'ON-025',
    name: '营业外支出发生额',
    taxType: '通用财务/经营',
    level: '低',
    basis: '脱敏税务风险预警指标：存在营业外支出发生额，需要复核税前扣除口径。',
    caseRef: '检查清单：营业外支出。',
    conditionJson: { field: 'nonOperatingExpense', operator: '>', value: 0 },
    trigger: (c) => c.nonOperatingExpense > 0,
    reason: (c) => `营业外支出发生额为 ${money(c.nonOperatingExpense)}。`,
    suggestion: '区分罚款、捐赠、资产损失等性质，复核税前扣除或纳税调整要求。',
    materials: ['营业外支出明细', '凭证附件', '税前扣除说明'],
  },
  {
    code: 'ON-026',
    name: '营业外收入发生额',
    taxType: '通用财务/经营',
    level: '低',
    basis: '脱敏税务风险预警指标：存在营业外收入发生额，需要复核收入性质和申报口径。',
    caseRef: '检查清单：营业外收入。',
    conditionJson: { field: 'nonOperatingIncome', operator: '>', value: 0 },
    trigger: (c) => c.nonOperatingIncome > 0,
    reason: (c) => `营业外收入发生额为 ${money(c.nonOperatingIncome)}。`,
    suggestion: '复核政府补助、赔偿收入、资产处置等性质及企业所得税处理。',
    materials: ['营业外收入明细', '政府补助文件', '资产处置资料'],
  },
  {
    code: 'ON-027',
    name: '期末留抵税额',
    taxType: '增值税',
    level: '中',
    basis: '脱敏税务风险预警指标：期末留抵税额较大，需要复核形成原因。',
    caseRef: '检查清单：期末留抵税额、销项税额。',
    conditionJson: { field: 'endingVatCredit', operator: '>', value: 0, compareField: 'outputTax', multiplier: 0.5 },
    trigger: (c) => c.endingVatCredit > c.outputTax * 0.5,
    reason: (c) => `期末留抵税额 ${money(c.endingVatCredit)}，销项税额 ${money(c.outputTax)}。`,
    suggestion: '复核进项留抵形成原因、存货和固定资产采购、留抵退税适用条件。',
    materials: ['增值税申报表', '进项明细', '存货和固定资产采购资料'],
  },
  {
    code: 'ON-028',
    name: '主体向个人支付的非工资薪金所得',
    taxType: '个人所得税',
    level: '高',
    basis: '脱敏税务风险预警指标：向个人支付非工资薪金所得，需复核个税扣缴和发票凭证。',
    caseRef: '检查清单：个人支付数据。',
    conditionJson: { field: 'nonPayrollPersonalPayment', operator: '>', value: 0 },
    trigger: (c) => c.nonPayrollPersonalPayment > 0,
    reason: (c) => `向个人支付的非工资薪金所得为 ${money(c.nonPayrollPersonalPayment)}。`,
    suggestion: '复核支付性质、合同、发票或扣缴申报记录，确认劳务报酬、稿酬、特许权使用费等个税处理。',
    materials: ['个人支付明细', '合同协议', '扣缴申报记录', '发票或收款凭证'],
  },
  {
    code: 'ON-029',
    name: '增值税税负率偏高',
    taxType: '增值税',
    level: '中',
    basis: '脱敏税务风险预警指标：应纳增值税额占应税销售额比例明显偏高，可能存在进项抵扣不足、税率适用或收入结构异常。',
    caseRef: '自动检测候选：增值税应纳税额、应税销售额。',
    conditionJson: { field: 'vatTaxPayable', operator: '>', value: 0, compareField: 'taxableSales', multiplier: 0.045 },
    requiredFields: ['taxableSales'],
    trigger: (c) => c.taxableSales > 0 && c.vatTaxPayable > c.taxableSales * 0.045,
    reason: (c) => `增值税应纳/入库税额 ${money(c.vatTaxPayable)}，应税销售额 ${money(c.taxableSales)}，税负率超过 4.5%。`,
    suggestion: '复核销项税额、进项抵扣、税率适用、简易计税和免税项目，说明税负率偏高原因。',
    materials: ['增值税申报表', '销项发票明细', '进项发票明细', '税负率测算表'],
  },
  {
    code: 'ON-030',
    name: '增值税税负率偏低',
    taxType: '增值税',
    level: '高',
    basis: '脱敏税务风险预警指标：应纳增值税额占应税销售额比例明显偏低，需复核未开票收入、进项抵扣和优惠适用。',
    caseRef: '自动检测候选：增值税应纳税额、应税销售额。',
    conditionJson: { all: [{ field: 'taxableSales', operator: '>', value: 0 }, { field: 'vatTaxPayable', operator: '<', value: 0, compareField: 'taxableSales', multiplier: 0.001 }] },
    requiredFields: ['taxableSales'],
    trigger: (c) => c.taxableSales > 0 && c.vatTaxPayable < c.taxableSales * 0.001,
    reason: (c) => `增值税应纳/入库税额 ${money(c.vatTaxPayable)}，应税销售额 ${money(c.taxableSales)}，税负率低于 0.1%。`,
    suggestion: '重点核对收入申报完整性、进项税额真实性、留抵形成原因和优惠政策适用依据。',
    materials: ['增值税申报表', '收入明细', '进项抵扣明细', '优惠政策适用资料'],
  },
  {
    code: 'ON-031',
    name: '进项税额显著高于销项税额',
    taxType: '增值税',
    level: '中',
    basis: '脱敏税务风险预警指标：进项税额持续或显著高于销项税额，可能形成异常留抵或进销结构倒挂。',
    caseRef: '自动检测候选：进项税额、销项税额。',
    conditionJson: { field: 'inputTax', operator: '>', value: 0, compareField: 'outputTax', multiplier: 1.2 },
    requiredFields: ['outputTax'],
    trigger: (c) => c.outputTax > 0 && c.inputTax > c.outputTax * 1.2,
    reason: (c) => `进项税额 ${money(c.inputTax)}，销项税额 ${money(c.outputTax)}，进项显著高于销项。`,
    suggestion: '复核采购集中、存货积压、固定资产购置、税率倒挂和进项抵扣真实性。',
    materials: ['进项发票明细', '销项发票明细', '库存台账', '固定资产采购资料'],
  },
  {
    code: 'ON-032',
    name: '收款流水显著高于申报收入',
    taxType: '增值税、企业所得税',
    level: '高',
    basis: '以数治税口径下，资金流与申报收入差异较大是收入完整性核查重点。',
    caseRef: '自动检测候选：收款流水、月收入。',
    conditionJson: { field: 'collectionFlow', operator: '>', value: 0, compareField: 'monthlyRevenue', multiplier: 1.2 },
    requiredFields: ['monthlyRevenue'],
    trigger: (c) => c.monthlyRevenue > 0 && c.collectionFlow > c.monthlyRevenue * 1.2,
    reason: (c) => `收款流水 ${money(c.collectionFlow)}，月收入 ${money(c.monthlyRevenue)}，资金流显著高于申报收入。`,
    suggestion: '核对银行、第三方支付、平台结算和未开票收入，确认收入是否完整申报。',
    materials: ['银行流水', '第三方支付流水', '收入明细', '纳税申报表'],
  },
  {
    code: 'ON-033',
    name: '开票金额显著高于申报收入',
    taxType: '增值税、企业所得税',
    level: '中',
    basis: '发票流与申报收入差异较大，可能涉及跨期收入、预开票或收入确认口径不一致。',
    caseRef: '自动检测候选：月开票金额、月收入。',
    conditionJson: { field: 'monthlyInvoice', operator: '>', value: 0, compareField: 'monthlyRevenue', multiplier: 1.2 },
    requiredFields: ['monthlyRevenue'],
    trigger: (c) => c.monthlyRevenue > 0 && c.monthlyInvoice > c.monthlyRevenue * 1.2,
    reason: (c) => `月开票金额 ${money(c.monthlyInvoice)}，月收入 ${money(c.monthlyRevenue)}，开票金额显著高于收入。`,
    suggestion: '复核预开票、跨期确认、退货折让和企业所得税收入确认口径。',
    materials: ['开票明细', '收入明细账', '合同台账', '预收款明细'],
  },
  {
    code: 'ON-034',
    name: '申报收入显著高于开票金额',
    taxType: '增值税、企业所得税',
    level: '中',
    basis: '申报收入与发票流差异较大，需关注未开票收入、不开票收入和收入确认口径。',
    caseRef: '自动检测候选：月收入、月开票金额。',
    conditionJson: { field: 'monthlyRevenue', operator: '>', value: 0, compareField: 'monthlyInvoice', multiplier: 1.2 },
    requiredFields: ['monthlyInvoice'],
    trigger: (c) => c.monthlyInvoice > 0 && c.monthlyRevenue > c.monthlyInvoice * 1.2,
    reason: (c) => `月收入 ${money(c.monthlyRevenue)}，月开票金额 ${money(c.monthlyInvoice)}，收入显著高于开票金额。`,
    suggestion: '复核未开票收入台账、不开票业务类型、纳税义务发生时间和申报口径。',
    materials: ['未开票收入明细', '收入明细账', '合同台账', '增值税申报表'],
  },
  {
    code: 'ON-035',
    name: '小型微利企业优惠接近边界',
    taxType: '企业所得税',
    level: '中',
    basis: '小型微利企业优惠适用需同时关注应纳税所得额、从业人数和资产总额，接近边界时误用风险较高。',
    caseRef: '自动检测候选：小微优惠、应纳税所得额、人数、资产总额。',
    conditionJson: { all: [{ field: 'smallProfitEnjoyed', operator: '=', value: true }, { any: [{ field: 'taxableIncome', operator: '>', value: 2800000 }, { field: 'employeeAnnualAvg', operator: '>', value: 280 }, { field: 'assetsTotal', operator: '>', value: 48000000 }] }] },
    trigger: (c) => c.smallProfitEnjoyed && (c.taxableIncome > 2_800_000 || c.employeeAnnualAvg > 280 || c.assetsTotal > 48_000_000),
    reason: (c) => `企业享受小微优惠，应纳税所得额 ${money(c.taxableIncome)}、年平均人数 ${c.employeeAnnualAvg}、资产总额 ${money(c.assetsTotal)} 接近政策边界。`,
    suggestion: '复核小型微利企业基础信息填报、人数和资产平均值计算，避免临界误用优惠。',
    materials: ['企业所得税申报表', '资产负债表', '人数测算表', '优惠适用底稿'],
  },
  {
    code: 'ON-036',
    name: '无人员但存在工资薪金支出',
    taxType: '企业所得税、个人所得税',
    level: '高',
    basis: '人员、工资和社保数据不匹配，可能涉及空壳主体列支成本或个税社保申报异常。',
    caseRef: '自动检测候选：员工人数、工资薪金总额。',
    conditionJson: { all: [{ field: 'employees', operator: '<=', value: 0 }, { field: 'payrollTotal', operator: '>', value: 0 }] },
    trigger: (c) => c.employees <= 0 && c.payrollTotal > 0,
    reason: (c) => `员工人数为 ${c.employees}，但工资薪金总额为 ${money(c.payrollTotal)}。`,
    suggestion: '复核员工花名册、工资表、个税扣缴和主体用工安排，说明无人员但有工资的原因。',
    materials: ['员工花名册', '工资表', '个税扣缴申报表', '用工说明'],
  },
  {
    code: 'ON-037',
    name: '有工资申报人数但社保人数为零',
    taxType: '个人所得税、社保费、企业所得税',
    level: '高',
    basis: '工资、个税和社保人数差异是人员合规核查重点。',
    caseRef: '自动检测候选：工资申报人数、社保人数。',
    conditionJson: { all: [{ field: 'salaryDeclaredCount', operator: '>', value: 0 }, { field: 'socialSecurityCount', operator: '<=', value: 0 }] },
    trigger: (c) => c.salaryDeclaredCount > 0 && c.socialSecurityCount <= 0,
    reason: (c) => `工资申报人数 ${c.salaryDeclaredCount} 人，社保人数 ${c.socialSecurityCount} 人。`,
    suggestion: '区分劳务、退休返聘、实习、外包等情形，复核个税扣缴和社保缴纳责任。',
    materials: ['工资表', '个税扣缴申报表', '社保清单', '劳动/劳务合同'],
  },
  {
    code: 'ON-038',
    name: '营业外支出占收入比例偏高',
    taxType: '企业所得税',
    level: '中',
    basis: '营业外支出金额较大时，罚款、捐赠、资产损失等项目的税前扣除口径需重点复核。',
    caseRef: '自动检测候选：营业外支出、年销售收入。',
    conditionJson: { field: 'nonOperatingExpense', operator: '>', value: 0, compareField: 'annualRevenue', multiplier: 0.05 },
    requiredFields: ['annualRevenue'],
    trigger: (c) => c.annualRevenue > 0 && c.nonOperatingExpense > c.annualRevenue * 0.05,
    reason: (c) => `营业外支出 ${money(c.nonOperatingExpense)}，年销售收入 ${money(c.annualRevenue)}，占比超过 5%。`,
    suggestion: '拆分罚款、捐赠、资产损失等明细，复核税前扣除和纳税调整口径。',
    materials: ['营业外支出明细', '资产损失资料', '捐赠票据', '纳税调整底稿'],
  },
  {
    code: 'ON-039',
    name: '向个人非工资支付占工资薪金比例偏高',
    taxType: '个人所得税、企业所得税',
    level: '高',
    basis: '向自然人支付劳务、佣金、推广费等金额较大时，需复核扣缴义务和费用真实性。',
    caseRef: '自动检测候选：个人非工资支付、工资薪金总额。',
    conditionJson: { field: 'nonPayrollPersonalPayment', operator: '>', value: 0, compareField: 'payrollTotal', multiplier: 0.3 },
    requiredFields: ['payrollTotal'],
    trigger: (c) => c.payrollTotal > 0 && c.nonPayrollPersonalPayment > c.payrollTotal * 0.3,
    reason: (c) => `向个人非工资支付 ${money(c.nonPayrollPersonalPayment)}，工资薪金总额 ${money(c.payrollTotal)}，占比偏高。`,
    suggestion: '复核个人收款合同、服务成果、发票或扣缴申报记录，避免以劳务或佣金替代工资薪金。',
    materials: ['个人支付明细', '劳务/服务合同', '服务成果', '扣缴申报记录'],
  },
  {
    code: 'ON-040',
    name: '高收入但无租赁面积',
    taxType: '增值税、企业所得税',
    level: '中',
    basis: '收入规模较大但无经营场所或租赁面积，可能被关注业务实质、开票经济或主体职能合理性。',
    caseRef: '自动检测候选：年销售收入、承租面积。',
    conditionJson: { all: [{ field: 'annualRevenue', operator: '>', value: 10000000 }, { field: 'rentalArea', operator: '<=', value: 0 }] },
    requiredFields: ['annualRevenue'],
    trigger: (c) => c.annualRevenue > 10_000_000 && c.rentalArea <= 0,
    reason: (c) => `年销售收入 ${money(c.annualRevenue)}，承租面积 ${c.rentalArea} 平方米。`,
    suggestion: '复核经营场所、人员配置、业务实质和开票主体定位，补充无租赁面积的合理说明。',
    materials: ['租赁合同', '办公场所说明', '人员配置说明', '业务合同'],
  },
  {
    code: 'ON-041',
    name: '季度收入环比大幅增长',
    taxType: '增值税、企业所得税',
    level: '中',
    basis: '脱敏税务风险预警指标：收入环比大幅增长时，需要复核新增业务、集中开票、跨期确认和申报口径。',
    caseRef: '自动检测候选：本季度收入、上季度收入。',
    conditionJson: { field: 'quarterRevenue', operator: '>', value: 0, compareField: 'previousQuarterRevenue', multiplier: 1.5 },
    requiredFields: ['previousQuarterRevenue'],
    trigger: (c) => c.previousQuarterRevenue > 0 && c.quarterRevenue > c.previousQuarterRevenue * 1.5,
    reason: (c) => `本季度收入 ${money(c.quarterRevenue)}，上季度收入 ${money(c.previousQuarterRevenue)}，环比增长超过 50%。`,
    suggestion: '复核新增合同、集中开票、跨期收入确认和纳税申报口径，说明收入增长原因。',
    materials: ['本季度收入明细', '上季度收入明细', '合同台账', '开票明细'],
  },
  {
    code: 'ON-042',
    name: '季度收入环比大幅下降',
    taxType: '增值税、企业所得税',
    level: '中',
    basis: '脱敏税务风险预警指标：收入环比大幅下降时，需要复核业务萎缩、跨期调整、不开票收入和主体职能变化。',
    caseRef: '自动检测候选：本季度收入、上季度收入。',
    conditionJson: { field: 'quarterRevenue', operator: '<', value: 0, compareField: 'previousQuarterRevenue', multiplier: 0.7 },
    requiredFields: ['previousQuarterRevenue'],
    trigger: (c) => c.previousQuarterRevenue > 0 && c.quarterRevenue < c.previousQuarterRevenue * 0.7,
    reason: (c) => `本季度收入 ${money(c.quarterRevenue)}，上季度收入 ${money(c.previousQuarterRevenue)}，环比下降超过 30%。`,
    suggestion: '复核业务变化、收入跨期调整、未开票收入和主体职能变化，形成合理说明。',
    materials: ['收入明细', '合同台账', '业务变化说明', '未开票收入台账'],
  },
  {
    code: 'ON-043',
    name: '季度成本费用环比大幅增长',
    taxType: '企业所得税',
    level: '中',
    basis: '脱敏税务风险预警指标：成本费用环比大幅增长时，需复核费用真实性、归属期间和税前扣除凭证。',
    caseRef: '自动检测候选：本季度成本费用、上季度成本费用。',
    conditionJson: { field: 'quarterCostExpense', operator: '>', value: 0, compareField: 'previousQuarterCostExpense', multiplier: 1.5 },
    requiredFields: ['previousQuarterCostExpense'],
    trigger: (c) => c.previousQuarterCostExpense > 0 && c.quarterCostExpense > c.previousQuarterCostExpense * 1.5,
    reason: (c) => `本季度成本费用 ${money(c.quarterCostExpense)}，上季度成本费用 ${money(c.previousQuarterCostExpense)}，环比增长超过 50%。`,
    suggestion: '复核大额费用、跨期费用、暂估入账和税前扣除凭证，说明成本费用增长原因。',
    materials: ['费用明细', '合同和发票', '付款记录', '费用归属期间说明'],
  },
  {
    code: 'ON-044',
    name: '成本费用增速显著高于收入增速',
    taxType: '企业所得税、增值税',
    level: '中',
    basis: '脱敏税务风险预警指标：成本费用快速增长但收入未同步增长，可能存在成本归集、跨期费用或虚列支出风险。',
    caseRef: '自动检测候选：季度收入、季度成本费用及上期数据。',
    conditionJson: { all: [{ field: 'quarterCostExpense', operator: '>', value: 0, compareField: 'previousQuarterCostExpense', multiplier: 1.5 }, { field: 'quarterRevenue', operator: '<=', value: 0, compareField: 'previousQuarterRevenue', multiplier: 1.2 }] },
    requiredFields: ['previousQuarterCostExpense', 'previousQuarterRevenue'],
    trigger: (c) => c.previousQuarterCostExpense > 0 && c.previousQuarterRevenue > 0 && c.quarterCostExpense > c.previousQuarterCostExpense * 1.5 && c.quarterRevenue <= c.previousQuarterRevenue * 1.2,
    reason: (c) => `本季度成本费用 ${money(c.quarterCostExpense)} 较上季度明显增长，但本季度收入 ${money(c.quarterRevenue)} 未同步增长。`,
    suggestion: '复核费用真实性、期间归属、收入成本匹配和关联交易安排。',
    materials: ['收入成本费用明细', '合同和发票', '付款记录', '关联交易资料'],
  },
  {
    code: 'ON-045',
    name: '本年成本费用接近或超过收入',
    taxType: '企业所得税',
    level: '中',
    basis: '脱敏税务风险预警指标：成本费用率过高时，需解释低利润、亏损、成本归集和费用真实性。',
    caseRef: '自动检测候选：本年累计收入、本年累计成本费用。',
    conditionJson: { all: [{ field: 'ytdRevenue', operator: '>', value: 0 }, { field: 'ytdCostExpense', operator: '>', value: 0, compareField: 'ytdRevenue', multiplier: 0.95 }] },
    requiredFields: ['ytdRevenue'],
    trigger: (c) => c.ytdRevenue > 0 && c.ytdCostExpense > c.ytdRevenue * 0.95,
    reason: (c) => `本年累计成本费用 ${money(c.ytdCostExpense)}，本年累计收入 ${money(c.ytdRevenue)}，成本费用率接近或超过收入。`,
    suggestion: '复核成本结转、费用归集、关联交易定价和亏损原因，说明低利润合理性。',
    materials: ['利润表', '成本费用明细', '关联交易资料', '亏损说明'],
  },
  {
    code: 'ON-046',
    name: '主营业务成本高于主营业务收入',
    taxType: '企业所得税',
    level: '中',
    basis: '脱敏税务风险预警指标：主营业务成本收入倒挂时，需复核成本结转、存货计价和收入确认。',
    caseRef: '自动检测候选：主营业务收入、主营业务成本。',
    conditionJson: { all: [{ field: 'mainBusinessRevenue', operator: '>', value: 0 }, { field: 'mainBusinessCost', operator: '>', value: 0, compareField: 'mainBusinessRevenue', multiplier: 1 }] },
    requiredFields: ['mainBusinessRevenue'],
    trigger: (c) => c.mainBusinessRevenue > 0 && c.mainBusinessCost > c.mainBusinessRevenue,
    reason: (c) => `主营业务成本 ${money(c.mainBusinessCost)}，主营业务收入 ${money(c.mainBusinessRevenue)}，成本高于收入。`,
    suggestion: '复核成本结转、存货跌价、收入确认和关联交易定价，说明成本收入倒挂原因。',
    materials: ['主营收入明细', '主营成本明细', '库存台账', '成本结转底稿'],
  },
  {
    code: 'ON-047',
    name: '人均租赁面积偏高',
    taxType: '通用财务/经营',
    level: '低',
    basis: '脱敏税务风险预警指标：人均租赁面积偏高时，需复核人员、场地用途和费用分摊合理性。',
    caseRef: '自动检测候选：承租面积、员工人数。',
    conditionJson: { all: [{ field: 'employees', operator: '>', value: 0 }, { field: 'rentalArea', operator: '>', value: 0, compareField: 'employees', multiplier: 80 }] },
    requiredFields: ['employees'],
    trigger: (c) => c.employees > 0 && c.rentalArea > c.employees * 80,
    reason: (c) => `承租面积 ${c.rentalArea} 平方米，员工人数 ${c.employees} 人，人均面积偏高。`,
    suggestion: '复核租赁面积用途、转租情况、人员配置和租赁费用分摊依据。',
    materials: ['租赁合同', '办公场地说明', '员工花名册', '费用分摊表'],
  },
  {
    code: 'ON-048',
    name: '无人员但存在承租面积',
    taxType: '通用财务/经营',
    level: '中',
    basis: '脱敏税务风险预警指标：无人员但存在承租面积时，需复核主体经营实质和费用归属。',
    caseRef: '自动检测候选：员工人数、承租面积。',
    conditionJson: { all: [{ field: 'employees', operator: '<=', value: 0 }, { field: 'rentalArea', operator: '>', value: 0 }] },
    trigger: (c) => c.employees <= 0 && c.rentalArea > 0,
    reason: (c) => `员工人数为 ${c.employees}，但承租面积为 ${c.rentalArea} 平方米。`,
    suggestion: '复核经营实质、人员安排、场地用途和租赁费用归属，避免空壳主体挂费用。',
    materials: ['租赁合同', '场地使用说明', '员工花名册', '费用明细'],
  },
  {
    code: 'ON-049',
    name: '平台收入显著高于开票金额',
    taxType: '增值税、企业所得税',
    level: '高',
    basis: '平台交易数据与发票流差异较大时，需复核不开票收入、平台结算和申报完整性。',
    caseRef: '自动检测候选：平台收入、月开票金额。',
    conditionJson: { all: [{ field: 'monthlyInvoice', operator: '>', value: 0 }, { field: 'platformRevenue', operator: '>', value: 0, compareField: 'monthlyInvoice', multiplier: 1.2 }] },
    requiredFields: ['monthlyInvoice'],
    trigger: (c) => c.monthlyInvoice > 0 && c.platformRevenue > c.monthlyInvoice * 1.2,
    reason: (c) => `平台收入 ${money(c.platformRevenue)}，月开票金额 ${money(c.monthlyInvoice)}，平台收入显著高于开票金额。`,
    suggestion: '导出平台订单和结算数据，与开票、收款和纳税申报逐项核对。',
    materials: ['平台后台收入', '订单明细', '开票明细', '收款流水'],
  },
  {
    code: 'ON-050',
    name: '工资薪金占成本费用比例偏高',
    taxType: '企业所得税、个人所得税',
    level: '中',
    basis: '工资薪金占成本费用比例过高时，需复核人员真实性、费用归集和个税社保申报。',
    caseRef: '自动检测候选：工资薪金总额、本年累计成本费用。',
    conditionJson: { all: [{ field: 'ytdCostExpense', operator: '>', value: 0 }, { field: 'payrollTotal', operator: '>', value: 0, compareField: 'ytdCostExpense', multiplier: 0.7 }] },
    requiredFields: ['ytdCostExpense'],
    trigger: (c) => c.ytdCostExpense > 0 && c.payrollTotal > c.ytdCostExpense * 0.7,
    reason: (c) => `工资薪金总额 ${money(c.payrollTotal)}，本年累计成本费用 ${money(c.ytdCostExpense)}，工资占比偏高。`,
    suggestion: '复核人员真实性、工资发放、个税扣缴和成本费用分类，说明人员成本结构。',
    materials: ['工资表', '员工花名册', '个税申报表', '成本费用明细'],
  },
  {
    code: 'ON-051',
    name: '人均工资薪金偏高',
    taxType: '企业所得税、个人所得税',
    level: '中',
    basis: '人均工资薪金明显偏高时，需复核高管薪酬、奖金、劳务转换和个税扣缴。',
    caseRef: '自动检测候选：工资薪金总额、员工人数。',
    conditionJson: { all: [{ field: 'employees', operator: '>', value: 0 }, { field: 'payrollTotal', operator: '>', value: 0, compareField: 'employees', multiplier: 300000 }] },
    requiredFields: ['employees'],
    trigger: (c) => c.employees > 0 && c.payrollTotal > c.employees * 300_000,
    reason: (c) => `工资薪金总额 ${money(c.payrollTotal)}，员工人数 ${c.employees} 人，人均工资薪金偏高。`,
    suggestion: '复核薪酬结构、奖金发放、股权激励、劳务转换和个税扣缴申报。',
    materials: ['工资表', '奖金明细', '个税申报表', '薪酬制度'],
  },
  {
    code: 'ON-052',
    name: '职工福利费为负',
    taxType: '企业所得税',
    level: '低',
    basis: '费用类科目出现负数通常属于重分类、冲销或录入口径异常，需要复核数据质量和纳税调整。',
    caseRef: '自动检测候选：职工福利费。',
    conditionJson: { field: 'welfareExpense', operator: '<', value: 0 },
    trigger: (c) => c.welfareExpense < 0,
    reason: (c) => `职工福利费为 ${money(c.welfareExpense)}，出现负数。`,
    suggestion: '复核冲销、重分类和数据录入口径，确认汇算清缴福利费限额测算基础准确。',
    materials: ['福利费明细', '调整凭证', '费用重分类说明'],
  },
  {
    code: 'ON-053',
    name: '期末留抵税额接近进项税额',
    taxType: '增值税',
    level: '中',
    basis: '期末留抵税额接近进项税额时，需复核进项形成原因、销项不足和留抵退税适用条件。',
    caseRef: '自动检测候选：期末留抵税额、进项税额。',
    conditionJson: { all: [{ field: 'inputTax', operator: '>', value: 0 }, { field: 'endingVatCredit', operator: '>', value: 0, compareField: 'inputTax', multiplier: 0.8 }] },
    requiredFields: ['inputTax'],
    trigger: (c) => c.inputTax > 0 && c.endingVatCredit > c.inputTax * 0.8,
    reason: (c) => `期末留抵税额 ${money(c.endingVatCredit)}，进项税额 ${money(c.inputTax)}，留抵占进项比例偏高。`,
    suggestion: '复核大额采购、固定资产进项、存货积压、销项不足和留抵退税资料。',
    materials: ['增值税申报表', '进项发票明细', '采购明细', '留抵形成说明'],
  },
  {
    code: 'ON-054',
    name: '红字专票金额占开票金额比例偏高',
    taxType: '增值税',
    level: '中',
    basis: '红字发票占比较高时，需复核退货折让、业务取消、跨期调整和虚开冲红风险。',
    caseRef: '自动检测候选：红字专票金额、月开票金额。',
    conditionJson: { all: [{ field: 'monthlyInvoice', operator: '>', value: 0 }, { field: 'redVatSpecialInvoiceAmount', operator: '>', value: 0, compareField: 'monthlyInvoice', multiplier: 0.2 }] },
    requiredFields: ['monthlyInvoice'],
    trigger: (c) => c.monthlyInvoice > 0 && c.redVatSpecialInvoiceAmount > c.monthlyInvoice * 0.2,
    reason: (c) => `红字专票金额 ${money(c.redVatSpecialInvoiceAmount)}，月开票金额 ${money(c.monthlyInvoice)}，红字占比偏高。`,
    suggestion: '复核红字发票原因、退货折让资料、合同变更和收入调整口径。',
    materials: ['红字发票清单', '退货折让资料', '合同变更记录', '收入调整凭证'],
  },
  {
    code: 'ON-055',
    name: '资产总额较大但收入规模偏低',
    taxType: '企业所得税、通用财务/经营',
    level: '低',
    basis: '资产规模与收入规模明显不匹配时，需复核资产使用效率、主体职能和收入确认口径。',
    caseRef: '自动检测候选：资产总额、年销售收入。',
    conditionJson: { all: [{ field: 'annualRevenue', operator: '>', value: 0 }, { field: 'assetsTotal', operator: '>', value: 0, compareField: 'annualRevenue', multiplier: 5 }] },
    requiredFields: ['annualRevenue'],
    trigger: (c) => c.annualRevenue > 0 && c.assetsTotal > c.annualRevenue * 5,
    reason: (c) => `资产总额 ${money(c.assetsTotal)}，年销售收入 ${money(c.annualRevenue)}，资产收入比例偏高。`,
    suggestion: '复核资产用途、闲置资产、投资性资产、主体职能和收入确认口径。',
    materials: ['资产负债表', '固定资产清单', '收入明细', '资产使用说明'],
  },
]


function conditionCandidateRule(config: AdvancedCandidateRuleConfig): RiskRule {
  return {
    ...config,
    trigger: (client) => evaluateCondition(toClientSnapshot(client), config.conditionJson),
    reason: () => publicRiskReason(config.reason),
  }
}

const advancedCandidateRules = advancedCandidateRuleConfigs.map(conditionCandidateRule)

const allCandidateRules = [...candidateRules, ...advancedCandidateRules]

const allBuiltInRules = [...rules, ...allCandidateRules]

function money(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function formatDate(date = new Date()) {
  return date.toLocaleString('zh-CN', { hour12: false })
}

function riskRank(level: RiskLevel) {
  return level === '高' ? 3 : level === '中' ? 2 : 1
}

function getOverallLevel(results: RiskResult[]): RiskLevel {
  if (results.some((r) => r.level === '高')) return '高'
  if (results.some((r) => r.level === '中')) return '中'
  return '低'
}

function getDataCompleteness(client: Client, risks: RiskResult[] = []) {
  const saveTotal = saveRequirementLabels(client).length
  const reportTotal = reportRequirementLabels().length
  const total = saveTotal + reportTotal
  const missing = validateClientForSave(client).length + validateClientForReport(client).length
  const score = Math.round(((total - missing) / total) * 100)
  const label = score >= 85 ? '资料较完整' : score >= 55 ? '资料部分缺失' : '资料不足'
  const note = score >= 85
    ? '当前录入信息可支持初步风险判断，建议结合原始凭证、申报表和合同继续复核。'
    : score >= 55
      ? '当前录入信息可支持初筛，但部分关键资料尚不完整，报告结论应作为风险提示使用。'
      : '当前信息不足以支持充分判断，本次结果仅适合作为线索提示，需补充资料后重新复核。'
  const suggestedMaterials = Array.from(new Set(risks.flatMap((risk) => risk.materials))).slice(0, 12)

  return { score, label, note, suggestedMaterials }
}

type FilingChecklistItem = {
  group: string
  item: string
  status: 'ready' | 'missing' | 'manual' | 'optional'
  handling: 'auto_import' | 'manual_confirm' | 'optional_upload'
  note: string
}

type BasicComplianceFinding = {
  title: string
  level: 'ok' | 'warning' | 'missing'
  detail: string
}

function hasPositive(value: number) {
  return Number.isFinite(value) && value > 0
}

function filingChecklistForClient(client: Client): FilingChecklistItem[] {
  const profileIssues = validateClientForSave(client)
  const profileMissing = new Set(profileIssues.map((issue) => issue.label))
  return [
    {
      group: '企业基础资料',
      item: '营业执照图片或 PDF',
      status: profileMissing.has('企业名称') || profileMissing.has('统一社会信用代码') ? 'missing' : 'ready',
      handling: 'auto_import',
      note: '可自动识别企业名称、统一社会信用代码、注册地址、成立日期和经营范围；纳税人类型仍需确认。',
    },
    {
      group: '企业基础资料',
      item: '纳税人类型、行业、地区、检查期间',
      status: profileMissing.size ? 'manual' : 'ready',
      handling: 'manual_confirm',
      note: '这些字段关系到规则口径，营业执照或报表通常不能完全判断，需要人工确认。',
    },
    {
      group: '财务报表',
      item: '科目余额表',
      status: hasPositive(client.assetsTotal) || hasPositive(client.otherReceivableAgencyBalance) ? 'ready' : 'missing',
      handling: 'auto_import',
      note: '适合从云代账、金亿财税等系统导出 Excel，用于识别资产、往来、税费、成本费用。',
    },
    {
      group: '财务报表',
      item: '利润表',
      status: hasPositive(client.mainBusinessRevenue) || hasPositive(client.monthlyRevenue) ? 'ready' : 'missing',
      handling: 'auto_import',
      note: '用于识别收入、成本、费用、利润等基础经营数据。',
    },
    {
      group: '财务报表',
      item: '资产负债表',
      status: hasPositive(client.assetsTotal) ? 'ready' : 'missing',
      handling: 'auto_import',
      note: '用于识别资产总额、往来款、存货、固定资产、负债等。',
    },
    {
      group: '增值税申报',
      item: '增值税申报表',
      status: hasPositive(client.outputTax) || hasPositive(client.inputTax) || hasPositive(client.vatTaxPayable) ? 'ready' : 'missing',
      handling: 'auto_import',
      note: '用于核对销项税、进项税、应纳税额、留抵税额和申报销售额。',
    },
    {
      group: '企业所得税申报',
      item: '企业所得税申报表',
      status: hasPositive(client.taxableIncome) || hasPositive(client.ytdProfit) ? 'ready' : 'missing',
      handling: 'auto_import',
      note: '用于核对利润、应纳税所得额、优惠政策和纳税调整。',
    },
    {
      group: '发票资料',
      item: '发票汇总表或开票统计表',
      status: hasPositive(client.monthlyInvoice) ? 'ready' : 'missing',
      handling: 'auto_import',
      note: '用于核对开票金额、税率、红字发票、未开票收入等。',
    },
    {
      group: '工资社保个税',
      item: '工资表、社保、个税申报资料',
      status: hasPositive(client.payrollTotal) || hasPositive(client.socialSecurityCount) || hasPositive(client.salaryDeclaredCount) ? 'ready' : 'missing',
      handling: 'auto_import',
      note: '可导入部分字段，但人数口径和申报口径通常需要人工确认。',
    },
    {
      group: '补充明细',
      item: '往来款、大额费用、存货、固定资产、合同或业务说明',
      status: 'optional',
      handling: 'optional_upload',
      note: '命中专业风险或资料不足时再补充，用于解释隐藏风险和测算依据。',
    },
  ]
}

function basicComplianceFindings(client: Client): BasicComplianceFinding[] {
  const findings: BasicComplianceFinding[] = []
  const saveMissing = validateClientForSave(client)
  const reportMissing = validateClientForReport(client)

  findings.push({
    title: '企业建档完整性',
    level: saveMissing.length ? 'missing' : 'ok',
    detail: saveMissing.length
      ? `还需确认：${saveMissing.map((issue) => issue.label).join('、')}`
      : '企业基础资料已满足建档口径。',
  })
  findings.push({
    title: '申报/报表基础数据完整性',
    level: reportMissing.length ? 'missing' : 'ok',
    detail: reportMissing.length
      ? `影响充分判断的字段：${reportMissing.map((issue) => issue.label).join('、')}`
      : '收入、成本、开票、人员和工资等基础检测字段已具备。',
  })

  if (hasPositive(client.monthlyRevenue) && hasPositive(client.monthlyInvoice)) {
    const gap = Math.abs(client.monthlyRevenue - client.monthlyInvoice)
    const ratio = gap / Math.max(client.monthlyRevenue, client.monthlyInvoice)
    findings.push({
      title: '收入与开票金额一致性',
      level: ratio > 0.2 ? 'warning' : 'ok',
      detail: ratio > 0.2
        ? `收入与开票金额差异约 ${(ratio * 100).toFixed(1)}%，需核对未开票收入、预收款或口径差异。`
        : '收入与开票金额差异不大，可继续结合申报表复核。',
    })
  }

  if (hasPositive(client.employees) && hasPositive(client.socialSecurityCount)) {
    findings.push({
      title: '员工人数与社保人数一致性',
      level: client.employees !== client.socialSecurityCount ? 'warning' : 'ok',
      detail: client.employees !== client.socialSecurityCount
        ? `员工人数 ${client.employees} 人，社保人数 ${client.socialSecurityCount} 人，需说明兼职、退休返聘、外包或漏缴情形。`
        : '员工人数与社保人数一致。',
    })
  }

  if (hasPositive(client.outputTax) && hasPositive(client.inputTax) && hasPositive(client.vatTaxPayable)) {
    const theoreticalVat = client.outputTax - client.inputTax
    const gap = Math.abs(theoreticalVat - client.vatTaxPayable)
    findings.push({
      title: '增值税勾稽关系',
      level: gap > Math.max(100, Math.abs(theoreticalVat) * 0.1) ? 'warning' : 'ok',
      detail: gap > Math.max(100, Math.abs(theoreticalVat) * 0.1)
        ? `销项税减进项税与申报应纳税额存在差异，差额约 ${money(gap)}，需核对留抵、转出、减免或预缴。`
        : '销项税、进项税和应纳税额勾稽关系未见明显异常。',
    })
  }

  return findings
}

type IntakeValidationIssue = {
  field: keyof Client
  label: string
  message: string
}

const intakeRequirementLabels: Record<string, IntakeRequirement> = {
  项目口径: 'required',
  集团项目名称: 'conditional',
  主体角色: 'conditional',
  企业名称: 'required',
  地区: 'required',
  行业: 'required',
  纳税人类型: 'required',
  成立时间: 'required',
  统一社会信用代码: 'required',
  所属年度: 'required',
  所属季度: 'conditional',
  所属月份: 'conditional',
  期间开始: 'conditional',
  期间结束: 'conditional',
  数据来源: 'required',
  对比期间: 'optional',
  月收入: 'recommended',
  月成本费用: 'recommended',
  月利润: 'recommended',
  年销售收入: 'computed',
  收款流水: 'recommended',
  员工人数: 'recommended',
  社保人数: 'recommended',
  工资申报人数: 'recommended',
  上季度末人数: 'optional',
  本季度收入: 'computed',
  上季度收入: 'optional',
  本季度成本费用: 'computed',
  上季度成本费用: 'optional',
  本年累计收入: 'computed',
  本年累计成本费用: 'computed',
  本年累计利润: 'computed',
  'EBIT 利润': 'computed',
  '上年 EBIT 利润': 'optional',
  '预算 EBIT 利润': 'optional',
  预算收入: 'optional',
  上年同期收入: 'optional',
  主营业务收入: 'computed',
  主营业务成本: 'computed',
  商品销售收入: 'computed',
  商品销售成本: 'computed',
  人员相关成本费用: 'optional',
  '承租面积（平方米）': 'optional',
  '转租面积（平方米）': 'optional',
  月福利性质餐费: 'optional',
  装修费用: 'optional',
  月开票金额: 'recommended',
  '连续 12 个月销售额': 'recommended',
  平台收入: 'optional',
  红字专票金额: 'optional',
  销项税额: 'optional',
  进项税额: 'optional',
  '增值税应纳/入库税额': 'optional',
  增值税应税销售额: 'computed',
  理论增值税税额: 'optional',
  预算增值税税额: 'optional',
  上期应税销售额: 'optional',
  上期增值税税额: 'optional',
  进销项税率差: 'optional',
  广告服务收入: 'optional',
  文化事业建设费实缴: 'optional',
  期末留抵税额: 'optional',
  业务招待费: 'optional',
  广告宣传费: 'optional',
  职工福利费: 'optional',
  工会经费: 'optional',
  职工教育经费: 'optional',
  应纳税所得额: 'optional',
  资产总额: 'optional',
  全年平均人数: 'optional',
  营业外支出发生额: 'optional',
  营业外收入发生额: 'optional',
  其他应收代收代付余额: 'optional',
  劳务人员人数: 'optional',
  工资薪金总额: 'recommended',
  向个人支付非工资薪金所得: 'optional',
}

function requirementText(requirement?: IntakeRequirement) {
  if (requirement === 'required') return '必填'
  if (requirement === 'recommended') return '检测必填'
  if (requirement === 'conditional') return '条件必填'
  if (requirement === 'computed') return '系统计算'
  return ''
}

function getFieldRequirement(label: string, override?: IntakeRequirement) {
  return override || intakeRequirementLabels[label]
}

function isBlankText(value: unknown) {
  return !String(value || '').trim()
}

function isMissingPositiveNumber(value: number) {
  return !Number.isFinite(value) || value <= 0
}

function inferAnalysisPeriodType(client: Pick<Client, 'analysisPeriodType' | 'analysisYear' | 'analysisQuarter' | 'analysisMonth' | 'periodStartDate' | 'periodEndDate'>): AnalysisPeriodType {
  if (client.analysisMonth) return '月度'
  if (client.analysisQuarter) return '季度'
  if (client.periodStartDate || client.periodEndDate) {
    if (client.analysisYear && client.periodStartDate === `${client.analysisYear}-01-01` && client.periodEndDate === `${client.analysisYear}-12-31`) return '年度'
    return client.analysisYear && client.periodStartDate === `${client.analysisYear}-01-01` ? '年初至今' : '自定义期间'
  }
  if (client.analysisYear) return '年度'
  return client.analysisPeriodType || ''
}

function normalizePeriodDraft<T extends Client>(client: T): T {
  const analysisPeriodType = inferAnalysisPeriodType(client)
  return {
    ...client,
    analysisPeriodType,
    dataBasis: client.dataBasis || '管理报表',
  }
}

function periodRequirementLabels(client: Client) {
  const analysisPeriodType = inferAnalysisPeriodType(client)
  const labels = ['所属年度', '数据来源']
  if (analysisPeriodType === '季度') labels.push('所属季度')
  if (analysisPeriodType === '月度') labels.push('所属月份')
  if (analysisPeriodType === '年初至今' || analysisPeriodType === '自定义期间') {
    labels.push('期间开始', '期间结束')
  }
  return labels
}

function normalizePeriodEntry(entry: Partial<ClientPeriodEntry>): ClientPeriodEntry | null {
  if (!entry.snapshot) return null
  const snapshot = deriveClientMetrics(normalizeClient({ ...entry.snapshot, periodEntries: [] }))
  const months = entry.months?.length ? [...entry.months] : getClientPeriodMonths(snapshot)
  return {
    id: entry.id || `${entry.dataBasis || snapshot.dataBasis || '未填口径'}-${months.join('_') || snapshot.analysisPeriodType || crypto.randomUUID()}`,
    label: entry.label || `${formatAnalysisPeriod(snapshot)}｜${snapshot.dataBasis || '未填写口径'}`,
    analysisPeriodType: (entry.analysisPeriodType ?? snapshot.analysisPeriodType) as AnalysisPeriodType,
    analysisYear: String(entry.analysisYear ?? snapshot.analysisYear ?? ''),
    analysisQuarter: (entry.analysisQuarter ?? snapshot.analysisQuarter ?? '') as AnalysisQuarter,
    analysisMonth: String(entry.analysisMonth ?? snapshot.analysisMonth ?? ''),
    periodStartDate: String(entry.periodStartDate ?? snapshot.periodStartDate ?? ''),
    periodEndDate: String(entry.periodEndDate ?? snapshot.periodEndDate ?? ''),
    dataBasis: (entry.dataBasis ?? snapshot.dataBasis ?? '') as DataBasis,
    comparisonPeriod: String(entry.comparisonPeriod ?? snapshot.comparisonPeriod ?? ''),
    months,
    snapshot,
    savedAt: entry.savedAt || formatDate(),
  }
}

function validateClientForSave(client: Client): IntakeValidationIssue[] {
  const issues: IntakeValidationIssue[] = []
  const add = (field: keyof Client, label: string, missing: boolean, message = `${label}为必填项`) => {
    if (missing) issues.push({ field, label, message })
  }
  const analysisPeriodType = inferAnalysisPeriodType(client)

  add('name', '企业名称', isBlankText(client.name))
  add('creditCode', '统一社会信用代码', isBlankText(client.creditCode))
  add('region', '地区', isBlankText(client.region))
  add('industry', '行业', !hasValidIndustry(client.industry))
  add('taxpayerType', '纳税人类型', isBlankText(client.taxpayerType))
  add('establishedAt', '成立时间', isBlankText(client.establishedAt))
  add('analysisYear', '所属年度', isBlankText(client.analysisYear))
  add('analysisQuarter', '所属季度', analysisPeriodType === '季度' && isBlankText(client.analysisQuarter), '季度数据需要选择所属季度')
  add('analysisMonth', '所属月份', analysisPeriodType === '月度' && isBlankText(client.analysisMonth), '月度数据需要选择所属月份')
  add('periodStartDate', '期间开始', (analysisPeriodType === '年初至今' || analysisPeriodType === '自定义期间') && isBlankText(client.periodStartDate), '期间数据需要填写开始日期')
  add('periodEndDate', '期间结束', (analysisPeriodType === '年初至今' || analysisPeriodType === '自定义期间') && isBlankText(client.periodEndDate), '期间数据需要填写结束日期')
  add('dataBasis', '数据来源', isBlankText(client.dataBasis))
  add('groupName', '集团项目名称', getProjectScope(client) === '集团项目' && isBlankText(client.groupName), '集团项目需要填写集团项目名称')
  add('entityRole', '主体角色', getProjectScope(client) === '集团项目' && isBlankText(client.entityRole), '集团项目需要选择主体角色')

  return issues
}

function saveRequirementLabels(client: Client) {
  const labels = ['项目口径', ...periodRequirementLabels(client), '企业名称', '统一社会信用代码', '地区', '行业', '纳税人类型', '成立时间']
  if (getProjectScope(client) === '集团项目') {
    labels.push('集团项目名称', '主体角色')
  }
  return labels
}

function reportRequirementLabels() {
  return ['月收入', '月成本费用', '月利润', '收款流水', '员工人数', '社保人数', '工资申报人数', '月开票金额', '连续 12 个月销售额', '工资薪金总额']
}

function validateClientForReport(client: Client): IntakeValidationIssue[] {
  const issues: IntakeValidationIssue[] = []
  const add = (field: keyof Client, label: string, missing: boolean) => {
    if (missing) issues.push({ field, label, message: `${label}缺失，报告只能作为线索参考` })
  }

  add('monthlyRevenue', '月收入', isMissingPositiveNumber(client.monthlyRevenue))
  add('monthlyCost', '月成本费用', isMissingPositiveNumber(client.monthlyCost))
  add('monthlyProfit', '月利润', !Number.isFinite(client.monthlyProfit) || client.monthlyProfit === 0)
  add('collectionFlow', '收款流水', isMissingPositiveNumber(client.collectionFlow))
  add('employees', '员工人数', isMissingPositiveNumber(client.employees))
  add('socialSecurityCount', '社保人数', isMissingPositiveNumber(client.socialSecurityCount))
  add('salaryDeclaredCount', '工资申报人数', isMissingPositiveNumber(client.salaryDeclaredCount))
  add('monthlyInvoice', '月开票金额', isMissingPositiveNumber(client.monthlyInvoice))
  add('consecutive12MonthSales', '连续 12 个月销售额', isMissingPositiveNumber(client.consecutive12MonthSales))
  add('payrollTotal', '工资薪金总额', isMissingPositiveNumber(client.payrollTotal))

  return issues
}

function validationSummary(issues: IntakeValidationIssue[]) {
  return issues.map((issue) => issue.label).join('、')
}

function focusFieldByLabel(label: string) {
  const selector = `[data-field-label="${label}"]`
  const target = document.querySelector(selector)
  if (!target) return
  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  target.classList.add('field-highlight')
  window.setTimeout(() => target.classList.remove('field-highlight'), 1600)
}

function normalizeClient(client: Partial<Client>): Client {
  return {
    ...emptyClient,
    ...client,
    id: client.id || crypto.randomUUID(),
    manualDerivedFields: { ...(client.manualDerivedFields || {}) },
    manualDerivedReasons: { ...(client.manualDerivedReasons || {}) },
    projectScope: (client.projectScope ?? '单主体') as ProjectScope,
    entityRole: (client.entityRole ?? '单体企业') as EntityRole,
    taxpayerType: (client.taxpayerType ?? '小规模纳税人') as TaxpayerType,
    analysisPeriodType: (client.analysisPeriodType ?? '年度') as AnalysisPeriodType,
    analysisYear: String(client.analysisYear ?? ''),
    analysisQuarter: (client.analysisQuarter ?? '') as AnalysisQuarter,
    analysisMonth: String(client.analysisMonth ?? ''),
    periodStartDate: String(client.periodStartDate ?? ''),
    periodEndDate: String(client.periodEndDate ?? ''),
    dataBasis: (client.dataBasis || '管理报表') as DataBasis,
    comparisonPeriod: String(client.comparisonPeriod ?? ''),
    periodEntries: (client.periodEntries || [])
      .map((entry) => normalizePeriodEntry(entry))
      .filter((entry): entry is ClientPeriodEntry => Boolean(entry)),
  }
}

type AutoDerivedFieldConfig = {
  key: keyof Client
  label: string
  source: string
  calculate: (client: Client) => number
}

const autoDerivedFieldConfigs: AutoDerivedFieldConfig[] = [
  { key: 'annualRevenue', label: '年销售收入', source: '月收入 x 12', calculate: (client) => Number(client.monthlyRevenue || 0) * 12 },
  { key: 'quarterRevenue', label: '本季度收入', source: '月收入 x 3', calculate: (client) => Number(client.monthlyRevenue || 0) * 3 },
  { key: 'quarterCostExpense', label: '本季度成本费用', source: '月成本费用 x 3', calculate: (client) => Number(client.monthlyCost || 0) * 3 },
  { key: 'ytdRevenue', label: '本年累计收入', source: '年销售收入', calculate: (client) => Number(client.annualRevenue || 0) },
  { key: 'ytdCostExpense', label: '本年累计成本费用', source: '月成本费用 x 12', calculate: (client) => Number(client.monthlyCost || 0) * 12 },
  { key: 'ytdProfit', label: '本年累计利润', source: '月利润 x 12；无月利润时取应纳税所得额', calculate: (client) => Number(client.monthlyProfit || 0) * 12 || Number(client.taxableIncome || 0) },
  { key: 'mainBusinessRevenue', label: '主营业务收入', source: '本年累计收入', calculate: (client) => Number(client.ytdRevenue || 0) },
  { key: 'mainBusinessCost', label: '主营业务成本', source: '本年累计成本费用', calculate: (client) => Number(client.ytdCostExpense || 0) },
  { key: 'ebitProfit', label: 'EBIT 利润', source: '本年累计利润', calculate: (client) => Number(client.ytdProfit || 0) },
  { key: 'goodsSalesRevenue', label: '商品销售收入', source: '主营业务收入', calculate: (client) => Number(client.mainBusinessRevenue || 0) },
  { key: 'goodsCost', label: '商品销售成本', source: '主营业务成本', calculate: (client) => Number(client.mainBusinessCost || 0) },
  { key: 'taxableSales', label: '增值税应税销售额', source: '连续 12 个月销售额；为空时取年销售收入', calculate: (client) => Number(client.consecutive12MonthSales || 0) || Number(client.annualRevenue || 0) },
]

const autoDerivedFieldMap = new Map(autoDerivedFieldConfigs.map((field) => [field.key, field]))

function isManualDerivedField(client: Partial<Client>, field: keyof Client) {
  return Boolean(client.manualDerivedFields?.[String(field)])
}

function toClientSnapshot(client: Client): ClientSnapshot {
  const snapshot = { ...client } as Record<string, unknown>
  delete snapshot.manualDerivedFields
  delete snapshot.manualDerivedReasons
  return snapshot as ClientSnapshot
}

function deriveClientMetrics(client: Client): Client {
  const normalized = normalizeClient(client)
  const derived: Client = {
    ...normalized,
    manualDerivedFields: { ...(normalized.manualDerivedFields || {}) },
    manualDerivedReasons: { ...(normalized.manualDerivedReasons || {}) },
  }

  autoDerivedFieldConfigs.forEach((field) => {
    if (!isManualDerivedField(derived, field.key)) {
      derived[field.key] = field.calculate(derived) as never
    }
  })

  return derived
}

function applyExplicitDerivedPatch(client: Client, patch: Partial<Client>, reason: string) {
  const { fields: manualDerivedFields, reasons: manualDerivedReasons } = explicitDerivedMetadata(
    patch as Record<string, unknown>,
    autoDerivedFieldConfigs.map((field) => String(field.key)),
    client.manualDerivedFields,
    client.manualDerivedReasons,
    reason,
  )
  return deriveClientMetrics({
    ...client,
    ...patch,
    manualDerivedFields,
    manualDerivedReasons,
  })
}

const demoClients: Client[] = createDemoClients()
const demoCaseCreditCodes = new Set(demoClients.map((client) => client.creditCode))

function applyAutoDerivedMetrics(_previous: Client, next: Client) {
  return deriveClientMetrics(next)
}

function getManualOverrideErrors(client: Client) {
  return autoDerivedFieldConfigs.filter((field) => (
    isManualDerivedField(client, field.key) && !String(client.manualDerivedReasons?.[String(field.key)] || '').trim()
  ))
}

function coerceImportedClientPatch(patch: Record<string, unknown>) {
  const coerced: Partial<Client> = {}
  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (key === 'name') {
      const candidate = String(value).trim()
      if (/^(开票日期|填发日期|序号|项目|名称|企业名称|纳税人名称|单位名称|日期|合计|总计)$/.test(candidate) || /^\d{4,}$/.test(candidate)) return
    }
    if (key === 'creditCode') {
      const candidate = String(value).replace(/\s+/g, '').toUpperCase()
      if (!/^[0-9A-Z]{18}$/.test(candidate)) return
      value = candidate
    }
    const current = emptyClient[key as keyof Client]
    coerced[key as keyof Client] = (typeof current === 'number'
      ? Number(String(value).replace(/,/g, '')) || 0
      : typeof current === 'boolean'
        ? ['true', '是', '1', 'yes', 'Y'].includes(String(value).trim())
        : value) as never
  })
  return coerced
}

function extractCompanyNameFromText(text: string) {
  const suffixPattern = '(?:有限责任公司|股份有限公司|有限公司|公司|集团|工作室|中心|店|个体工商户)'
  const normalized = text
    .replace(/\.[^.]+$/, '')
    .replace(/[（）()[\]【】《》]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const tokens = normalized
    .split(/[_\-—,，;；\s]+/)
    .map((token) => token.trim())
    .filter(Boolean)
  const tokenCompany = tokens.find((token) => new RegExp(`^[\\u4e00-\\u9fa5A-Za-z0-9·]{2,60}${suffixPattern}$`).test(token))
  if (tokenCompany) return tokenCompany
  const matches = normalized.match(new RegExp(`[\\u4e00-\\u9fa5A-Za-z0-9·]{2,60}${suffixPattern}`, 'g')) || []
  return matches
    .map((match) => match.replace(/^(?:明细账|全部科目|科目余额表|余额表|资产负债表|利润表|现金流量表|工资表|发票清单|增值税申报表|客户资料|资料)+/, ''))
    .find((match) => match.length >= 4) || ''
}

function inferClientPatchFromFileName(fileName: string): Partial<Client> {
  const baseName = fileName.replace(/\.[^.]+$/, '')
  const periodMatch = baseName.match(/(20\d{2})[年.\-/]?\s*(0?[1-9]|1[0-2])\s*月?/)
  const rangePeriodMatch = baseName.match(/[（(](20\d{2})\.(0?[1-9]|1[0-2])-/)
  const year = periodMatch?.[1] || rangePeriodMatch?.[1] || ''
  const month = periodMatch?.[2] || rangePeriodMatch?.[2] || ''
  const periodMonth = year && month ? `${year}-${month.padStart(2, '0')}` : ''
  const inferredCompanyName = extractCompanyNameFromText(baseName)
  const name = inferredCompanyName || baseName
    .replace(/[（(].*?[）)]/g, '')
    .replace(/20\d{2}[年.\-/]?\s*(0?[1-9]|1[0-2])\s*月?/g, '')
    .replace(/20\d{2}\s*(0[1-9]|1[0-2])\s*[-至到]\s*20\d{2}\s*(0[1-9]|1[0-2])/g, '')
    .replace(/\b20\d{6}\b/g, '')
    .replace(/[_\-—]+/g, ' ')
    .replace(/明细账|全部科目|余额表|批量导出|科目余额表|资产负债表|利润表|现金流量表|导出/g, '')
    .trim()
  return {
    ...(name ? { name } : {}),
    ...(periodMonth
      ? {
          analysisPeriodType: '月度' as AnalysisPeriodType,
          analysisYear: year,
          analysisMonth: periodMonth,
          dataBasis: '管理报表' as DataBasis,
        }
      : {}),
  }
}

function riskDisplayTitle(risk: RiskResult) {
  return risk.name
}

function riskPriority(risk: RiskResult) {
  if (risk.level === '高') return '优先整改'
  if (risk.level === '中') return '尽快复核'
  return '持续关注'
}

function taxTypeSummary(risks: RiskResult[]) {
  const summary = new Map<string, { total: number; high: number; medium: number }>()
  risks.forEach((risk) => {
    risk.taxType.split('、').map((item) => item.trim()).filter(Boolean).forEach((taxType) => {
      const current = summary.get(taxType) || { total: 0, high: 0, medium: 0 }
      current.total += 1
      if (risk.level === '高') current.high += 1
      if (risk.level === '中') current.medium += 1
      summary.set(taxType, current)
    })
  })

  return Array.from(summary.entries())
    .sort(([, a], [, b]) => b.high - a.high || b.medium - a.medium || b.total - a.total)
    .map(([taxType, item]) => `${taxType}：${item.total} 项，其中高风险 ${item.high} 项、中风险 ${item.medium} 项`)
}

function groupedRiskSections(risks: RiskResult[]) {
  const groups = [
    { title: 'VAT 增值税风险', match: (risk: RiskResult) => risk.taxType.includes('增值税') },
    { title: 'CIT 企业所得税风险', match: (risk: RiskResult) => risk.taxType.includes('企业所得税') },
    { title: 'IIT 个人所得税与薪酬风险', match: (risk: RiskResult) => risk.taxType.includes('个人所得税') || risk.taxType.includes('社保') },
    { title: '综合经营与资料缺口风险', match: () => true },
  ]
  const used = new Set<string>()

  return groups.map((group) => {
    const items = risks.filter((risk) => !used.has(risk.code) && group.match(risk))
    items.forEach((risk) => used.add(risk.code))
    return { title: group.title, items }
  })
}

function getProjectScope(client: Client): ProjectScope {
  return client.projectScope === '集团项目' ? '集团项目' : '单主体'
}

function getEntityRole(client: Client): EntityRole {
  const allowed: EntityRole[] = ['单体企业', '集团总部', '经营主体', '关联主体', '个体户/个人独资']
  return allowed.includes(client.entityRole as EntityRole)
    ? client.entityRole as EntityRole
    : getProjectScope(client) === '集团项目' ? '经营主体' : '单体企业'
}

function getGroupName(client: Client) {
  const groupName = String(client.groupName || '').trim()
  return getProjectScope(client) === '集团项目' && groupName
    ? groupName
    : ''
}

function buildGroupSummaries(clients: Client[], managedRules: ManagedRule[] = []) {
  const groups = new Map<string, { name: string; clients: Client[]; risks: RiskResult[]; highClients: number; mediumClients: number }>()

  clients.forEach((client) => {
    const groupName = getGroupName(client)
    if (!groupName) return
    const risks = detectRisks(client, managedRules)
    const level = getOverallLevel(risks)
    const current = groups.get(groupName) || { name: groupName, clients: [], risks: [], highClients: 0, mediumClients: 0 }
    current.clients.push(client)
    current.risks.push(...risks)
    if (level === '高') current.highClients += 1
    if (level === '中') current.mediumClients += 1
    groups.set(groupName, current)
  })

  return Array.from(groups.values()).sort((a, b) => b.highClients - a.highClients || b.risks.length - a.risks.length)
}

function managedRuleToRisk(rule: ManagedRule): RiskRule {
  const builtInRule = allBuiltInRules.find((item) => item.code === rule.code)
  return {
    code: rule.code,
    name: rule.name,
    taxType: rule.taxType,
    level: rule.level,
    basis: rule.basis,
    caseRef: rule.conditionText,
    trigger: (client) => evaluateCondition(toClientSnapshot(client), rule.conditionJson),
    reason: builtInRule?.reason || (() => {
      return '该事项符合规则库配置的触发口径，建议结合录入数据和原始资料进一步复核。'
    }),
    suggestion: rule.suggestion,
    materials: rule.materials,
    conditionJson: rule.conditionJson,
    requiredFields: rule.requiredFields,
  }
}

function riskRuleToManaged(rule: RiskRule): ManagedRule {
  return {
    code: rule.code,
    name: rule.name,
    taxType: rule.taxType,
    level: rule.level,
    basis: rule.basis,
    suggestion: rule.suggestion,
    enabled: true,
    conditionText: rule.caseRef,
    conditionJson: riskRuleCondition(rule),
    requiredFields: rule.requiredFields || [],
    materials: rule.materials,
  }
}

function riskRuleCondition(rule: RiskRule) {
  return rule.conditionJson || builtInRuleConditions[rule.code] || emptyRuleCondition
}

function hydrateManagedRules(managed: ManagedRule[] = []) {
  const existingByCode = new Map(managed.map((rule) => [rule.code, rule]))
  const builtInCodes = new Set(allBuiltInRules.map((rule) => rule.code))
  const hydratedBuiltIns = allBuiltInRules.map((builtInRule) => {
    const fallback = riskRuleToManaged(builtInRule)
    const existing = existingByCode.get(builtInRule.code)
    if (!existing) return fallback

    const shouldUseFallbackCondition = !isExecutableCondition(existing.conditionJson) && isExecutableCondition(fallback.conditionJson)
    return {
      ...fallback,
      ...existing,
      enabled: shouldUseFallbackCondition ? true : existing.enabled,
      conditionText: shouldUseFallbackCondition ? fallback.conditionText : existing.conditionText,
      conditionJson: shouldUseFallbackCondition ? fallback.conditionJson : existing.conditionJson,
      requiredFields: shouldUseFallbackCondition ? fallback.requiredFields : existing.requiredFields,
      materials: existing.materials.length ? existing.materials : fallback.materials,
    }
  })
  const customRules = managed.filter((rule) => !builtInCodes.has(rule.code))

  return [...hydratedBuiltIns, ...customRules].sort((a, b) => a.code.localeCompare(b.code, 'zh-CN'))
}

function riskRuleExecution(client: Client, rule: RiskRule) {
  return evaluateRuleExecution(toClientSnapshot(client), {
    code: rule.code,
    enabled: true,
    conditionJson: riskRuleCondition(rule),
    requiredFields: rule.requiredFields,
  })
}

function getSourceRules(managed: ManagedRule[] = []) {
  const executableRules = hydrateManagedRules(managed)
    .filter((rule) => rule.enabled && isExecutableCondition(rule.conditionJson))
    .map(managedRuleToRisk)

  return executableRules.length ? executableRules : allBuiltInRules
}

const duplicateRiskGroups = [
  ['R015', 'ON-021'],
  ['R016', 'ON-020'],
  ['R017', 'ON-005', 'ON-019'],
]

function consolidateRisks(risks: RiskRule[]) {
  const removeCodes = new Set<string>()
  duplicateRiskGroups.forEach(([primary, ...duplicates]) => {
    if (risks.some((risk) => risk.code === primary)) {
      duplicates.forEach((code) => removeCodes.add(code))
    }
  })

  return risks.filter((risk) => !removeCodes.has(risk.code))
}

function ruleOrigin(rule: ManagedRule | RiskRule) {
  if (rule.code.startsWith('ON-')) return 'Excel规则'
  if (rule.code.startsWith('R')) return '内置规则'
  return '自定义规则'
}

function ruleSelfCheck(rulesToCheck: ManagedRule[]) {
  const total = rulesToCheck.length
  const executable = rulesToCheck.filter((rule) => rule.enabled && isExecutableCondition(rule.conditionJson)).length
  const missingCondition = rulesToCheck.filter((rule) => !isExecutableCondition(rule.conditionJson)).length
  const disabled = rulesToCheck.filter((rule) => !rule.enabled).length

  return { total, executable, missingCondition, disabled }
}

function detectRisks(client: Client, managed: ManagedRule[] = []): RiskResult[] {
  const sourceRules = getSourceRules(managed)
  const detectionClient = deriveClientMetrics(client)

  const matchedRules = sourceRules
    .filter((rule) => riskRuleExecution(detectionClient, rule).status === 'matched')
    .sort((a, b) => riskRank(b.level) - riskRank(a.level))

  return consolidateRisks(matchedRules)
    .map((rule) => ({ ...rule, triggeredAt: formatDate() }))
}

function getSkippedRules(client: Client, managed: ManagedRule[] = []): SkippedRule[] {
  const detectionClient = deriveClientMetrics(client)

  return getSourceRules(managed)
    .map((rule) => ({ rule, execution: riskRuleExecution(detectionClient, rule) }))
    .filter((item) => item.execution.status === 'skipped_missing_data')
}

function fieldLabel(field: string) {
  return conditionFields.find((item) => item.value === field)?.label || clientImportFieldLabels[field] || field
}


function uniqueLabels(labels: string[]) {
  return Array.from(new Set(labels.filter(Boolean)))
}

function cleanAssistantValue(value: string) {
  return value.replace(/[，。；;：:\s]+$/g, '').trim()
}

function inferAssistantCleaningPatch(message: string, contextClient?: Client): { patch: Partial<Client>; changes: string[] } | null {
  const patch: Partial<Client> = {}
  const changes: string[] = []
  const companyMatch = message.match(/(?:这是|这个是|客户是|公司是|企业是|名称是|企业名称是)\s*([^，。；;\n]+?(?:有限责任公司|股份有限公司|有限公司|公司|集团|工作室|中心|店|个体工商户))/)
    || message.match(/([^，。；;\s]+?(?:有限责任公司|股份有限公司|有限公司|公司|集团|工作室|中心|店|个体工商户))/)
  if (companyMatch?.[1]) {
    patch.name = cleanAssistantValue(companyMatch[1])
    changes.push(`企业名称：${patch.name}`)
  }

  const creditCodeMatch = message.match(/(?:统一社会信用代码|信用代码|税号)[是为:：\s]*([0-9A-Z]{15,20})/i)
  if (creditCodeMatch?.[1]) {
    patch.creditCode = creditCodeMatch[1].toUpperCase()
    changes.push(`统一社会信用代码：${patch.creditCode}`)
  }

  const periodRangeMatch = message.match(/(?:(20\d{2})\s*年\s*)?(1[0-2]|0?[1-9])\s*月?\s*(?:至|到|[-~—])\s*(1[0-2]|0?[1-9])\s*月/)
  const contextYear = contextClient?.analysisYear || contextClient?.periodStartDate?.slice(0, 4) || ''
  if (periodRangeMatch && (periodRangeMatch[1] || contextYear)) {
    const year = periodRangeMatch[1] || contextYear
    const startMonth = Number(periodRangeMatch[2])
    const endMonth = Number(periodRangeMatch[3])
    const endDay = new Date(Date.UTC(Number(year), endMonth, 0)).getUTCDate()
    patch.analysisPeriodType = '自定义期间'
    patch.analysisYear = year
    patch.analysisMonth = ''
    patch.periodStartDate = `${year}-${String(startMonth).padStart(2, '0')}-01`
    patch.periodEndDate = `${year}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
    changes.push(`所属期间：${year}年${startMonth}月至${endMonth}月`)
  } else {
    const periodMatch = message.match(/(20\d{2})\s*年\s*(1[0-2]|0?[1-9])\s*月/)
    if (periodMatch) {
      patch.analysisPeriodType = '月度'
      patch.analysisYear = periodMatch[1]
      patch.analysisMonth = `${Number(periodMatch[2])}月`
      changes.push(`所属期间：${patch.analysisYear}年${patch.analysisMonth}`)
    }
  }

  if (/一般纳税人/.test(message)) {
    patch.taxpayerType = '一般纳税人'
    changes.push('纳税人类型：一般纳税人')
  } else if (/小规模/.test(message)) {
    patch.taxpayerType = '小规模纳税人'
    changes.push('纳税人类型：小规模纳税人')
  } else if (/个体工商户|个体户/.test(message)) {
    patch.taxpayerType = '个体工商户'
    changes.push('纳税人类型：个体工商户')
  }

  const regionMatch = message.match(/(?:地区|所在地|注册地|城市)[是为:：\s]*([^，。；;\n]{2,20})/)
  if (regionMatch?.[1]) {
    patch.region = cleanAssistantValue(regionMatch[1])
    changes.push(`地区：${patch.region}`)
  }

  const industryMatch = message.match(/(?:行业|所属行业)[是为:：\s]*([^，。；;\n]{2,24})/)
  if (industryMatch?.[1]) {
    patch.industry = cleanAssistantValue(industryMatch[1])
    changes.push(`行业：${patch.industry}`)
  }

  return changes.length ? { patch, changes } : null
}

function resolvedConfirmationFields(message: string, patch: Partial<Client>) {
  const fields = new Set<string>()
  if (patch.analysisYear || patch.analysisMonth || patch.periodStartDate || patch.periodEndDate) fields.add('period')
  if (/进项|销项|进销项|两者|都有/.test(message)) fields.add('invoiceDirection')
  if (/本月数|本期数|本年累计|期末余额|年初余额/.test(message)) fields.add('periodNature')
  if (/单月发生额|累计余额|截至.*余额|本期发生额/.test(message)) fields.add('balanceNature')
  if (/逐行收录|生成标准记录|按.*口径/.test(message)) fields.add('parserScope')
  if (/未识别.*(?:不需要|无需)收录|列.*分别对应/.test(message)) fields.add('unmappedHeaders')
  if (/工资表|个税扣缴|科目余额表|明细账|财务报表|增值税申报|发票清单/.test(message)) fields.add('documentType')
  return fields
}

const assistantThreadsStorageKey = 'hy-tax-ai-assistant-threads'

function createAssistantThread(title = '新对话'): AssistantThread {
  const now = formatDate()
  return {
    id: crypto.randomUUID(),
    title,
    messages: [],
    drafts: [],
    createdAt: now,
    updatedAt: now,
  }
}

function loadAssistantThreads() {
  if (typeof window === 'undefined') return [createAssistantThread()]
  try {
    const parsed = JSON.parse(window.localStorage.getItem(assistantThreadsStorageKey) || '[]') as AssistantThread[]
    const validThreads = parsed.filter((thread) => thread?.id && thread?.title)
    return validThreads.length ? validThreads : [createAssistantThread()]
  } catch {
    return [createAssistantThread()]
  }
}

function assistantThreadTitleFromText(text: string) {
  const cleanText = text.replace(/\s+/g, ' ').trim()
  if (!cleanText) return '新对话'
  return cleanText.length > 18 ? `${cleanText.slice(0, 18)}...` : cleanText
}

function looksLikeAssistantFileTitle(title: string) {
  return /[_]|\.xlsx?$|\.pdf$|明细账|科目|余额表|工资表|申报表|发票|资料/.test(title)
}

function uniqueByQuestion(questions: IntakeConfirmationQuestion[]) {
  const seen = new Set<string>()
  return questions.filter((question) => {
    const key = question.id || question.question
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function compactAssistantDraftForModel(draft?: AiAssistantDraft) {
  if (!draft) return null
  return {
    id: draft.id,
    targetMode: draft.targetMode,
    client: {
      name: draft.client.name,
      creditCode: draft.client.creditCode,
      region: draft.client.region,
      industry: draft.client.industry,
      taxpayerType: draft.client.taxpayerType,
      establishedAt: draft.client.establishedAt,
      analysisPeriodType: draft.client.analysisPeriodType,
      analysisYear: draft.client.analysisYear,
      analysisQuarter: draft.client.analysisQuarter,
      analysisMonth: draft.client.analysisMonth,
      periodStartDate: draft.client.periodStartDate,
      periodEndDate: draft.client.periodEndDate,
      dataBasis: draft.client.dataBasis,
      monthlyRevenue: draft.client.monthlyRevenue,
      monthlyCost: draft.client.monthlyCost,
      monthlyProfit: draft.client.monthlyProfit,
      mainBusinessRevenue: draft.client.mainBusinessRevenue,
      mainBusinessCost: draft.client.mainBusinessCost,
      ytdRevenue: draft.client.ytdRevenue,
      ytdCostExpense: draft.client.ytdCostExpense,
      ytdProfit: draft.client.ytdProfit,
      outputTax: draft.client.outputTax,
      inputTax: draft.client.inputTax,
      assetsTotal: draft.client.assetsTotal,
      payrollTotal: draft.client.payrollTotal,
      entertainmentExpense: draft.client.entertainmentExpense,
      otherReceivableAgencyBalance: draft.client.otherReceivableAgencyBalance,
    },
    labels: draft.labels.slice(0, 30),
    missingSaveLabels: draft.missingSaveLabels,
    rawMaterials: draft.rawMaterials.map((material) => ({
      name: material.name,
      sourceType: material.sourceType,
      documentType: material.documentType,
      periodStart: material.periodStart,
      periodEnd: material.periodEnd,
      confirmationQuestions: material.confirmationQuestions || [],
      size: material.size,
      uploadedAt: material.uploadedAt,
    })),
    confirmationQuestions: draft.confirmationQuestions || [],
    taxDataRecordCounts: draft.taxDataRecordCounts || {},
    taxDataWarnings: draft.taxDataWarnings || [],
    mappings: draft.mappings.slice(0, 30),
    unmappedHeaders: draft.unmappedHeaders.slice(0, 30),
    detectedTables: draft.detectedTables,
    changeLog: draft.changeLog.slice(0, 6).map((change) => ({
      source: change.source,
      detail: change.detail,
      at: change.at,
    })),
  }
}

function sanitizeAssistantAnswer(answer: string) {
  return answer
    .replace(/页面上的[「“"]?保存[」”"]?\s*或\s*[「“"]?提交[」”"]?按钮/g, '在对话里回复“确认导入”')
    .replace(/点击[「“"]?保存[」”"]?\s*或\s*[「“"]?提交[」”"]?按钮/g, '在对话里回复“确认导入”')
    .replace(/点击页面上的[「“"]?保存[」”"]?按钮/g, '在对话里回复“确认导入”')
    .replace(/点击页面上的[「“"]?提交[」”"]?按钮/g, '在对话里回复“确认导入”')
}

function isCurrentFileConfirmationQuestion(question: IntakeConfirmationQuestion) {
  const allowedFields = new Set([
    'documentType',
    'period',
    'unmappedHeaders',
    'mappedFields',
    'parserScope',
    'periodNature',
    'balanceNature',
    'invoiceDirection',
  ])
  return allowedFields.has(question.field) || question.field.startsWith('crossMaterial.')
}

function filterCurrentFileConfirmationQuestions(questions: IntakeConfirmationQuestion[]) {
  return questions.filter(isCurrentFileConfirmationQuestion)
}

function sanitizeIntakeStageAssistantAnswer(answer: string) {
  return sanitizeAssistantAnswer(answer)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false
      if (/分析.*(全年|全年度|几个月|某几个月|期间范围|范围)/.test(line)) return false
      if (/企业基础信息|统一社会信用代码、地区、行业、纳税人类型、成立时间/.test(line)) return false
      if (/还需要确认：.*(统一社会信用代码|地区|行业|纳税人类型|成立时间|分析期间范围)/.test(line)) return false
      return true
    })
    .join('\n')
}

function assistantMessageBlocks(content: string) {
  const blocks: Array<{ type: 'paragraph'; text: string } | { type: 'list'; items: string[] }> = []
  let paragraph: string[] = []
  let items: string[] = []
  const flushParagraph = () => {
    const text = paragraph.join(' ').trim()
    if (text) blocks.push({ type: 'paragraph', text })
    paragraph = []
  }
  const flushItems = () => {
    if (items.length) blocks.push({ type: 'list', items })
    items = []
  }
  content.split(/\n+/).forEach((rawLine) => {
    const line = rawLine.trim()
    if (!line) {
      flushParagraph()
      flushItems()
      return
    }
    const item = line.match(/^[-•]\s*(.+)$/) || line.match(/^\d+[.、]\s*(.+)$/)
    if (item) {
      flushParagraph()
      items.push(item[1].trim())
      return
    }
    flushItems()
    paragraph.push(line)
  })
  flushParagraph()
  flushItems()
  return blocks
}

function downloadClientImportTemplate() {
  const csv = createClientImportTemplateCsv()
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'HY税务健康检查导入模板.csv'
  link.click()
  URL.revokeObjectURL(url)
}

const importTemplateFieldGuides = [
  { label: '企业名称 / 统一社会信用代码', detail: '用于建立或识别企业档案，导入后仍需人工确认是否为本次检查主体。' },
  { label: '所属年度 / 所属月份 / 数据来源', detail: '用于形成期间快照，决定后续检测和报告对应哪一段审阅范围。' },
  { label: '月收入 / 月成本费用 / 月利润', detail: '用于基础经营规模、利润波动和所得税相关风险初筛。' },
  { label: '收款流水 / 月开票金额', detail: '用于比对收款、收入和开票差异，只做预填提示，不替代账务复核。' },
  { label: '员工人数 / 社保人数 / 工资申报人数', detail: '用于个税、社保和用工人数一致性初筛。' },
]

const importTemplateFieldGroups = [
  { title: '建档识别', fields: '企业名称、统一社会信用代码、地区、行业、纳税人类型' },
  { title: '期间快照', fields: '所属年度、所属月份、数据来源' },
  { title: '金额预填', fields: '月收入、月成本费用、月利润、连续12个月销售额' },
  { title: '收付票据', fields: '收款流水、月开票金额' },
  { title: '用工一致性', fields: '员工人数、社保人数、工资申报人数' },
]

const importSampleCheckSteps = [
  { title: '先试一行', detail: '用脱敏样例行导入，确认表头可被识别。' },
  { title: '核对四类字段', detail: '重点看企业识别、期间快照、金额预填和用工人数。' },
  { title: '再保存数据', detail: '样例值请替换为已复核数据，保存前完成人工确认。' },
]

const importManualReviewChecklist = [
  '企业名称、统一社会信用代码与本次检查主体一致',
  '所属年度、月份和数据来源对应正确期间',
  '收入、成本、利润、收款和开票金额已和源表核对',
  '员工、社保和工资申报人数已确认口径一致',
]

const importEvidencePacketItems = [
  '原始导出文件',
  '字段映射确认清单',
  '保存前人工复核记录',
  '未识别字段处理说明',
]

const importArchiveNamingHints = [
  '企业简称',
  '检查期间',
  '导入批次',
]

const importAcceptanceSummaryItems = [
  '来源已说明',
  '字段已核对',
  '结论已确认',
]

const unmappedImportTemplateSuggestions = [
  '企业名称',
  '统一社会信用代码',
  '所属年度',
  '所属月份',
  '月收入',
  '月开票金额',
  '员工人数',
]

function plainRiskLevel(level: RiskLevel) {
  const rank = riskRank(level)
  if (rank >= 3) return '高'
  if (rank === 2) return '中'
  return '低'
}

function riskCountByRank(risks: RiskResult[], rank: number) {
  return risks.filter((risk) => riskRank(risk.level) === rank).length
}

function reportValue(value: string | number | undefined) {
  const text = String(value ?? '').trim()
  return text || '未填写'
}

function riskReasonForReport(client: Client, risk: RiskResult) {
  return publicRiskReason(risk.reason(client))
}

function exposureEstimateForRisk(client: Client, risk: RiskResult) {
  const taxableSales = Number(client.taxableSales || client.monthlyRevenue || 0)
  const vatPayable = Number(client.vatTaxPayable || 0)
  const taxableIncome = Number(client.taxableIncome || client.monthlyProfit || 0)
  const payroll = Number(client.payrollTotal || 0)
  const taxType = risk.taxType || ''

  if (taxType.includes('增值税') && taxableSales > 0) {
    return `可先以应税销售额 ${money(taxableSales)}、已填增值税税额 ${money(vatPayable)} 为基础复核税负率、开票收入和申报收入差异；最终风险敞口需结合申报表、发票明细和适用税率测算。`
  }
  if (taxType.includes('企业所得税') && taxableIncome > 0) {
    return `可先以应纳税所得额或利润口径 ${money(taxableIncome)} 为基础复核纳税调增影响；最终风险敞口需结合汇算清缴申报表、扣除凭证和会计明细测算。`
  }
  if ((taxType.includes('个人所得税') || taxType.includes('社保')) && payroll > 0) {
    return `可先以工资薪金总额 ${money(payroll)}、个税申报人数和社保人数为基础复核扣缴风险；最终影响需结合个税明细、社保记录和人员台账测算。`
  }
  return '当前录入数据不足以直接量化税额影响，建议在补充申报表、发票明细、合同、付款流水和会计明细后进行专项测算。'
}

function findingAnalysisForRisk(client: Client, risk: RiskResult) {
  const reason = riskReasonForReport(client, risk)
  return `系统规则命中原因为：${reason}。该事项不直接等同于税务机关最终认定，但说明当前数据或业务安排存在需要复核的异常信号，应结合原始凭证、申报表和业务实质进一步确认。`
}

function buildStructuredRiskFinding(client: Client, risk: RiskResult): StructuredRiskFinding {
  const template = deepReportRuleTemplates[risk.code]
  if (template) {
    return {
      id: risk.code,
      title: riskDisplayTitle(risk),
      level: risk.level,
      taxType: risk.taxType,
      priority: riskPriority(risk),
      scenario: template.scenario,
      currentFinding: riskReasonForReport(client, risk),
      riskAnalysis: template.riskAnalysis,
      exposureEstimate: template.measurementMethod,
      recommendation: template.remediation,
      basis: publicRiskBasis(template.legalBasis),
      legalBasis: template.legalBasis,
      remediation: template.remediation,
      materials: Array.from(new Set([...template.materials, ...risk.materials])),
      deepTemplate: true,
    }
  }

  return {
    id: risk.code,
    title: riskDisplayTitle(risk),
    level: risk.level,
    taxType: risk.taxType,
    priority: riskPriority(risk),
    scenario: '该事项由系统规则命中，说明当前录入数据存在需要进一步复核的异常信号。',
    currentFinding: riskReasonForReport(client, risk),
    riskAnalysis: findingAnalysisForRisk(client, risk),
    exposureEstimate: exposureEstimateForRisk(client, risk),
    recommendation: risk.suggestion,
    basis: publicRiskBasis(risk.basis),
    legalBasis: publicRiskBasis(risk.basis),
    remediation: risk.suggestion,
    materials: risk.materials,
    deepTemplate: false,
  }
}

function buildStructuredReport(client: Client, risks: RiskResult[]): StructuredReport {
  const level = getOverallLevel(risks)
  const highRisks = riskCountByRank(risks, 3)
  const mediumRisks = riskCountByRank(risks, 2)
  const lowRisks = Math.max(risks.length - highRisks - mediumRisks, 0)
  const completeness = getDataCompleteness(client, risks)
  const missingFields = validateClientForReport(client).map((issue) => issue.label)
  const findings = risks.map((risk) => buildStructuredRiskFinding(client, risk))
  const groupName = getGroupName(client)
  const suggestedMaterials = Array.from(new Set([
    ...completeness.suggestedMaterials,
    ...risks.flatMap((risk) => risk.materials),
  ])).slice(0, 12)
  const expertReviewItems = Array.from(new Set(
    suggestedMaterials.map((item) => `复核资料：${item}`),
  )).slice(0, 10)

  return {
    version: 'professional-v1',
    title: `${client.name} 中国税务健康检查报告`,
    clientProfile: [
      { label: '企业名称', value: reportValue(client.name) },
      { label: '统一社会信用代码', value: reportValue(client.creditCode) },
      { label: '所属地区', value: reportValue(client.region) },
      { label: '所属行业', value: reportValue(client.industry) },
      { label: '纳税人类型', value: reportValue(client.taxpayerType) },
      { label: '项目口径', value: reportValue(getProjectScope(client)) },
      { label: '主体角色', value: reportValue(getEntityRole(client)) },
      { label: '集团项目', value: groupName || '不适用' },
    ],
    scope: [
      { label: '报告编号', value: reportDocumentId(client) },
      { label: '报告版本', value: 'V1.0' },
      { label: '报告状态', value: '系统初筛版（待顾问复核）' },
      { label: '审阅期间', value: formatAnalysisPeriod(client) },
      { label: '数据来源', value: reportValue(client.dataBasis) },
      { label: '对比期间', value: reportValue(client.comparisonPeriod) },
      {
        label: '期间摘要',
        value: reportScopeSummary({
          periodLabel: formatAnalysisPeriod(client),
          dataBasis: client.dataBasis,
          comparisonPeriod: client.comparisonPeriod,
        }),
      },
      { label: '复核建议', value: reportReviewAction({ totalRisks: risks.length, highRisks, mediumRisks }) },
      { label: '生成时间', value: formatDate() },
      { label: '工作方法', value: '基于企业录入数据、已保存期间快照和系统规则库进行自动检测，并由 AI 仅作表达润色和数据复核提示。' },
      { label: '工作限制', value: '本次检查未替代原始凭证穿行测试、税务机关沟通、专项鉴证或法律意见。' },
    ],
    executiveSummary: {
      overallLevel: level,
      totalRisks: risks.length,
      highRisks,
      mediumRisks,
      lowRisks,
      conclusion: risks.length
        ? `本次共识别 ${risks.length} 项税务风险提示，其中高风险 ${highRisks} 项、中风险 ${mediumRisks} 项、低风险 ${lowRisks} 项，综合风险等级为${plainRiskLevel(level)}。建议优先处理高风险事项，并对中风险事项安排资料复核。`
        : '本次在已录入数据和当前规则覆盖范围内未识别明显风险事项，但仍建议补充原始凭证、申报表和发票明细进行人工复核。',
    },
    dataQuality: {
      score: completeness.score,
      label: completeness.label,
      note: completeness.note,
      missingFields,
      suggestedMaterials,
    },
    taxSummaries: taxTypeSummary(risks),
    keyFindings: findings.filter((finding) => riskRank(finding.level) >= 2).slice(0, 8),
    detailedFindings: findings,
    actionPlan: findings.slice(0, 12).map((finding) => ({
      priority: finding.priority,
      item: finding.title,
      ownerHint: riskRank(finding.level) >= 3 ? '建议由财务负责人牵头，必要时引入外部税务顾问复核。' : '建议由财税经办人员补充资料后复核。',
    })),
    expertReviewItems,
    followUpCadence: reportFollowUpCadence({ highRisks, mediumRisks, totalRisks: risks.length }),
    deliveryChecklist: reportDeliveryChecklist({ hasRisks: risks.length > 0, suggestedMaterials }),
    clientAcknowledgement: reportClientAcknowledgement({
      periodLabel: formatAnalysisPeriod(client),
      dataBasis: client.dataBasis,
    }),
    signOffBlock: reportSignOffBlock(),
    disclaimers: [
      '本报告基于企业提供资料、系统录入数据及规则库进行风险提示，不构成税务机关认定、税务鉴证结论或法律意见。',
      'AI 仅用于数据复核提示和报告表达润色，不得新增、删除或覆盖规则引擎已经命中的风险结论。',
      '若审阅期间、数据来源、申报口径或原始凭证发生变化，应重新检测并生成报告。',
      '涉及具体补税、滞纳金、罚款或整改方案的事项，应结合完整账套、申报表、发票、合同、付款流水及当地税务实践进一步确认。',
    ],
  }
}

function buildProfessionalReportContent(report: StructuredReport) {
  const profile = report.clientProfile.map((item) => `${item.label}：${item.value}`).join('\n')
  const scope = report.scope.map((item) => `${item.label}：${item.value}`).join('\n')
  const keyFindings = report.keyFindings.length
    ? report.keyFindings.map((item, index) => `${index + 1}. 【${plainRiskLevel(item.level)}风险】${item.title}：${item.currentFinding}`).join('\n')
    : '当前未形成需要在摘要中重点列示的风险事项。'
  const details = report.detailedFindings.length
    ? report.detailedFindings.map((item, index) => `${index + 1}. ${item.title}
风险等级：${plainRiskLevel(item.level)}风险
涉及税种：${item.taxType}
整改优先级：${item.priority}
事项背景：${item.scenario}
当前发现：${item.currentFinding}
潜在税务风险分析：${item.riskAnalysis}
测算逻辑：${item.exposureEstimate}
政策/规则依据：${item.legalBasis}
优化建议：${item.remediation}
建议补充资料：${item.materials.join('、') || '暂无'}
`).join('\n')
    : '当前未命中自动风险事项。'

  return `《${report.title}》

一、项目背景及工作范围
${profile}

${scope}

二、报告摘要：我们的观点
${report.executiveSummary.conclusion}

资料完整性：${report.dataQuality.score}%（${report.dataQuality.label}）
${report.dataQuality.note}

三、重要事项汇总
${keyFindings}

四、分税种风险摘要
${report.taxSummaries.length ? report.taxSummaries.join('\n') : '当前未形成分税种风险提示。'}

五、重要事项章节
${details}

六、专家核查清单
${report.expertReviewItems.length ? report.expertReviewItems.map((item, index) => `${index + 1}. ${item}`).join('\n') : '当前无额外专家核查提示。'}

七、整改优先级
${report.actionPlan.length ? report.actionPlan.map((item, index) => `${index + 1}. ${item.priority}：${item.item}。${item.ownerHint}`).join('\n') : '当前无需要列入整改清单的自动风险事项。'}

八、后续跟进节奏
${report.followUpCadence.map((item, index) => `${index + 1}. ${item}`).join('\n')}

九、交付资料清单
${report.deliveryChecklist.map((item, index) => `${index + 1}. ${item}`).join('\n')}

十、客户确认事项
${report.clientAcknowledgement.map((item, index) => `${index + 1}. ${item}`).join('\n')}

十一、报告签收栏
${report.signOffBlock.map((item) => `${item.label}：${item.value}`).join('\n')}

十二、资料缺口及建议补充资料
缺失字段：${report.dataQuality.missingFields.length ? report.dataQuality.missingFields.join('、') : '无'}
建议补充资料：${report.dataQuality.suggestedMaterials.length ? report.dataQuality.suggestedMaterials.join('、') : '暂无'}

十三、责任边界及免责声明
${report.disclaimers.map((item, index) => `${index + 1}. ${item}`).join('\n')}`
}

function buildReportContent(client: Client, risks: RiskResult[]) {
  const level = getOverallLevel(risks)
  const highCount = risks.filter((r) => r.level === '高').length
  const mediumCount = risks.filter((r) => r.level === '中').length
  const completeness = getDataCompleteness(client, risks)
  const reportMissingFields = validateClientForReport(client)
  const byTaxType = taxTypeSummary(risks).join('\n')
  const groupedSections = groupedRiskSections(risks)
    .map(({ title, items }) => `${title}
${items.length ? items.map((risk, index) => `${index + 1}. 【${risk.level}风险】${riskDisplayTitle(risk)}
触发原因：${riskReasonForReport(client, risk)}
整改建议：${risk.suggestion}
需补资料：${risk.materials.join('、')}`).join('\n') : '本章节暂未命中风险。'}`)
    .join('\n\n')
  const groupName = getGroupName(client)
  const riskSummary = risks
    .slice(0, 8)
    .map((risk, index) => `${index + 1}. 【${risk.level}风险】${riskDisplayTitle(risk)}：${riskReasonForReport(client, risk)}`)
    .join('\n')

  return `《企业税务风险体检报告》

一、企业基本情况
企业名称：${client.name}
统一社会信用代码：${client.creditCode || '未填写'}
所属地区：${client.region}
所属行业：${client.industry}
纳税人类型：${client.taxpayerType}
项目口径：${getProjectScope(client)}
${groupName ? `所属集团项目：${groupName}\n主体角色：${getEntityRole(client)}` : `主体角色：${getEntityRole(client)}`}
数据期间：${formatAnalysisPeriod(client)}
数据来源：${client.dataBasis || '未填写'}
对比期间：${client.comparisonPeriod || '未填写'}
最近检测时间：${formatDate()}

二、综合风险结论
本次系统共命中 ${risks.length} 项风险提示，其中高风险 ${highCount} 项，中风险 ${mediumCount} 项，综合风险等级为【${level}】。
${reportMissingFields.length ? `本次基础检测资料仍缺少：${validationSummary(reportMissingFields)}。报告结论应作为风险线索参考，补齐资料后建议重新生成。` : '本次基础检测必填资料已补齐，可支持初步风险判断。'}
本结论基于已选档案期间数据和系统规则库生成，建议由财税专业人员结合原始凭证、账套、申报表、合同、资金流水进一步复核。
本报告仅适用于上述数据期间和数据来源；期间或数据来源变化后，建议重新生成报告。

三、资料完整性说明
资料完整度：${completeness.score}%（${completeness.label}）
说明：${completeness.note}
基础检测缺失字段：${reportMissingFields.length ? validationSummary(reportMissingFields) : '无'}
建议优先补充资料：${completeness.suggestedMaterials.length ? completeness.suggestedMaterials.join('、') : '当前未形成明确补充资料清单。'}

四、分税种风险摘要
${byTaxType || '暂未形成分税种风险提示。'}

五、分税种风险章节
${groupedSections}

六、重点风险事项
${riskSummary || '未发现明显高频风险。建议继续完善资料后复核。'}

七、风险明细与整改建议
${risks
  .map(
    (risk, index) => `${index + 1}. ${riskDisplayTitle(risk)}
风险等级：${risk.level}
整改优先级：${riskPriority(risk)}
涉及税种：${risk.taxType}
触发原因：${riskReasonForReport(client, risk)}
政策/案例依据：${publicRiskBasis(risk.basis)}
建议动作：${risk.suggestion}
建议补充资料：${risk.materials.join('、')}
`,
  )
  .join('\n')}

八、整改优先级
${risks.length
  ? risks.map((risk, index) => `${index + 1}. ${riskPriority(risk)}｜${riskDisplayTitle(risk)}`).join('\n')
  : '当前暂无需列入整改清单的风险事项。'}

九、后续处理建议
建议基于本报告推进以下事项：
1. 补充缺失资料，先完成账税数据一致性复核。
2. 对高风险事项建立整改清单和责任人。
3. 按月输出风险跟踪表，形成持续合规管理机制。
4. 对涉及发票、收入、个人账户和优惠政策的事项优先处理。

十、免责声明
本报告基于企业提供资料及系统规则进行辅助分析，仅供经营和税务风险管理参考。具体税务处理应结合完整原始资料、适用地区口径及最新政策，并由专业人员进一步复核确认。`
}


function downloadWord(report: Report) {
  const html = professionalReportDocumentHtml(report, 'word')
  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = reportFileName(report, 'doc')
  link.click()
  URL.revokeObjectURL(url)
}

function printReportPdf(report: Report) {
  const html = professionalReportDocumentHtml(report, 'print')
  const printWindow = window.open('', '_blank', 'width=1120,height=860')
  if (!printWindow) {
    window.alert('浏览器拦截了打印窗口，请允许弹窗后重试。')
    return
  }
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function StatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: string | number
  tone?: 'red' | 'orange' | 'green' | 'blue'
  icon: React.ReactNode
}) {
  return (
    <div className={`stat-card ${tone || 'blue'}`}>
      <div className="stat-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function LevelBadge({ level }: { level: RiskLevel }) {
  const levelClass = level === '高' ? 'level-high' : level === '中' ? 'level-medium' : 'level-low'
  return <span className={`level-badge ${levelClass}`}>{level}风险</span>
}

function Field({
  label,
  children,
  requirement,
  missing,
}: {
  label: string
  children: React.ReactNode
  requirement?: IntakeRequirement
  missing?: 'required' | 'recommended'
}) {
  const resolvedRequirement = getFieldRequirement(label, requirement)
  const tag = requirementText(resolvedRequirement)
  const missingHint = missing === 'required' ? `请填写${label}` : missing === 'recommended' ? `建议补充${label}，可提高检测准确度` : ''
  return (
    <label
      className={`field ${missing ? `missing-${missing}` : ''}`}
      data-field-label={label}
      data-requirement={resolvedRequirement || undefined}
      data-missing={missing || undefined}
    >
      <span className="field-label-line">
        <span>{label}</span>
        {tag && <em className={`field-requirement ${resolvedRequirement}`}>{tag}</em>}
      </span>
      {children}
      {missingHint && <small className={`field-missing-hint ${missing}`}>{missingHint}</small>}
    </label>
  )
}

function BoolField({
  label,
  checked,
  onChange,
  requirement = 'optional',
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
  requirement?: IntakeRequirement
}) {
  const tag = requirementText(requirement)
  return (
    <label className={`check-field ${checked ? 'checked' : ''}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}{tag && <em className={`field-requirement ${requirement}`}>{tag}</em>}</span>
    </label>
  )
}

type ChartDatum = {
  name: string
  value: number
}

function compactChartRows(rows: ChartDatum[], visibleCount: number): ChartDatum[] {
  if (rows.length <= visibleCount) return rows
  const visibleRows = rows.slice(0, visibleCount)
  const otherValue = rows.slice(visibleCount).reduce((total, row) => total + row.value, 0)
  return otherValue > 0 ? [...visibleRows, { name: '其他', value: otherValue }] : visibleRows
}

function EChartPanel({
  title,
  subtitle,
  option,
  rows,
}: {
  title: string
  subtitle?: string
  option: EChartsOption
  rows: ChartDatum[]
}) {
  const chartRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!chartRef.current) return

    let disposed = false
    let chart: EChartsType | null = null
    let observer: ResizeObserver | null = null
    let resize: (() => void) | null = null
    let resizeFrame: number | null = null
    const container = chartRef.current

    async function mountChart() {
      const [echartsCore, charts, components, renderers] = await Promise.all([
        import('echarts/core'),
        import('echarts/charts'),
        import('echarts/components'),
        import('echarts/renderers'),
      ])
      echartsCore.use([
        charts.BarChart,
        charts.PieChart,
        components.GridComponent,
        components.TooltipComponent,
        renderers.CanvasRenderer,
      ])
      if (disposed) return
      chart = echartsCore.init(container)
      chart.setOption(option)
      resize = () => {
        if (resizeFrame !== null) {
          window.cancelAnimationFrame(resizeFrame)
        }
        resizeFrame = window.requestAnimationFrame(() => {
          resizeFrame = null
          chart?.resize()
        })
      }
      observer = new ResizeObserver(resize)
      observer.observe(container)
      window.addEventListener('resize', resize)
      resize()
    }

    mountChart()

    return () => {
      disposed = true
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame)
      }
      observer?.disconnect()
      if (resize) window.removeEventListener('resize', resize)
      chart?.dispose()
    }
  }, [option])

  return (
    <section className="panel chart-panel">
      <div className="panel-title">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      <div ref={chartRef} className="chart-canvas" />
      <table className="mini-table">
        <thead>
          <tr>
            <th>项目</th>
            <th>数量</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function RiskOrbit({
  high,
  medium,
  low,
}: {
  high: number
  medium: number
  low: number
}) {
  const mountRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const currentMount = mountRef.current
    if (!currentMount) return
    const mountEl: HTMLDivElement = currentMount

    let disposed = false
    let renderer: ThreeNamespace.WebGLRenderer | null = null
    let observer: ResizeObserver | null = null
    let animationId = 0
    const geometries: ThreeNamespace.BufferGeometry[] = []
    const materials: ThreeNamespace.Material[] = []

    async function mountScene() {
      const THREE = await import('three')
      if (disposed) return

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
      camera.position.z = 6
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      mountEl.appendChild(renderer.domElement)

      const group = new THREE.Group()
      scene.add(group)

      const shellGeometry = new THREE.IcosahedronGeometry(1.7, 2)
      const shellMaterial = new THREE.MeshBasicMaterial({ color: 0x56f0ee, wireframe: true, transparent: true, opacity: 0.18 })
      const shell = new THREE.Mesh(shellGeometry, shellMaterial)
      geometries.push(shellGeometry)
      materials.push(shellMaterial)
      group.add(shell)

      const issueTotal = Math.max(high + medium + low, 1)
      const points: ThreeNamespace.Mesh[] = []
      const palette = [
        { count: high, color: 0xb63136, radius: 0.07 },
        { count: medium, color: 0xb76a20, radius: 0.055 },
        { count: Math.max(low, issueTotal === 1 ? 8 : low), color: 0x56f0ee, radius: 0.045 },
      ]

      palette.forEach(({ count, color, radius }) => {
        Array.from({ length: Math.min(Math.max(count, 0), 24) }).forEach((_, index) => {
          const phi = Math.acos(-1 + (2 * (index + 0.5)) / Math.max(count, 1))
          const theta = Math.sqrt(Math.max(count, 1) * Math.PI) * phi
          const geometry = new THREE.SphereGeometry(radius, 12, 12)
          const material = new THREE.MeshBasicMaterial({ color })
          const dot = new THREE.Mesh(geometry, material)
          dot.position.set(
            2.05 * Math.cos(theta) * Math.sin(phi),
            2.05 * Math.sin(theta) * Math.sin(phi),
            2.05 * Math.cos(phi),
          )
          geometries.push(geometry)
          materials.push(material)
          points.push(dot)
          group.add(dot)
        })
      })

      const ringGeometry = new THREE.TorusGeometry(2.35, 0.008, 8, 96)
      const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x12aeea, transparent: true, opacity: 0.5 })
      const ring = new THREE.Mesh(ringGeometry, ringMaterial)
      geometries.push(ringGeometry)
      materials.push(ringMaterial)
      ring.rotation.x = Math.PI / 2.8
      group.add(ring)

      const resize = () => {
        if (!renderer) return
        const width = mountEl.clientWidth
        const height = mountEl.clientHeight
        renderer.setSize(width, height)
        camera.aspect = width / Math.max(height, 1)
        camera.updateProjectionMatrix()
      }
      const animate = () => {
        if (!renderer || disposed) return
        group.rotation.y += 0.006
        shell.rotation.x += 0.002
        points.forEach((dot, index) => {
          dot.scale.setScalar(1 + Math.sin(Date.now() / 420 + index) * 0.12)
        })
        renderer.render(scene, camera)
        animationId = requestAnimationFrame(animate)
      }

      resize()
      animate()
      observer = new ResizeObserver(resize)
      observer.observe(mountEl)
    }

    mountScene()

    return () => {
      disposed = true
      cancelAnimationFrame(animationId)
      observer?.disconnect()
      if (renderer?.domElement.parentElement === mountEl) {
        mountEl.removeChild(renderer.domElement)
      }
      renderer?.dispose()
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
    }
  }, [high, medium, low])

  const total = high + medium + low

  return (
    <section className="panel three-panel">
      <div>
        <p className="eyebrow">风险态势</p>
        <h3>{total ? `${total} 个风险事项` : '暂无明显风险事项'}</h3>
        <p>红色代表高风险，橙色代表中风险，青色代表持续关注项。</p>
      </div>
      <div ref={mountRef} className="risk-orbit" />
      <div className="orbit-legend">
        <span><i className="legend-high" />高 {high}</span>
        <span><i className="legend-medium" />中 {medium}</span>
        <span><i className="legend-low" />低 {low}</span>
      </div>
    </section>
  )
}

function App() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authUsername, setAuthUsername] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(true)
  const [page, setPage] = useState<Page>('dashboard')
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [selectedReportId, setSelectedReportId] = useState('')
  const [editingClient, setEditingClient] = useState<Client>(blankDraftClient())
  const [reports, setReports] = useState<Report[]>([])
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([])
  const [managedRules, setManagedRules] = useState<ManagedRule[]>([])
  const [restrictedRuleCount, setRestrictedRuleCount] = useState(0)
  const [ruleDraft, setRuleDraft] = useState<ManagedRule>(emptyManagedRule)
  const [editingRuleCode, setEditingRuleCode] = useState('')
  const [selectedPeriodEntryIds, setSelectedPeriodEntryIds] = useState<string[]>([])
  const [selectedTaxDataFolder, setSelectedTaxDataFolder] = useState('增值税资料')
  const [selectedTaxDataMonth, setSelectedTaxDataMonth] = useState('')
  const [taxDataViewMode, setTaxDataViewMode] = useState<'overview' | 'month'>('overview')
  const [bossPeriodStart, setBossPeriodStart] = useState('')
  const [bossPeriodEnd, setBossPeriodEnd] = useState('')
  const [riskDetectionStep, setRiskDetectionStep] = useState<RiskDetectionStep>('client')
  const [reportConfirmOpen, setReportConfirmOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [ruleQuery, setRuleQuery] = useState('')
  const [ruleStatusFilter, setRuleStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [ruleLevelFilter, setRuleLevelFilter] = useState<'all' | RiskLevel>('all')
  const [ruleTaxFilter, setRuleTaxFilter] = useState('all')
  const [rulePageSize, setRulePageSize] = useState<RulePageSize>(50)
  const [rulePage, setRulePage] = useState(1)
  const [, setDataStatus] = useState<'loading' | 'connected' | 'fallback'>('loading')
  const [aiReportStage, setAiReportStage] = useState<'reviewing' | 'generating' | null>(null)
  const [taxDataSummary, setTaxDataSummary] = useState<TaxDataSummary | null>(null)
  const [taxDataDetailSlot, setTaxDataDetailSlot] = useState<TaxDataSlot | null>(null)
  const [taxDataDetail, setTaxDataDetail] = useState<TaxDataDetail | null>(null)
  const [taxDataDetailLoading, setTaxDataDetailLoading] = useState(false)
  const [taxDataDetailError, setTaxDataDetailError] = useState('')
  const taxDataDetailCache = useRef(new Map<string, TaxDataDetail>())

  useEffect(() => {
    let active = true

    async function checkSession() {
      try {
        const response = await apiGet<{ user: AuthUser }>('/api/auth/me')
        if (!active) return
        setAuthUser(response.user)
        setLoggedIn(true)
      } catch {
        if (!active) return
        if (import.meta.env.DEV) {
          setAuthUser({
            id: 'local-preview-user',
            username: 'local-preview',
            role: 'admin',
            actor: null,
          })
          setLoggedIn(true)
          setDataStatus('fallback')
        } else {
          setAuthUser(null)
          setLoggedIn(false)
        }
      } finally {
        if (active) {
          setAuthLoading(false)
        }
      }
    }

    checkSession()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!loggedIn || !authUser) return

    let active = true

    async function loadData() {
      setDataStatus('loading')
      try {
        const [clientsResponse, reportsResponse] = await Promise.all([
          apiGet<{ clients: Client[] }>('/api/clients'),
          apiGet<{ reports: Report[] }>('/api/reports'),
        ])

        if (!active) return

        const visibleClients = clientsResponse.clients
          .filter((client) => !demoCaseCreditCodes.has(client.creditCode))
          .map((client) => deriveClientMetrics(normalizeClient(client)))
        setClients(visibleClients)
        setReports(reportsResponse.reports)
        if (visibleClients[0]) {
          setSelectedClientId(visibleClients[0].id)
          setSelectedPeriodEntryIds([])
        } else {
          setSelectedClientId('')
          setSelectedPeriodEntryIds([])
        }
        setDataStatus('connected')
      } catch (error) {
        console.warn('Using local demo data because API is unavailable.', error)
        if (error instanceof Error && error.message.includes('401')) {
          setLoggedIn(false)
          setAuthUser(null)
          setAuthLoading(false)
          return
        }
        if (active) {
          setDataStatus('fallback')
        }
      }
    }

    loadData()

    return () => {
      active = false
    }
  }, [loggedIn, authUser])

  useEffect(() => {
    if (!loggedIn || !authUser || page !== 'admin') return
    const canUseAdmin = authUser.role === 'admin' || authUser.actor?.role === 'admin'
    if (!canUseAdmin) return

    let active = true

    async function loadAdminUsers() {
      try {
        const response = await apiGet<{ users: AdminUser[] }>('/api/admin/users')
        if (active) {
          setAdminUsers(response.users)
        }
      } catch (error) {
        console.warn('Failed to load admin users.', error)
      }
    }

    loadAdminUsers()

    return () => {
      active = false
    }
  }, [loggedIn, authUser, page])

  useEffect(() => {
    if (!loggedIn || !authUser) return

    let active = true

    async function loadRules() {
      try {
        const response = await apiGet<{ rules: ManagedRule[]; restrictedCount?: number }>('/api/rules')
        if (active) {
          setManagedRules(hydrateManagedRules(response.rules))
          setRestrictedRuleCount(response.restrictedCount || 0)
        }
      } catch (error) {
        console.warn('Failed to load managed rules.', error)
      }
    }

    loadRules()

    return () => {
      active = false
    }
  }, [loggedIn, authUser])

  const selectedClient = clients.find((client) => client.id === selectedClientId) || clients[0]

  async function openTaxDataDetail(slot: TaxDataSlot) {
    if (!selectedClient?.id) return
    if (!slot.sourceFiles.length && taxDataHasElectronicTemplate(slot)) {
      setTaxDataDetailSlot(slot)
      setTaxDataDetail({ sources: [], records: [], evidence: [], totalRecords: 0, truncated: false })
      setTaxDataDetailError('')
      setTaxDataDetailLoading(false)
      return
    }
    if (!slot.sourceFiles.length) return
    const sourceFileIds = slot.sourceFiles.map((file) => file.id).join(',')
    const cacheKey = `${selectedClient.id}:${slot.slotId}:${sourceFileIds}`
    setTaxDataDetailSlot(slot)
    setTaxDataDetailError('')
    const cached = taxDataDetailCache.current.get(cacheKey)
    if (cached) {
      setTaxDataDetail(cached)
      setTaxDataDetailLoading(false)
      return
    }
    setTaxDataDetail(null)
    setTaxDataDetailLoading(true)
    try {
      const detail = await apiGet<TaxDataDetail>(`/api/tax-data/detail?clientId=${encodeURIComponent(selectedClient.id)}&slotId=${encodeURIComponent(slot.slotId)}&sourceFileIds=${encodeURIComponent(sourceFileIds)}`)
      taxDataDetailCache.current.set(cacheKey, detail)
      setTaxDataDetail(detail)
    } catch (error) {
      setTaxDataDetailError(error instanceof Error ? error.message : '资料详情读取失败')
    } finally {
      setTaxDataDetailLoading(false)
    }
  }

  useEffect(() => {
    if (!loggedIn || !selectedClient?.id) {
      return
    }
    let active = true
    async function loadTaxDataSummary() {
      try {
        const response = await apiGet<TaxDataSummary>(`/api/tax-data/summary?clientId=${encodeURIComponent(selectedClient.id)}`)
        if (active) setTaxDataSummary(response)
      } catch (error) {
        console.warn('Failed to load tax data summary.', error)
        if (active) setTaxDataSummary(null)
      }
    }
    loadTaxDataSummary()
    return () => {
      active = false
    }
  }, [loggedIn, selectedClient?.id])

  const selectedReport = reports.find((report) => report.id === selectedReportId)
  const selectedPeriodEntryIdSet = useMemo(() => new Set(selectedPeriodEntryIds), [selectedPeriodEntryIds])
  const selectedPeriodEntries = useMemo(() => {
    if (!selectedClient) return []
    const selected = selectedClient.periodEntries.filter((entry) => selectedPeriodEntryIdSet.has(entry.id))
    return selected.sort((a, b) => monthIndex(a.months[0] || '') - monthIndex(b.months[0] || ''))
  }, [selectedClient, selectedPeriodEntryIdSet])
  const selectedPeriodMonths = useMemo(() => selectedPeriodEntries.flatMap((entry) => entry.months), [selectedPeriodEntries])
  const selectedPeriodsContinuous = selectedPeriodEntries.length === 0 || areMonthsContinuous(selectedPeriodMonths)
  const selectedPeriodLabel = selectedPeriodEntries.length
    ? `${formatMonthRange(selectedPeriodMonths)}｜${selectedPeriodEntries.length} 期`
    : '请选择已有档案期间'
  const selectedDetectionClient = useMemo(() => {
    if (!selectedClient) return null
    if (!selectedPeriodEntries.length || !selectedPeriodsContinuous) return null
    return deriveClientMetrics({
      ...selectedClient,
      ...summarizePeriodEntries(selectedClient, selectedPeriodEntries),
      id: selectedClient.id,
      name: selectedClient.name,
      creditCode: selectedClient.creditCode,
      region: selectedClient.region,
      industry: selectedClient.industry,
      taxpayerType: selectedClient.taxpayerType,
      establishedAt: selectedClient.establishedAt,
      projectScope: selectedClient.projectScope,
      groupName: selectedClient.groupName,
      entityRole: selectedClient.entityRole,
      periodEntries: selectedClient.periodEntries,
    })
  }, [selectedClient, selectedPeriodEntries, selectedPeriodsContinuous])
  const currentRisks = useMemo(() => (selectedDetectionClient ? detectRisks(selectedDetectionClient, managedRules) : []), [selectedDetectionClient, managedRules])
  const currentSkippedRules = useMemo(() => (selectedDetectionClient ? getSkippedRules(selectedDetectionClient, managedRules) : []), [selectedDetectionClient, managedRules])
  const overallLevel = getOverallLevel(currentRisks)
  const currentCompleteness = selectedDetectionClient ? getDataCompleteness(selectedDetectionClient, currentRisks) : null
  const currentReportIssues = selectedDetectionClient ? validateClientForReport(selectedDetectionClient) : []
  const reportPageClient = selectedReport
    ? clients.find((client) => client.id === selectedReport.clientId) || clientFromReport(selectedReport)
    : selectedClient
  const reportPageRisks = selectedReport ? reportRiskList(selectedReport) : currentRisks
  const activeTaxDataSummary = taxDataSummary?.clientId === selectedClient?.id ? taxDataSummary : null
  const taxDataPeriodYears = useMemo(() => {
    const years = new Set<string>()
    for (const entry of selectedClient?.periodEntries || []) {
      entry.months.forEach((month) => years.add(month.slice(0, 4)))
      if (entry.analysisYear) years.add(entry.analysisYear)
    }
    for (const slot of activeTaxDataSummary?.slots || []) {
      if (slot.periodStart) years.add(slot.periodStart.slice(0, 4))
      if (slot.periodEnd) years.add(slot.periodEnd.slice(0, 4))
    }
    if (!years.size) years.add(String(new Date().getFullYear()))
    return Array.from(years).filter(Boolean).sort((a, b) => Number(b) - Number(a))
  }, [activeTaxDataSummary, selectedClient])
  const defaultTaxDataMonth = useMemo(() => {
    const collectedMonths = (activeTaxDataSummary?.slots || [])
      .filter((slot) => slot.status === 'collected')
      .map((slot) => (slot.periodEnd || slot.periodStart).slice(0, 7))
      .filter(Boolean)
      .sort()
    const fallbackYear = taxDataPeriodYears[0] || String(new Date().getFullYear())
    return collectedMonths.at(-1) || `${fallbackYear}-01`
  }, [activeTaxDataSummary, taxDataPeriodYears])
  const effectiveTaxDataMonth = selectedTaxDataMonth && taxDataPeriodYears.includes(selectedTaxDataMonth.slice(0, 4))
    ? selectedTaxDataMonth
    : defaultTaxDataMonth
  const periodScopedTaxDataSlots = useMemo(() => {
    const slotsById = new Map<string, TaxDataSlot[]>()
    for (const slot of activeTaxDataSummary?.slots || []) {
      const items = slotsById.get(slot.slotId) || []
      items.push(slot)
      slotsById.set(slot.slotId, items)
    }
    return Array.from(slotsById.values()).flatMap((items) => {
      const matching = items.filter((slot) => taxDataSlotCoversMonth(slot, effectiveTaxDataMonth))
      if (matching.length) return matching
      const base = items.find((slot) => slot.status === 'missing') || items[0]
      return [{
        ...base,
        id: `period-missing:${base.slotId}:${effectiveTaxDataMonth}`,
        status: 'missing' as const,
        periodStart: '',
        periodEnd: '',
        periodLabel: '待收录',
        recordCount: 0,
        sourceFileCount: 0,
        keyValues: [],
        validationMessages: [],
        sourceFiles: [],
      }]
    })
  }, [activeTaxDataSummary, effectiveTaxDataMonth])
  const displayedTaxDataSlots = useMemo(() => (
    taxDataViewMode === 'overview'
      ? activeTaxDataSummary?.slots || []
      : periodScopedTaxDataSlots
  ), [activeTaxDataSummary, periodScopedTaxDataSlots, taxDataViewMode])
  const taxDataSlotsByGroup = useMemo(() => {
    const groups = new Map<string, TaxDataSlot[]>()
    for (const slot of displayedTaxDataSlots) {
      const items = groups.get(slot.group) || []
      items.push(slot)
      groups.set(slot.group, items)
    }
    return taxDataFolderOrder
      .filter((group) => groups.has(group))
      .map((group) => [group, groups.get(group) || []] as [string, TaxDataSlot[]])
  }, [displayedTaxDataSlots])
  const taxDataFolderSummaries = useMemo(() => {
    return taxDataSlotsByGroup.map(([group, slots]) => {
      const categories = new Map<string, boolean>()
      for (const slot of slots) {
        categories.set(slot.slotId, Boolean(categories.get(slot.slotId)) || slot.status === 'collected')
      }
      const collected = Array.from(categories.values()).filter(Boolean).length
      const total = categories.size
      const missing = total - collected
      const hasValidation = slots.some((slot) => slot.validationMessages.length)
      const collectedSlots = slots.filter((slot) => slot.status === 'collected')
      const sourceFileCount = new Set(collectedSlots.flatMap((slot) => slot.sourceFiles.map((file) => file.id))).size
      const coveredMonths = new Set<string>()
      for (const slot of collectedSlots) {
        const start = (slot.periodStart || slot.periodEnd).slice(0, 7)
        const end = (slot.periodEnd || slot.periodStart).slice(0, 7)
        if (!start || !end) continue
        let cursor = monthIndex(start)
        const last = monthIndex(end)
        while (cursor <= last && coveredMonths.size < 240) {
          coveredMonths.add(monthFromIndex(cursor))
          cursor += 1
        }
      }
      const status = activeTaxDataSummary?.pendingConfirmationCount && hasValidation
        ? 'pending'
        : missing === 0 && total > 0
          ? 'complete'
          : collected > 0
            ? 'partial'
            : 'missing'
      return { group, slots, collected, missing, total, status, sourceFileCount, coveredMonthCount: coveredMonths.size }
    })
  }, [taxDataSlotsByGroup, activeTaxDataSummary?.pendingConfirmationCount])
  const selectedTaxDataFolderSummary = taxDataFolderSummaries.find((folder) => folder.group === selectedTaxDataFolder)
    || taxDataFolderSummaries[0]
  const selectedTaxDataSlots = selectedTaxDataFolderSummary?.slots || []
  const displayedTaxDataStats = useMemo(() => {
    const collected = displayedTaxDataSlots.filter((slot) => slot.status === 'collected')
    return {
      collectedCategoryCount: new Set(collected.map((slot) => slot.slotId)).size,
      totalCategoryCount: new Set(displayedTaxDataSlots.map((slot) => slot.slotId)).size,
      sourceFileCount: new Set(collected.flatMap((slot) => slot.sourceFiles.map((file) => file.id))).size,
      recordCount: collected.reduce((sum, slot) => sum + slot.recordCount, 0),
      missingCount: new Set(displayedTaxDataSlots.filter((slot) => slot.status === 'missing').map((slot) => slot.slotId)).size,
    }
  }, [displayedTaxDataSlots])
  const taxDataMonthsWithData = useMemo(() => new Set(
    (activeTaxDataSummary?.slots || []).filter((slot) => slot.status === 'collected').flatMap((slot) => {
      const start = (slot.periodStart || slot.periodEnd).slice(0, 7)
      const end = (slot.periodEnd || slot.periodStart).slice(0, 7)
      if (!start || !end) return []
      const months: string[] = []
      let cursor = monthIndex(start)
      const last = monthIndex(end)
      while (cursor <= last && months.length < 120) {
        months.push(monthFromIndex(cursor))
        cursor += 1
      }
      return months
    }),
  ), [activeTaxDataSummary])

  const clientRows = useMemo(() => {
    return clients
      .filter((client) => client.name.includes(query) || client.creditCode.includes(query) || getGroupName(client).includes(query))
      .map((client) => {
        const risks = detectRisks(client, managedRules)
        return {
          client,
          risks,
          level: getOverallLevel(risks),
          report: reports.find((report) => report.clientId === client.id),
        }
      })
  }, [clients, query, reports, managedRules])

  const groupSummaries = useMemo(() => buildGroupSummaries(clients, managedRules), [clients, managedRules])
  const selectedGroupSummary = useMemo(() => {
    if (!selectedClient) return null
    const groupName = getGroupName(selectedClient)
    if (!groupName) return null
    return groupSummaries.find((group) => group.name === groupName) || null
  }, [selectedClient, groupSummaries])

  const stats = useMemo(() => {
    const clientStats = clients.map((client) => detectRisks(client, managedRules))
    return {
      high: clientStats.filter((risks) => getOverallLevel(risks) === '高').length,
      medium: clientStats.filter((risks) => getOverallLevel(risks) === '中').length,
      detections: clientStats.reduce((sum, risks) => sum + risks.length, 0),
      groups: buildGroupSummaries(clients, managedRules).length,
    }
  }, [clients, managedRules])
  const bossPeriodMonths = useMemo(() => (
    bossPeriodStart && bossPeriodEnd ? monthsBetween(bossPeriodStart, bossPeriodEnd) : []
  ), [bossPeriodEnd, bossPeriodStart])
  const bossPeriodActive = bossPeriodMonths.length > 0
  const bossPeriodInvalid = Boolean(bossPeriodStart && bossPeriodEnd && !bossPeriodActive)
  const bossPeriodLabel = bossPeriodActive ? formatMonthRange(bossPeriodMonths) : '全部期间'
  const bossPeriodClientRows = useMemo(() => {
    if (!bossPeriodActive) {
      return clientRows.map((row) => ({ ...row, analysisClient: row.client, missingMonths: [] as string[], periodComplete: true }))
    }

    return clients.map((client) => {
      const monthlyEntries = bossPeriodMonths
        .map((month) => client.periodEntries.find((entry) => entry.months.length === 1 && entry.months[0] === month))
        .filter((entry): entry is ClientPeriodEntry => Boolean(entry))
      const coveredMonths = new Set(monthlyEntries.flatMap((entry) => entry.months))
      const missingMonths = bossPeriodMonths.filter((month) => !coveredMonths.has(month))
      const analysisClient = missingMonths.length
        ? client
        : deriveClientMetrics({
            ...client,
            ...summarizePeriodEntries(client, monthlyEntries),
            id: client.id,
            name: client.name,
            creditCode: client.creditCode,
            region: client.region,
            industry: client.industry,
            taxpayerType: client.taxpayerType,
            establishedAt: client.establishedAt,
            projectScope: client.projectScope,
            groupName: client.groupName,
            entityRole: client.entityRole,
            periodEntries: client.periodEntries,
          })
      const risks = missingMonths.length ? [] : detectRisks(analysisClient, managedRules)

      return {
        client,
        analysisClient,
        risks,
        level: missingMonths.length ? '低' as RiskLevel : getOverallLevel(risks),
        report: reports.find((report) => report.clientId === client.id),
        missingMonths,
        periodComplete: missingMonths.length === 0,
      }
    })
  }, [bossPeriodActive, bossPeriodMonths, clientRows, clients, managedRules, reports])
  const bossStats = useMemo(() => {
    const analysableRows = bossPeriodClientRows.filter((row) => row.periodComplete)
    const riskSets = analysableRows.map((row) => row.risks)
    return {
      high: riskSets.filter((risks) => getOverallLevel(risks) === '高').length,
      medium: riskSets.filter((risks) => getOverallLevel(risks) === '中').length,
      detections: riskSets.reduce((sum, risks) => sum + risks.length, 0),
      analysable: analysableRows.length,
      missingPeriodClients: bossPeriodClientRows.filter((row) => !row.periodComplete).length,
    }
  }, [bossPeriodClientRows])
  const bossDashboard = useMemo(() => {
    const allRisks = bossPeriodClientRows
      .filter((row) => row.periodComplete)
      .flatMap(({ client, analysisClient, risks }) => risks.map((risk) => ({
        client,
        risk,
        evidence: risk.reason(analysisClient),
        material: risk.materials[0] || '对应申报表、发票、合同或银行流水资料',
      })))
    const topRisks = allRisks
      .sort((a, b) => riskRank(b.risk.level) - riskRank(a.risk.level) || a.client.name.localeCompare(b.client.name, 'zh-Hans-CN'))
      .slice(0, 3)
    const level: RiskLevel = bossStats.high > 0 ? '高' : bossStats.medium > 0 ? '中' : '低'
    const missingFieldTotals = new Map<string, { count: number; examples: string[]; sources: string[]; blockedRules: string[] }>()
    let missingDataClients = 0
    bossPeriodClientRows.forEach((row) => {
      const skippedRuleNamesByField = new Map<string, string[]>()
      if (row.periodComplete) {
        getSkippedRules(row.analysisClient, managedRules).forEach(({ rule, execution }) => {
          execution.missingFields.forEach((field) => {
            const label = fieldLabel(field)
            const names = skippedRuleNamesByField.get(label) || []
            const ruleName = `${rule.code} ${rule.name}`
            if (!names.includes(ruleName) && names.length < 2) names.push(ruleName)
            skippedRuleNamesByField.set(label, names)
          })
        })
      }
      const issues = row.periodComplete
        ? validateClientForReport(row.client).map((issue) => ({ label: issue.label, source: '企业基础资料字段' }))
        : []
      const periodIssues = row.missingMonths.slice(0, 3).map((month) => ({ label: `${month} 月度归档`, source: '期间归档' }))
      const combinedIssues = [...periodIssues, ...issues]
      if (combinedIssues.length > 0) missingDataClients += 1
      combinedIssues.forEach((issue) => {
        const current = missingFieldTotals.get(issue.label) || { count: 0, examples: [], sources: [], blockedRules: [] }
        const example = row.periodComplete
          ? `${row.client.name} / ${bossPeriodLabel}`
          : `${row.client.name} / 缺 ${row.missingMonths.slice(0, 2).join('、')}`
        if (!current.examples.includes(example) && current.examples.length < 2) current.examples.push(example)
        if (!current.sources.includes(issue.source)) current.sources.push(issue.source)
        const blockedRules = skippedRuleNamesByField.get(issue.label) || (row.periodComplete ? [] : ['当前期间规则检测'])
        blockedRules.forEach((ruleName) => {
          if (!current.blockedRules.includes(ruleName) && current.blockedRules.length < 2) current.blockedRules.push(ruleName)
        })
        missingFieldTotals.set(issue.label, {
          count: current.count + 1,
          examples: current.examples,
          sources: current.sources,
          blockedRules: current.blockedRules,
        })
      })
    })
    const missingFields = Array.from(missingFieldTotals, ([label, value]) => ({ label, ...value }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-Hans-CN'))
      .slice(0, 5)
    const conclusion = clients.length === 0
      ? '当前还没有企业档案。建议先导入企业和最近期间数据，再生成管理层可读的税务健康结论。'
      : bossPeriodActive && bossStats.analysable === 0
        ? `${bossPeriodLabel} 暂无企业具备完整月度归档，建议先让财务补齐指定期间资料。`
        : bossStats.high > 0
          ? `${bossPeriodLabel} 有 ${bossStats.high} 家企业处于高风险状态，建议先安排财务负责人和税务顾问处理重点事项。`
          : bossStats.medium > 0
            ? `${bossPeriodLabel} 有 ${bossStats.medium} 家企业存在中风险提示，建议先补齐资料并安排顾问复核。`
            : `${bossPeriodLabel} 未发现高/中风险企业，可先归档本次初筛结果，并在下一期数据更新后复查。`
    const actions = clients.length === 0
      ? ['导入第一家企业档案', '载入测试案例查看完整流程', '生成一份管理层摘要报告样例']
      : [
          bossPeriodActive && bossStats.missingPeriodClients > 0
            ? `先补齐 ${bossStats.missingPeriodClients} 家企业的指定期间月度归档`
            : missingDataClients > 0 ? `安排财务补齐 ${missingDataClients} 家企业的关键资料` : '要求财务保留本次检查底稿',
          topRisks.length > 0 ? `优先复核 ${topRisks.length} 个重点风险事项` : '将低风险初筛结果归档',
          reports.length > 0 ? '查看最新报告并确认后续跟进节奏' : '生成第一份税务健康报告',
        ]
    const deliveryChecks = [
      {
        label: '期间资料',
        value: bossStats.missingPeriodClients > 0 ? `${bossStats.missingPeriodClients} 家待补` : bossStats.analysable > 0 ? '已具备' : '待导入',
        tone: bossStats.missingPeriodClients > 0 || bossStats.analysable === 0 ? 'attention' : 'ready',
      },
      {
        label: '重点风险',
        value: topRisks.length > 0 ? `${topRisks.length} 项待复核` : '无高优先级',
        tone: topRisks.length > 0 ? 'attention' : 'ready',
      },
      {
        label: '资料缺口',
        value: missingDataClients > 0 ? `${missingDataClients} 家待补` : '已补齐',
        tone: missingDataClients > 0 ? 'attention' : 'ready',
      },
      {
        label: '税务报告',
        value: reports.length > 0 ? '可查看' : '待生成',
        tone: reports.length > 0 ? 'ready' : 'attention',
      },
    ]

    return { level, conclusion, topRisks, actions, missingDataClients, missingFields, deliveryChecks }
  }, [bossPeriodActive, bossPeriodClientRows, bossPeriodLabel, bossStats.analysable, bossStats.high, bossStats.medium, bossStats.missingPeriodClients, clients.length, managedRules, reports.length])
  const dashboardLevelRows = useMemo<ChartDatum[]>(() => {
    const clientStats = clients.map((client) => detectRisks(client, managedRules))
    return [
      { name: '高风险', value: clientStats.filter((risks) => getOverallLevel(risks) === '高').length },
      { name: '中风险', value: clientStats.filter((risks) => getOverallLevel(risks) === '中').length },
      { name: '低风险', value: clientStats.filter((risks) => getOverallLevel(risks) === '低').length },
    ]
  }, [clients, managedRules])
  const dashboardTaxRows = useMemo<ChartDatum[]>(() => {
    const totals = new Map<string, number>()
    clients.flatMap((client) => detectRisks(client, managedRules)).forEach((risk) => {
      const name = risk.taxType || '未分类'
      totals.set(name, (totals.get(name) || 0) + 1)
    })
    const rows = Array.from(totals, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
    return rows.length ? rows : [{ name: '暂无风险事项', value: 0 }]
  }, [clients, managedRules])
  const dashboardTaxDisplayRows = useMemo(() => compactChartRows(dashboardTaxRows, 5), [dashboardTaxRows])
  const dashboardLevelOption = useMemo<EChartsOption>(() => ({
    color: ['#8f3d42', '#b88a46', '#2b8a78'],
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['42%', '66%'],
        center: ['50%', '52%'],
        avoidLabelOverlap: true,
        label: { show: false },
        data: dashboardLevelRows,
      },
    ],
  }), [dashboardLevelRows])
  const dashboardTaxOption = useMemo<EChartsOption>(() => ({
    color: ['#1689a6'],
    tooltip: { trigger: 'axis' },
    grid: { left: 24, right: 16, top: 18, bottom: 32, containLabel: true },
    xAxis: { type: 'category', data: dashboardTaxDisplayRows.map((row) => row.name), axisLabel: { color: '#637781' } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#637781' }, splitLine: { lineStyle: { color: 'rgba(31, 71, 82, 0.12)' } } },
    series: [{ type: 'bar', data: dashboardTaxDisplayRows.map((row) => row.value), barMaxWidth: 34, itemStyle: { borderRadius: [6, 6, 0, 0], color: '#1689a6' } }],
  }), [dashboardTaxDisplayRows])
  const currentRiskLevelRows = useMemo<ChartDatum[]>(() => [
    { name: '高风险', value: currentRisks.filter((risk) => risk.level === '高').length },
    { name: '中风险', value: currentRisks.filter((risk) => risk.level === '中').length },
    { name: '低风险', value: currentRisks.filter((risk) => risk.level === '低').length },
  ], [currentRisks])
  const currentRiskTaxRows = useMemo<ChartDatum[]>(() => {
    const totals = new Map<string, number>()
    currentRisks.forEach((risk) => totals.set(risk.taxType || '未分类', (totals.get(risk.taxType || '未分类') || 0) + 1))
    const rows = Array.from(totals, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
    return rows.length ? rows : [{ name: '暂无风险事项', value: 0 }]
  }, [currentRisks])
  const currentPriorityRows = useMemo<ChartDatum[]>(() => {
    const totals = new Map<string, number>()
    currentRisks.forEach((risk) => {
      const priority = riskPriority(risk)
      totals.set(priority, (totals.get(priority) || 0) + 1)
    })
    const rows = Array.from(totals, ([name, value]) => ({ name, value }))
    return rows.length ? rows : [{ name: '暂无整改事项', value: 0 }]
  }, [currentRisks])
  const currentMissingFieldRows = useMemo<ChartDatum[]>(() => {
    const totals = new Map<string, number>()
    currentSkippedRules.forEach(({ execution }) => {
      execution.missingFields.forEach((field) => {
        const label = fieldLabel(field)
        totals.set(label, (totals.get(label) || 0) + 1)
      })
    })
    return Array.from(totals, ([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'zh-CN'))
      .slice(0, 10)
  }, [currentSkippedRules])
  const jumpToIntakeField = (label: string) => {
    if (selectedClient) {
      setEditingClient(deriveClientMetrics(selectedClient))
    }
    setPage('form')
    window.setTimeout(() => {
      const target = document.querySelector(`[data-field-label="${label}"]`)
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target?.classList.add('field-highlight')
      window.setTimeout(() => target?.classList.remove('field-highlight'), 1600)
    }, 80)
  }
  const currentTaxOption = useMemo<EChartsOption>(() => ({
    color: ['#12aeea', '#0c8c82', '#b76a20', '#b63136', '#56f0ee'],
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: '62%',
        center: ['50%', '52%'],
        avoidLabelOverlap: true,
        label: { color: '#102027', formatter: '{b}: {c}' },
        data: currentRiskTaxRows,
      },
    ],
  }), [currentRiskTaxRows])
  const currentPriorityOption = useMemo<EChartsOption>(() => ({
    color: ['#b63136', '#b76a20', '#0c8c82'],
    tooltip: { trigger: 'axis' },
    grid: { left: 20, right: 16, top: 18, bottom: 28, containLabel: true },
    xAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#637781' }, splitLine: { lineStyle: { color: 'rgba(31, 71, 82, 0.12)' } } },
    yAxis: { type: 'category', data: currentPriorityRows.map((row) => row.name), axisLabel: { color: '#637781' } },
    series: [{ type: 'bar', data: currentPriorityRows.map((row) => row.value), barMaxWidth: 28, itemStyle: { borderRadius: [0, 6, 6, 0] } }],
  }), [currentPriorityRows])

  const ruleTaxOptions = useMemo(() => {
    return Array.from(new Set(managedRules.map((rule) => rule.taxType || '未填写税种'))).sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [managedRules])
  const filteredRules = useMemo(() => {
    const normalizedQuery = ruleQuery.trim().toLowerCase()
    return managedRules.filter((rule) => {
      const searchable = [
        rule.code,
        rule.name,
        rule.taxType,
        rule.basis,
        rule.suggestion,
        rule.conditionText,
        rule.materials.join(' '),
        rule.requiredFields.join(' '),
      ].join(' ').toLowerCase()
      const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery)
      const matchesStatus = ruleStatusFilter === 'all'
        || (ruleStatusFilter === 'enabled' ? rule.enabled : !rule.enabled)
      const matchesLevel = ruleLevelFilter === 'all' || rule.level === ruleLevelFilter
      const matchesTax = ruleTaxFilter === 'all' || (rule.taxType || '未填写税种') === ruleTaxFilter

      return matchesQuery && matchesStatus && matchesLevel && matchesTax
    })
  }, [managedRules, ruleLevelFilter, ruleQuery, ruleStatusFilter, ruleTaxFilter])
  const rulePageCount = rulePageSize === 'all'
    ? 1
    : Math.max(1, Math.ceil(filteredRules.length / rulePageSize))
  const normalizedRulePage = Math.min(rulePage, rulePageCount)
  const visibleRules = rulePageSize === 'all'
    ? filteredRules
    : filteredRules.slice((normalizedRulePage - 1) * rulePageSize, normalizedRulePage * rulePageSize)
  const ruleCheck = useMemo(() => ruleSelfCheck(managedRules), [managedRules])
  const selectedClientPeriodWarnings = useMemo(() => (
    selectedClient ? findPeriodConsistencyWarnings(selectedClient.periodEntries) : []
  ), [selectedClient])
  const selectedClientPeriodYears = useMemo(() => {
    if (!selectedClient) return []
    const years = new Set<string>()
    selectedClient.periodEntries.forEach((entry) => {
      entry.months.forEach((month) => years.add(month.slice(0, 4)))
      if (entry.analysisYear) years.add(entry.analysisYear)
    })
    if (!years.size) years.add(String(new Date().getFullYear()))
    return Array.from(years).sort((a, b) => Number(b) - Number(a))
  }, [selectedClient])
  const selectedClientAvailableMonths = useMemo(() => (
    new Set(selectedClient?.periodEntries.flatMap((entry) => entry.months) || [])
  ), [selectedClient])
  const periodEntriesForMonth = (client: Client, year: string, monthIndexValue: number) => {
    const month = `${year}-${String(monthIndexValue + 1).padStart(2, '0')}`
    return client.periodEntries.filter((entry) => entry.months.includes(month))
  }

  const selectPeriodMonths = (months: string[], label: string) => {
    if (!selectedClient) return
    const expectedMonths = Array.from(new Set(months)).sort((a, b) => monthIndex(a) - monthIndex(b))
    const entries = expectedMonths.map((month) => selectedClient.periodEntries.find((entry) => entry.months.length === 1 && entry.months[0] === month))
    if (entries.some((entry) => !entry)) {
      window.alert(`当前企业缺少「${label}」的完整月度归档数据。请先补齐月度数据，或在下方选择已有期间卡片。`)
      return
    }
    setSelectedPeriodEntryIds(entries.map((entry) => entry!.id))
  }

  const selectQuarterMonths = (year: string, quarter: AnalysisQuarter) => {
    selectPeriodMonths(quarterMonths(year, quarter), `${year}年${quarter}`)
  }

  const selectYearMonths = (year: string) => {
    selectPeriodMonths(monthsBetween(`${year}-01`, `${year}-12`), `${year}全年`)
  }

  const openBossPeriodReportFlow = () => {
    if (!bossPeriodActive) {
      setPage(reports.length ? 'reports' : 'result')
      return
    }
    const rankedRows = bossPeriodClientRows
      .filter((row) => row.periodComplete)
      .sort((a, b) => riskRank(b.level) - riskRank(a.level) || b.risks.length - a.risks.length)
    const targetRow = rankedRows[0]
    if (!targetRow) {
      window.alert(`当前分析期间「${bossPeriodLabel}」还没有企业具备完整月度归档。请先让财务补齐期间资料。`)
      return
    }
    const entries = bossPeriodMonths
      .map((month) => targetRow.client.periodEntries.find((entry) => entry.months.length === 1 && entry.months[0] === month))
      .filter((entry): entry is ClientPeriodEntry => Boolean(entry))
    setSelectedClientId(targetRow.client.id)
    setSelectedPeriodEntryIds(entries.map((entry) => entry.id))
    setRiskDetectionStep('confirm')
    setPage('result')
  }

  const togglePeriodEntry = (entryId: string) => {
    if (!selectedClient) return
    setSelectedPeriodEntryIds((current) => {
      const next = current.includes(entryId) ? current.filter((id) => id !== entryId) : [...current, entryId]
      const nextEntries = selectedClient.periodEntries.filter((entry) => next.includes(entry.id))
      const nextMonths = nextEntries.flatMap((entry) => entry.months)
      if (nextEntries.length > 1 && !areMonthsContinuous(nextMonths)) {
        window.alert('当前选择的月份不连续，不能合并分析。请选择连续月份，例如 2025-01 至 2025-03，或分别生成单月报告。')
        return current
      }
      return next
    })
  }

  const analyzePeriodEntry = (client: Client, entry: ClientPeriodEntry) => {
    setSelectedClientId(client.id)
    setSelectedPeriodEntryIds([entry.id])
    setRiskDetectionStep('confirm')
    setPage('result')
  }

  const analyzeMonth = (client: Client, entries: ClientPeriodEntry[]) => {
    if (!entries.length) return
    setSelectedClientId(client.id)
    setSelectedPeriodEntryIds([entries[0].id])
    setRiskDetectionStep('confirm')
    setPage('result')
  }

  const selectAllPeriodEntriesForAnalysis = () => {
    if (!selectedClient) return
    const months = selectedClient.periodEntries.flatMap((entry) => entry.months)
    if (selectedClient.periodEntries.length > 1 && !areMonthsContinuous(months)) {
      window.alert('当前企业的已录入月份不连续，不能一键选择全部期间合并分析。请手动选择连续月份，或分别生成单月报告。')
      return
    }
    setSelectedPeriodEntryIds(selectedClient.periodEntries.map((entry) => entry.id))
  }

  const selectClientForRiskDetection = (client: Client) => {
    setSelectedClientId(client.id)
    setSelectedPeriodEntryIds([])
    setRiskDetectionStep('period')
  }

  const backToRiskClientSelection = () => {
    setSelectedPeriodEntryIds([])
    setRiskDetectionStep('client')
  }

  const proceedToRiskConfirmation = () => {
    if (!selectedClient) return
    if (!selectedClient.periodEntries.length) {
      window.alert('当前企业还没有保存期间数据，请先到数据录入页保存一条期间数据。')
      return
    }
    if (!selectedPeriodEntries.length) {
      window.alert('请先选择需要分析的期间，可以选择单月、季度、连续多月或全年。')
      return
    }
    if (!selectedPeriodsContinuous) {
      window.alert('选择的月份不连续，不能合并检测。请改选连续月份，例如 1-3 月、4-6 月或全年。')
      return
    }
    setRiskDetectionStep('confirm')
  }

  const startRiskDetection = () => {
    if (!selectedDetectionClient) {
      window.alert('请先确认企业和连续期间范围。')
      return
    }
    setRiskDetectionStep('result')
  }

  const hydratePeriodDraft = (entry: ClientPeriodEntry, patchData: Partial<Client> = {}) => {
    if (!selectedClient) return deriveClientMetrics({ ...entry.snapshot, ...patchData })
    return deriveClientMetrics({
      ...selectedClient,
      ...entry.snapshot,
      id: selectedClient.id,
      name: selectedClient.name,
      creditCode: selectedClient.creditCode,
      region: selectedClient.region,
      industry: selectedClient.industry,
      taxpayerType: selectedClient.taxpayerType,
      establishedAt: selectedClient.establishedAt,
      projectScope: selectedClient.projectScope,
      groupName: selectedClient.groupName,
      entityRole: selectedClient.entityRole,
      periodEntries: selectedClient.periodEntries,
      ...patchData,
    })
  }

  const nextPeriodPatch = (entry: ClientPeriodEntry): Partial<Client> => {
    if (entry.analysisPeriodType === '月度' && entry.months[0]) {
      const nextMonth = monthFromIndex(monthIndex(entry.months[0]) + 1)
      return { analysisMonth: nextMonth, analysisYear: nextMonth.slice(0, 4) }
    }
    if (entry.analysisPeriodType === '季度') {
      const quarterOrder: AnalysisQuarter[] = ['Q1', 'Q2', 'Q3', 'Q4']
      const currentIndex = quarterOrder.indexOf(entry.analysisQuarter)
      const nextQuarter = currentIndex >= 0 && currentIndex < 3 ? quarterOrder[currentIndex + 1] : 'Q1'
      const nextYear = currentIndex === 3 ? String(Number(entry.analysisYear || new Date().getFullYear()) + 1) : entry.analysisYear
      return { analysisQuarter: nextQuarter, analysisYear: nextYear }
    }
    if (entry.analysisPeriodType === '年度') {
      const nextYear = String(Number(entry.analysisYear || new Date().getFullYear()) + 1)
      return { analysisYear: nextYear, periodStartDate: `${nextYear}-01-01`, periodEndDate: `${nextYear}-12-31` }
    }
    if (entry.months.length > 0) {
      const firstNextMonth = monthFromIndex(monthIndex(entry.months[entry.months.length - 1]) + 1)
      const lastNextMonth = monthFromIndex(monthIndex(firstNextMonth) + entry.months.length - 1)
      return {
        analysisYear: firstNextMonth.slice(0, 4),
        periodStartDate: `${firstNextMonth}-01`,
        periodEndDate: `${lastNextMonth}-31`,
      }
    }
    return {}
  }

  const persistClientUpdate = async (updatedClient: Client) => {
    setClients((current) => current.map((client) => (client.id === updatedClient.id ? updatedClient : client)))
    try {
      await apiSend<{ client: Client }>('/api/clients', 'POST', {
        ...updatedClient,
        riskLevel: getOverallLevel(detectRisks(updatedClient, managedRules)),
      })
      setDataStatus('connected')
    } catch (error) {
      console.warn('Client updated locally only.', error)
      setDataStatus('fallback')
    }
  }

  const applyAssistantClientDraft = async (draftClient: Client): Promise<AssistantDraftApplyResult> => {
    const normalizedName = draftClient.name.trim()
    if (!normalizedName) {
      return {
        status: 'draft',
        message: '还不能保存：请先告诉我企业名称。我会把企业名称写入当前清洗草稿后再保存。',
      }
    }
    const normalizedBase: Client = deriveClientMetrics({
      ...normalizePeriodDraft(normalizeClient(draftClient)),
      name: normalizedName,
      projectScope: getProjectScope(draftClient),
      groupName: getProjectScope(draftClient) === '集团项目' ? draftClient.groupName.trim() : '',
      entityRole: getProjectScope(draftClient) === '集团项目' ? getEntityRole(draftClient) : '单体企业',
    })
    const saveIssues = validateClientForSave(normalizedBase)
    const periodEntry = createPeriodEntry(
      normalizedBase,
      {
        ...normalizedBase,
        periodEntries: [],
        manualDerivedFields: { ...(normalizedBase.manualDerivedFields || {}) },
        manualDerivedReasons: { ...(normalizedBase.manualDerivedReasons || {}) },
      },
      formatDate(),
    )

    if (saveIssues.length > 0 || !periodEntry.months.length) {
      const periodEntries = periodEntry.months.length
        ? upsertPeriodEntry(normalizedBase.periodEntries, periodEntry)
        : normalizedBase.periodEntries
      const normalized: Client = { ...normalizedBase, periodEntries }
      setClients((current) => {
        const exists = current.some((client) => client.id === normalized.id)
        return exists ? current.map((client) => (client.id === normalized.id ? normalized : client)) : [normalized, ...current]
      })
      setSelectedClientId(normalizedBase.id)
      setSelectedPeriodEntryIds(periodEntry.months.length ? [periodEntry.id] : [])
      const missingMessage = saveIssues.length
        ? `还缺：${saveIssues.map((issue) => issue.label).slice(0, 6).join('、')}`
        : '还缺：数据期间'
      try {
        await apiSend<{ client: Client }>('/api/clients', 'POST', {
          ...normalized,
          riskLevel: getOverallLevel(detectRisks(normalized, managedRules)),
        })
        setDataStatus('connected')
      } catch (error) {
        console.warn('Assistant draft saved locally only.', error)
        setDataStatus('fallback')
      }
      return {
        status: 'saved',
        client: normalized,
        message: `我已先保存「${normalized.name}」${periodEntry.months.length ? '和已识别的期间数据' : '的企业档案草稿'}，不会离开当前对话。${missingMessage}。你可以直接告诉我这些信息，我会继续更新。`,
      }
    }

    const periodEntries = upsertPeriodEntry(normalizedBase.periodEntries, periodEntry)
    const consistencyWarnings = findPeriodConsistencyWarnings(periodEntries)
    if (consistencyWarnings.length > 0) {
      const confirmed = window.confirm(`发现期间数据差异：\n\n${consistencyWarnings.join('\n')}\n\n是否继续导入？`)
      if (!confirmed) {
        setSelectedClientId(normalizedBase.id)
        return { status: 'draft', message: '已保留在当前清洗草稿中，暂未覆盖已有期间数据。你可以继续告诉我如何处理。' }
      }
    }

    const normalized: Client = { ...normalizedBase, periodEntries }
    setClients((current) => {
      const exists = current.some((client) => client.id === normalized.id)
      return exists ? current.map((client) => (client.id === normalized.id ? normalized : client)) : [normalized, ...current]
    })
    setSelectedClientId(normalized.id)
    setSelectedPeriodEntryIds([periodEntry.id])

    try {
      await apiSend<{ client: Client }>('/api/clients', 'POST', {
        ...normalized,
        riskLevel: getOverallLevel(detectRisks(normalized, managedRules)),
      })
      setDataStatus('connected')
      return { status: 'saved', client: normalized, message: `我已保存「${normalized.name}」并写入 1 条期间数据，当前仍保留在 AI 对话中。` }
    } catch (error) {
      console.warn('Assistant draft saved locally only.', error)
      setDataStatus('fallback')
      return { status: 'saved', client: normalized, message: `我已在本地保存「${normalized.name}」，当前后端不可用；你可以继续在这里补充信息。` }
    }
  }

  const loadRiskDemoCases = () => {
    const existingByCreditCode = new Map(clients.map((client) => [client.creditCode, client]))
    const demoCases = createDemoClients().map((client) => {
      const existingClient = existingByCreditCode.get(client.creditCode)
      return deriveClientMetrics(existingClient ? { ...client, id: existingClient.id } : client)
    })

    setClients((current) => [
      ...demoCases,
      ...current.filter((client) => !demoCaseCreditCodes.has(client.creditCode)),
    ])
    setSelectedClientId(demoCases[0].id)
    setSelectedPeriodEntryIds(demoCases[0].periodEntries[0] ? [demoCases[0].periodEntries[0].id] : [])
    setPage('clients')
    window.alert('已临时载入低风险、中风险、高风险 3 个测试案例，每个案例包含 2024-01 至 2025-12 共 24 期月度数据。测试案例不会保存到正式企业档案，刷新后会隐藏。')
  }

  const editPeriodEntry = (entry: ClientPeriodEntry) => {
    setEditingClient(hydratePeriodDraft(entry))
    setPage('form')
  }

  const copyPeriodEntryToNext = (entry: ClientPeriodEntry) => {
    setEditingClient(hydratePeriodDraft(entry, nextPeriodPatch(entry)))
    setPage('form')
  }

  const deletePeriodEntry = async (entry: ClientPeriodEntry) => {
    if (!selectedClient) return
    if (!window.confirm(`确定删除期间数据「${entry.label}」吗？已生成的历史报告不会删除。`)) return
    const updatedClient = { ...selectedClient, periodEntries: selectedClient.periodEntries.filter((item) => item.id !== entry.id) }
    setSelectedPeriodEntryIds((current) => current.filter((id) => id !== entry.id))
    await persistClientUpdate(updatedClient)
  }

  const canUseAdmin = authUser?.role === 'admin' || authUser?.actor?.role === 'admin'

  const refreshAdminUsers = async () => {
    const response = await apiGet<{ users: AdminUser[] }>('/api/admin/users')
    setAdminUsers(response.users)
  }

  const refreshRules = async () => {
    const response = await apiGet<{ rules: ManagedRule[]; restrictedCount?: number }>('/api/rules')
    setManagedRules(hydrateManagedRules(response.rules))
    setRestrictedRuleCount(response.restrictedCount || 0)
  }

  const resetRuleDraft = () => {
    setRuleDraft(emptyManagedRule)
    setEditingRuleCode('')
  }

  const saveManagedRule = async () => {
    if (!ruleDraft.code.trim() || !ruleDraft.name.trim()) {
      window.alert('规则编号和规则名称不能为空。')
      return
    }

    const payload = {
      ...ruleDraft,
      materials: ruleDraft.materials,
    }

    try {
      await apiSend<{ rule: ManagedRule }>(
        editingRuleCode ? `/api/rules/${editingRuleCode}` : '/api/rules',
        editingRuleCode ? 'PUT' : 'POST',
        payload,
      )
      await refreshRules()
      resetRuleDraft()
    } catch (error) {
      console.warn('Failed to save rule.', error)
      window.alert('保存规则失败。')
    }
  }

  const editManagedRule = (rule: ManagedRule) => {
    setEditingRuleCode(rule.code)
    setRuleDraft({ ...rule })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const deleteManagedRule = async (rule: ManagedRule) => {
    if (!window.confirm(`确定删除规则「${rule.code} ${rule.name}」吗？`)) return

    try {
      await apiDelete<{ ok: true }>(`/api/rules/${rule.code}`)
      await refreshRules()
      if (editingRuleCode === rule.code) {
        resetRuleDraft()
      }
    } catch (error) {
      console.warn('Failed to delete rule.', error)
      window.alert('删除规则失败。')
    }
  }

  const toggleManagedRule = async (rule: ManagedRule) => {
    try {
      await apiSend<{ ok: true; enabled: boolean }>(`/api/rules/${rule.code}/toggle`, 'POST', {})
      await refreshRules()
    } catch (error) {
      console.warn('Failed to toggle rule.', error)
      window.alert('切换规则状态失败。')
    }
  }

  const importBuiltInRules = async () => {
    if (!window.confirm('确定把当前内置规则导入规则库吗？同编号规则会被覆盖。')) return

    try {
      await Promise.all(
        allBuiltInRules.map((rule) =>
          apiSend<{ rule: ManagedRule }>('/api/rules', 'POST', {
            code: rule.code,
            name: rule.name,
            taxType: rule.taxType,
            level: rule.level,
            basis: rule.basis,
            suggestion: rule.suggestion,
            enabled: true,
            conditionText: rule.caseRef,
            conditionJson: riskRuleCondition(rule),
            requiredFields: rule.requiredFields || [],
            materials: rule.materials,
          }),
        ),
      )
      await refreshRules()
    } catch (error) {
      console.warn('Failed to import built-in rules.', error)
      window.alert('导入内置规则失败。')
    }
  }

  const importCandidateRules = async () => {
    if (!window.confirm('确定导入脱敏候选规则吗？同编号 ON 规则会更新为可执行并启用。')) return

    try {
      await Promise.all(
        allCandidateRules.map((rule) =>
          apiSend<{ rule: ManagedRule }>('/api/rules', 'POST', {
            code: rule.code,
            name: rule.name,
            taxType: rule.taxType,
            level: rule.level,
            basis: rule.basis,
            suggestion: rule.suggestion,
            enabled: true,
            conditionText: rule.caseRef,
            conditionJson: riskRuleCondition(rule),
            requiredFields: rule.requiredFields || [],
            materials: rule.materials,
          }),
        ),
      )
      await refreshRules()
    } catch (error) {
      console.warn('Failed to import candidate rules.', error)
      window.alert('导入脱敏候选规则失败。')
    }
  }

  const saveClient = async () => {
    const saveIssues = validateClientForSave(editingClient)
    if (saveIssues.length > 0) {
      window.alert(`请先补齐建档必填项：${saveIssues.map((issue) => issue.message).join('、')}`)
      focusFieldByLabel(saveIssues[0].label)
      return
    }
    const manualOverrideErrors = getManualOverrideErrors(editingClient)
    if (manualOverrideErrors.length > 0) {
      window.alert(`以下手动填写字段需要注明原因：${manualOverrideErrors.map((field) => field.label).join('、')}`)
      return
    }
    const normalizedName = editingClient.name.trim()
    const normalizedBase: Client = deriveClientMetrics({
      ...normalizePeriodDraft(normalizeClient(editingClient)),
      name: normalizedName,
      projectScope: getProjectScope(editingClient),
      groupName: getProjectScope(editingClient) === '集团项目' ? editingClient.groupName.trim() : '',
      entityRole: getProjectScope(editingClient) === '集团项目' ? getEntityRole(editingClient) : '单体企业',
    })
    const periodEntry = createPeriodEntry(
      normalizedBase,
      {
        ...normalizedBase,
        periodEntries: [],
        manualDerivedFields: { ...(normalizedBase.manualDerivedFields || {}) },
        manualDerivedReasons: { ...(normalizedBase.manualDerivedReasons || {}) },
      },
      formatDate(),
    )
    if (!periodEntry.months.length) {
      window.alert('请先补齐数据期间，系统需要明确本次录入覆盖哪些月份。')
      focusFieldByLabel('所属年度')
      return
    }
    const periodEntries = upsertPeriodEntry(normalizedBase.periodEntries, periodEntry)
    const consistencyWarnings = findPeriodConsistencyWarnings(periodEntries)
    if (consistencyWarnings.length > 0) {
      const confirmed = window.confirm(`发现期间数据差异：\n\n${consistencyWarnings.join('\n')}\n\n可以继续保存，但报告会按所选期间分析。是否继续保存？`)
      if (!confirmed) return
    }
    const normalized: Client = {
      ...normalizedBase,
      periodEntries,
    }

    setClients((current) => {
      const exists = current.some((client) => client.id === normalized.id)
      return exists ? current.map((client) => (client.id === normalized.id ? normalized : client)) : [normalized, ...current]
    })
    setSelectedClientId(normalized.id)
    setSelectedPeriodEntryIds([periodEntry.id])
    setPage('clients')

    try {
      await apiSend<{ client: Client }>('/api/clients', 'POST', {
        ...normalized,
        riskLevel: getOverallLevel(detectRisks(normalized, managedRules)),
      })
      setDataStatus('connected')
    } catch (error) {
      console.warn('Client saved locally only.', error)
      setDataStatus('fallback')
    }
  }

  const clearEditingClient = () => {
    const confirmed = window.confirm('确定清空当前录入内容吗？此操作不会删除已保存档案，保存前可继续编辑。')
    if (!confirmed) return
    setEditingClient({ ...blankClient, id: editingClient.id || crypto.randomUUID() })
  }

  const createReport = async (confirmed = false) => {
    if (!selectedClient || aiReportStage) return
    if (!selectedClient.periodEntries.length) {
      window.alert('请先在数据录入页保存一条期间数据，再基于已归档数据生成报告。')
      return
    }
    if (!selectedPeriodEntries.length) {
      window.alert('请先选择要生成报告的已有期间数据，可以选择单月、季度、连续多月或全年。')
      return
    }
    if (selectedPeriodEntries.length > 0 && !selectedPeriodsContinuous) {
      window.alert('选择的月份不连续，不能合并生成一份报告。请改选连续月份，例如 1-3 月、4-6 月或全年。')
      return
    }
    if (!confirmed) {
      setReportConfirmOpen(true)
      return
    }
    setReportConfirmOpen(false)

    const reportClient = deriveClientMetrics({ ...(selectedDetectionClient || selectedClient), periodEntries: [] })
    const startedAt = Date.now()
    const risks = detectRisks(reportClient, managedRules)
    const structuredReport = buildStructuredReport(reportClient, risks)
    const baseReport: Report = {
      id: crypto.randomUUID(),
      clientId: reportClient.id,
      clientName: reportClient.name,
      riskLevel: getOverallLevel(risks),
      createdAt: formatDate(),
      risks,
      content: buildProfessionalReportContent(structuredReport),
      structured: structuredReport,
    }
    setSelectedReportId('')
    setPage('report')

    let report = baseReport
    const risksForAi = risks.map((risk, index) => ({
      ...risk,
      displayOrder: index + 1,
      priority: riskPriority(risk),
      reason: risk.reason(reportClient),
    }))
    try {
      setAiReportStage('reviewing')
      const [reviewResponse] = await Promise.all([
        apiSend<{ review: AiReview; model: string; usage?: unknown }>('/api/ai/review', 'POST', {
          client: reportClient,
          risks: risksForAi,
        }),
        wait(2000),
      ])

      setAiReportStage('generating')
      const [reportResponse] = await Promise.all([
        apiSend<{ content: string; model: string; usage?: unknown }>('/api/ai/report', 'POST', {
          client: reportClient,
          risks: risksForAi,
          content: baseReport.content,
          structuredReport: buildStructuredReport(reportClient, risks),
          aiReview: reviewResponse.review,
        }),
        wait(2000),
      ])
      const reviewedStructuredReport = buildStructuredReport(reportClient, risks)

      report = {
        ...baseReport,
        content: sanitizePublicReportContent(reportResponse.content),
        structured: reviewedStructuredReport,
        aiReview: reviewResponse.review,
        aiGenerated: true,
        aiModel: reportResponse.model || reviewResponse.model,
      }
    } catch (error) {
      console.warn('AI report generation failed, using local report template.', error)
      report = {
        ...baseReport,
        content: sanitizePublicReportContent(`${baseReport.content}\n\nAI 处理提示：本次 AI 数据复核或报告生成失败，系统已使用本地规则模板生成报告。`),
        aiGenerated: false,
      }
      setDataStatus('fallback')
    } finally {
      const elapsed = Date.now() - startedAt
      if (elapsed < 6000) {
        await wait(6000 - elapsed)
      }
      setAiReportStage(null)
    }

    setReports((current) => [report, ...current])
    setSelectedReportId(report.id)

    try {
      await apiSend<{ report: Report }>('/api/reports', 'POST', report)
      setDataStatus('connected')
    } catch (error) {
      console.warn('Report saved locally only.', error)
      setDataStatus('fallback')
    }
  }

  const deleteClient = async (client: Client) => {
    if (!window.confirm(`确定删除企业「${client.name}」吗？相关报告也会一起删除。`)) {
      return
    }

    const remainingClients = clients.filter((item) => item.id !== client.id)
    setClients(remainingClients)
    setReports((current) => current.filter((report) => report.clientId !== client.id))
    if (selectedClientId === client.id) {
      setSelectedClientId(remainingClients[0]?.id || '')
      setSelectedPeriodEntryIds([])
    }

    try {
      await apiDelete<{ ok: true }>(`/api/clients/${client.id}`)
      setDataStatus('connected')
    } catch (error) {
      console.warn('Client deleted locally only.', error)
      setDataStatus('fallback')
    }
  }

  const deleteReport = async (report: Report) => {
    if (!window.confirm(`确定删除「${report.clientName}」的这份报告吗？`)) {
      return
    }

    setReports((current) => current.filter((item) => item.id !== report.id))
    try {
      await apiDelete<{ ok: true }>(`/api/reports/${report.id}`)
      setDataStatus('connected')
    } catch (error) {
      console.warn('Report deleted locally only.', error)
      setDataStatus('fallback')
    }
  }

  const openClientForPeriodSelection = (client: Client) => {
    selectClientForRiskDetection(client)
    setPage('result')
  }

  const openRiskDetectionPage = () => {
    setSelectedPeriodEntryIds([])
    setRiskDetectionStep('client')
    setPage('result')
  }

  const handleAuthSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuthError('')
    setAuthLoading(true)

    try {
      const response = await apiSend<{ user: AuthUser }>(
        authMode === 'login' ? '/api/auth/login' : '/api/auth/register',
        'POST',
        {
          username: authUsername,
          password: authPassword,
        },
      )
      setAuthUser(response.user)
      setLoggedIn(true)
      setAuthPassword('')
      setDataStatus('loading')
    } catch (error) {
      console.warn('Authentication failed.', error)
      const message = error instanceof Error ? error.message : ''
      if (message === 'Username already exists') {
        setAuthError('这个用户名已经被注册，请换一个用户名。')
      } else if (message === 'Invalid username or password') {
        setAuthError('用户名或密码不正确。')
      } else {
        setAuthError(authMode === 'login' ? '登录失败，请稍后重试。' : '注册失败，请稍后重试。')
      }
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    setLoggedIn(false)
    setAuthUser(null)
    setAuthPassword('')
    setDataStatus('loading')
  }

  const resetUserPassword = async (user: AdminUser) => {
    const password = window.prompt(`请输入 ${user.username} 的新密码，至少 6 位：`)
    if (!password) return

    try {
      await apiSend<{ ok: true }>(`/api/admin/users/${user.id}/reset-password`, 'POST', { password })
      window.alert('密码已重置，用户需要用新密码重新登录。')
      await refreshAdminUsers()
    } catch (error) {
      console.warn('Failed to reset password.', error)
      window.alert('重置密码失败。')
    }
  }

  const toggleUserDisabled = async (user: AdminUser) => {
    const action = user.disabledAt ? '启用' : '禁用'
    if (!window.confirm(`确定${action}用户「${user.username}」吗？`)) return

    try {
      await apiSend<{ ok: true }>(`/api/admin/users/${user.id}/${user.disabledAt ? 'enable' : 'disable'}`, 'POST', {})
      await refreshAdminUsers()
    } catch (error) {
      console.warn('Failed to update user status.', error)
      window.alert(`${action}失败。`)
    }
  }

  const impersonateUser = async (user: AdminUser) => {
    if (user.disabledAt) {
      window.alert('该用户已被禁用，不能代入。')
      return
    }
    if (!window.confirm(`确定进入「${user.username}」的工作台吗？`)) return

    try {
      const response = await apiSend<{ user: AuthUser }>('/api/admin/impersonate', 'POST', { userId: user.id })
      setAuthUser(response.user)
      setClients([])
      setReports([])
      setPage('dashboard')
      setDataStatus('loading')
    } catch (error) {
      console.warn('Failed to impersonate user.', error)
      window.alert('进入用户工作台失败。')
    }
  }

  const stopImpersonation = async () => {
    try {
      const response = await apiSend<{ user: AuthUser }>('/api/admin/stop-impersonation', 'POST', {})
      setAuthUser(response.user)
      setClients([])
      setReports([])
      setPage('admin')
      setDataStatus('loading')
    } catch (error) {
      console.warn('Failed to stop impersonation.', error)
      window.alert('退出代入失败，请重新登录管理员账号。')
    }
  }

  const isDraftSimpleCondition = isSimpleCondition(ruleDraft.conditionJson)
  const simpleDraftCondition = isDraftSimpleCondition ? (ruleDraft.conditionJson as SimpleRuleCondition) : null
  const isDraftEditableSimpleCondition =
    Boolean(simpleDraftCondition) &&
    !simpleDraftCondition?.compareField &&
    !simpleDraftCondition?.multiplier &&
    !simpleDraftCondition?.transform
  const draftCondition: SimpleRuleCondition = isDraftSimpleCondition
    ? simpleDraftCondition as SimpleRuleCondition
    : { field: '', operator: '=', value: '' }

  if (!loggedIn) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div className="brand-mark">
            <img src="/heyao-logo.jpg" alt="合耀科技" />
          </div>
          <p className="eyebrow">内部税务风控工作台</p>
          <h1>合耀税务风控工作台</h1>
          <p className="login-copy">录入企业财税画像，自动命中风险规则，生成可复核、可流转的税务风险体检报告。</p>
          <form className="login-card" onSubmit={handleAuthSubmit}>
            <div className="auth-switch">
              <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>
                登录
              </button>
              <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>
                注册
              </button>
            </div>
            <Field label="用户名">
              <input
                value={authUsername}
                onChange={(event) => setAuthUsername(event.target.value)}
                placeholder="3-32 位字母、数字或下划线"
                autoComplete="username"
                disabled={authLoading}
              />
            </Field>
            <Field label="密码">
              <input
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                type="password"
                placeholder="至少 6 位"
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                disabled={authLoading}
              />
            </Field>
            {authError && <p className="auth-error">{authError}</p>}
            <button className="primary-button full" type="submit" disabled={authLoading}>
              {authLoading ? '处理中...' : authMode === 'login' ? '登录工作台' : '注册并进入'}
            </button>
          </form>
        </section>
        <aside className="login-aside">
          <div>
            <span>合耀科技 HY AI</span>
            <strong>把税务经验沉淀成可复核的风控流程</strong>
          </div>
          <p>围绕企业财税画像、风险规则检测和报告流转，帮助财务负责人更快完成税务风险初筛。</p>
        </aside>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/heyao-logo.jpg" alt="合耀科技" />
          <div>
            <strong>合耀科技</strong>
            <span>税务风控工作台</span>
          </div>
        </div>
        {authUser && (
          <div className="sidebar-user">
            <span>当前用户：{authUser.username}</span>
            {authUser.actor && <span>管理员代入：{authUser.actor.username}</span>}
          </div>
        )}
        <nav className="sidebar-nav">
          <div className="nav-group">
            <button className={page === 'dashboard' ? 'active' : ''} onClick={() => setPage('dashboard')}>
              <LayoutDashboard /> 税务健康总览
            </button>
          </div>
          <div className="nav-group">
            <span className="nav-group-label">工作区</span>
            <button className={page === 'assistant' ? 'active' : ''} onClick={() => setPage('assistant')}>
              <Sparkles /> AI 财税助手
            </button>
            <button className={page === 'clients' ? 'active' : ''} onClick={() => setPage('clients')}>
              <Building2 /> 企业档案
            </button>
            <button className={page === 'result' ? 'active' : ''} onClick={openRiskDetectionPage}>
              <Gauge /> 风险检测
            </button>
            <button className={page === 'reports' || page === 'report' ? 'active' : ''} onClick={() => setPage('reports')}>
              <FileText /> 报告
            </button>
            <button className={page === 'rules' ? 'active' : ''} onClick={() => setPage('rules')}>
              <Settings2 /> 规则库
            </button>
            {canUseAdmin && (
              <button className={page === 'admin' ? 'active' : ''} onClick={() => setPage('admin')}>
                <UserCog /> 管理员
              </button>
            )}
          </div>
        </nav>
        {authUser?.actor && (
          <button className="ghost-button logout" onClick={stopImpersonation}>
            <UserCog /> 退出代入
          </button>
        )}
        <button className="ghost-button logout" onClick={handleLogout}>
          <LogOut /> 退出
        </button>
      </aside>

      <main className="workspace">
        {page === 'dashboard' && (
          <section className="page">
            <header className="page-header">
              <div>
                <p className="eyebrow">税务总览</p>
                <h2>税务健康总览</h2>
              </div>
              <div className="header-actions">
                <button className="secondary-button" onClick={() => setPage('reports')}>
                  <FileText /> 查看报告
                </button>
                <button
                  className="primary-button"
                  onClick={() => {
                    setEditingClient(blankDraftClient())
                    setPage('form')
                  }}
                >
                  <Plus /> 导入财务数据
                </button>
              </div>
            </header>
            <section className="boss-period-filter" aria-label="分析期间">
              <div>
                <p className="eyebrow">分析期间</p>
                <h3>{bossPeriodLabel}</h3>
                <p>
                  {bossPeriodInvalid
                    ? '结束月份不能早于开始月份，请重新选择。'
                    : bossPeriodActive
                      ? `${bossStats.analysable} 家企业期间资料完整，${bossStats.missingPeriodClients} 家缺期间数据。`
                      : '默认查看全部企业当前数据；也可以指定月份区间，只看该期间健康情况。'}
                </p>
              </div>
              <div className="boss-period-controls">
                <label>
                  <span>开始月份</span>
                  <input type="month" value={bossPeriodStart} onChange={(event) => setBossPeriodStart(event.target.value)} />
                </label>
                <label>
                  <span>结束月份</span>
                  <input type="month" value={bossPeriodEnd} onChange={(event) => setBossPeriodEnd(event.target.value)} />
                </label>
                <button
                  className="ghost-button"
                  onClick={() => {
                    setBossPeriodStart('')
                    setBossPeriodEnd('')
                  }}
                >
                  全部期间
                </button>
                <div className="boss-period-mode-cue" aria-label="期间选择口径">
                  <span>全部期间</span>
                  <span>手动起止</span>
                  <span>连续月份</span>
                </div>
              </div>
            </section>
            <section className="boss-period-brief" aria-label="本次检查口径">
              <div>
                <span>检查范围</span>
                <strong>{bossPeriodLabel}</strong>
              </div>
              <div>
                <span>可分析企业</span>
                <strong>{bossStats.analysable} 家</strong>
              </div>
              <div>
                <span>资料缺口</span>
                <strong>{bossStats.missingPeriodClients + bossDashboard.missingDataClients} 家待补</strong>
              </div>
              <div>
                <span>风险命中</span>
                <strong>{bossStats.detections} 项</strong>
              </div>
            </section>
            <section className="dashboard-next-step" aria-label="下一步处理">
              <div className="dashboard-next-copy">
                <p className="eyebrow">下一步处理</p>
                <h3>
                  {bossDashboard.missingDataClients > 0
                    ? `先补齐 ${bossDashboard.missingDataClients} 家企业资料`
                    : bossDashboard.topRisks.length > 0
                      ? `先复核 ${bossDashboard.topRisks.length} 个重点风险`
                      : reports.length > 0 ? '查看最新税务报告' : '生成第一份税务报告'}
                </h3>
                <p>{bossDashboard.actions[0]}</p>
              </div>
              <div className="dashboard-next-actions">
                <button className="primary-button" onClick={bossDashboard.missingDataClients > 0 ? () => setPage('clients') : openRiskDetectionPage}>
                  <Gauge /> {bossDashboard.missingDataClients > 0 ? '查看企业档案' : '继续检测'}
                </button>
                <button className="secondary-button" onClick={() => setPage(reports.length > 0 ? 'reports' : 'clients')}>
                  <FileText /> {reports.length > 0 ? '查看报告' : '选择企业'}
                </button>
              </div>
              <div className="dashboard-next-list">
                {bossDashboard.actions.map((item) => <span key={item}>{item}</span>)}
              </div>
            </section>
            <div className="analytics-grid executive-analytics">
              <EChartPanel
                title="企业风险等级分布"
                subtitle="按当前规则引擎检测结果统计"
                option={dashboardLevelOption}
                rows={dashboardLevelRows}
              />
              <EChartPanel
                title="税种风险命中分布"
                subtitle="汇总所有企业当前命中的风险事项"
                option={dashboardTaxOption}
                rows={dashboardTaxDisplayRows}
              />
              <RiskOrbit
                high={stats.high}
                medium={stats.medium}
                low={Math.max(clients.length - stats.high - stats.medium, 0)}
              />
            </div>
            <section className={`boss-dashboard level-${bossDashboard.level === '高' ? 'high' : bossDashboard.level === '中' ? 'medium' : 'low'}`}>
              <div className="boss-summary">
                <span>当前税务健康等级</span>
                <strong>{plainRiskLevel(bossDashboard.level)}风险</strong>
                <p>{bossDashboard.conclusion}</p>
                <div className="boss-delivery-checks" aria-label="试点交付状态">
                  {bossDashboard.deliveryChecks.map((item) => (
                    <div className={`boss-delivery-check ${item.tone}`} key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
                <div className="boss-actions">
                  <button className="primary-button boss-period-report-action" onClick={openBossPeriodReportFlow}>
                    <FileText /> {bossPeriodActive ? '生成当前期间报告' : reports.length ? '查看税务报告' : '生成健康报告'}
                  </button>
                  <button className="secondary-button" onClick={() => setPage('clients')}>
                    <Building2 /> 进入企业档案
                  </button>
                </div>
              </div>
              <div className="boss-panel">
                <div className="panel-title">
                  <h3>优先处理事项</h3>
                </div>
                <div className="boss-risk-list">
                  {bossDashboard.topRisks.length ? bossDashboard.topRisks.map(({ client, risk, evidence, material }) => (
                    <article key={`${client.id}-${risk.code}`}>
                      <div>
                        <strong>{riskDisplayTitle(risk)}</strong>
                        <p>{client.name} / {risk.taxType}</p>
                        <p className="boss-risk-evidence">原因：{evidence}</p>
                        <p className="boss-risk-evidence">资料：{material}</p>
                      </div>
                      <LevelBadge level={risk.level} />
                    </article>
                  )) : (
                    <p className="section-helper">当前没有需要立即处理的中高风险事项。</p>
                  )}
                </div>
              </div>
              <div className="boss-side-column">
                <div className="boss-panel">
                  <div className="panel-title">
                    <h3>缺什么资料</h3>
                    <span>{bossDashboard.missingDataClients} 家待补</span>
                  </div>
                  <div className="boss-gap-list">
                    {bossDashboard.missingFields.length ? bossDashboard.missingFields.map((item) => (
                      <article key={item.label}>
                        <div>
                          <strong>{item.label}</strong>
                          <p>来源：{item.sources.join('、')}</p>
                          <p>涉及：{item.examples.join('；')}</p>
                          <p>影响：{item.blockedRules.length ? item.blockedRules.join('；') : '报告完整性和复核准确度'}</p>
                        </div>
                        <span>{item.count} 家企业</span>
                      </article>
                    )) : (
                      <p className="section-helper">当前基础检测资料已补齐，可先归档本次初筛结果。</p>
                    )}
                  </div>
                </div>
                <div className="boss-panel">
                  <div className="panel-title">
                    <h3>下一步动作</h3>
                  </div>
                  <ol className="boss-action-list">
                    {bossDashboard.actions.map((item) => <li key={item}>{item}</li>)}
                  </ol>
                </div>
              </div>
            </section>
            <div className="stat-grid">
              <StatCard label="企业档案" value={clients.length} icon={<Building2 />} />
              <StatCard label="集团项目" value={stats.groups} icon={<ClipboardList />} tone="green" />
              <StatCard label="命中风险" value={stats.detections} icon={<AlertTriangle />} tone="orange" />
              <StatCard label="高风险企业" value={stats.high} icon={<Gauge />} tone="red" />
            </div>
            <div className="two-column">
              <section className="panel">
                <div className="panel-title">
                  <h3>最近企业风险</h3>
                  <button className="text-button" onClick={() => setPage('clients')}>查看全部</button>
                </div>
                <div className="compact-list">
                  {clientRows.map(({ client, risks, level }) => (
                    <button
                      key={client.id}
                      className="compact-row"
                      onClick={() => {
                        selectClientForRiskDetection(client)
                        setPage('result')
                      }}
                    >
                      <span>
                        <strong>{client.name}</strong>
                        <small>{client.industry} / 命中 {risks.length} 项</small>
                      </span>
                      <LevelBadge level={level} />
                    </button>
                  ))}
                </div>
              </section>
              <section className="panel dark-panel">
                <Sparkles />
                <h3>税务风险体检流程</h3>
                <p>从企业财税画像出发，先用规则引擎完成确定性检测，再由 AI 辅助复核数据疑点并生成可流转报告。</p>
                <ul>
                  <li>录入企业基础、经营、发票和人员数据</li>
                  <li>集团项目按主体分别建档，汇总查看多主体风险</li>
                  <li>自动识别增值税、所得税、发票和资金风险</li>
                  <li>生成风险体检报告并支持 Word 导出</li>
                </ul>
              </section>
            </div>
            {groupSummaries.length > 0 && (
              <section className="panel group-panel">
                <div className="panel-title">
                  <h3>集团项目汇总</h3>
                  <button className="text-button" onClick={() => setPage('clients')}>管理主体</button>
                </div>
                <div className="group-summary-grid">
                  {groupSummaries.map((group) => (
                    <article key={group.name} className="group-summary-card">
                      <div>
                        <strong>{group.name}</strong>
                        <small>{group.clients.length} 个主体 / 命中 {group.risks.length} 项风险</small>
                      </div>
                      <div className="group-metrics">
                        <span>高风险主体 {group.highClients}</span>
                        <span>中风险主体 {group.mediumClients}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </section>
        )}

        <div style={page === 'assistant' ? { display: 'contents' } : { display: 'none' }} aria-hidden={page !== 'assistant'}>
          <AiAssistantPage
            clients={clients}
            selectedClientId={selectedClientId}
            managedRules={managedRules}
            reports={reports}
            taxDataSummary={activeTaxDataSummary}
            taxDataMonth={effectiveTaxDataMonth}
            onApplyClientDraft={(draftClient) => applyAssistantClientDraft(draftClient)}
            onGenerateReport={() => createReport(true)}
            onTaxDataSummaryUpdate={setTaxDataSummary}
          />
        </div>

        {page === 'clients' && (
          <section className="page">
            <header className="page-header">
              <div>
                <p className="eyebrow">企业档案</p>
                <h2>企业档案与期间数据</h2>
              </div>
              <div className="header-actions">
                <div className="demo-import-action">
                  <button type="button" className="secondary-button" onClick={loadRiskDemoCases}>
                    <ClipboardList /> 载入测试案例
                  </button>
                  <small>演示数据，仅用于试算流程验证；点击后临时显示，刷新后隐藏。</small>
                </div>
                <button
                  className="primary-button"
                  onClick={() => {
                    setEditingClient(blankDraftClient())
                    setPage('form')
                  }}
                >
                  <Plus /> 新建企业
                </button>
              </div>
            </header>
            <div className="toolbar">
              <Search />
              <input placeholder="搜索企业名称、统一社会信用代码或集团项目" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            {selectedClient && (
              <section className="panel archive-overview-panel">
                <div className="panel-title">
                  <div>
                    <p className="eyebrow">当前企业</p>
                    <h3>{selectedClient.name}</h3>
                    <p className="section-helper">
                      已归档 {selectedClient.periodEntries.length} 期数据。先保存企业和期间数据，再进入风险检测选择连续月份分析。
                    </p>
                  </div>
                  <div className="header-actions">
                    <button
                      type="button"
                      className="secondary-button compact-button"
                      onClick={() => {
                        setEditingClient(deriveClientMetrics(selectedClient))
                        setPage('form')
                      }}
                    >
                      编辑档案
                    </button>
                    <button
                      type="button"
                      className="primary-button compact-button"
                      onClick={() => {
                        setEditingClient(deriveClientMetrics(selectedClient))
                        setPage('form')
                      }}
                    >
                      新增期间数据
                    </button>
                  </div>
                </div>
                <section className="tax-data-board" aria-label="企业资料完整性看板">
                  <div className="tax-data-period-nav">
                    <div>
                      <span>{taxDataViewMode === 'overview' ? '企业资料' : '查看资料期间'}</span>
                      <strong>{taxDataViewMode === 'overview' ? '历史覆盖总览' : effectiveTaxDataMonth ? `${effectiveTaxDataMonth.slice(0, 4)}年${Number(effectiveTaxDataMonth.slice(5, 7))}月` : '请选择月份'}</strong>
                    </div>
                    <div className="tax-data-view-switch" aria-label="资料查看方式">
                      <button type="button" className={taxDataViewMode === 'overview' ? 'active' : ''} onClick={() => setTaxDataViewMode('overview')}>总览</button>
                      <button type="button" className={taxDataViewMode === 'month' ? 'active' : ''} onClick={() => setTaxDataViewMode('month')}>按月查看</button>
                    </div>
                    {taxDataViewMode === 'month' ? (
                      <>
                        <select
                          aria-label="资料年份"
                          value={effectiveTaxDataMonth.slice(0, 4) || taxDataPeriodYears[0] || ''}
                          onChange={(event) => setSelectedTaxDataMonth(`${event.target.value}-${effectiveTaxDataMonth.slice(5, 7) || '01'}`)}
                        >
                          {taxDataPeriodYears.map((year) => <option key={year} value={year}>{year}年</option>)}
                        </select>
                        <div className="tax-data-period-months">
                          {monthNames.map((label, index) => {
                            const month = `${effectiveTaxDataMonth.slice(0, 4) || taxDataPeriodYears[0]}-${String(index + 1).padStart(2, '0')}`
                            return (
                              <button
                                key={month}
                                type="button"
                                className={`${effectiveTaxDataMonth === month ? 'active' : ''}${taxDataMonthsWithData.has(month) ? ' has-data' : ''}`}
                                onClick={() => setSelectedTaxDataMonth(month)}
                              >
                                {label}
                              </button>
                            )
                          })}
                        </div>
                      </>
                    ) : <p>查看企业历年已收录的资料类别；是否齐全请切换到具体月份。</p>}
                  </div>
                  {taxDataViewMode === 'overview' ? (
                    <div className="tax-data-coverage-matrix" aria-label="各月资料覆盖情况">
                      {taxDataPeriodYears.map((year) => (
                        <div key={year} className="tax-data-coverage-year">
                          <strong>{year}年</strong>
                          <div>
                            {monthNames.map((label, index) => {
                              const month = `${year}-${String(index + 1).padStart(2, '0')}`
                              const categoryCount = new Set((activeTaxDataSummary?.slots || [])
                                .filter((slot) => taxDataSlotCoversMonth(slot, month))
                                .map((slot) => slot.slotId)).size
                              return <button
                                key={month}
                                type="button"
                                className={categoryCount ? 'has-data' : ''}
                                onClick={() => {
                                  setSelectedTaxDataMonth(month)
                                  setTaxDataViewMode('month')
                                }}
                              >
                                <span>{label}</span>
                                <small>{categoryCount ? `${categoryCount}类` : '无资料'}</small>
                              </button>
                            })}
                          </div>
                        </div>
                      ))}
                      <p>总览仅表示历史覆盖，不代表任何月份资料齐全。点击月份查看当期缺失情况。</p>
                    </div>
                  ) : null}
                  <div className="tax-data-board-summary">
                    <div>
                      <span>{taxDataViewMode === 'overview' ? '历史出现资料类别' : '本期已收录资料类别'}</span>
                      <strong>{taxDataViewMode === 'overview'
                        ? `${displayedTaxDataStats.collectedCategoryCount} 类`
                        : `${displayedTaxDataStats.collectedCategoryCount}/${displayedTaxDataStats.totalCategoryCount || 18}`}</strong>
                    </div>
                    <div>
                      <span>来源文件</span>
                      <strong>{displayedTaxDataStats.sourceFileCount} 个</strong>
                    </div>
                    <div>
                      <span>标准记录</span>
                      <strong>{displayedTaxDataStats.recordCount} 条</strong>
                    </div>
                    <div>
                      <span>待确认（全部期间）</span>
                      <strong>{activeTaxDataSummary?.pendingConfirmationCount || 0} 项</strong>
                    </div>
                    <div>
                      <span>{taxDataViewMode === 'overview' ? '从未收录资料类别' : '本期缺失资料'}</span>
                      <strong>{displayedTaxDataStats.missingCount} 类</strong>
                    </div>
                  </div>
                  {taxDataFolderSummaries.length ? (
                    <>
                      <div className="tax-data-folder-grid" aria-label="资料分类">
                        {taxDataFolderSummaries.map((folder, index) => {
                          const active = folder.group === selectedTaxDataFolderSummary?.group
                          const displayStatus = taxDataViewMode === 'overview' ? (folder.collected ? 'history' : 'missing') : folder.status
                          return (
                            <button
                              key={folder.group}
                              type="button"
                              className={`tax-data-folder-tile ${displayStatus}${active ? ' active' : ''}`}
                              onClick={() => setSelectedTaxDataFolder(folder.group)}
                            >
                              <span className="tax-data-folder-index">{String(index + 1).padStart(2, '0')}</span>
                              <span className="tax-data-folder-icon">{active ? <FolderOpen /> : <Folder />}</span>
                              <strong>{folder.group}</strong>
                              <small>{taxDataViewMode === 'overview'
                                ? folder.collected
                                  ? `已收录 ${folder.collected} 类 · ${folder.sourceFileCount} 份文件 · 覆盖 ${folder.coveredMonthCount} 个月`
                                  : '尚无历史资料'
                                : `${folder.collected}/${folder.total} 类资料已收录`}</small>
                              <em>{taxDataViewMode === 'overview'
                                ? folder.collected > 0 ? '历史有资料' : '无历史资料'
                                : folder.status === 'complete' ? '齐全' : folder.status === 'partial' ? '部分缺失' : folder.status === 'pending' ? '待确认' : '缺资料'}</em>
                            </button>
                          )
                        })}
                      </div>
                      <article className="tax-data-folder-detail">
                        <header>
                          <div>
                            <span>{selectedTaxDataFolderSummary?.group}</span>
                            <strong>{taxDataViewMode === 'overview'
                              ? selectedTaxDataFolderSummary?.collected ? '已有历史资料' : '尚未收录资料'
                              : selectedTaxDataFolderSummary?.status === 'complete' ? '资料齐全' : selectedTaxDataFolderSummary?.status === 'partial' ? '资料部分收录' : '资料待补齐'}</strong>
                          </div>
                          <small>{taxDataViewMode === 'overview'
                            ? `历史收录 ${selectedTaxDataFolderSummary?.collected || 0} 类 · ${selectedTaxDataFolderSummary?.sourceFileCount || 0} 份源文件`
                            : `${selectedTaxDataFolderSummary?.collected || 0}/${selectedTaxDataFolderSummary?.total || 0} 类资料已收录`}</small>
                        </header>
                        <div className="tax-data-slot-list">
                          {selectedTaxDataSlots.map((slot) => {
                            const canOpen = slot.status === 'collected' || taxDataHasElectronicTemplate(slot)
                            return (
                            <div
                              key={slot.id}
                              className={`${slot.status === 'collected' ? 'tax-data-slot-row collected' : 'tax-data-slot-row missing'}${canOpen ? ' clickable' : ''}`}
                              role={canOpen ? 'button' : undefined}
                              tabIndex={canOpen ? 0 : undefined}
                              onClick={() => canOpen && void openTaxDataDetail(slot)}
                              onKeyDown={(event) => {
                                if (canOpen && (event.key === 'Enter' || event.key === ' ')) {
                                  event.preventDefault()
                                  void openTaxDataDetail(slot)
                                }
                              }}
                            >
                              <span className="tax-data-slot-state">{slot.status === 'collected' ? <CheckCircle2 /> : <AlertTriangle />}</span>
                              <div className="tax-data-slot-main">
                                <strong>{slot.name}</strong>
                                <small>
                                  {slot.status === 'collected'
                                    ? `${slot.periodLabel} · ${slot.recordCount} 条记录 · ${slot.sourceFileCount} 个来源文件`
                                    : `${taxDataPeriodTypeLabel(slot.periodType)}收录 · ${taxDataParserTypeLabel(slot.parserType)}`}
                                </small>
                                {slot.sourceFiles[0]?.file_name ? <em>{slot.sourceFiles[0].file_name}</em> : null}
                                {slot.sourceFiles[0]?.template_matches?.[0] ? (
                                  <span className={slot.sourceFiles[0].auto_import_eligible ? 'tax-data-template-state passed' : 'tax-data-template-state failed'}>
                                    {slot.sourceFiles[0].auto_import_eligible ? '模板校验通过' : '模板待复核'} · {slot.sourceFiles[0].template_matches[0].templateName} v{slot.sourceFiles[0].template_matches[0].version}
                                  </span>
                                ) : null}
                                {slot.validationMessages.length ? <p>{slot.validationMessages[0]}</p> : null}
                              </div>
                              <div className="tax-data-slot-actions">
                                {slot.keyValues.length ? (
                                  <dl>
                                    {slot.keyValues.slice(0, 3).map(([label, value]) => (
                                      <div key={`${slot.id}-${label}`}><dt>{label}</dt><dd>{value}</dd></div>
                                    ))}
                                  </dl>
                                ) : null}
                                {canOpen ? <button type="button" className="secondary-button compact-button tax-data-review-button" onClick={(event) => { event.stopPropagation(); void openTaxDataDetail(slot) }}>{slot.status === 'collected' ? '查看与核对' : '查看标准表'}</button> : null}
                              </div>
                            </div>
                            )
                          })}
                        </div>
                      </article>
                    </>
                  ) : (
                    <div className="tax-data-empty">
                      <strong>还没有已收录的标准资料</strong>
                      <p>在 AI 财税助手上传并确认导入后，增值税申报表、附表四、工资表、科目余额表等会自动出现在这里。</p>
                    </div>
                  )}
                </section>
                <div className="archive-year-list">
                  {selectedClientPeriodYears.map((year) => (
                    <article key={year} className="archive-year-card">
                      <div>
                        <strong>{year} 年月度数据</strong>
                        <small>有数据的月份可直接进入分析；空缺月份需要先录入。</small>
                      </div>
                      <div className="archive-month-grid">
                        {monthNames.map((label, index) => {
                          const entries = periodEntriesForMonth(selectedClient, year, index)
                          const hasData = entries.length > 0
                          return (
                            <button
                              key={`${year}-${label}`}
                              type="button"
                              className={hasData ? 'archive-month-cell has-data' : 'archive-month-cell'}
                              disabled={!hasData}
                              onClick={() => analyzeMonth(selectedClient, entries)}
                            >
                              <span>{label}</span>
                              <small>{hasData ? `${entries.length} 期` : '空缺'}</small>
                            </button>
                          )
                        })}
                      </div>
                    </article>
                  ))}
                </div>
                {selectedClient.periodEntries.length > 0 && (
                  <div className="archive-period-list">
                    <strong>已录入期间</strong>
                    <div className="period-entry-grid">
                      {selectedClient.periodEntries.map((entry) => (
                        <article key={entry.id} className="period-entry-card">
                          <span>{periodEntryDisplayLabel(entry)}</span>
                          <strong>{formatMonthRange(entry.months)}</strong>
                          <small>{entry.months.length} 个月｜保存于 {entry.savedAt}</small>
                          <div className="period-card-actions">
                            <button type="button" onClick={() => analyzePeriodEntry(selectedClient, entry)}>分析</button>
                            <button type="button" onClick={() => editPeriodEntry(entry)}>编辑</button>
                            <button type="button" onClick={() => copyPeriodEntryToNext(entry)}>复制下一期</button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                )}
                {selectedClientPeriodWarnings.length > 0 && (
                  <div className="period-warning-list">
                    <strong>数据一致性提示</strong>
                    {selectedClientPeriodWarnings.map((warning) => <p key={warning}>{warning}</p>)}
                  </div>
                )}
              </section>
            )}
            <div className="table-panel">
              <table>
                <thead>
                  <tr>
                    <th>企业名称</th>
                    <th>项目口径</th>
                    <th>行业</th>
                    <th>纳税人类型</th>
                    <th>地区</th>
                    <th>期间数据</th>
                    <th>风险等级</th>
                    <th>报告</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {clientRows.map(({ client, level, report }) => (
                    <tr key={client.id}>
                      <td>
                        <strong>{client.name}</strong>
                        <small>{client.creditCode}</small>
                      </td>
                      <td>
                        <strong>{getProjectScope(client)}</strong>
                        <small>{getGroupName(client) || getEntityRole(client)}</small>
                      </td>
                      <td>{readableImportedText(client.industry, '未填写')}</td>
                      <td>{readableImportedText(client.taxpayerType, '未填写')}</td>
                      <td>{readableImportedText(client.region, '未填写')}</td>
                      <td>{client.periodEntries.length ? `${client.periodEntries.length} 期` : '未归档'}</td>
                      <td><LevelBadge level={level} /></td>
                      <td>{report ? '已生成' : '未生成'}</td>
                      <td className="row-actions">
                        <button
                          onClick={() => {
                            setSelectedClientId(client.id)
                            setSelectedPeriodEntryIds([])
                            setPage('clients')
                          }}
                        >
                          查看
                        </button>
                        <button
                          onClick={() => {
                            setEditingClient(deriveClientMetrics(client))
                            setPage('form')
                          }}
                        >
                          编辑
                        </button>
                        <button className="danger-action" onClick={() => deleteClient(client)}>
                          <Trash2 /> 删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {page === 'form' && (
          <section className="page">
            <header className="page-header">
              <div>
                <p className="eyebrow">数据录入</p>
                <h2>企业档案与期间数据</h2>
              </div>
              <div className="header-actions">
                <button className="secondary-button danger-secondary" onClick={clearEditingClient}>
                  <Trash2 /> 全部清空
                </button>
                <button className="primary-button" onClick={saveClient}>
                  <ShieldCheck /> 保存期间数据
                </button>
              </div>
            </header>
            <ClientForm client={editingClient} clients={clients} onChange={setEditingClient} />
          </section>
        )}

        {page === 'result' && selectedClient && (
          <section className="page">
            <header className="page-header">
              <div>
                <p className="eyebrow">风险检测</p>
                <h2>按企业和期间发起检测</h2>
              </div>
              <div className="header-actions">
                <button
                  className="secondary-button"
                  onClick={() => {
                    setEditingClient(deriveClientMetrics(selectedClient))
                    setPage('form')
                  }}
                >
                  <RefreshCcw /> 编辑资料
                </button>
                <button className="primary-button" onClick={() => createReport()} disabled={riskDetectionStep !== 'result' || Boolean(aiReportStage)}>
                  <Sparkles /> {aiReportStage === 'reviewing' ? 'AI 正在复核数据...' : aiReportStage === 'generating' ? 'AI 正在生成报告...' : '生成报告'}
                </button>
              </div>
            </header>
            <div className="risk-stepper" aria-label="风险检测流程">
              {[
                ['client', '选择企业'],
                ['period', '选择期间'],
                ['confirm', '确认范围'],
                ['result', '检测结果'],
              ].map(([step, label], index) => (
                <span
                  key={step}
                  className={riskDetectionStep === step ? 'active' : ['client', 'period', 'confirm', 'result'].indexOf(riskDetectionStep) > index ? 'done' : ''}
                >
                  <i>{index + 1}</i>{label}
                </span>
              ))}
            </div>
            {riskDetectionStep === 'client' && (
            <section className="panel archive-overview-panel">
              <div className="panel-title">
                <div>
                  <p className="eyebrow">已有档案</p>
                  <h3>第一步：选择需要分析的企业</h3>
                  <p className="section-helper">风险检测只基于企业档案中的已保存期间数据。先选择企业，再进入期间选择和检测确认。</p>
                </div>
                <span>{clients.length} 个企业</span>
              </div>
              <div className="table-panel compact-table">
                <table>
                  <thead>
                    <tr>
                      <th>企业名称</th>
                      <th>项目口径</th>
                      <th>行业</th>
                      <th>纳税人类型</th>
                      <th>地区</th>
                      <th>期间数据</th>
                      <th>风险等级</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientRows.map(({ client, level }) => (
                      <tr key={`risk-source-${client.id}`}>
                        <td>
                          <strong>{client.name}</strong>
                          <small>{client.creditCode}</small>
                        </td>
                        <td>
                          <strong>{getProjectScope(client)}</strong>
                          <small>{getGroupName(client) || getEntityRole(client)}</small>
                        </td>
                        <td>{client.industry}</td>
                        <td>{client.taxpayerType}</td>
                        <td>{client.region}</td>
                        <td>{client.periodEntries.length ? `${client.periodEntries.length} 期` : '未归档'}</td>
                        <td><LevelBadge level={level} /></td>
                        <td className="row-actions">
                          <button onClick={() => selectClientForRiskDetection(client)} disabled={!client.periodEntries.length}>
                            选择企业
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            )}
            {riskDetectionStep === 'period' && (
            <section className="panel period-analysis-panel">
              <div className="panel-title">
                <div>
                  <p className="eyebrow">期间数据</p>
                  <h3>第二步：选择连续期间</h3>
                  <p className="section-helper">最小单位为月份。可以选择单月、连续多月、季度或全年；不连续月份不能合并成一份报告。</p>
                </div>
                <div className="period-title-actions">
                  <span>{selectedPeriodLabel}</span>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={proceedToRiskConfirmation}
                    disabled={!selectedPeriodEntries.length || !selectedPeriodsContinuous}
                  >
                    {!selectedPeriodEntries.length ? '请选择期间' : !selectedPeriodsContinuous ? '期间需连续' : '确认期间'}
                  </button>
                </div>
              </div>
              {selectedClient.periodEntries.length > 0 ? (
                <>
                  <div className="period-picker">
                    {selectedClientPeriodYears.map((year) => {
                      const yearMonths = monthsBetween(`${year}-01`, `${year}-12`)
                      const hasFullYear = yearMonths.every((month) => selectedClientAvailableMonths.has(month))
                      return (
                        <section key={year} className="period-picker-year">
                          <div className="period-picker-title">
                            <strong>{year} 年</strong>
                            <button type="button" disabled={!hasFullYear} onClick={() => selectYearMonths(year)}>
                              全年
                            </button>
                          </div>
                          <div className="period-picker-quarters">
                            {(['Q1', 'Q2', 'Q3', 'Q4'] as AnalysisQuarter[]).map((quarter) => {
                              const months = quarterMonths(year, quarter)
                              const disabled = !months.every((month) => selectedClientAvailableMonths.has(month))
                              return (
                                <button key={quarter} type="button" disabled={disabled} onClick={() => selectQuarterMonths(year, quarter)}>
                                  {quarter}
                                </button>
                              )
                            })}
                          </div>
                          <div className="period-picker-months">
                            {monthNames.map((label, index) => {
                              const month = `${year}-${String(index + 1).padStart(2, '0')}`
                              const disabled = !selectedClientAvailableMonths.has(month)
                              const active = selectedPeriodMonths.includes(month)
                              return (
                                <button
                                  key={month}
                                  type="button"
                                  className={active ? 'active' : ''}
                                  disabled={disabled}
                                  onClick={() => selectPeriodMonths([month], month)}
                                >
                                  {label}
                                </button>
                              )
                            })}
                          </div>
                        </section>
                      )
                    })}
                  </div>
                  <div className="period-entry-grid">
                    {selectedClient.periodEntries.map((entry) => {
                      const checked = selectedPeriodEntryIdSet.has(entry.id)
                      return (
                        <article
                          key={entry.id}
                          className={checked ? 'period-entry-card active' : 'period-entry-card'}
                        >
                          <span>{periodEntryDisplayLabel(entry)}</span>
                          <strong>{formatMonthRange(entry.months)}</strong>
                          <small>{entry.months.length} 个月｜保存于 {entry.savedAt}</small>
                          <div className="period-card-actions">
                            <button type="button" onClick={() => togglePeriodEntry(entry.id)}>
                              {checked ? '取消选择' : '选择分析'}
                            </button>
                            <button type="button" onClick={() => editPeriodEntry(entry)}>编辑</button>
                            <button type="button" onClick={() => copyPeriodEntryToNext(entry)}>复制下一期</button>
                            <button type="button" className="danger-action" onClick={() => void deletePeriodEntry(entry)}>删除</button>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                  <div className="period-actions-row">
                    <button type="button" className="secondary-button compact-button" onClick={() => setSelectedPeriodEntryIds([])}>
                      清空期间选择
                    </button>
                    <button
                      type="button"
                      className="secondary-button compact-button"
                      onClick={selectAllPeriodEntriesForAnalysis}
                    >
                      选择全部连续期间
                    </button>
                    <button type="button" className="primary-button compact-button" onClick={proceedToRiskConfirmation} disabled={!selectedPeriodEntries.length || !selectedPeriodsContinuous}>
                      下一步确认
                    </button>
                  </div>
                  {selectedPeriodEntries.length > 0 && !selectedPeriodsContinuous && (
                    <p className="period-warning">当前选择的月份不连续，不能合并分析。请改选连续月份，例如 1-3 月、4-6 月或全年。</p>
                  )}
                  {selectedClientPeriodWarnings.length > 0 && (
                    <div className="period-warning-list">
                      <strong>数据一致性提示</strong>
                      {selectedClientPeriodWarnings.map((warning) => <p key={warning}>{warning}</p>)}
                    </div>
                  )}
                </>
              ) : (
                <p className="section-helper">当前企业还没有保存期间快照。请先到数据录入页保存期间数据，再选择已有档案生成检测和报告。</p>
              )}
              <div className="period-actions-row">
                <button type="button" className="secondary-button compact-button" onClick={backToRiskClientSelection}>
                  返回选择企业
                </button>
              </div>
            </section>
            )}
            {riskDetectionStep === 'confirm' && (
              <section className="panel risk-confirm-panel">
                <div className="panel-title">
                  <div>
                    <p className="eyebrow">检测前确认</p>
                    <h3>第三步：确认企业和分析期间</h3>
                    <p className="section-helper">确认无误后开始检测。检测结论只适用于当前企业、所选连续期间和数据来源。</p>
                  </div>
                  <span>{selectedPeriodsContinuous ? '期间连续' : '期间不连续'}</span>
                </div>
                <div className="confirm-grid">
                  <article>
                    <span>分析企业</span>
                    <strong>{selectedClient.name}</strong>
                    <small>{selectedClient.creditCode || '未填写统一社会信用代码'}</small>
                  </article>
                  <article>
                    <span>分析范围</span>
                    <strong>{selectedPeriodLabel}</strong>
                    <small>{selectedPeriodEntries.length ? formatMonthRange(selectedPeriodMonths) : '未选择归档期间'}</small>
                  </article>
                  <article>
                    <span>数据来源</span>
                    <strong>{selectedDetectionClient?.dataBasis || selectedClient.dataBasis || '未填写'}</strong>
                    <small>{selectedDetectionClient?.comparisonPeriod || '未设置对比期间'}</small>
                  </article>
                  <article>
                    <span>检测准备</span>
                    <strong>{currentReportIssues.length ? `${currentReportIssues.length} 项待补` : '可检测'}</strong>
                    <small>{currentReportIssues.length ? validationSummary(currentReportIssues) : '基础检测必填项已补齐'}</small>
                  </article>
                </div>
                {selectedClientPeriodWarnings.length > 0 && (
                  <div className="period-warning-list">
                    <strong>数据一致性提示</strong>
                    {selectedClientPeriodWarnings.map((warning) => <p key={warning}>{warning}</p>)}
                  </div>
                )}
                {currentReportIssues.length > 0 && (
                  <p className="period-warning">当前仍有检测必填字段缺失，可以继续检测，但结果会标记为资料不足，仅供线索参考。</p>
                )}
                <div className="modal-actions">
                  <button type="button" className="secondary-button" onClick={() => setRiskDetectionStep('period')}>返回选择期间</button>
                  <button type="button" className="primary-button" disabled={!selectedDetectionClient || !selectedPeriodsContinuous} onClick={startRiskDetection}>
                    开始检测
                  </button>
                </div>
              </section>
            )}
            {riskDetectionStep === 'result' && selectedDetectionClient ? (
              <>
            <div className="result-summary">
              <StatCard label="综合等级" value={`${overallLevel}风险`} icon={<Gauge />} tone={overallLevel === '高' ? 'red' : overallLevel === '中' ? 'orange' : 'green'} />
              <StatCard label="风险事项" value={currentRisks.length} icon={<ClipboardList />} tone="orange" />
              <StatCard label="高风险" value={currentRisks.filter((risk) => risk.level === '高').length} icon={<AlertTriangle />} tone="red" />
              <StatCard label="中风险" value={currentRisks.filter((risk) => risk.level === '中').length} icon={<BarChart3 />} />
            </div>
            {selectedGroupSummary && (
              <section className="panel selected-group-panel">
                <div>
                  <p className="eyebrow">集团项目</p>
                  <h3>{selectedGroupSummary.name}</h3>
                  <p className="section-helper">
                    当前主体角色：{getEntityRole(selectedClient)}。集团口径共 {selectedGroupSummary.clients.length} 个主体，合计命中 {selectedGroupSummary.risks.length} 项风险。
                  </p>
                </div>
                <div className="group-metrics">
                  <span>高风险主体 {selectedGroupSummary.highClients}</span>
                  <span>中风险主体 {selectedGroupSummary.mediumClients}</span>
                  <span>当前主体 {selectedClient.name}</span>
                </div>
              </section>
            )}
            <div className="analytics-grid result-analytics">
              <EChartPanel
                title="当前企业税种分布"
                subtitle="按风险事项涉及税种汇总"
                option={currentTaxOption}
                rows={currentRiskTaxRows}
              />
              <EChartPanel
                title="整改优先级分布"
                subtitle="用于安排后续复核和整改顺序"
                option={currentPriorityOption}
                rows={currentPriorityRows}
              />
              <RiskOrbit
                high={currentRiskLevelRows.find((row) => row.name === '高风险')?.value || 0}
                medium={currentRiskLevelRows.find((row) => row.name === '中风险')?.value || 0}
                low={currentRiskLevelRows.find((row) => row.name === '低风险')?.value || 0}
              />
            </div>
            {currentCompleteness && (
              <section className="panel readiness-panel">
                <div>
                  <p className="eyebrow">资料完整性说明</p>
                  <h3>{currentCompleteness.label}（{currentCompleteness.score}%）</h3>
                  <p>{currentCompleteness.note}</p>
                </div>
                <div>
                  <strong>建议优先补充资料</strong>
                  <div className="chips">
                    {currentCompleteness.suggestedMaterials.length
                      ? currentCompleteness.suggestedMaterials.map((item) => <span key={item}>{item}</span>)
                      : <span>继续完善申报表、发票、流水和合同等原始资料</span>}
                  </div>
                </div>
                <div className="wide">
                  <strong>基础检测缺失字段</strong>
                  <div className="chips action-chips">
                    {currentReportIssues.length
                      ? currentReportIssues.map((issue) => (
                        <button key={`${issue.field}-${issue.label}`} type="button" onClick={() => jumpToIntakeField(issue.label)}>
                          {issue.label}
                        </button>
                      ))
                      : <span>基础检测必填项已补齐</span>}
                  </div>
                </div>
              </section>
            )}
            {currentSkippedRules.length > 0 && (
              <section className="panel skipped-rules-panel">
                <div className="panel-title">
                  <div>
                    <p className="eyebrow">资料不足未执行规则</p>
                    <h3>补齐资料后自动纳入检测</h3>
                  </div>
                  <span>{currentSkippedRules.length} 条</span>
                </div>
                {currentMissingFieldRows.length > 0 && (
                  <div className="missing-field-summary">
                    <strong>优先补充字段</strong>
                    <div className="chips action-chips">
                      {currentMissingFieldRows.map((row) => (
                        <button key={row.name} type="button" onClick={() => jumpToIntakeField(row.name)}>
                          {row.name} × {row.value}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="skipped-rule-list">
                  {currentSkippedRules.slice(0, 8).map(({ rule, execution }) => (
                    <article key={rule.code} className="skipped-rule-card">
                      <strong>{rule.code}｜{rule.name}</strong>
                      <small>缺少字段：{execution.missingFields.map(fieldLabel).join('、')}</small>
                    </article>
                  ))}
                </div>
                {currentSkippedRules.length > 8 && <p className="section-helper">还有 {currentSkippedRules.length - 8} 条规则因资料不足暂未展开。</p>}
              </section>
            )}
            <div className="risk-list">
              {currentRisks.map((risk) => (
                <article className="risk-card" key={risk.code}>
                  <div className="risk-card-head">
                    <span className="rule-code">风险事项</span>
                    <LevelBadge level={risk.level} />
                  </div>
                  <h3>{risk.name}</h3>
                  <p><strong>涉及税种：</strong>{risk.taxType}</p>
                  <p><strong>整改优先级：</strong>{riskPriority(risk)}</p>
                  <p><strong>触发原因：</strong>{risk.reason(selectedDetectionClient || selectedClient)}</p>
                  <p><strong>整改建议：</strong>{risk.suggestion}</p>
                  <p><strong>依据：</strong>{risk.basis}</p>
                  <strong className="section-label">建议补充资料</strong>
                  <div className="chips">{risk.materials.map((item) => <span key={item}>{item}</span>)}</div>
                </article>
              ))}
              {!currentRisks.length && (
                <div className="empty-state">
                  <CheckCircle2 />
                  <h3>暂未命中明显风险</h3>
                  <p>建议继续补充流水、发票、工资和平台收入等资料后复核。</p>
                </div>
              )}
            </div>
              </>
            ) : riskDetectionStep === 'result' ? (
              <div className="empty-state wide">
                <ClipboardList />
                <h3>请选择已有档案期间</h3>
                <p>风险检测和报告生成必须基于已保存的期间数据。请选择单月、季度、连续多月或全年后再生成结果。</p>
              </div>
            ) : null}
          </section>
        )}

        {reportConfirmOpen && selectedClient && (
          <div className="modal-backdrop" role="presentation" onClick={() => setReportConfirmOpen(false)}>
            <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="report-confirm-title" onClick={(event) => event.stopPropagation()}>
              <div className="modal-title-row">
                <div>
                  <p className="eyebrow">报告前确认</p>
                  <h3 id="report-confirm-title">确认本次分析范围和数据质量</h3>
                </div>
                <button type="button" className="icon-text-button" onClick={() => setReportConfirmOpen(false)}>关闭</button>
              </div>
              <div className="confirm-grid">
                <article>
                  <span>分析范围</span>
                  <strong>{selectedPeriodLabel}</strong>
                  <small>{selectedPeriodEntries.length ? `使用 ${selectedPeriodEntries.length} 期期间数据` : '未选择归档期间'}</small>
                </article>
                <article>
                  <span>月份连续性</span>
                  <strong>{selectedPeriodsContinuous ? '连续' : '不连续'}</strong>
                  <small>{selectedPeriodEntries.length ? formatMonthRange(selectedPeriodMonths) : '请先选择已有档案数据'}</small>
                </article>
                <article>
                  <span>数据来源</span>
                  <strong>{selectedDetectionClient?.dataBasis || selectedClient.dataBasis || '未填写'}</strong>
                  <small>{selectedDetectionClient?.comparisonPeriod || '未设置对比期间'}</small>
                </article>
                <article>
                  <span>检测缺失</span>
                  <strong>{currentReportIssues.length} 项</strong>
                  <small>{currentReportIssues.length ? validationSummary(currentReportIssues) : '基础检测必填项已补齐'}</small>
                </article>
              </div>
              {selectedClientPeriodWarnings.length > 0 && (
                <div className="period-warning-list">
                  <strong>数据一致性提示</strong>
                  {selectedClientPeriodWarnings.map((warning) => <p key={warning}>{warning}</p>)}
                </div>
              )}
              {currentReportIssues.length > 0 && (
                <p className="period-warning">当前仍有检测必填字段缺失，可以继续生成报告，但报告会标记为资料不足，仅供线索参考。</p>
              )}
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setReportConfirmOpen(false)}>返回检查</button>
                <button type="button" className="primary-button" disabled={!selectedPeriodsContinuous || Boolean(aiReportStage)} onClick={() => void createReport(true)}>
                  确认生成报告
                </button>
              </div>
            </section>
          </div>
        )}

        {page === 'report' && reportPageClient && (
          <ReportPage
            report={selectedReport || reports.find((report) => report.clientId === reportPageClient.id)}
            client={reportPageClient}
            risks={reportPageRisks}
            onGenerate={() => {
              if (selectedReport && !clients.some((client) => client.id === selectedReport.clientId)) {
                window.alert('这份历史报告未匹配到当前企业档案，可继续查看或导出；如需重新生成，请先恢复对应企业档案。')
                return
              }
              createReport()
            }}
            aiStage={aiReportStage}
            onUpdate={(content) =>
              setReports((current) =>
                current.map((report) => (
                  selectedReport
                    ? (report.id === selectedReport.id ? { ...report, content } : report)
                    : (report.clientId === reportPageClient.id ? { ...report, content } : report)
                )),
              )
            }
          />
        )}

        {page === 'reports' && (
          <section className="page">
            <header className="page-header">
              <div>
                <p className="eyebrow">报告记录</p>
                <h2>历史体检报告</h2>
              </div>
            </header>
            <section className="panel archive-overview-panel">
              <div className="panel-title">
                <div>
                  <p className="eyebrow">生成报告</p>
                  <h3>选择已有档案数据</h3>
                  <p className="section-helper">报告必须基于已保存的企业档案和连续期间数据生成。先选择企业，再确认单月、季度、连续多月或全年范围。</p>
                </div>
                <button
                  type="button"
                  className="primary-button compact-button"
                  onClick={() => {
                    setEditingClient(blankDraftClient())
                    setPage('form')
                  }}
                >
                  <Plus /> 录入新数据
                </button>
              </div>
              <div className="table-panel compact-table">
                <table>
                  <thead>
                    <tr>
                      <th>企业名称</th>
                      <th>期间数据</th>
                      <th>当前风险</th>
                      <th>报告状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientRows.map(({ client, level, report }) => (
                      <tr key={`report-source-${client.id}`}>
                        <td>
                          <strong>{client.name}</strong>
                          <small>{client.creditCode}</small>
                        </td>
                        <td>{client.periodEntries.length ? `${client.periodEntries.length} 期` : '未归档'}</td>
                        <td><LevelBadge level={level} /></td>
                        <td>{report ? '已生成' : '未生成'}</td>
                        <td className="row-actions">
                          <button onClick={() => openClientForPeriodSelection(client)}>
                            选择期间
                          </button>
                          {report && (
                            <button
                              onClick={() => {
                                setSelectedReportId(report.id)
                                setSelectedClientId(client.id)
                                setSelectedPeriodEntryIds([])
                                setPage('report')
                              }}
                            >
                              查看报告
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <div className="report-grid">
              {reports.map((report) => (
                <article className="report-card" key={report.id}>
                  <LevelBadge level={report.riskLevel} />
                  <h3>{report.clientName}</h3>
                  <p>{report.createdAt}</p>
                  <div className="report-actions">
                    <button
                      onClick={() => {
                        setSelectedReportId(report.id)
                        setSelectedClientId(report.clientId)
                        setSelectedPeriodEntryIds([])
                        setPage('report')
                      }}
                    >
                      查看
                    </button>
                    <button onClick={() => downloadWord(report)}>
                      <Download /> Word
                    </button>
                    <button onClick={() => printReportPdf(report)}>
                      <Printer /> PDF
                    </button>
                    <button className="danger-action" onClick={() => deleteReport(report)}>
                      <Trash2 /> 删除
                    </button>
                  </div>
                </article>
              ))}
              {!reports.length && (
                <div className="empty-state wide">
                  <FileText />
                  <h3>还没有报告</h3>
                  <p>先选择一个企业，在风险结果页生成报告。</p>
                </div>
              )}
            </div>
          </section>
        )}

        {page === 'admin' && canUseAdmin && (
          <section className="page">
            <header className="page-header">
              <div>
                <p className="eyebrow">账号管理</p>
                <h2>测试用户后台</h2>
              </div>
              <button className="secondary-button" onClick={refreshAdminUsers}>
                <RefreshCcw /> 刷新
              </button>
            </header>
            <div className="table-panel">
              <table>
                <thead>
                  <tr>
                    <th>用户名</th>
                    <th>角色</th>
                    <th>状态</th>
                    <th>企业</th>
                    <th>报告</th>
                    <th>注册时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.username}</strong>
                        <small>{user.id}</small>
                      </td>
                      <td>{user.role === 'admin' ? '管理员' : '普通用户'}</td>
                      <td>{user.disabledAt ? '已禁用' : '正常'}</td>
                      <td>{user.clientsCount}</td>
                      <td>{user.reportsCount}</td>
                      <td>{user.createdAt}</td>
                      <td className="row-actions admin-actions">
                        <button onClick={() => impersonateUser(user)}>
                          <UserCog /> 进入
                        </button>
                        <button onClick={() => resetUserPassword(user)}>重置密码</button>
                        <button className="danger-action" onClick={() => toggleUserDisabled(user)}>
                          {user.disabledAt ? '启用' : '禁用'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!adminUsers.length && (
              <div className="empty-state wide">
                <UserCog />
                <h3>还没有加载到用户</h3>
                <p>确认当前账号已经被设置为 admin，然后点击刷新。</p>
              </div>
            )}
          </section>
        )}

        {page === 'rules' && (
          <section className="page">
            <header className="page-header">
              <div>
                <p className="eyebrow">规则库</p>
                <h2>规则库后台</h2>
              </div>
              <div className="header-actions">
                <button className="secondary-button" onClick={refreshRules}>
                  <RefreshCcw /> 刷新
                </button>
                {canUseAdmin && (
                  <>
                    <button className="secondary-button" onClick={importCandidateRules}>
                      <ClipboardList /> 导入脱敏候选规则
                    </button>
                    <button className="primary-button" onClick={importBuiltInRules}>
                      <Plus /> 导入内置规则
                    </button>
                  </>
                )}
              </div>
            </header>
            {canUseAdmin && (
              <section className="form-section rule-editor">
                <div className="panel-title">
                  <h3>{editingRuleCode ? `编辑规则 ${editingRuleCode}` : '新增规则'}</h3>
                  {editingRuleCode && <button className="text-button" onClick={resetRuleDraft}>取消编辑</button>}
                </div>
                <div className="form-grid">
                  <Field label="规则编号">
                    <input
                      value={ruleDraft.code}
                      disabled={Boolean(editingRuleCode)}
                      onChange={(event) => setRuleDraft({ ...ruleDraft, code: event.target.value.toUpperCase() })}
                      placeholder="R031"
                    />
                  </Field>
                  <Field label="规则名称">
                    <input value={ruleDraft.name} onChange={(event) => setRuleDraft({ ...ruleDraft, name: event.target.value })} />
                  </Field>
                  <Field label="税种">
                    <input value={ruleDraft.taxType} onChange={(event) => setRuleDraft({ ...ruleDraft, taxType: event.target.value })} />
                  </Field>
                  <Field label="风险等级">
                    <select value={ruleDraft.level} onChange={(event) => setRuleDraft({ ...ruleDraft, level: event.target.value as RiskLevel })}>
                      <option>高</option>
                      <option>中</option>
                      <option>低</option>
                    </select>
                  </Field>
                  <Field label="启用状态">
                    <select
                      value={ruleDraft.enabled ? 'enabled' : 'disabled'}
                      onChange={(event) => setRuleDraft({ ...ruleDraft, enabled: event.target.value === 'enabled' })}
                    >
                      <option value="enabled">启用</option>
                      <option value="disabled">停用</option>
                    </select>
                  </Field>
                  <Field label="触发条件说明">
                    <input
                      value={ruleDraft.conditionText}
                      onChange={(event) => setRuleDraft({ ...ruleDraft, conditionText: event.target.value })}
                      placeholder="用于描述规则触发口径，下一阶段可升级为可执行条件"
                    />
                  </Field>
                  <Field label="执行字段">
                    <select
                      value={isDraftEditableSimpleCondition ? draftCondition.field : '__advanced'}
                      onChange={(event) =>
                        setRuleDraft({
                          ...ruleDraft,
                          conditionJson:
                            event.target.value === '__advanced'
                              ? ruleDraft.conditionJson
                              : { ...draftCondition, field: event.target.value as keyof Client },
                        })
                      }
                    >
                      <option value="">不参与自动检测</option>
                      {!isDraftEditableSimpleCondition && <option value="__advanced">高级条件（自动检测）</option>}
                      {conditionFields.map((field) => (
                        <option key={field.value} value={field.value}>{field.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="操作符">
                    <select
                      value={draftCondition.operator}
                      onChange={(event) =>
                        setRuleDraft({
                          ...ruleDraft,
                          conditionJson: { ...draftCondition, operator: event.target.value as SimpleRuleCondition['operator'] },
                        })
                      }
                    >
                      {['>', '>=', '<', '<=', '=', '!='].map((operator) => <option key={operator}>{operator}</option>)}
                    </select>
                  </Field>
                  <Field label="比较值">
                    <input
                      value={String(draftCondition.value)}
                      onChange={(event) =>
                        setRuleDraft({
                          ...ruleDraft,
                          conditionJson: { ...draftCondition, value: event.target.value },
                        })
                      }
                      placeholder="例如 5000000 / true / 小规模纳税人"
                    />
                  </Field>
                </div>
                {conditionSummary(ruleDraft.conditionJson) !== '不参与自动检测' && (
                  <p className="condition-note">当前执行条件：{conditionSummary(ruleDraft.conditionJson)}</p>
                )}
                <div className="rule-editor-textareas">
                  <Field label="风险依据">
                    <textarea value={ruleDraft.basis} onChange={(event) => setRuleDraft({ ...ruleDraft, basis: event.target.value })} />
                  </Field>
                  <Field label="整改建议">
                    <textarea value={ruleDraft.suggestion} onChange={(event) => setRuleDraft({ ...ruleDraft, suggestion: event.target.value })} />
                  </Field>
                  <Field label="所需材料，每行一项">
                    <textarea
                      value={ruleDraft.materials.join('\n')}
                      onChange={(event) =>
                        setRuleDraft({
                          ...ruleDraft,
                          materials: event.target.value
                            .split('\n')
                            .map((item) => item.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </Field>
                  <Field label="执行所需字段，每行一项">
                    <textarea
                      value={ruleDraft.requiredFields.join('\n')}
                      onChange={(event) =>
                        setRuleDraft({
                          ...ruleDraft,
                          requiredFields: event.target.value
                            .split('\n')
                            .map((item) => item.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </Field>
                </div>
                <div className="header-actions">
                  <button className="primary-button" onClick={saveManagedRule}>
                    <ShieldCheck /> 保存规则
                  </button>
                  <button className="secondary-button" onClick={resetRuleDraft}>清空</button>
                </div>
              </section>
            )}
            <section className="panel rule-filter-panel">
              <div className="rule-health-row">
                <span>规则自检：{ruleCheck.executable}/{ruleCheck.total} 可执行</span>
                <span>停用 {ruleCheck.disabled} 条</span>
                <span>缺执行条件 {ruleCheck.missingCondition} 条</span>
              </div>
              <div className="rule-filter-grid">
                <label className="filter-field wide-filter">
                  <span>筛选规则</span>
                  <div className="filter-input">
                    <Search />
                    <input
                      value={ruleQuery}
                      onChange={(event) => {
                        setRuleQuery(event.target.value)
                        setRulePage(1)
                      }}
                      placeholder="搜索编号、名称、税种、条件、材料"
                    />
                  </div>
                </label>
                <label className="filter-field">
                  <span>启用状态</span>
                  <select
                    value={ruleStatusFilter}
                    onChange={(event) => {
                      setRuleStatusFilter(event.target.value as typeof ruleStatusFilter)
                      setRulePage(1)
                    }}
                  >
                    <option value="all">全部</option>
                    <option value="enabled">启用</option>
                    <option value="disabled">停用</option>
                  </select>
                </label>
                <label className="filter-field">
                  <span>风险等级</span>
                  <select
                    value={ruleLevelFilter}
                    onChange={(event) => {
                      setRuleLevelFilter(event.target.value as typeof ruleLevelFilter)
                      setRulePage(1)
                    }}
                  >
                    <option value="all">全部</option>
                    <option value="高">高风险</option>
                    <option value="中">中风险</option>
                    <option value="低">低风险</option>
                  </select>
                </label>
                <label className="filter-field">
                  <span>税种</span>
                  <select
                    value={ruleTaxFilter}
                    onChange={(event) => {
                      setRuleTaxFilter(event.target.value)
                      setRulePage(1)
                    }}
                  >
                    <option value="all">全部</option>
                    {ruleTaxOptions.map((taxType) => <option key={taxType} value={taxType}>{taxType}</option>)}
                  </select>
                </label>
                <label className="filter-field">
                  <span>每页显示</span>
                  <select
                    value={String(rulePageSize)}
                    onChange={(event) => {
                      const value = event.target.value
                      setRulePageSize(value === 'all' ? 'all' : Number(value) as RulePageSize)
                      setRulePage(1)
                    }}
                  >
                    <option value="10">10 条</option>
                    <option value="20">20 条</option>
                    <option value="50">50 条</option>
                    <option value="all">全部</option>
                  </select>
                </label>
              </div>
              <div className="rule-filter-footer">
                <span>
                  共 {managedRules.length} 条规则，筛选命中 {filteredRules.length} 条，本页显示 {visibleRules.length} 条
                  {rulePageSize !== 'all' && filteredRules.length > 0
                    ? `，第 ${(normalizedRulePage - 1) * rulePageSize + 1}-${Math.min(normalizedRulePage * rulePageSize, filteredRules.length)} 条`
                    : ''}
                </span>
                {rulePageSize !== 'all' && (
                  <div className="pagination-actions">
                    <button
                      className="secondary-button"
                      disabled={normalizedRulePage <= 1}
                      onClick={() => setRulePage((current) => Math.max(1, current - 1))}
                    >
                      上一页
                    </button>
                    <strong>{normalizedRulePage} / {rulePageCount}</strong>
                    <button
                      className="secondary-button"
                      disabled={normalizedRulePage >= rulePageCount}
                      onClick={() => setRulePage((current) => Math.min(rulePageCount, current + 1))}
                    >
                      下一页
                    </button>
                  </div>
                )}
              </div>
            </section>
            <div className="rules-grid">
              {visibleRules.map((rule) => (
                <article className="rule-card" key={rule.code}>
                  <div>
                    <span className="rule-code">{rule.code}</span>
                    <LevelBadge level={rule.level} />
                  </div>
                  <h3>{rule.name}</h3>
                  <p>{rule.taxType || '未填写税种'} / {rule.enabled ? '启用' : '停用'}</p>
                  <div className="rule-tags">
                    <span>{ruleOrigin(rule)}</span>
                    <span>{isExecutableCondition(rule.conditionJson) ? '可直接执行' : '未配置条件'}</span>
                    {rule.requiredFields.length > 0 && <span>需补资料</span>}
                  </div>
                  {conditionSummary(rule.conditionJson) !== '不参与自动检测' && <small>执行条件：{conditionSummary(rule.conditionJson)}</small>}
                  {rule.requiredFields.length > 0 && <small>执行所需字段：{rule.requiredFields.map(fieldLabel).join('、')}</small>}
                  {rule.conditionText && <small>{rule.conditionText}</small>}
                  <small>{rule.basis}</small>
                  <p>{rule.suggestion}</p>
                  <div className="chips">{rule.materials.map((item) => <span key={item}>{item}</span>)}</div>
                  {canUseAdmin && (
                    <div className="report-actions">
                      <button onClick={() => editManagedRule(rule)}>编辑</button>
                      <button onClick={() => toggleManagedRule(rule)}>{rule.enabled ? '停用' : '启用'}</button>
                      <button className="danger-action" onClick={() => deleteManagedRule(rule)}>
                        <Trash2 /> 删除
                      </button>
                    </div>
                  )}
                </article>
              ))}
              {!visibleRules.length && managedRules.length > 0 && (
                <div className="empty-state wide">
                  <Search />
                  <h3>没有匹配的规则</h3>
                  <p>调整关键词、状态、等级或税种筛选后再查看。</p>
                </div>
              )}
              {restrictedRuleCount > 0 && (
                <article className="rule-card locked-rule-card">
                  <div>
                    <span className="rule-code">LOCKED</span>
                    <span className="level-badge level-medium">受限</span>
                  </div>
                  <h3>其他规则无权限查看</h3>
                  <p>当前账号仅开放前 5 条规则预览。</p>
                  <small>还有 {restrictedRuleCount} 条规则需要管理员权限。</small>
                </article>
              )}
              {!managedRules.length && (
                <div className="empty-state wide">
                  <Settings2 />
                  <h3>规则库还没有入库规则</h3>
                  <p>管理员可以点击“导入内置规则”，先初始化当前规则库，再继续编辑维护。</p>
                </div>
              )}
            </div>
          </section>
        )}
        <TaxDataDetailModal
          slot={taxDataDetailSlot}
          detail={taxDataDetail}
          loading={taxDataDetailLoading}
          error={taxDataDetailError}
          onClose={() => setTaxDataDetailSlot(null)}
        />
      </main>
    </div>
  )
}

function TaxDataDetailModal({ slot, detail, loading, error, onClose }: {
  slot: TaxDataSlot | null
  detail: TaxDataDetail | null
  loading: boolean
  error: string
  onClose: () => void
}) {
  if (!slot) return null
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="confirm-modal tax-data-detail-modal" role="dialog" aria-modal="true" aria-labelledby="tax-data-detail-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-title-row">
          <div>
            <p className="eyebrow">资料核对</p>
            <h3 id="tax-data-detail-title">{slot.name}</h3>
            <p className="section-helper">{slot.periodLabel} · 系统保存的标准数据与来源证据</p>
          </div>
          <button type="button" className="icon-text-button" onClick={onClose}>关闭</button>
        </div>
        {loading && !slot.slotId.startsWith('financial-') ? <p className="tax-data-detail-status">正在读取资料和标准数据...</p> : null}
        {loading && !detail && slot.slotId.startsWith('financial-') ? (
          <section className="tax-data-detail-section instant-standard-table">
            <div className="panel-title"><h3>标准报表</h3><span>正在填入已收录金额</span></div>
            <TaxDataRecordView slot={slot} detail={{ sources: [], records: [], evidence: [], totalRecords: 0, truncated: false }} />
          </section>
        ) : null}
        {error ? <p className="period-warning">{error}</p> : null}
        {detail ? (
          <>
            {detail.sources.length ? <section className="tax-data-detail-section">
              <div className="panel-title"><h3>源文件</h3><span>{detail.sources.length} 个</span></div>
              <div className="tax-data-source-list">
                {detail.sources.map((source) => (
                  <article key={source.id}>
                    <FileText />
                    <div><strong>{source.file_name}</strong><small>{source.period_start} 至 {source.period_end} · {source.parse_status}</small></div>
                    {source.stored
                      ? <a className="secondary-button compact-button" href={`/api/tax-data/source?sourceFileId=${encodeURIComponent(source.id)}`} target="_blank" rel="noreferrer">{sourceFileActionLabel(source.file_name)}</a>
                      : <span className="tax-data-source-unavailable">仅保留归档索引</span>}
                  </article>
                ))}
              </div>
            </section> : null}
            <section className="tax-data-detail-section">
              <div className="panel-title"><h3>{detail.sources.length ? '数据概览与明细' : '标准电子表'}</h3><span>{detail.sources.length ? `${detail.totalRecords} 条` : '待收录'}</span></div>
              {!detail.sources.length && taxDataHasElectronicTemplate(slot) ? <EmptyElectronicTemplate slot={slot} /> : <TaxDataRecordView slot={slot} detail={detail} />}
            </section>
            <RawWorkbookComparison slot={slot} detail={detail} />
            <PdfSourceReview detail={detail} />
            {detail.sources.length ? <section className="tax-data-detail-section">
              <div className="panel-title"><h3>原值与字段对应</h3><span>{detail.evidence.length} 项证据</span></div>
              {detail.evidence.length ? (
                <div className="tax-data-table-wrap"><table className="tax-data-detail-table evidence-table">
                  <thead><tr><th>源位置</th><th>标准字段</th><th>源文件原值</th><th>入库值</th><th>可信度</th></tr></thead>
                  <tbody>{detail.evidence.map((item, index) => <tr key={`${item.target_id}-${item.target_field}-${index}`}>
                    <td>{item.sheet_name ? `${item.sheet_name} ` : ''}{item.page_no ? `第${item.page_no}页 ` : ''}{item.row_no ? `第${item.row_no}行` : ''}</td>
                    <td>{item.target_field}</td><td>{item.raw_value || '-'}</td><td>{item.normalized_value || '-'}</td><td>{item.confidence}</td>
                  </tr>)}</tbody>
                </table></div>
              ) : <p className="tax-data-detail-status">本批资料没有单独保存字段级证据，请以源文件和标准数据逐项核对。</p>}
            </section> : null}
          </>
        ) : null}
      </section>
    </div>
  )
}

function ClientForm({ client, clients, onChange }: { client: Client; clients: Client[]; onChange: (client: Client) => void }) {
  const [numberDrafts, setNumberDrafts] = useState<Record<string, string>>({})
  const [importSummary, setImportSummary] = useState<{
    fileName: string
    labels: string[]
    mappings: ImportMappingPreview[]
    unmappedHeaders: string[]
    sourceType: string
    detectedTables: string[]
    missingSaveLabels: string[]
    missingReportLabels: string[]
  } | null>(null)
  const [importReviewConfirmed, setImportReviewConfirmed] = useState(false)
  const patch = <K extends keyof Client>(key: K, value: Client[K]) => {
    onChange(applyAutoDerivedMetrics(client, { ...client, [key]: value }))
  }
  const num = (key: keyof Client) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value
    setNumberDrafts((current) => ({ ...current, [String(key)]: rawValue }))
    patch(key, Number(rawValue || 0) as never)
  }
  const numberValue = (key: keyof Client) => (
    Object.prototype.hasOwnProperty.call(numberDrafts, String(key))
      ? numberDrafts[String(key)]
      : client[key] as number
  )
  const clearNumberDraft = (key: keyof Client) => {
    setNumberDrafts((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, String(key))) return current
      const next = { ...current }
      delete next[String(key)]
      return next
    })
  }
  const focusNumber = (key: keyof Client) => {
    setNumberDrafts((current) => ({ ...current, [String(key)]: '' }))
  }
  const setManualDerivedField = (key: keyof Client, enabled: boolean) => {
    const manualDerivedFields = { ...(client.manualDerivedFields || {}), [String(key)]: enabled }
    const manualDerivedReasons = { ...(client.manualDerivedReasons || {}) }
    if (!enabled) {
      delete manualDerivedFields[String(key)]
      delete manualDerivedReasons[String(key)]
    }
    onChange(deriveClientMetrics({ ...client, manualDerivedFields, manualDerivedReasons }))
  }
  const setManualDerivedReason = (key: keyof Client, reason: string) => {
    onChange({
      ...client,
      manualDerivedReasons: {
        ...(client.manualDerivedReasons || {}),
        [String(key)]: reason,
      },
    })
  }
  const renderDerivedNumberField = (key: keyof Client) => {
    const config = autoDerivedFieldMap.get(key)
    if (!config) return null
    const isManual = isManualDerivedField(client, key)
    const reason = String(client.manualDerivedReasons?.[String(key)] || '')
    return (
      <Field label={config.label} requirement="computed">
        <div className="derived-field-shell">
          <input
            type="number"
            value={numberValue(key)}
            disabled={!isManual}
            onChange={num(key)}
            onFocus={() => focusNumber(key)}
            onBlur={() => clearNumberDraft(key)}
          />
          <div className="derived-field-meta">
            <span>系统计算：{config.source}</span>
            <label className="manual-toggle">
              <input
                type="checkbox"
                checked={isManual}
                onChange={(event) => setManualDerivedField(key, event.target.checked)}
              />
              手动填写
            </label>
          </div>
          {isManual && (
            <textarea
              className="manual-reason-input"
              value={reason}
              rows={2}
              placeholder="请说明为什么不采用系统计算口径"
              onChange={(event) => setManualDerivedReason(key, event.target.value)}
            />
          )}
        </div>
      </Field>
    )
  }
  const completeness = getDataCompleteness(client)
  const saveIssues = validateClientForSave(client)
  const reportIssues = validateClientForReport(deriveClientMetrics(client))
  const saveTotal = saveRequirementLabels(client).length
  const reportTotal = reportRequirementLabels().length
  const missingSaveLabels = new Set(saveIssues.map((issue) => issue.label))
  const missingReportLabels = new Set(reportIssues.map((issue) => issue.label))
  const missingStateForLabel = (label: string): 'required' | 'recommended' | undefined => {
    if (missingSaveLabels.has(label)) return 'required'
    if (missingReportLabels.has(label)) return 'recommended'
    return undefined
  }
  const countMissingLabels = (labels: string[]) => labels.filter((label) => missingSaveLabels.has(label) || missingReportLabels.has(label)).length
  const periodLabels = periodRequirementLabels(client)
  const sectionNavItems = [
    { id: 'intake-project', label: '项目', missing: countMissingLabels(['项目口径', '集团项目名称', '主体角色']) },
    { id: 'intake-period', label: '期间', missing: countMissingLabels(['所属年度', '所属季度', '所属月份', '期间开始', '期间结束', '数据来源']) },
    { id: 'intake-basic', label: '基础', missing: countMissingLabels(['企业名称', '统一社会信用代码', '地区', '行业', '纳税人类型', '成立时间']) },
    { id: 'intake-quick', label: '快检', missing: countMissingLabels(['月收入', '月成本费用', '月利润', '收款流水', '员工人数', '社保人数', '工资申报人数']) },
    { id: 'intake-trend', label: '趋势', missing: 0 },
    { id: 'intake-cost', label: '费用', missing: 0 },
    { id: 'intake-vat', label: 'VAT', missing: countMissingLabels(['月开票金额', '连续 12 个月销售额']) },
    { id: 'intake-cit', label: 'CIT', missing: countMissingLabels(['工资薪金总额']) },
    { id: 'intake-iit', label: 'IIT', missing: 0 },
    { id: 'intake-comprehensive', label: '综合', missing: 0 },
  ]
  const renderMissingChips = (issues: IntakeValidationIssue[], emptyText: string) => (
    <div className="chips action-chips">
      {issues.length
        ? issues.map((issue) => (
          <button key={`${issue.field}-${issue.label}`} type="button" onClick={() => focusFieldByLabel(issue.label)}>
            {issue.label}
          </button>
        ))
        : <span>{emptyText}</span>}
    </div>
  )
  const firstMissingIssue = saveIssues[0] || reportIssues[0]
  const copyMissingSummary = async () => {
    const lines = [
      saveIssues.length ? `建档必填缺失：${validationSummary(saveIssues)}` : '建档必填缺失：无',
      reportIssues.length ? `基础检测必填缺失：${validationSummary(reportIssues)}` : '基础检测必填缺失：无',
    ]
    const content = lines.join('\n')
    try {
      await navigator.clipboard.writeText(content)
      window.alert('缺失清单已复制。')
    } catch {
      window.alert(content)
    }
  }
  const copyUnmappedImportHeaders = async () => {
    if (!importSummary?.unmappedHeaders.length) return
    const content = [
      `导入文件：${importSummary.fileName}`,
      `未识别表头：${importSummary.unmappedHeaders.join('、')}`,
      `建议改用模板字段：${unmappedImportTemplateSuggestions.join('、')}`,
      '处理建议：先将 ERP 导出列名改成最接近的模板字段；仍无法对应的列保留原文件备查，不参与自动预填。',
    ].join('\n')
    try {
      await navigator.clipboard.writeText(content)
      window.alert('未识别字段清单已复制。')
    } catch {
      window.alert(content)
    }
  }
  const copyImportMappingReview = async () => {
    if (!importSummary?.mappings.length) return
    const mappedLines = importSummary.mappings.map((item) => `${item.source} -> ${item.label}`)
    const content = [
      `导入文件：${importSummary.fileName}`,
      `文件类型：${importSummary.sourceType}`,
      `已预填字段数：${importSummary.labels.length}`,
      '字段映射确认清单：',
      ...mappedLines,
      importSummary.unmappedHeaders.length
        ? `未识别表头：${importSummary.unmappedHeaders.join('、')}`
        : '未识别表头：无',
      '复核要求：保存期间数据前，请逐项核对预填金额、期间、纳税人类型和字段映射是否正确。',
    ].join('\n')
    try {
      await navigator.clipboard.writeText(content)
      window.alert('字段映射确认清单已复制。')
    } catch {
      window.alert(content)
    }
  }
  const copyImportAcceptanceMemo = async () => {
    if (!importSummary) return
    const missingTotal = importSummary.missingSaveLabels.length + importSummary.missingReportLabels.length
    const content = [
      `导入验收纪要：${importSummary.fileName}`,
      `资料来源：${importSummary.sourceType}`,
      `字段映射：已预填 ${importSummary.labels.length} 项，已识别映射 ${importSummary.mappings.length} 项。`,
      importSummary.unmappedHeaders.length
        ? `未识别表头：${importSummary.unmappedHeaders.join('、')}，需保留源文件并人工说明。`
        : '未识别表头：无。',
      missingTotal
        ? `资料缺口：仍有 ${missingTotal} 项待补齐，保存或检测前需完成复核。`
        : '资料缺口：建档和基础检测必填项已补齐。',
      `人工确认：${importReviewConfirmed ? '已确认预填字段和源文件一致。' : '待确认，保存前需由财务勾选确认。'}`,
      '交付结论：本次导入仅作为预填和资料留痕，规则引擎结论不被导入记录或 AI 覆盖。',
    ].join('\n')
    try {
      await navigator.clipboard.writeText(content)
      window.alert('导入验收纪要已复制。')
    } catch {
      window.alert(content)
    }
  }

  const firstImportMissingLabel = importSummary?.missingSaveLabels[0] || importSummary?.missingReportLabels[0]
  const importReviewStatusItems = importSummary ? [
    { label: '字段映射', value: `${importSummary.mappings.length} 项` },
    { label: '未识别表头', value: importSummary.unmappedHeaders.length ? `${importSummary.unmappedHeaders.length} 项待处理` : '无' },
    { label: '缺失项', value: importSummary.missingSaveLabels.length + importSummary.missingReportLabels.length ? `${importSummary.missingSaveLabels.length + importSummary.missingReportLabels.length} 项待补齐` : '已补齐' },
    { label: '人工复核', value: importReviewConfirmed ? '已确认' : '待确认' },
  ] : []

  const renderSectionRequirementSummary = (labels: string[]) => {
    const requiredLabels = labels.filter((label) => {
      const requirement = intakeRequirementLabels[label]
      return requirement === 'required' || requirement === 'recommended' || requirement === 'conditional'
    })
    if (!requiredLabels.length) return null
    const missingCount = requiredLabels.filter((label) => missingSaveLabels.has(label) || missingReportLabels.has(label)).length
    return (
      <p className={missingCount ? 'section-required-summary warning' : 'section-required-summary'}>
        必填完成 {requiredLabels.length - missingCount}/{requiredLabels.length}
      </p>
    )
  }
  const vatChecks: Array<[keyof Client, string]> = [
    ['unbilledIncome', '存在大额未开票收入'],
    ['nearVatExemption', '长期接近小规模免税临界点'],
    ['longTermZeroDeclaration', '长期零申报'],
    ['prepaidLongTerm', '预收款长期挂账'],
    ['supplierNoInput', '供应商只有销项少进项'],
    ['invoiceNameMismatch', '发票品名与业务不符'],
    ['abnormalInvoice', '异常/重复发票入账'],
  ]
  const citChecks: Array<[keyof Client, string]> = [
    ['largeExpenseNoInvoice', '大额费用无票'],
    ['serviceFeeInvoices', '大额服务费/咨询费发票'],
    ['inventoryAbnormal', '库存异常'],
    ['longTermLoss', '长期亏损'],
    ['nonFinancialInterestAbnormal', '非金融借款利息异常'],
    ['smallProfitEnjoyed', '享受小型微利优惠'],
    ['taxBenefitDataMissing', '优惠资料不足'],
    ['rdDeductionEnjoyed', '享受研发加计扣除'],
    ['rdDocsInsufficient', '研发资料不足'],
  ]
  const iitChecks: Array<[keyof Client, string]> = [
    ['salarySplit', '工资拆分为报销/劳务/个体户发票'],
    ['noIitWithholding', '劳务佣金未见个税扣缴'],
    ['individualVendorRelated', '关联个体户承接服务'],
  ]
  const comprehensiveChecks: Array<[keyof Client, string]> = [
    ['privateAccountCollection', '个人账户收取经营款'],
    ['relatedTransactions', '存在关联交易'],
    ['purchaseSalesMismatch', '进销品类不匹配'],
    ['relatedEntitiesNearThreshold', '关联主体接近 500 万临界点'],
    ['fundsReturn', '采购付款后资金回流'],
    ['intercompanyManagementFee', '企业间管理费异常'],
    ['relatedPricingAbnormal', '关联交易价格异常'],
    ['agencyComplianceRisk', '涉税服务/内部协助风险'],
  ]
  const vatMaterialGaps = ['月度增值税申报表及附表', '开票明细与发票样本', '进项抵扣及进项转出明细', '会员卡/预收款明细', '视同销售场景说明']
  const citMaterialGaps = ['企业所得税季度及年度申报表', '汇算清缴申报表及测算底稿', '无票/替票/个人抬头发票明细', '三费扣除限额测算', '关联资金拆借及管理费资料']
  const iitMaterialGaps = ['工资薪金个税申报明细', '临时工/劳务/佣金付款明细', '绩效和年终奖发放明细', '非现金福利及员工餐住宿资料', '社保缴纳清单']
  const existingGroupNames = Array.from(new Set(clients.map(getGroupName).filter(Boolean)))
  const jumpToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const importClientFile = async (file: File | null) => {
    if (!file) return
    try {
      const isExcelFile = /\.(xlsx|xls)$/i.test(file.name)
      const fileBuffer = await file.arrayBuffer()
      const parsedImport = isExcelFile
        ? await parseClientImportWorkbook(fileBuffer)
        : parseClientImportText(decodeClientImportText(fileBuffer))
      const sourceType = parsedImport.detectedSourceType || (isExcelFile ? 'Excel/ERP 导出文件' : /\.json$/i.test(file.name) ? 'JSON 数据文件' : 'CSV/TSV/ERP 导出文件')
      const patchData = {
        ...inferClientPatchFromFileName(file.name),
        ...coerceImportedClientPatch(parsedImport.patch),
      }
      const importedLabels = Object.keys(patchData).map(fieldLabel)
      if (!importedLabels.length) {
        setImportSummary(null)
        setImportReviewConfirmed(false)
        window.alert('未识别到可填充字段。请确认表头或字段名使用系统字段名、中文字段名，或采用“字段名 / 值”两列格式。')
        return
      }
      const importedClient = applyExplicitDerivedPatch(client, patchData, '原始资料导入值')
      const importedSaveMissing = validateClientForSave(importedClient).map((issue) => issue.label).slice(0, 6)
      const importedReportMissing = validateClientForReport(importedClient).map((issue) => issue.label).slice(0, 6)
      onChange(importedClient)
      setImportSummary({
        fileName: file.name,
        labels: importedLabels,
        mappings: parsedImport.mappings.filter((item) => Object.prototype.hasOwnProperty.call(patchData, item.field)),
        unmappedHeaders: parsedImport.unmappedHeaders,
        sourceType,
        detectedTables: parsedImport.detectedTables,
        missingSaveLabels: importedSaveMissing,
        missingReportLabels: importedReportMissing,
      })
      setImportReviewConfirmed(false)
      window.alert(`已从表格预填 ${importedLabels.length} 个字段，保存期间数据前请核对：${importedLabels.slice(0, 12).join('、')}${importedLabels.length > 12 ? '等' : ''}`)
    } catch (error) {
      console.warn('Failed to import client file.', error)
      setImportSummary(null)
      setImportReviewConfirmed(false)
      window.alert('文件解析失败。请使用 JSON、CSV、TSV、XLS 或 XLSX，并使用系统字段名或中文字段名。')
    }
  }
  const renderChecks = (items: Array<[keyof Client, string]>) => items.map(([key, label]) => (
    <BoolField
      key={String(key)}
      label={label}
      checked={client[key] as boolean}
      onChange={(value) => patch(key, value as never)}
    />
  ))
  const renderMaterialGaps = (items: string[]) => (
    <div className="material-gap-panel">
      <strong>缺这些资料会影响判断</strong>
      <div className="chips">
        {items.map((item) => <span key={item}>{item}</span>)}
      </div>
    </div>
  )

  const renderUnitNote = (items: string[]) => (
    <div className="unit-note" aria-label="字段计量单位">
      {items.map((item) => <span key={item}>{item}</span>)}
    </div>
  )
  const patchPeriod = (patchData: Partial<Client>) => {
    onChange(applyAutoDerivedMetrics(client, { ...client, ...patchData }))
  }
  const changeAnalysisYear = (analysisYear: string) => {
    patchPeriod({ analysisYear })
  }
  const changeAnalysisQuarter = (analysisQuarter: AnalysisQuarter) => {
    patchPeriod({ analysisQuarter, analysisMonth: '', periodStartDate: '', periodEndDate: '' })
  }
  const changeAnalysisMonth = (analysisMonth: string) => {
    patchPeriod({
      analysisMonth,
      analysisYear: analysisMonth ? analysisMonth.slice(0, 4) : client.analysisYear,
      analysisQuarter: '',
      periodStartDate: '',
      periodEndDate: '',
    })
  }
  const changePeriodDate = (field: 'periodStartDate' | 'periodEndDate', value: string) => {
    const patchData: Partial<Client> = {
      [field]: value,
      analysisQuarter: '',
      analysisMonth: '',
    }
    if (field === 'periodStartDate' && value && !client.analysisYear) {
      patchData.analysisYear = value.slice(0, 4)
    }
    patchPeriod(patchData)
  }
  const currentAnalysisPeriodType = inferAnalysisPeriodType(client)
  const currentPeriodLabel = currentAnalysisPeriodType ? formatAnalysisPeriod({ ...client, analysisPeriodType: currentAnalysisPeriodType }) : '填写年度、月份、季度或起止日期后自动生成'
  const changeDataBasis = (dataBasis: DataBasis) => {
    patch('dataBasis', dataBasis || '管理报表')
  }
  const clearNumberDrafts = (keys: Array<keyof Client>) => {
    setNumberDrafts((current) => {
      const next = { ...current }
      keys.forEach((key) => delete next[String(key)])
      return next
    })
  }
  const clearIntakeSection = (
    sectionName: string,
    patchData: Partial<Client>,
    numericKeys: Array<keyof Client> = [],
    derivedKeys: Array<keyof Client> = [],
  ) => {
    const confirmed = window.confirm(`确定清空${sectionName}数据吗？此操作只影响当前录入草稿。`)
    if (!confirmed) return
    const manualDerivedFields = { ...(client.manualDerivedFields || {}) }
    const manualDerivedReasons = { ...(client.manualDerivedReasons || {}) }
    derivedKeys.forEach((key) => {
      delete manualDerivedFields[String(key)]
      delete manualDerivedReasons[String(key)]
    })
    clearNumberDrafts([...numericKeys, ...derivedKeys])
    onChange(deriveClientMetrics({ ...client, ...patchData, manualDerivedFields, manualDerivedReasons }))
  }
  const clearProjectSection = () => clearIntakeSection('项目结构', {
    projectScope: '单主体',
    groupName: '',
    entityRole: '单体企业',
  })
  const clearPeriodSection = () => clearIntakeSection('数据期间', {
    analysisPeriodType: '',
    analysisYear: '',
    analysisQuarter: '',
    analysisMonth: '',
    periodStartDate: '',
    periodEndDate: '',
    dataBasis: '管理报表',
    comparisonPeriod: '',
  })
  const clearBasicSection = () => clearIntakeSection('基础资料', {
    name: '',
    creditCode: '',
    region: '',
    industry: '',
    taxpayerType: '',
    establishedAt: '',
  })
  const clearQuickSection = () => clearIntakeSection('快速体检', {
    monthlyRevenue: 0,
    monthlyCost: 0,
    monthlyProfit: 0,
    collectionFlow: 0,
    employees: 0,
    socialSecurityCount: 0,
    salaryDeclaredCount: 0,
  }, ['monthlyRevenue', 'monthlyCost', 'monthlyProfit', 'collectionFlow', 'employees', 'socialSecurityCount', 'salaryDeclaredCount'], ['annualRevenue'])
  const clearTrendSection = () => clearIntakeSection('趋势与预算', {
    previousQuarterEmployees: 0,
    previousQuarterRevenue: 0,
    previousQuarterCostExpense: 0,
    previousYearEbitProfit: 0,
    budgetEbitProfit: 0,
    budgetRevenue: 0,
    previousYearRevenue: 0,
  }, ['previousQuarterEmployees', 'previousQuarterRevenue', 'previousQuarterCostExpense', 'previousYearEbitProfit', 'budgetEbitProfit', 'budgetRevenue', 'previousYearRevenue'], ['quarterRevenue', 'quarterCostExpense', 'ytdRevenue', 'ytdCostExpense', 'ytdProfit', 'ebitProfit', 'mainBusinessRevenue', 'mainBusinessCost', 'goodsSalesRevenue', 'goodsCost'])
  const clearCostSection = () => clearIntakeSection('房租装修与人员费用', {
    peopleRelatedExpense: 0,
    rentalArea: 0,
    subleaseArea: 0,
    monthlyMealBenefitExpense: 0,
    decorationExpense: 0,
  }, ['peopleRelatedExpense', 'rentalArea', 'subleaseArea', 'monthlyMealBenefitExpense', 'decorationExpense'])
  const clearVatSection = () => clearIntakeSection('VAT 增值税资料', {
    monthlyInvoice: 0,
    consecutive12MonthSales: 0,
    platformRevenue: 0,
    redVatSpecialInvoiceAmount: 0,
    outputTax: 0,
    inputTax: 0,
    vatTaxPayable: 0,
    theoreticalVatTax: 0,
    budgetVatTax: 0,
    priorTaxableSales: 0,
    priorVatTaxPayable: 0,
    vatRateSpread: 0,
    advertisingServiceRevenue: 0,
    cultureConstructionFeePaid: 0,
    endingVatCredit: 0,
    unbilledIncome: false,
    nearVatExemption: false,
    longTermZeroDeclaration: false,
    prepaidLongTerm: false,
    supplierNoInput: false,
    invoiceNameMismatch: false,
    abnormalInvoice: false,
  }, ['monthlyInvoice', 'consecutive12MonthSales', 'platformRevenue', 'redVatSpecialInvoiceAmount', 'outputTax', 'inputTax', 'vatTaxPayable', 'theoreticalVatTax', 'budgetVatTax', 'priorTaxableSales', 'priorVatTaxPayable', 'vatRateSpread', 'advertisingServiceRevenue', 'cultureConstructionFeePaid', 'endingVatCredit'], ['taxableSales'])
  const clearCitSection = () => clearIntakeSection('CIT 企业所得税资料', {
    entertainmentExpense: 0,
    adExpense: 0,
    welfareExpense: 0,
    unionExpense: 0,
    educationExpense: 0,
    taxableIncome: 0,
    assetsTotal: 0,
    employeeAnnualAvg: 0,
    nonOperatingExpense: 0,
    nonOperatingIncome: 0,
    otherReceivableAgencyBalance: 0,
    largeExpenseNoInvoice: false,
    serviceFeeInvoices: false,
    inventoryAbnormal: false,
    longTermLoss: false,
    nonFinancialInterestAbnormal: false,
    smallProfitEnjoyed: false,
    taxBenefitDataMissing: false,
    rdDeductionEnjoyed: false,
    rdDocsInsufficient: false,
  }, ['entertainmentExpense', 'adExpense', 'welfareExpense', 'unionExpense', 'educationExpense', 'taxableIncome', 'assetsTotal', 'employeeAnnualAvg', 'nonOperatingExpense', 'nonOperatingIncome', 'otherReceivableAgencyBalance'])
  const clearIitSection = () => clearIntakeSection('IIT 个税与薪酬资料', {
    laborCount: 0,
    payrollTotal: 0,
    nonPayrollPersonalPayment: 0,
    salarySplit: false,
    noIitWithholding: false,
    individualVendorRelated: false,
  }, ['laborCount', 'payrollTotal', 'nonPayrollPersonalPayment'])
  const clearComprehensiveSection = () => clearIntakeSection('综合风险线索', {
    privateAccountCollection: false,
    relatedTransactions: false,
    purchaseSalesMismatch: false,
    relatedEntitiesNearThreshold: false,
    fundsReturn: false,
    intercompanyManagementFee: false,
    relatedPricingAbnormal: false,
    agencyComplianceRisk: false,
  })
  const renderSectionActions = (label: string, badge: string, onClear: () => void) => (
    <div className="section-title-actions">
      <button type="button" className="section-clear-button" onClick={onClear}>清空{label}</button>
      <span>{badge}</span>
    </div>
  )

  return (
    <div className="form-layout">
      <section className="form-section intake-overview">
        <div className="intake-overview-main">
          <p className="eyebrow">录入路线</p>
          <h3>优先从记账软件导入</h3>
          <p className="section-helper">客户已经在金蝶、用友或其他记账软件里维护数据，优先上传导出表；系统自动预填企业和期间数据，缺什么再补什么。</p>
          <div className="intake-method-grid">
            <label className="intake-method-card file-import-button">
              <input type="file" accept=".json,.csv,.tsv,.txt,.xlsx,.xls" onChange={(event) => void importClientFile(event.target.files?.[0] || null)} />
              <FileText />
              <strong>导入金蝶导出表</strong>
              <span>上传金蝶科目余额表、利润表、申报表等导出文件</span>
            </label>
            <label className="intake-method-card file-import-button">
              <input type="file" accept=".json,.csv,.tsv,.txt,.xlsx,.xls" onChange={(event) => void importClientFile(event.target.files?.[0] || null)} />
              <Download />
              <strong>导入用友导出表</strong>
              <span>上传用友 U8、好会计、YonSuite 等导出文件</span>
            </label>
            <label className="intake-method-card file-import-button">
              <input type="file" accept=".json,.csv,.tsv,.txt,.xlsx,.xls" onChange={(event) => void importClientFile(event.target.files?.[0] || null)} />
              <FileText />
              <strong>上传通用财务表</strong>
              <span>支持 Excel、CSV、TSV、JSON 和常见 ERP 导出表</span>
            </label>
            <button type="button" className="intake-method-card" onClick={() => jumpToSection('intake-basic')}>
              <Plus />
              <strong>手工补录</strong>
              <span>只补系统未识别的企业、期间和经营字段</span>
            </button>
            {firstMissingIssue && (
              <button type="button" className="intake-method-card attention" onClick={() => focusFieldByLabel(firstMissingIssue.label)}>
                <AlertTriangle />
                <strong>补缺失项</strong>
                <span>跳到「{firstMissingIssue.label}」</span>
              </button>
            )}
          </div>
          <div className="intake-helper-actions">
            <button type="button" className="secondary-button compact-button" onClick={downloadClientImportTemplate}>
              <Download /> 下载标准模板
            </button>
            <span>没有标准导出表时再使用模板整理字段。</span>
          </div>
          <details className="intake-guide-details">
            <summary>导入说明和字段校验</summary>
            <p className="auto-fill-note">除标注“必填 / 条件必填 / 检测必填 / 系统计算”的字段外，其余字段均为选填；有数据、能确认的字段建议尽量填写。</p>
            <p className="auto-fill-note">系统会根据基础数据自动计算部分检测口径；如需改用特殊口径，请在对应字段切换“手动填写”并说明原因。</p>
            <div className="import-guide-strip" aria-label="导入字段映射说明">
              <span>支持 Excel、CSV、TSV、JSON 和常见 ERP 导出表</span>
              <span>可识别中文表头，或“字段名 / 值”两列格式</span>
              <strong>导入只做预填，保存前仍需人工核对</strong>
            </div>
            <div className="import-safety-note" aria-label="本地导入安全边界">
              <ShieldCheck />
              <span>仅读取本地选择的导出文件，不连接生产 ERP、不写回 ERP、不保存密钥或真实敏感样本。</span>
            </div>
            <div className="import-field-guide" aria-label="导入模板字段解释">
              {importTemplateFieldGuides.map((item) => (
                <span key={item.label}>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
              ))}
            </div>
            <div className="import-field-groups" aria-label="导入模板字段分组核对">
              <strong>模板字段分组核对</strong>
              <div>
                {importTemplateFieldGroups.map((group) => (
                  <span key={group.title}>
                    <b>{group.title}</b>
                    <small>{group.fields}</small>
                  </span>
                ))}
              </div>
            </div>
            <div className="import-sample-check" aria-label="导入样例字段校验提示">
              <strong>试导入前样例字段校验</strong>
              <div>
                {importSampleCheckSteps.map((step) => (
                  <span key={step.title}>
                    <b>{step.title}</b>
                    <small>{step.detail}</small>
                  </span>
                ))}
              </div>
            </div>
          </details>
          {importSummary && (
            <div className="import-summary-panel">
              <strong>已识别并预填 {importSummary.labels.length} 个字段</strong>
              <p>{importSummary.sourceType}：{importSummary.fileName}</p>
              {importSummary.detectedTables.length > 0 && (
                <div className="import-detected-tables" aria-label="识别到的导出表类型">
                  {importSummary.detectedTables.map((item) => <span key={item}>{item}</span>)}
                </div>
              )}
              <div className="import-review-status" aria-label="导入复核状态">
                {importReviewStatusItems.map((item) => (
                  <span key={item.label}>
                    <small>{item.label}</small>
                    <b>{item.value}</b>
                  </span>
                ))}
              </div>
              <p>字段映射：{importSummary.labels.slice(0, 12).join('、')}{importSummary.labels.length > 12 ? '等' : ''}</p>
              <div className="import-mapping-preview" aria-label="导入字段映射预览">
                {importSummary.mappings.slice(0, 8).map((item) => (
                  <span key={`${item.source}-${String(item.field)}`}>{item.source} -&gt; {item.label}</span>
                ))}
                {importSummary.mappings.length > 8 && <small>+{importSummary.mappings.length - 8} 个已映射字段</small>}
              </div>
              <button type="button" className="import-mapping-copy" onClick={copyImportMappingReview}>
                <ClipboardList /> 复制映射确认清单
              </button>
              <div className="import-manual-review-checklist" aria-label="导入保存前人工复核清单">
                <strong>保存前人工复核清单</strong>
                <div>
                  {importManualReviewChecklist.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
              <div className="import-evidence-packet" aria-label="导入留痕资料包">
                <strong>导入留痕资料包</strong>
                <div>
                  {importEvidencePacketItems.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
                <small>建议随本期档案一并留存，便于查看资料来源，也便于后续复核字段映射。</small>
                <div className="import-archive-naming" aria-label="导入资料归档编号建议">
                  <strong>归档编号建议</strong>
                  <div>
                    {importArchiveNamingHints.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                  <small>建议命名为“企业简称-检查期间-导入批次”，方便税务报告和后续复盘快速追溯。</small>
                </div>
              </div>
              <div className="import-acceptance-summary" aria-label="导入验收摘要口径">
                <strong>导入后复核</strong>
                <div>
                  {importAcceptanceSummaryItems.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
                <small>导入结果仅作预填，保存前仍需人工确认字段、期间和资料来源。</small>
                <button type="button" className="import-acceptance-memo" onClick={copyImportAcceptanceMemo}>
                  <ClipboardList /> 复制复核纪要
                </button>
              </div>
              {importSummary.unmappedHeaders.length > 0 && (
                <div>
                  <p className="import-summary-warning">
                    未识别表头：{importSummary.unmappedHeaders.join('、')}。这些列未预填，请核对模板字段或改成“字段名 / 值”两列格式。
                  </p>
                  <div className="import-unmapped-suggestions" aria-label="未识别字段模板建议">
                    <strong>建议优先改成模板字段</strong>
                    <div>
                      {unmappedImportTemplateSuggestions.map((field) => (
                        <span key={field}>{field}</span>
                      ))}
                    </div>
                  </div>
                  <button type="button" className="import-unmapped-copy" onClick={copyUnmappedImportHeaders}>
                    <ClipboardList /> 复制未识别字段
                  </button>
                </div>
              )}
              <div className="import-confirm-strip" aria-label="导入预填确认流程">
                <span>1. 已解析本地文件</span>
                <span>2. 已预填表单字段</span>
                <strong>3. 保存前人工确认</strong>
              </div>
              <label className={importReviewConfirmed ? 'import-review-check confirmed' : 'import-review-check'}>
                <input
                  type="checkbox"
                  checked={importReviewConfirmed}
                  onChange={(event) => setImportReviewConfirmed(event.target.checked)}
                />
                <span>{importReviewConfirmed ? '已确认预填字段和源文件一致' : '保存前请勾选确认已复核预填字段'}</span>
              </label>
              <p className={importSummary.missingSaveLabels.length ? 'import-summary-warning' : 'import-summary-ok'}>
                建档必填：{importSummary.missingSaveLabels.length ? `还缺 ${importSummary.missingSaveLabels.join('、')}` : '已补齐'}
              </p>
              <p className={importSummary.missingReportLabels.length ? 'import-summary-warning' : 'import-summary-ok'}>
                检测必填：{importSummary.missingReportLabels.length ? `还缺 ${importSummary.missingReportLabels.join('、')}` : '已补齐'}
              </p>
              {firstImportMissingLabel && (
                <button type="button" className="import-fill-missing" onClick={() => focusFieldByLabel(firstImportMissingLabel)}>
                  <AlertTriangle /> 跳转补齐首个缺失项
                </button>
              )}
              <small>保存期间数据前，请核对预填金额、期间和纳税人类型；当前仅解析本地文件，不连接真实 ERP。</small>
            </div>
          )}
        </div>
        <div className="intake-score">
          <span>{completeness.label}</span>
          <strong>{completeness.score}%</strong>
          <small>{completeness.note}</small>
        </div>
      </section>

      <section className="intake-status-bar">
        <div className="intake-status-item">
          <strong>建档必填 <span className="requirement-progress">{saveTotal - saveIssues.length}/{saveTotal}</span></strong>
          <div className="requirement-bar" aria-hidden="true"><span style={{ width: `${Math.round(((saveTotal - saveIssues.length) / saveTotal) * 100)}%` }} /></div>
        </div>
        <div className="intake-status-item">
          <strong>基础检测必填 <span className="requirement-progress">{reportTotal - reportIssues.length}/{reportTotal}</span></strong>
          <div className="requirement-bar" aria-hidden="true"><span style={{ width: `${Math.round(((reportTotal - reportIssues.length) / reportTotal) * 100)}%` }} /></div>
        </div>
        <div className="intake-status-item score">
          <strong>完整度 {completeness.score}%</strong>
          <small>{completeness.label}</small>
        </div>
        {(saveIssues.length > 0 || reportIssues.length > 0) && (
          <div className="requirement-copy-row">
            {firstMissingIssue && (
              <button type="button" className="secondary-button compact-button" onClick={() => focusFieldByLabel(firstMissingIssue.label)}>
                <AlertTriangle /> 补第一个缺失项
              </button>
            )}
            <button type="button" className="secondary-button compact-button" onClick={copyMissingSummary}>
              <ClipboardList /> 复制缺失清单
            </button>
          </div>
        )}

        {/* The archive detail modal is mounted by App so it remains available on the archive page.
          <div className="modal-backdrop" role="presentation" onClick={() => setTaxDataDetailSlot(null)}>
            <section className="confirm-modal tax-data-detail-modal" role="dialog" aria-modal="true" aria-labelledby="tax-data-detail-title" onClick={(event) => event.stopPropagation()}>
              <div className="modal-title-row">
                <div>
                  <p className="eyebrow">资料核对</p>
                  <h3 id="tax-data-detail-title">{taxDataDetailSlot.name}</h3>
                  <p className="section-helper">{taxDataDetailSlot.periodLabel} · 系统保存的标准数据与来源证据</p>
                </div>
                <button type="button" className="icon-text-button" onClick={() => setTaxDataDetailSlot(null)}>关闭</button>
              </div>
              {taxDataDetailLoading ? <p className="tax-data-detail-status">正在读取资料和标准数据...</p> : null}
              {taxDataDetailError ? <p className="period-warning">{taxDataDetailError}</p> : null}
              {taxDataDetail ? (
                <>
                  <section className="tax-data-detail-section">
                    <div className="panel-title"><h3>源文件</h3><span>{taxDataDetail.sources.length} 个</span></div>
                    <div className="tax-data-source-list">
                      {taxDataDetail.sources.map((source) => (
                        <article key={source.id}>
                          <FileText />
                          <div><strong>{source.file_name}</strong><small>{source.period_start} 至 {source.period_end} · {source.parse_status}</small></div>
                          {source.stored
                            ? <a className="secondary-button compact-button" href={`/api/tax-data/source?sourceFileId=${encodeURIComponent(source.id)}`} target="_blank" rel="noreferrer">{sourceFileActionLabel(source.file_name)}</a>
                            : <span className="tax-data-source-unavailable">仅保留归档索引</span>}
                        </article>
                      ))}
                    </div>
                  </section>
                  <section className="tax-data-detail-section">
                    <div className="panel-title"><h3>处理后的标准数据</h3><span>{taxDataDetail.totalRecords} 条</span></div>
                    {taxDataDetail.records.length ? (
                      <div className="tax-data-table-wrap">
                        <table className="tax-data-detail-table">
                          <thead><tr><th>类型</th><th>期间</th><th>标准字段和值</th><th>可信度</th></tr></thead>
                          <tbody>{taxDataDetail.records.map((record) => (
                            <tr key={record.id}>
                              <td>{record.record_subtype || record.record_type}</td>
                              <td>{record.period_start}<br />{record.period_end}</td>
                              <td><dl>{Object.entries(record.data).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{displayTaxDataValue(value)}</dd></div>)}</dl></td>
                              <td>{record.confidence}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                        {taxDataDetail.truncated ? <p className="section-helper">当前展示前 500 条，完整记录仍保存在系统中。</p> : null}
                      </div>
                    ) : <p className="tax-data-detail-status">该归档已有汇总记录，但没有可展示的标准明细。</p>}
                  </section>
                  <section className="tax-data-detail-section">
                    <div className="panel-title"><h3>原值与字段对应</h3><span>{taxDataDetail.evidence.length} 项证据</span></div>
                    {taxDataDetail.evidence.length ? (
                      <div className="tax-data-table-wrap"><table className="tax-data-detail-table evidence-table">
                        <thead><tr><th>源位置</th><th>标准字段</th><th>源文件原值</th><th>入库值</th><th>可信度</th></tr></thead>
                        <tbody>{taxDataDetail.evidence.map((item, index) => <tr key={`${item.target_id}-${item.target_field}-${index}`}>
                          <td>{item.sheet_name ? `${item.sheet_name} ` : ''}{item.page_no ? `第${item.page_no}页 ` : ''}{item.row_no ? `第${item.row_no}行` : ''}</td>
                          <td>{item.target_field}</td><td>{item.raw_value || '-'}</td><td>{item.normalized_value || '-'}</td><td>{item.confidence}</td>
                        </tr>)}</tbody>
                      </table></div>
                    ) : <p className="tax-data-detail-status">本批资料没有单独保存字段级证据，请以源文件和标准数据逐项核对。</p>}
                  </section>
                </>
              ) : null}
            </section>
          </div>
        */}
      </section>

      <details className="intake-missing-details">
        <summary>查看缺失字段清单</summary>
        <div className="intake-requirement-panel">
          <div>
            <strong>建档必填 <span className="requirement-progress">{saveTotal - saveIssues.length}/{saveTotal}</span></strong>
            <small>缺失时不能保存并检测。</small>
            {renderMissingChips(saveIssues, '已补齐')}
          </div>
          <div>
            <strong>基础检测必填 <span className="requirement-progress">{reportTotal - reportIssues.length}/{reportTotal}</span></strong>
            <small>缺失时仍可生成报告，但会提示资料不足。</small>
            {renderMissingChips(reportIssues, '已补齐')}
          </div>
        </div>
      </details>

      <nav className="intake-section-nav" aria-label="录入子目录">
        {sectionNavItems.map((item) => (
          <button key={item.id} type="button" className={item.missing ? 'has-missing' : ''} onClick={() => jumpToSection(item.id)}>
            {item.label}
            {item.missing > 0 && <span>{item.missing}</span>}
          </button>
        ))}
      </nav>

      <section className="form-section" id="intake-project">
        <div className="section-title-row">
          <div>
            <h3>项目结构</h3>
            <p className="section-helper">真实健康检查通常按主体分别建档；选择集团项目后，系统会在工作台和结果页生成集团口径汇总。</p>
            {renderSectionRequirementSummary(['项目口径'])}
          </div>
          {renderSectionActions('项目结构', 'Step 1', clearProjectSection)}
        </div>
        <div className="form-grid">
          <Field label="项目口径">
            <select
              value={getProjectScope(client)}
              onChange={(e) => {
                const projectScope = e.target.value as ProjectScope
                onChange({
                  ...client,
                  projectScope,
                  groupName: projectScope === '集团项目' ? String(client.groupName || '') : '',
                  entityRole: projectScope === '集团项目' ? (client.entityRole === '单体企业' ? '经营主体' : getEntityRole(client)) : '单体企业',
                })
              }}
            >
              <option>单主体</option>
              <option>集团项目</option>
            </select>
          </Field>
          <Field label="集团项目名称" requirement={getProjectScope(client) === '集团项目' ? 'conditional' : 'optional'} missing={missingStateForLabel('集团项目名称')}>
            <input
              value={client.groupName || ''}
              list="group-name-options"
              placeholder={getProjectScope(client) === '集团项目' ? '例如：某餐饮集团' : '单主体无需填写'}
              disabled={getProjectScope(client) !== '集团项目'}
              onChange={(e) => patch('groupName', e.target.value)}
            />
            <datalist id="group-name-options">
              {existingGroupNames.map((item) => <option key={item} value={item} />)}
            </datalist>
          </Field>
          <Field label="主体角色" requirement={getProjectScope(client) === '集团项目' ? 'conditional' : 'optional'} missing={missingStateForLabel('主体角色')}>
            <select value={getEntityRole(client)} onChange={(e) => patch('entityRole', e.target.value as EntityRole)} disabled={getProjectScope(client) !== '集团项目'}>
              <option>集团总部</option>
              <option>经营主体</option>
              <option>关联主体</option>
              <option>个体户/个人独资</option>
              <option>单体企业</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="form-section" id="intake-period">
        <div className="section-title-row">
          <div>
            <h3>数据期间</h3>
            <p className="section-helper">用于标记本次录入资料对应的时间点或时间段。系统会根据年度、季度、月份或起止日期自动判断分析范围。</p>
            {renderSectionRequirementSummary(periodLabels)}
          </div>
          {renderSectionActions('数据期间', 'Step 2', clearPeriodSection)}
        </div>
        <div className="form-grid">
          <Field label="所属年度" missing={missingStateForLabel('所属年度')}>
            <input
              type="number"
              min="2000"
              max="2100"
              value={client.analysisYear}
              placeholder="例如：2024"
              onChange={(e) => changeAnalysisYear(e.target.value)}
            />
          </Field>
          <Field label="数据来源" missing={missingStateForLabel('数据来源')}>
            <select value={client.dataBasis || '管理报表'} onChange={(e) => changeDataBasis(e.target.value as DataBasis)}>
              <option>申报数据</option>
              <option>管理报表</option>
              <option>暂估数据</option>
              <option>混合口径</option>
            </select>
            <small className="field-helper">请选择本次录入数据主要来自哪里，用于说明报告依据。</small>
          </Field>
          <Field label="所属季度" requirement={currentAnalysisPeriodType === '季度' ? 'conditional' : 'optional'} missing={missingStateForLabel('所属季度')}>
            <select
              value={client.analysisQuarter}
              onChange={(e) => changeAnalysisQuarter(e.target.value as AnalysisQuarter)}
            >
              <option value="">未选择</option>
              <option>Q1</option>
              <option>Q2</option>
              <option>Q3</option>
              <option>Q4</option>
            </select>
          </Field>
          <Field label="所属月份" requirement={currentAnalysisPeriodType === '月度' ? 'conditional' : 'optional'} missing={missingStateForLabel('所属月份')}>
            <input
              type="month"
              value={client.analysisMonth}
              onChange={(e) => changeAnalysisMonth(e.target.value)}
            />
          </Field>
          <Field label="期间开始" requirement={currentAnalysisPeriodType === '年初至今' || currentAnalysisPeriodType === '自定义期间' ? 'conditional' : 'optional'} missing={missingStateForLabel('期间开始')}>
            <input
              type="date"
              value={client.periodStartDate}
              onChange={(e) => changePeriodDate('periodStartDate', e.target.value)}
            />
          </Field>
          <Field label="期间结束" requirement={currentAnalysisPeriodType === '年初至今' || currentAnalysisPeriodType === '自定义期间' ? 'conditional' : 'optional'} missing={missingStateForLabel('期间结束')}>
            <input
              type="date"
              value={client.periodEndDate}
              onChange={(e) => changePeriodDate('periodEndDate', e.target.value)}
            />
          </Field>
          <Field label="对比期间">
            <input
              value={client.comparisonPeriod}
              placeholder="例如：上年同期 / 上季度 / 上月"
              onChange={(e) => patch('comparisonPeriod', e.target.value)}
            />
          </Field>
          <div className="field period-derived-field">
            <span className="field-label-line">
              <span>系统识别期间</span>
              <em className="field-requirement computed">系统计算</em>
            </span>
            <strong>{currentPeriodLabel}</strong>
            <small className="field-helper">优先按所属月份识别，其次按季度、起止日期、年度识别。</small>
          </div>
        </div>
      </section>

      <section className="form-section" id="intake-basic">
        <div className="section-title-row">
          <div>
            <h3>基础资料（共用）</h3>
            <p className="section-helper">用于确定审阅主体、地区、行业、纳税人身份和适用检查口径。</p>
            {renderSectionRequirementSummary(['企业名称', '统一社会信用代码', '地区', '行业', '纳税人类型', '成立时间'])}
          </div>
          {renderSectionActions('基础资料', 'Step 3', clearBasicSection)}
        </div>
        <div className="form-grid">
          <Field label="企业名称" missing={missingStateForLabel('企业名称')}><input value={client.name} onChange={(e) => patch('name', e.target.value)} /></Field>
          <Field label="统一社会信用代码" missing={missingStateForLabel('统一社会信用代码')}><input value={client.creditCode} onChange={(e) => patch('creditCode', e.target.value)} /></Field>
          <Field label="地区" missing={missingStateForLabel('地区')}><input value={client.region} onChange={(e) => patch('region', e.target.value)} /></Field>
          <Field label="行业" missing={missingStateForLabel('行业')}>
            <select
              value={getIndustrySelectValue(client.industry)}
              onChange={(e) => {
                const nextIndustry = e.target.value
                patch('industry', (nextIndustry === customIndustryOption ? customIndustryPrefix : nextIndustry) as never)
              }}
            >
              <option value="">未选择</option>
              {mainstreamIndustryOptions.map((item) => <option key={item}>{item}</option>)}
              <option>{customIndustryOption}</option>
            </select>
            {isCustomIndustry(client.industry) && (
              <input
                value={getCustomIndustryValue(client.industry)}
                placeholder="请输入行业名称"
                onChange={(e) => patch('industry', `${customIndustryPrefix}${e.target.value}`)}
              />
            )}
          </Field>
          <Field label="纳税人类型" missing={missingStateForLabel('纳税人类型')}>
            <select value={client.taxpayerType} onChange={(e) => patch('taxpayerType', e.target.value as TaxpayerType)}>
              <option value="">未选择</option>
              <option>小规模纳税人</option>
              <option>一般纳税人</option>
              <option>个体工商户</option>
            </select>
          </Field>
          <Field label="成立时间" missing={missingStateForLabel('成立时间')}><input type="date" value={client.establishedAt} onChange={(e) => patch('establishedAt', e.target.value)} /></Field>
        </div>
      </section>

      <section className="form-section" id="intake-quick">
        <div className="section-title-row">
          <div>
            <h3>快速体检数据（共用）</h3>
            <p className="section-helper">用于先跑通整体经营规模、收入成本、收款流水和人员匹配关系。</p>
            {renderUnitNote(['金额单位：元', '人数单位：人'])}
            {renderSectionRequirementSummary(['月收入', '月成本费用', '月利润', '收款流水', '员工人数', '社保人数', '工资申报人数'])}
          </div>
          {renderSectionActions('快检数据', 'Step 4', clearQuickSection)}
        </div>
        <div className="form-grid">
          <Field label="月收入" missing={missingStateForLabel('月收入')}><input type="number" value={numberValue('monthlyRevenue')} onChange={num('monthlyRevenue')} onFocus={() => focusNumber('monthlyRevenue')} onBlur={() => clearNumberDraft('monthlyRevenue')} /></Field>
          <Field label="月成本费用" missing={missingStateForLabel('月成本费用')}><input type="number" value={numberValue('monthlyCost')} onChange={num('monthlyCost')} onFocus={() => focusNumber('monthlyCost')} onBlur={() => clearNumberDraft('monthlyCost')} /></Field>
          <Field label="月利润" missing={missingStateForLabel('月利润')}><input type="number" value={numberValue('monthlyProfit')} onChange={num('monthlyProfit')} onFocus={() => focusNumber('monthlyProfit')} onBlur={() => clearNumberDraft('monthlyProfit')} /></Field>
          {renderDerivedNumberField('annualRevenue')}
          <Field label="收款流水" missing={missingStateForLabel('收款流水')}><input type="number" value={numberValue('collectionFlow')} onChange={num('collectionFlow')} onFocus={() => focusNumber('collectionFlow')} onBlur={() => clearNumberDraft('collectionFlow')} /></Field>
          <Field label="员工人数" missing={missingStateForLabel('员工人数')}><input type="number" value={numberValue('employees')} onChange={num('employees')} onFocus={() => focusNumber('employees')} onBlur={() => clearNumberDraft('employees')} /></Field>
          <Field label="社保人数" missing={missingStateForLabel('社保人数')}><input type="number" value={numberValue('socialSecurityCount')} onChange={num('socialSecurityCount')} onFocus={() => focusNumber('socialSecurityCount')} onBlur={() => clearNumberDraft('socialSecurityCount')} /></Field>
          <Field label="工资申报人数" missing={missingStateForLabel('工资申报人数')}><input type="number" value={numberValue('salaryDeclaredCount')} onChange={num('salaryDeclaredCount')} onFocus={() => focusNumber('salaryDeclaredCount')} onBlur={() => clearNumberDraft('salaryDeclaredCount')} /></Field>
        </div>
      </section>

      <section className="form-section" id="intake-trend">
        <div className="section-title-row">
          <div>
            <h3>趋势与预算数据</h3>
            <p className="section-helper">用于执行同比、环比、预实差异、主体利润率和有费用无收入类规则。</p>
            {renderUnitNote(['金额单位：元', '人数单位：人'])}
          </div>
          {renderSectionActions('趋势数据', '趋势', clearTrendSection)}
        </div>
        <div className="form-grid">
          <Field label="上季度末人数"><input type="number" value={numberValue('previousQuarterEmployees')} onChange={num('previousQuarterEmployees')} onFocus={() => focusNumber('previousQuarterEmployees')} onBlur={() => clearNumberDraft('previousQuarterEmployees')} /></Field>
          {renderDerivedNumberField('quarterRevenue')}
          <Field label="上季度收入"><input type="number" value={numberValue('previousQuarterRevenue')} onChange={num('previousQuarterRevenue')} onFocus={() => focusNumber('previousQuarterRevenue')} onBlur={() => clearNumberDraft('previousQuarterRevenue')} /></Field>
          {renderDerivedNumberField('quarterCostExpense')}
          <Field label="上季度成本费用"><input type="number" value={numberValue('previousQuarterCostExpense')} onChange={num('previousQuarterCostExpense')} onFocus={() => focusNumber('previousQuarterCostExpense')} onBlur={() => clearNumberDraft('previousQuarterCostExpense')} /></Field>
          {renderDerivedNumberField('ytdRevenue')}
          {renderDerivedNumberField('ytdCostExpense')}
          {renderDerivedNumberField('ytdProfit')}
          {renderDerivedNumberField('ebitProfit')}
          <Field label="上年 EBIT 利润"><input type="number" value={numberValue('previousYearEbitProfit')} onChange={num('previousYearEbitProfit')} onFocus={() => focusNumber('previousYearEbitProfit')} onBlur={() => clearNumberDraft('previousYearEbitProfit')} /></Field>
          <Field label="预算 EBIT 利润"><input type="number" value={numberValue('budgetEbitProfit')} onChange={num('budgetEbitProfit')} onFocus={() => focusNumber('budgetEbitProfit')} onBlur={() => clearNumberDraft('budgetEbitProfit')} /></Field>
          <Field label="预算收入"><input type="number" value={numberValue('budgetRevenue')} onChange={num('budgetRevenue')} onFocus={() => focusNumber('budgetRevenue')} onBlur={() => clearNumberDraft('budgetRevenue')} /></Field>
          <Field label="上年同期收入"><input type="number" value={numberValue('previousYearRevenue')} onChange={num('previousYearRevenue')} onFocus={() => focusNumber('previousYearRevenue')} onBlur={() => clearNumberDraft('previousYearRevenue')} /></Field>
          {renderDerivedNumberField('mainBusinessRevenue')}
          {renderDerivedNumberField('mainBusinessCost')}
          {renderDerivedNumberField('goodsSalesRevenue')}
          {renderDerivedNumberField('goodsCost')}
        </div>
      </section>

      <section className="form-section" id="intake-cost">
        <div className="section-title-row">
          <div>
            <h3>房租装修与人员费用</h3>
            <p className="section-helper">用于执行无人员有费用、人均租房面积、福利性质餐费和装修费用合理性规则。</p>
            {renderUnitNote(['金额单位：元', '面积单位：平方米'])}
          </div>
          {renderSectionActions('费用数据', '费用', clearCostSection)}
        </div>
        <div className="form-grid">
          <Field label="人员相关成本费用"><input type="number" value={numberValue('peopleRelatedExpense')} onChange={num('peopleRelatedExpense')} onFocus={() => focusNumber('peopleRelatedExpense')} onBlur={() => clearNumberDraft('peopleRelatedExpense')} /></Field>
          <Field label="承租面积（平方米）"><input type="number" value={numberValue('rentalArea')} onChange={num('rentalArea')} onFocus={() => focusNumber('rentalArea')} onBlur={() => clearNumberDraft('rentalArea')} /></Field>
          <Field label="转租面积（平方米）"><input type="number" value={numberValue('subleaseArea')} onChange={num('subleaseArea')} onFocus={() => focusNumber('subleaseArea')} onBlur={() => clearNumberDraft('subleaseArea')} /></Field>
          <Field label="月福利性质餐费"><input type="number" value={numberValue('monthlyMealBenefitExpense')} onChange={num('monthlyMealBenefitExpense')} onFocus={() => focusNumber('monthlyMealBenefitExpense')} onBlur={() => clearNumberDraft('monthlyMealBenefitExpense')} /></Field>
          <Field label="装修费用"><input type="number" value={numberValue('decorationExpense')} onChange={num('decorationExpense')} onFocus={() => focusNumber('decorationExpense')} onBlur={() => clearNumberDraft('decorationExpense')} /></Field>
        </div>
      </section>

      <section className="form-section" id="intake-vat">
        <div className="section-title-row">
          <div>
            <h3>VAT 增值税资料</h3>
            <p className="section-helper">建议来源：增值税申报表、开票明细、平台账单、银行或第三方收款流水。</p>
            {renderUnitNote(['金额单位：元', '税率差/比例：小数'])}
            {renderSectionRequirementSummary(['月开票金额', '连续 12 个月销售额'])}
          </div>
          {renderSectionActions('VAT 数据', 'VAT', clearVatSection)}
        </div>
        <div className="form-grid">
          <Field label="月开票金额" missing={missingStateForLabel('月开票金额')}><input type="number" value={numberValue('monthlyInvoice')} onChange={num('monthlyInvoice')} onFocus={() => focusNumber('monthlyInvoice')} onBlur={() => clearNumberDraft('monthlyInvoice')} /></Field>
          <Field label="连续 12 个月销售额" missing={missingStateForLabel('连续 12 个月销售额')}><input type="number" value={numberValue('consecutive12MonthSales')} onChange={num('consecutive12MonthSales')} onFocus={() => focusNumber('consecutive12MonthSales')} onBlur={() => clearNumberDraft('consecutive12MonthSales')} /></Field>
          <Field label="平台收入"><input type="number" value={numberValue('platformRevenue')} onChange={num('platformRevenue')} onFocus={() => focusNumber('platformRevenue')} onBlur={() => clearNumberDraft('platformRevenue')} /></Field>
          <Field label="红字专票金额"><input type="number" value={numberValue('redVatSpecialInvoiceAmount')} onChange={num('redVatSpecialInvoiceAmount')} onFocus={() => focusNumber('redVatSpecialInvoiceAmount')} onBlur={() => clearNumberDraft('redVatSpecialInvoiceAmount')} /></Field>
          <Field label="销项税额"><input type="number" value={numberValue('outputTax')} onChange={num('outputTax')} onFocus={() => focusNumber('outputTax')} onBlur={() => clearNumberDraft('outputTax')} /></Field>
          <Field label="进项税额"><input type="number" value={numberValue('inputTax')} onChange={num('inputTax')} onFocus={() => focusNumber('inputTax')} onBlur={() => clearNumberDraft('inputTax')} /></Field>
          <Field label="增值税应纳/入库税额"><input type="number" value={numberValue('vatTaxPayable')} onChange={num('vatTaxPayable')} onFocus={() => focusNumber('vatTaxPayable')} onBlur={() => clearNumberDraft('vatTaxPayable')} /></Field>
          {renderDerivedNumberField('taxableSales')}
          <Field label="理论增值税税额"><input type="number" value={numberValue('theoreticalVatTax')} onChange={num('theoreticalVatTax')} onFocus={() => focusNumber('theoreticalVatTax')} onBlur={() => clearNumberDraft('theoreticalVatTax')} /></Field>
          <Field label="预算增值税税额"><input type="number" value={numberValue('budgetVatTax')} onChange={num('budgetVatTax')} onFocus={() => focusNumber('budgetVatTax')} onBlur={() => clearNumberDraft('budgetVatTax')} /></Field>
          <Field label="上期应税销售额"><input type="number" value={numberValue('priorTaxableSales')} onChange={num('priorTaxableSales')} onFocus={() => focusNumber('priorTaxableSales')} onBlur={() => clearNumberDraft('priorTaxableSales')} /></Field>
          <Field label="上期增值税税额"><input type="number" value={numberValue('priorVatTaxPayable')} onChange={num('priorVatTaxPayable')} onFocus={() => focusNumber('priorVatTaxPayable')} onBlur={() => clearNumberDraft('priorVatTaxPayable')} /></Field>
          <Field label="进销项税率差"><input type="number" step="0.0001" value={numberValue('vatRateSpread')} onChange={num('vatRateSpread')} onFocus={() => focusNumber('vatRateSpread')} onBlur={() => clearNumberDraft('vatRateSpread')} /></Field>
          <Field label="广告服务收入"><input type="number" value={numberValue('advertisingServiceRevenue')} onChange={num('advertisingServiceRevenue')} onFocus={() => focusNumber('advertisingServiceRevenue')} onBlur={() => clearNumberDraft('advertisingServiceRevenue')} /></Field>
          <Field label="文化事业建设费实缴"><input type="number" value={numberValue('cultureConstructionFeePaid')} onChange={num('cultureConstructionFeePaid')} onFocus={() => focusNumber('cultureConstructionFeePaid')} onBlur={() => clearNumberDraft('cultureConstructionFeePaid')} /></Field>
          <Field label="期末留抵税额"><input type="number" value={numberValue('endingVatCredit')} onChange={num('endingVatCredit')} onFocus={() => focusNumber('endingVatCredit')} onBlur={() => clearNumberDraft('endingVatCredit')} /></Field>
        </div>
        {renderMaterialGaps(vatMaterialGaps)}
        <div className="check-grid tax-check-grid">
          {renderChecks(vatChecks)}
        </div>
      </section>

      <section className="form-section" id="intake-cit">
        <div className="section-title-row">
          <div>
            <h3>CIT 企业所得税资料</h3>
            <p className="section-helper">覆盖年度利润、扣除限额、优惠适用和费用真实性等企业所得税检查点。</p>
            {renderUnitNote(['金额单位：元', '人数单位：人'])}
            {renderSectionRequirementSummary(['工资薪金总额'])}
          </div>
          {renderSectionActions('CIT 数据', 'CIT', clearCitSection)}
        </div>
        <div className="form-grid">
          <Field label="业务招待费"><input type="number" value={numberValue('entertainmentExpense')} onChange={num('entertainmentExpense')} onFocus={() => focusNumber('entertainmentExpense')} onBlur={() => clearNumberDraft('entertainmentExpense')} /></Field>
          <Field label="广告宣传费"><input type="number" value={numberValue('adExpense')} onChange={num('adExpense')} onFocus={() => focusNumber('adExpense')} onBlur={() => clearNumberDraft('adExpense')} /></Field>
          <Field label="职工福利费"><input type="number" value={numberValue('welfareExpense')} onChange={num('welfareExpense')} onFocus={() => focusNumber('welfareExpense')} onBlur={() => clearNumberDraft('welfareExpense')} /></Field>
          <Field label="工会经费"><input type="number" value={numberValue('unionExpense')} onChange={num('unionExpense')} onFocus={() => focusNumber('unionExpense')} onBlur={() => clearNumberDraft('unionExpense')} /></Field>
          <Field label="职工教育经费"><input type="number" value={numberValue('educationExpense')} onChange={num('educationExpense')} onFocus={() => focusNumber('educationExpense')} onBlur={() => clearNumberDraft('educationExpense')} /></Field>
          <Field label="应纳税所得额"><input type="number" value={numberValue('taxableIncome')} onChange={num('taxableIncome')} onFocus={() => focusNumber('taxableIncome')} onBlur={() => clearNumberDraft('taxableIncome')} /></Field>
          <Field label="资产总额"><input type="number" value={numberValue('assetsTotal')} onChange={num('assetsTotal')} onFocus={() => focusNumber('assetsTotal')} onBlur={() => clearNumberDraft('assetsTotal')} /></Field>
          <Field label="全年平均人数"><input type="number" value={numberValue('employeeAnnualAvg')} onChange={num('employeeAnnualAvg')} onFocus={() => focusNumber('employeeAnnualAvg')} onBlur={() => clearNumberDraft('employeeAnnualAvg')} /></Field>
          <Field label="营业外支出发生额"><input type="number" value={numberValue('nonOperatingExpense')} onChange={num('nonOperatingExpense')} onFocus={() => focusNumber('nonOperatingExpense')} onBlur={() => clearNumberDraft('nonOperatingExpense')} /></Field>
          <Field label="营业外收入发生额"><input type="number" value={numberValue('nonOperatingIncome')} onChange={num('nonOperatingIncome')} onFocus={() => focusNumber('nonOperatingIncome')} onBlur={() => clearNumberDraft('nonOperatingIncome')} /></Field>
          <Field label="其他应收代收代付余额"><input type="number" value={numberValue('otherReceivableAgencyBalance')} onChange={num('otherReceivableAgencyBalance')} onFocus={() => focusNumber('otherReceivableAgencyBalance')} onBlur={() => clearNumberDraft('otherReceivableAgencyBalance')} /></Field>
        </div>
        {renderMaterialGaps(citMaterialGaps)}
        <div className="check-grid tax-check-grid">
          {renderChecks(citChecks)}
        </div>
      </section>

      <section className="form-section" id="intake-iit">
        <div className="section-title-row">
          <div>
            <h3>IIT 个税与薪酬资料</h3>
            <p className="section-helper">用于检查员工、社保、工资申报、劳务佣金和个税扣缴情形是否匹配。</p>
            {renderUnitNote(['金额单位：元', '人数单位：人'])}
          </div>
          {renderSectionActions('IIT 数据', 'IIT', clearIitSection)}
        </div>
        <div className="form-grid">
          <Field label="劳务人员人数"><input type="number" value={numberValue('laborCount')} onChange={num('laborCount')} onFocus={() => focusNumber('laborCount')} onBlur={() => clearNumberDraft('laborCount')} /></Field>
          <Field label="工资薪金总额" missing={missingStateForLabel('工资薪金总额')}><input type="number" value={numberValue('payrollTotal')} onChange={num('payrollTotal')} onFocus={() => focusNumber('payrollTotal')} onBlur={() => clearNumberDraft('payrollTotal')} /></Field>
          <Field label="向个人支付非工资薪金所得"><input type="number" value={numberValue('nonPayrollPersonalPayment')} onChange={num('nonPayrollPersonalPayment')} onFocus={() => focusNumber('nonPayrollPersonalPayment')} onBlur={() => clearNumberDraft('nonPayrollPersonalPayment')} /></Field>
        </div>
        {renderMaterialGaps(iitMaterialGaps)}
        <div className="check-grid tax-check-grid">
          {renderChecks(iitChecks)}
        </div>
      </section>

      <section className="form-section" id="intake-comprehensive">
        <div className="section-title-row">
          <div>
            <h3>综合风险线索</h3>
            <p className="section-helper">记录跨税种、资金流、关联方和业务实质类线索，作为报告复核重点。</p>
          </div>
          {renderSectionActions('综合线索', '综合', clearComprehensiveSection)}
        </div>
        <div className="check-grid tax-check-grid">
          {renderChecks(comprehensiveChecks)}
        </div>
      </section>
    </div>
  )
}

function StructuredReportPreview({ report }: { report: StructuredReport }) {
  return (
    <div className="structured-report">
      <section className="report-cover">
        <p className="eyebrow">中国税务健康检查报告</p>
        <h1>{report.title}</h1>
        <div className="report-cover-meta">
          {report.scope.slice(0, 4).map((item) => (
            <span key={item.label}>{item.label}：{item.value}</span>
          ))}
        </div>
      </section>

      <section className="report-section">
        <div className="report-section-title">
          <span>01</span>
          <h3>项目背景及工作范围</h3>
        </div>
        <div className="report-fact-grid">
          {report.clientProfile.map((item) => (
            <article key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
        <div className="report-scope-list">
          {report.scope.map((item) => (
            <p key={item.label}><strong>{item.label}：</strong>{item.value}</p>
          ))}
        </div>
      </section>

      <section className="report-section">
        <div className="report-section-title">
          <span>02</span>
          <h3>报告摘要：我们的观点</h3>
        </div>
        <div className="executive-summary">
          <div><span>综合风险等级</span><strong>{plainRiskLevel(report.executiveSummary.overallLevel)}风险</strong></div>
          <div><span>命中风险事项</span><strong>{report.executiveSummary.totalRisks} 项</strong></div>
          <div><span>高 / 中 / 低</span><strong>{report.executiveSummary.highRisks} / {report.executiveSummary.mediumRisks} / {report.executiveSummary.lowRisks}</strong></div>
          <div><span>资料完整性</span><strong>{report.dataQuality.score}%</strong></div>
        </div>
        <p className="report-lead">{report.executiveSummary.conclusion}</p>
        <p className="report-note">{report.dataQuality.note}</p>
      </section>

      <section className="report-section">
        <div className="report-section-title">
          <span>03</span>
          <h3>重要事项汇总</h3>
        </div>
        {report.keyFindings.length ? (
          <div className="finding-summary-list">
            {report.keyFindings.map((finding, index) => (
              <article key={finding.id}>
                <span>{index + 1}</span>
                <div>
                  <strong>{finding.title}</strong>
                  <p>{finding.currentFinding}</p>
                </div>
                <LevelBadge level={finding.level} />
              </article>
            ))}
          </div>
        ) : (
          <p className="report-note">当前未形成需要在摘要中重点列示的风险事项。</p>
        )}
      </section>

      <section className="report-section">
        <div className="report-section-title">
          <span>04</span>
          <h3>分税种风险摘要</h3>
        </div>
        <div className="tax-summary-list">
          {report.taxSummaries.length ? report.taxSummaries.map((item) => <p key={item}>{item}</p>) : <p>当前未形成分税种风险提示。</p>}
        </div>
      </section>

      <section className="report-section">
        <div className="report-section-title">
          <span>05</span>
          <h3>重要事项章节</h3>
        </div>
        <div className="detailed-finding-list">
          {report.detailedFindings.length ? report.detailedFindings.map((finding, index) => (
            <article key={finding.id} className="detailed-finding">
              <div className="finding-heading">
                <div>
                  <span>事项 {index + 1}</span>
                  <h4>{finding.title}</h4>
                </div>
                <LevelBadge level={finding.level} />
              </div>
              <div className="finding-meta">
                <span>涉及税种：{finding.taxType}</span>
                <span>整改优先级：{finding.priority}</span>
                {finding.deepTemplate && <span>顾问级深度模板</span>}
              </div>
              <h5>事项背景</h5>
              <p>{finding.scenario}</p>
              <h5>当前发现</h5>
              <p>{finding.currentFinding}</p>
              <h5>潜在税务风险分析</h5>
              <p>{finding.riskAnalysis}</p>
              <h5>测算逻辑</h5>
              <p>{finding.exposureEstimate}</p>
              <h5>优化建议</h5>
              <p>{finding.remediation}</p>
              <h5>政策/规则依据</h5>
              <p>{finding.legalBasis}</p>
              <div className="chips">{finding.materials.map((item) => <span key={item}>{item}</span>)}</div>
            </article>
          )) : <p className="report-note">当前未命中自动风险事项。</p>}
        </div>
      </section>

      <section className="report-section">
        <div className="report-section-title">
          <span>06</span>
          <h3>专家核查清单与资料缺口</h3>
        </div>
        <div className="report-two-col">
          <article>
            <h4>建议核查事项</h4>
            {report.expertReviewItems.length ? (
              <ol>{report.expertReviewItems.map((item) => <li key={item}>{item}</li>)}</ol>
            ) : (
              <p>当前无额外专家核查提示。</p>
            )}
          </article>
          <article>
            <h4>建议补充资料</h4>
            {report.dataQuality.suggestedMaterials.length ? (
              <div className="chips">{report.dataQuality.suggestedMaterials.map((item) => <span key={item}>{item}</span>)}</div>
            ) : (
              <p>暂无明确资料缺口。</p>
            )}
          </article>
        </div>
      </section>

      <section className="report-section">
        <div className="report-section-title">
          <span>07</span>
          <h3>后续跟进节奏</h3>
        </div>
        <ol className="disclaimer-list">
          {report.followUpCadence.map((item) => <li key={item}>{item}</li>)}
        </ol>
      </section>

      <section className="report-section">
        <div className="report-section-title">
          <span>08</span>
          <h3>交付资料清单</h3>
        </div>
        <ol className="disclaimer-list">
          {report.deliveryChecklist.map((item) => <li key={item}>{item}</li>)}
        </ol>
      </section>

      <section className="report-section">
        <div className="report-section-title">
          <span>09</span>
          <h3>客户确认事项</h3>
        </div>
        <ol className="disclaimer-list">
          {report.clientAcknowledgement.map((item) => <li key={item}>{item}</li>)}
        </ol>
      </section>

      <section className="report-section">
        <div className="report-section-title">
          <span>10</span>
          <h3>报告签收栏</h3>
        </div>
        <div className="report-scope-list">
          {report.signOffBlock.map((item) => (
            <p key={item.label}><strong>{item.label}：</strong>{item.value}</p>
          ))}
        </div>
      </section>

      <section className="report-section">
        <div className="report-section-title">
          <span>11</span>
          <h3>责任边界及免责声明</h3>
        </div>
        <ol className="disclaimer-list">
          {report.disclaimers.map((item) => <li key={item}>{item}</li>)}
        </ol>
      </section>
    </div>
  )
}

function AiAssistantPage({
  clients,
  selectedClientId,
  managedRules,
  reports,
  taxDataSummary,
  taxDataMonth,
  onApplyClientDraft,
  onGenerateReport,
  onTaxDataSummaryUpdate,
}: {
  clients: Client[]
  selectedClientId: string
  managedRules: ManagedRule[]
  reports: Report[]
  taxDataSummary: TaxDataSummary | null
  taxDataMonth: string
  onApplyClientDraft: (draftClient: Client) => Promise<AssistantDraftApplyResult>
  onGenerateReport: () => Promise<void>
  onTaxDataSummaryUpdate: (summary: TaxDataSummary) => void
}) {
  const temporaryAssistantClient = useMemo(() => (
    deriveClientMetrics({ ...blankClient, id: 'assistant-temp-client', name: '待录入企业' })
  ), [])
  const selectedClient = clients.find((client) => client.id === selectedClientId) || clients[0] || temporaryAssistantClient
  const risks = useMemo(() => (selectedClient ? detectRisks(selectedClient, managedRules) : []), [selectedClient, managedRules])
  const report = useMemo(() => (
    selectedClient ? reports.find((item) => item.clientId === selectedClient.id) : undefined
  ), [reports, selectedClient])
  const filingChecklist = useMemo(() => filingChecklistForClient(selectedClient), [selectedClient])
  const basicFindings = useMemo(() => basicComplianceFindings(selectedClient), [selectedClient])
  const dataCompleteness = useMemo(() => getDataCompleteness(selectedClient, risks), [selectedClient, risks])
  const [assistantInput, setAssistantInput] = useState('')
  const [assistantThreadState, setAssistantThreadState] = useState(() => {
    const threads = loadAssistantThreads()
    return { threads, activeId: threads[0]?.id || '' }
  })
  const assistantThreads = assistantThreadState.threads
  const activeAssistantThreadId = assistantThreadState.activeId
  const setAssistantThreads = (updater: AssistantThread[] | ((threads: AssistantThread[]) => AssistantThread[])) => {
    setAssistantThreadState((current) => ({
      ...current,
      threads: typeof updater === 'function' ? updater(current.threads) : updater,
    }))
  }
  const setActiveAssistantThreadId = (activeId: string) => {
    setAssistantThreadState((current) => ({ ...current, activeId }))
  }
  const [assistantLoading, setAssistantLoading] = useState(false)
  const [assistantProgress, setAssistantProgress] = useState<{
    totalFiles: number
    currentFile: number
    completedFiles: number
    fileName: string
    recordCount: number
    startedAt: number
    elapsedSeconds: number
  } | null>(null)
  const [assistantError, setAssistantError] = useState('')
  const [assistantNotice, setAssistantNotice] = useState('')
  const [assistantDragActive, setAssistantDragActive] = useState(false)
  const [assistantPendingFiles, setAssistantPendingFiles] = useState<File[]>([])
  const [assistantThreadsHydrated, setAssistantThreadsHydrated] = useState(false)
  const assistantFileInputRef = useRef<HTMLInputElement | null>(null)
  const structuredIntakeByDraftId = useRef(new Map<string, ParsedTaxDataIntake>())
  const activeAssistantThread = assistantThreads.find((thread) => thread.id === activeAssistantThreadId) || assistantThreads[0]
  const assistantMessages = activeAssistantThread?.messages || []
  const assistantDrafts = activeAssistantThread?.drafts || []
  const showAssistantProcessingMessage = assistantLoading && assistantMessages.at(-1)?.role === 'user'
  const assistantProgressText = (() => {
    if (!assistantProgress) return '正在处理...'
    const remainingFiles = assistantProgress.totalFiles - assistantProgress.completedFiles
    const elapsedSeconds = Math.max(1, assistantProgress.elapsedSeconds)
    const estimatedSeconds = assistantProgress.completedFiles > 0
      ? Math.ceil((elapsedSeconds / assistantProgress.completedFiles) * remainingFiles)
      : 0
    const estimate = estimatedSeconds > 0
      ? `预计剩余约 ${estimatedSeconds >= 60 ? `${Math.ceil(estimatedSeconds / 60)} 分钟` : `${estimatedSeconds} 秒`}`
      : '预计需要 1-3 分钟'
    return [
      `正在处理 ${assistantProgress.currentFile}/${assistantProgress.totalFiles}：${assistantProgress.fileName}`,
      `已完成 ${assistantProgress.completedFiles}/${assistantProgress.totalFiles} 个文件，已收录 ${assistantProgress.recordCount} 条标准记录。${estimate}。`,
      '可以切换到其他页面，处理会继续进行。',
    ].join('\n')
  })()
  const currentAssistantDraft = assistantDrafts[0]
  const currentMaterialSummary = activeAssistantThread?.latestMaterialSummary
  const currentUploadCount = currentAssistantDraft?.rawMaterials.length || 0
  const currentQuestionCount = currentAssistantDraft?.confirmationQuestions.length || 0
  const currentRecordCount = Object.values(currentAssistantDraft?.taxDataRecordCounts || {}).reduce((sum, value) => sum + value, 0)
  useEffect(() => {
    window.localStorage.setItem(assistantThreadsStorageKey, JSON.stringify(assistantThreads.slice(0, 20)))
  }, [assistantThreads])
  useEffect(() => {
    let active = true
    async function loadPersistedThreads() {
      try {
        const response = await apiGet<{ threads: AssistantThread[] }>('/api/assistant/threads')
        if (!active || !response.threads?.length) return
        setAssistantThreadState({
          threads: response.threads,
          activeId: response.threads[0].id,
        })
      } catch (error) {
        console.warn('Using local assistant threads.', error)
      } finally {
        if (active) setAssistantThreadsHydrated(true)
      }
    }
    void loadPersistedThreads()
    return () => {
      active = false
    }
  }, [])
  useEffect(() => {
    if (!assistantThreadsHydrated) return
    const timeout = window.setTimeout(() => {
      apiSend<{ threads: AssistantThread[] }>('/api/assistant/threads', 'POST', {
        threads: assistantThreads.slice(0, 20),
      }).catch((error) => {
        console.warn('Assistant threads saved locally only.', error)
      })
    }, 700)
    return () => window.clearTimeout(timeout)
  }, [assistantThreads, assistantThreadsHydrated])
  const updateActiveAssistantThread = (updater: (thread: AssistantThread) => AssistantThread) => {
    if (!activeAssistantThread) return
    setAssistantThreads((current) => current.map((thread) => (
      thread.id === activeAssistantThread.id ? updater(thread) : thread
    )))
  }
  const setActiveAssistantMessages = (updater: AiAssistantMessage[] | ((messages: AiAssistantMessage[]) => AiAssistantMessage[])) => {
    updateActiveAssistantThread((thread) => ({
      ...thread,
      messages: typeof updater === 'function' ? updater(thread.messages) : updater,
      updatedAt: formatDate(),
    }))
  }
  const setActiveAssistantDrafts = (updater: AiAssistantDraft[] | ((drafts: AiAssistantDraft[]) => AiAssistantDraft[])) => {
    updateActiveAssistantThread((thread) => ({
      ...thread,
      drafts: typeof updater === 'function' ? updater(thread.drafts) : updater,
      updatedAt: formatDate(),
    }))
  }
  const setActiveAssistantMaterialSummary = (summary: AssistantMaterialSummary) => {
    updateActiveAssistantThread((thread) => ({
      ...thread,
      latestMaterialSummary: summary,
      updatedAt: formatDate(),
    }))
  }
  const buildAssistantContext = (
    draftOverride?: AiAssistantDraft | null,
    materialSummaryOverride?: AssistantMaterialSummary | null,
  ) => {
    const contextDraft = draftOverride === undefined ? assistantDrafts[0] : draftOverride || undefined
    const contextClient = contextDraft?.client || selectedClient
    const contextRisks = contextDraft ? detectRisks(contextClient, managedRules) : risks
    const contextReport = contextDraft ? undefined : report
    const contextChecklist = filingChecklistForClient(contextClient)
    const contextBasicFindings = basicComplianceFindings(contextClient)
    const contextCompleteness = getDataCompleteness(contextClient, contextRisks)
    const contextTaxDataSummary = taxDataSummary?.clientId === contextClient.id ? taxDataSummary : null
    const collectedTaxDataSlots = (contextTaxDataSummary?.slots || []).filter((slot) => taxDataSlotCoversMonth(slot, taxDataMonth))
    const collectedTaxDataIds = new Set(collectedTaxDataSlots.map((slot) => slot.slotId))
    const taxDataCatalog = contextTaxDataSummary?.slotCatalog || []
    return {
    activeThread: activeAssistantThread
      ? {
        id: activeAssistantThread.id,
        title: activeAssistantThread.title,
        messageCount: activeAssistantThread.messages.length,
        draftCount: activeAssistantThread.drafts.length,
      }
      : null,
    currentDraft: compactAssistantDraftForModel(contextDraft),
    latestMaterialSummary: materialSummaryOverride === undefined
      ? activeAssistantThread?.latestMaterialSummary || null
      : materialSummaryOverride,
    filingChecklist: contextChecklist.map((item) => ({
      group: item.group,
      item: item.item,
      status: item.status,
      handling: item.handling,
      note: item.note,
    })),
    taxDataArchive: contextTaxDataSummary ? {
      period: taxDataMonth,
      sourceOfTruth: 'standard_tax_data_archive',
      collectedCategories: Array.from(new Set(collectedTaxDataSlots.map((slot) => slot.name))),
      missingCategories: taxDataCatalog.filter((item) => !collectedTaxDataIds.has(taxDataCatalogSlotId(item))).map((item) => item.name),
      sourceFiles: Array.from(new Set(collectedTaxDataSlots.flatMap((slot) => slot.sourceFiles.map((file) => file.file_name)))),
      recordCount: collectedTaxDataSlots.reduce((sum, slot) => sum + slot.recordCount, 0),
    } : null,
    workflowState: {
      dataCompleteness: contextCompleteness,
      basicComplianceFindings: contextBasicFindings,
      professionalRiskCount: contextRisks.length,
      professionalRiskLevel: getOverallLevel(contextRisks),
      hasReport: Boolean(contextReport),
      reportRiskLevel: contextReport?.riskLevel || '',
    },
    }
  }
  const updateAssistantThreadTitle = (title: string, preferredTitle?: string) => {
    const nextTitle = assistantThreadTitleFromText(preferredTitle || extractCompanyNameFromText(title) || title)
    updateActiveAssistantThread((thread) => (
      thread.title === '新对话' || looksLikeAssistantFileTitle(thread.title)
        ? { ...thread, title: nextTitle, updatedAt: formatDate() }
        : thread
    ))
  }
  const addAssistantPendingFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    if (!files.length) return
    setAssistantError('')
    setAssistantPendingFiles((current) => [...current, ...files].slice(0, 12))
  }
  const removeAssistantPendingFile = (index: number) => {
    setAssistantPendingFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))
  }
  const startAssistantThread = () => {
    const thread = createAssistantThread()
    setAssistantThreads((current) => [thread, ...current])
    setActiveAssistantThreadId(thread.id)
    setAssistantInput('')
    setAssistantPendingFiles([])
    setAssistantError('')
    setAssistantNotice('')
  }
  const removeAssistantThread = (threadId: string) => {
    setAssistantThreadState((current) => {
      const nextThreads = current.threads.filter((thread) => thread.id !== threadId)
      const threads = nextThreads.length ? nextThreads : [createAssistantThread()]
      return {
        threads,
        activeId: threadId === current.activeId ? threads[0].id : current.activeId,
      }
    })
    apiDelete<{ ok: boolean }>(`/api/assistant/threads?id=${encodeURIComponent(threadId)}`).catch((error) => {
      console.warn('Assistant thread delete saved locally only.', error)
    })
  }
  const taxFactAmountFields = ['currentAmount', 'cumulativeAmount', 'endingAmount', 'currentTax', 'taxAmount', 'taxWithheld', 'grossPay', 'currentIncome', 'endingDebit', 'endingCredit']
  const taxFactKey = (record: ParsedTaxDataIntake['records'][number]) => {
    const payload = record.payload || {}
    const businessKey = [
      payload.statementType,
      payload.lineCode || payload.lineName,
      payload.accountCode || payload.accountName,
      payload.rowNo || payload.itemName,
      payload.invoiceNo,
      payload.employeeName || payload.personName,
      payload.incomeItem,
    ].filter(Boolean).join('|')
    return [record.recordType, record.recordSubtype || '', record.periodStart || '', record.periodEnd || '', businessKey].join('::')
  }
  const taxFactDisplayName = (record: ParsedTaxDataIntake['records'][number], field: string) => {
    const payload = record.payload || {}
    return [
      payload.lineName,
      payload.accountName,
      payload.itemName,
      payload.invoiceNo,
      payload.employeeName || payload.personName,
      field,
    ].filter(Boolean).join(' / ') || `${record.recordType} / ${field}`
  }
  const buildCrossMaterialConfirmationQuestions = (
    incomingDraft: AiAssistantDraft,
    incomingIntake?: ParsedTaxDataIntake,
    existingDrafts: AiAssistantDraft[] = assistantDrafts,
  ) => {
    if (!incomingIntake?.records.length) return { questions: [] as IntakeConfirmationQuestion[], warnings: [] as string[] }
    const existingFacts = new Map<string, { amount: number; draft: AiAssistantDraft; record: ParsedTaxDataIntake['records'][number]; field: string }>()
    existingDrafts.forEach((draft) => {
      const intake = structuredIntakeByDraftId.current.get(draft.id)
      if (!intake?.records.length) return
      if (draft.client.name && incomingDraft.client.name && draft.client.name !== incomingDraft.client.name) return
      intake.records.forEach((record) => {
        taxFactAmountFields.forEach((field) => {
          const amount = Number(record.payload?.[field])
          if (!Number.isFinite(amount)) return
          existingFacts.set(`${taxFactKey(record)}::${field}`, { amount, draft, record, field })
        })
      })
    })

    const questions: IntakeConfirmationQuestion[] = []
    const warnings: string[] = []
    const matchedFacts = new Set<string>()
    incomingIntake.records.forEach((record) => {
      taxFactAmountFields.forEach((field) => {
        const incomingAmount = Number(record.payload?.[field])
        if (!Number.isFinite(incomingAmount)) return
        const key = `${taxFactKey(record)}::${field}`
        const existing = existingFacts.get(key)
        if (!existing) return
        const diff = Math.abs(incomingAmount - existing.amount)
        const label = taxFactDisplayName(record, field)
        if (diff <= 0.01) {
          if (!matchedFacts.has(key)) {
            matchedFacts.add(key)
            warnings.push(`跨资料一致：${label} 在「${existing.draft.fileName || existing.draft.sourceType}」和「${incomingDraft.fileName || incomingDraft.sourceType}」中金额一致。`)
          }
          return
        }
        questions.push({
          id: `crossMaterial:${key}`.replace(/[^a-z0-9:_-]/gi, '_'),
          field: `crossMaterial.${field}`,
          label: '跨资料金额差异',
          question: `「${existing.draft.fileName || existing.draft.sourceType}」与「${incomingDraft.fileName || incomingDraft.sourceType}」都包含「${label}」，但金额不一致：前者 ${existing.amount}，后者 ${incomingAmount}，差额 ${diff.toFixed(2)}。请客户确认哪一份为准，或说明是否存在期间/口径差异。`,
          severity: 'required',
          source: incomingDraft.fileName || incomingDraft.sourceType,
          evidence: `${existing.record.periodStart || ''} 至 ${existing.record.periodEnd || ''}`,
        })
      })
    })
    return { questions: uniqueByQuestion(questions).slice(0, 6), warnings: warnings.slice(0, 6) }
  }
  const assistantUploadCustomerMessage = (draft: AiAssistantDraft, fileName: string, recordCount: number) => {
    const questionLines = filterCurrentFileConfirmationQuestions(draft.confirmationQuestions)
      .slice(0, 6)
      .map((question, index) => `${index + 1}. ${question.question}`)
    return [
      `我已读取「${fileName}」，识别到 ${recordCount} 条可收录数据。`,
      questionLines.length
        ? `请先确认这个文件本身：\n${questionLines.join('\n')}`
        : '这个文件本身暂未发现必须确认的疑点。',
      '如果还有资料，请继续上传；如果这批资料已经传完，请回复“资料已传完”。确认无误后，也可以直接回复“确认导入”或“按这个保存”。',
    ].filter(Boolean).join('\n\n')
  }
  const buildAssistantDraft = (
    patchData: Partial<Client>,
    options: {
      fileName?: string
      rawMaterial?: AssistantRawMaterial
      mappings: ImportMappingPreview[]
      unmappedHeaders: string[]
      detectedTables: string[]
      sourceType: string
      confirmationQuestions?: IntakeConfirmationQuestion[]
      taxDataIntake?: ParsedTaxDataIntake
      preferredClient?: Client
    },
  ) => {
    const targetMode: Exclude<AiAssistantTargetMode, 'auto'> = options.preferredClient
      ? 'existing'
      : clients.length === 0
      ? 'new'
      : patchData.name && !clients.some((client) => (
          client.creditCode && patchData.creditCode
            ? client.creditCode === patchData.creditCode
            : client.name === patchData.name
        ))
          ? 'new'
          : 'existing'
    const matchedClient = targetMode === 'existing'
      ? options.preferredClient || clients.find((client) => (
        (patchData.creditCode && client.creditCode === patchData.creditCode)
        || (patchData.name && client.name === patchData.name)
      )) || (!patchData.name && !patchData.creditCode ? selectedClient : null)
      : null
    const baseClient = targetMode === 'existing' && matchedClient
      ? matchedClient
      : blankDraftClient()
    const draftClient = applyExplicitDerivedPatch(baseClient, {
      ...patchData,
      id: baseClient.id,
      periodEntries: baseClient.periodEntries,
    }, `清洗资料明确值：${options.sourceType}`)
    const labels = Object.keys(patchData).map(fieldLabel)
    const now = formatDate()
    const rawMaterials = options.rawMaterial ? [options.rawMaterial] : []
    const confirmationQuestions = filterCurrentFileConfirmationQuestions(uniqueByQuestion([
      ...(options.confirmationQuestions || []),
      ...rawMaterials.flatMap((material) => material.confirmationQuestions || []),
    ])).slice(0, 8)
    return {
      id: crypto.randomUUID(),
      targetMode,
      client: draftClient,
      labels: uniqueLabels(labels),
      mappings: options.mappings.filter((item) => Object.prototype.hasOwnProperty.call(patchData, item.field)),
      unmappedHeaders: options.unmappedHeaders,
      detectedTables: options.detectedTables,
      sourceType: options.sourceType,
      fileName: options.fileName,
      rawMaterials,
      changeLog: [
        {
          id: crypto.randomUUID(),
          at: now,
          source: 'AI 清洗',
          detail: rawMaterials.length
            ? `从原始资料「${rawMaterials[0].name}」生成清洗后数据草稿`
            : '从粘贴内容生成清洗后数据草稿',
        },
      ],
      updatedAt: now,
      missingSaveLabels: validateClientForSave(draftClient).map((issue) => issue.label).slice(0, 6),
      confirmationQuestions,
      taxDataRecordCounts: options.taxDataIntake?.recordCounts,
      taxDataWarnings: options.taxDataIntake?.warnings,
    }
  }
  const addAssistantDraftFromParsedImport = (parsedImport: ParsedClientImport, fileName?: string, rawMaterial?: AssistantRawMaterial, preferredClient?: Client) => {
    const patchData = {
      ...(fileName ? inferClientPatchFromFileName(fileName) : {}),
      ...coerceImportedClientPatch(parsedImport.patch),
    }
    const labels = Object.keys(patchData).map(fieldLabel)
    if (!labels.length && !parsedImport.taxDataIntake?.records.length) return null
    const draft = buildAssistantDraft(patchData, {
      fileName,
      rawMaterial,
      confirmationQuestions: rawMaterial?.confirmationQuestions || [],
      mappings: parsedImport.mappings,
      unmappedHeaders: parsedImport.unmappedHeaders,
      detectedTables: parsedImport.detectedTables,
      sourceType: parsedImport.detectedSourceType || (fileName ? '上传资料' : '粘贴资料'),
      taxDataIntake: parsedImport.taxDataIntake,
      preferredClient,
    })
    const crossMaterialCheck = buildCrossMaterialConfirmationQuestions(draft, parsedImport.taxDataIntake)
    if (crossMaterialCheck.questions.length || crossMaterialCheck.warnings.length) {
      draft.confirmationQuestions = uniqueByQuestion([
        ...crossMaterialCheck.questions,
        ...draft.confirmationQuestions,
      ]).slice(0, 8)
      draft.taxDataWarnings = uniqueLabels([
        ...(draft.taxDataWarnings || []),
        ...crossMaterialCheck.warnings,
      ]).slice(0, 12)
      draft.changeLog = [
        {
          id: crypto.randomUUID(),
          at: formatDate(),
          source: '跨资料校验',
          detail: crossMaterialCheck.questions.length
            ? `发现 ${crossMaterialCheck.questions.length} 个跨资料金额差异，需客户确认。`
            : `已有 ${crossMaterialCheck.warnings.length} 个字段被其他客户资料互相佐证。`,
        },
        ...draft.changeLog,
      ]
    }
    if (parsedImport.taxDataIntake?.records.length) structuredIntakeByDraftId.current.set(draft.id, parsedImport.taxDataIntake)
    setActiveAssistantDrafts((current) => [draft, ...current].slice(0, 5))
    setActiveAssistantMaterialSummary({
      fileName,
      sourceType: parsedImport.detectedSourceType || (fileName ? '上传资料' : '粘贴资料'),
      detectedTables: parsedImport.detectedTables,
      mappedFields: parsedImport.mappings.slice(0, 40),
      unmappedHeaders: parsedImport.unmappedHeaders.slice(0, 40),
      patchPreview: patchData,
      confirmationQuestions: draft.confirmationQuestions,
    })
    return draft
  }
  const applyAssistantAutoCleanPatch = (patch: Partial<Client> | undefined, source = 'AI 二次清洗') => {
    if (!patch || !Object.keys(patch).length) return null
    const labels = Object.keys(patch).map(fieldLabel)
    const detail = labels.length ? `更新 ${labels.join('、')}` : '更新清洗草稿'
    const now = formatDate()

    setActiveAssistantDrafts((current) => {
      if (!current.length) return current
      return current.map((draft, index) => {
        if (index !== 0) return draft
        const client = applyExplicitDerivedPatch(draft.client, patch, source)
        return {
          ...draft,
          client,
          labels: uniqueLabels([...draft.labels, ...labels]),
          changeLog: [
            { id: crypto.randomUUID(), at: now, source, detail },
            ...draft.changeLog,
          ].slice(0, 8),
          updatedAt: now,
          missingSaveLabels: validateClientForSave(client).map((issue) => issue.label).slice(0, 6),
        }
      })
    })
    return { labels, detail }
  }
  const askAssistantToCleanUploadedDraft = async (
    draft: AiAssistantDraft,
    materialSummary: AssistantMaterialSummary,
    baseMessages: AiAssistantMessage[],
  ) => {
    setAssistantLoading(true)
    try {
      const response = await apiSend<AiAssistantResponse>('/api/ai/assistant', 'POST', {
        message: '请基于刚上传的原始资料和当前上下文继续清洗。只允许补充资料中可以确定的字段，并只列出“当前这个文件本身”需要客户确认的问题，例如资料类型、资料所属期、未识别列、跨资料金额差异。不要询问分析全年还是某几个月；不要因为企业基础信息缺失就要求补统一社会信用代码、地区、行业、纳税人类型、成立时间；这些等客户明确说“资料已传完”或进入分析阶段后再问。不要要求用户点击页面保存、提交或确认导入按钮；用户只需要在对话中确认。',
        history: baseMessages.map((item) => ({ role: item.role, content: item.content })),
        client: draft.client,
        risks: [],
        report: null,
        assistantContext: buildAssistantContext(draft, materialSummary),
      })
      const toolResults: string[] = []
      const patchResult = applyAssistantAutoCleanPatch(response.draftPatch)
      if (patchResult) toolResults.push(`已更新清洗草稿：${patchResult.detail}`)
      setActiveAssistantMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: [
            sanitizeIntakeStageAssistantAnswer(response.answer),
            ...toolResults,
          ].filter(Boolean).join('\n'),
          response,
        },
      ])
    } catch (error) {
      console.warn('Assistant auto cleaning failed.', error)
      setActiveAssistantMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '已完成资料解析。你可以继续回答我提出的确认问题；确认无误后，直接回复“确认导入”或“按这个保存”，我会自动入库。',
        },
      ])
    } finally {
      setAssistantLoading(false)
    }
  }
  const uploadAssistantMaterial = async (file: File): Promise<AssistantRawMaterial> => {
    const fallback: AssistantRawMaterial = {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      contentType: file.type || 'application/octet-stream',
      sourceType: '上传资料',
      storageStatus: 'local_only',
      uploadedAt: formatDate(),
    }
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (activeAssistantThread?.id) formData.append('threadId', activeAssistantThread.id)
      const response = await apiUpload<{ material: AssistantRawMaterial }>('/api/assistant/materials', formData)
      return {
        ...fallback,
        ...response.material,
        sourceType: response.material.sourceType || fallback.sourceType,
        storageStatus: response.material.storageStatus || fallback.storageStatus,
      }
    } catch (error) {
      console.warn('Assistant material stored locally only.', error)
      return fallback
    }
  }
  const buildAssistantIntakeMetadata = (
    fileName: string,
    parsedImport?: {
      mappings: ImportMappingPreview[]
      unmappedHeaders: string[]
      detectedTables: string[]
      detectedSourceType?: string
    },
    userNote = '',
  ) => {
    const signal = {
      fileName,
      sheetNames: parsedImport?.detectedTables || [],
      textSample: [
        userNote ? `用户说明：${userNote}` : '',
        parsedImport?.detectedSourceType || '',
        ...(parsedImport?.detectedTables || []),
        ...(parsedImport?.mappings || []).map((item) => `${item.source} ${item.label} ${item.field}`),
        ...(parsedImport?.unmappedHeaders || []),
      ].filter(Boolean).join('\n').slice(0, 4000),
    }
    const classification = classifyIntakeMaterial(signal)
    const period = detectIntakePeriod(signal)
    const confirmationQuestions = buildIntakeConfirmationQuestions({
      fileName,
      classification,
      period,
      parsedImport,
    })
    return {
      documentType: classification.documentType,
      classificationConfidence: classification.confidence,
      classificationReasons: classification.reasons,
      sourceSystem: classification.sourceSystem,
      requiresSpecializedParser: classification.requiresSpecializedParser,
      periodType: period.periodType,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      periodEvidence: period.evidence,
      confirmationQuestions,
    }
  }
  const requiredConfirmationQuestions = (draft: AiAssistantDraft) => (
    draft.confirmationQuestions.filter((question) => question.severity === 'required')
  )
  const saveDraftAndStructuredIntake = async (draft: AiAssistantDraft) => {
    const result = await onApplyClientDraft(draft.client)
    if (result.status !== 'saved' || !result.client) return { result, messages: [] as string[] }
    const messages = await saveStructuredIntake(draft, result.client)
    return { result, messages }
  }
  const assistantBackendWriteToolNames = new Set<AiAssistantToolCall['name']>([
    'save_cleaning_draft',
    'create_or_update_company',
    'save_period_data',
    'attach_source_material',
    'save_customer_memory',
    'create_import_audit_log',
    'save_standardized_tax_data',
    'save_current_draft',
  ])
  const assistantClientWriteToolNames = new Set<AiAssistantToolCall['name']>([
    'create_or_update_company',
    'save_period_data',
    'save_current_draft',
  ])
  const executeAssistantSaveTool = async (
    client: Client,
    toolCalls: AiAssistantToolCall[] = [
      {
        name: 'save_current_draft',
        arguments: {},
        reason: '用户已确认导入当前清洗草稿',
        requiresConfirmation: false,
      },
    ],
    draft?: AiAssistantDraft | null,
  ) => {
    try {
      const response = await apiSend<{ results: Array<{ name: AiAssistantToolCall['name']; status: string; message: string }> }>('/api/assistant/tools', 'POST', {
        toolCalls,
        allowSave: true,
        currentDraft: draft ? { ...draft, client } : { client },
        assistantContext: buildAssistantContext(draft || undefined),
      })
      return response.results
        .filter((item) => !assistantClientWriteToolNames.has(item.name))
        .map((item) => item.message)
        .filter(Boolean)
    } catch (error) {
      console.warn('Assistant save tool fell back to existing save flow.', error)
      return []
    }
  }
  const saveStructuredIntake = async (draft: AiAssistantDraft, savedClient: Client) => {
    const intake = structuredIntakeByDraftId.current.get(draft.id)
    const expectedRecordCount = Object.values(draft.taxDataRecordCounts || {}).reduce((sum, value) => sum + value, 0)
    if (!intake && expectedRecordCount > 0) {
      throw new Error('结构化解析缓存已失效，请重新上传原始文件后再确认导入。')
    }
    if (!intake) return []
    if (intake.records.length && !intake.autoImportEligible) {
      const failures = intake.templateMatches
        .flatMap((match) => match.validations.filter((validation) => validation.blocking && validation.status === 'failed').map((validation) => `${match.templateName}：${validation.label}`))
      throw new Error(`模板校验未通过，已阻止写入业务数据。${failures.length ? `请复核：${failures.join('、')}。` : ''}`)
    }
    const messages: string[] = []
    const chunkSize = 80
    const sourceFiles = draft.rawMaterials.map((material) => ({
      id: material.id,
      materialId: material.id,
      clientId: savedClient.id,
      fileName: material.name,
      contentType: material.contentType,
      fileSize: material.size,
      documentType: material.documentType || intake.documentTypes[0] || 'other_material',
      sourceSystem: material.sourceSystem || draft.sourceType,
      periodStart: material.periodStart || savedClient.periodStartDate,
      periodEnd: material.periodEnd || savedClient.periodEndDate,
      parseStatus: intake.conflicts.length ? 'needs_confirmation' : 'parsed',
      storageKey: material.objectKey,
      evidence: {
        recordCounts: intake.recordCounts,
        warnings: intake.warnings,
        templateMatches: intake.templateMatches,
        autoImportEligible: intake.autoImportEligible,
        confirmationQuestions: material.confirmationQuestions || [],
      },
    }))

    const chunkOffsets = intake.records.length ? Array.from({ length: Math.ceil(intake.records.length / chunkSize) }, (_, index) => index * chunkSize) : [0]
    for (const offset of chunkOffsets) {
      const records = intake.records.slice(offset, offset + chunkSize)
      const recordIds = new Set(records.map((record) => record.id))
      const isLastChunk = offset + records.length >= intake.records.length
      const requiredQuestions = requiredConfirmationQuestions(draft)
      const response = await apiSend<{ results: Array<{ status: string; message: string }> }>('/api/assistant/tools', 'POST', {
        toolCalls: [{
          name: 'save_standardized_tax_data',
          arguments: {
            batchId: draft.id,
            clientId: savedClient.id,
            clientName: savedClient.name,
            clientCreditCode: savedClient.creditCode,
            periodStart: savedClient.periodStartDate,
            periodEnd: savedClient.periodEndDate,
            status: isLastChunk
              ? !intake.autoImportEligible || intake.conflicts.length || requiredQuestions.length ? 'pending_confirmation' : 'confirmed'
              : 'importing',
            sourceFiles,
            records,
            evidenceFields: records.length ? intake.evidenceFields.filter((item) => recordIds.has(item.targetId)) : [],
            conflicts: offset === 0
              ? [
                  ...intake.conflicts,
                  ...requiredQuestions.map((question) => ({
                    conflictType: 'customer_confirmation_required',
                    fieldName: question.field,
                    incomingValue: question.question,
                    severity: question.severity === 'required' ? 'medium' : 'low',
                    status: 'open',
                    sourceFileIds: draft.rawMaterials.map((material) => material.id),
                  })),
                ]
              : [],
            summary: { totalRecordCount: intake.records.length, recordCounts: intake.recordCounts, warnings: intake.warnings },
          },
          reason: `用户确认导入结构化税务资料，第 ${Math.floor(offset / chunkSize) + 1} 批`,
          requiresConfirmation: false,
        }],
        allowSave: true,
        currentDraft: { ...draft, client: savedClient },
        assistantContext: buildAssistantContext(draft),
      })
      const failed = response.results.find((item) => item.status === 'failed' || item.status === 'rejected')
      if (failed) throw new Error(failed.message)
      messages.push(...response.results.map((item) => item.message).filter(Boolean))
    }
    return messages
  }
  const canParseAssistantFile = (fileName: string) => /\.(xlsx|xls|csv|tsv|txt|json|pdf)$/i.test(fileName)
  const importAssistantFile = async (
    file: File | null,
    userNote = '',
    contextMessages = assistantMessages,
    options: { silentDirectResult?: boolean; preferredClient?: Client } = {},
  ) => {
    if (!file) return
    setAssistantError('')
    setAssistantNotice('')
    try {
      const rawMaterial = await uploadAssistantMaterial(file)
      if (!canParseAssistantFile(file.name)) {
        const metadata = buildAssistantIntakeMetadata(file.name, undefined, userNote)
        const enrichedRawMaterial = {
          ...rawMaterial,
          ...metadata,
        }
        updateAssistantThreadTitle(file.name)
        setActiveAssistantMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `已接收「${file.name}」并记录原始资料。当前自动清洗优先支持 Excel、CSV、TSV、JSON 和文本；图片、PDF、PPT 可先作为资料留痕，你可以继续告诉我这份资料对应哪家公司、哪个期间，以及需要我提取什么信息。`,
          },
        ])
        setActiveAssistantMaterialSummary({
          fileName: file.name,
          sourceType: enrichedRawMaterial.sourceType,
          documentType: enrichedRawMaterial.documentType,
          classificationConfidence: enrichedRawMaterial.classificationConfidence,
          classificationReasons: enrichedRawMaterial.classificationReasons,
          sourceSystem: enrichedRawMaterial.sourceSystem,
          requiresSpecializedParser: enrichedRawMaterial.requiresSpecializedParser,
          periodType: enrichedRawMaterial.periodType,
          periodStart: enrichedRawMaterial.periodStart,
          periodEnd: enrichedRawMaterial.periodEnd,
          periodEvidence: enrichedRawMaterial.periodEvidence,
          detectedTables: [],
          mappedFields: [],
          unmappedHeaders: [],
          patchPreview: {},
          confirmationQuestions: enrichedRawMaterial.confirmationQuestions || [],
        })
        if (enrichedRawMaterial.confirmationQuestions?.length) {
          setActiveAssistantMessages((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `客户确认问题：\n${enrichedRawMaterial.confirmationQuestions!.map((question) => `- ${question.question}`).join('\n')}`,
            },
          ])
        }
        return
      }
      const fileBuffer = await file.arrayBuffer()
      const isExcelFile = /\.(xlsx|xls)$/i.test(file.name)
      const isPdfFile = /\.pdf$/i.test(file.name)
      const parsedImport: ParsedClientImport = isExcelFile
        ? await parseClientImportWorkbook(fileBuffer, file.name)
        : isPdfFile
          ? {
              patch: {},
              mappings: [],
              unmappedHeaders: [],
              detectedTables: ['PDF 文本提取'],
              detectedSourceType: 'PDF 税务资料',
              taxDataIntake: parseTaxDataPdfText(file.name, await extractPdfTextPages(fileBuffer)),
            }
          : parseClientImportText(decodeClientImportText(fileBuffer))
      const metadata = buildAssistantIntakeMetadata(file.name, parsedImport, userNote)
      const draft = addAssistantDraftFromParsedImport(parsedImport, file.name, {
        ...rawMaterial,
        ...metadata,
        sourceType: parsedImport.detectedSourceType || '上传资料',
      }, options.preferredClient)
      if (!draft) {
        setAssistantError('未识别到可填入系统的字段。')
        return
      }
      const materialSummary: AssistantMaterialSummary = {
        fileName: file.name,
        ...metadata,
        sourceType: parsedImport.detectedSourceType || '上传资料',
        detectedTables: parsedImport.detectedTables,
        mappedFields: parsedImport.mappings.slice(0, 40),
        unmappedHeaders: parsedImport.unmappedHeaders.slice(0, 40),
        patchPreview: {
          ...inferClientPatchFromFileName(file.name),
          ...coerceImportedClientPatch(parsedImport.patch),
        },
      }
      updateAssistantThreadTitle(file.name, draft.client.name)
      if (hasDirectIntakeAuthorization(userNote)) {
        const intake = parsedImport.taxDataIntake
        if (intake?.records.length && !intake.autoImportEligible) {
          const failedChecks = intake.templateMatches
            .flatMap((match) => match.validations.filter((validation) => validation.blocking && validation.status === 'failed').map((validation) => `${match.templateName}：${validation.label}`))
          const reason = failedChecks.length ? failedChecks.join('、') : '文件类型、期间或模板版本需要确认'
          if (!options.silentDirectResult) {
            setActiveAssistantMessages((current) => [
              ...current,
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `「${file.name}」未自动入库。模板校验未全部通过；为避免错档，业务数据未写入。需要确认：${reason}。`,
              },
            ])
          }
          return { status: 'blocked' as const, fileName: file.name, recordCount: intake.records.length, reason }
        }
        const requiredQuestions = requiredConfirmationQuestions(draft)
        const saved = await saveDraftAndStructuredIntake(draft)
        const recordCount = parsedImport.taxDataIntake?.records.length || 0
        const sourceFileCount = draft.rawMaterials.length || 1
        if (saved.result.status !== 'saved' || !saved.result.client) {
          const reason = saved.result.message || '企业归属尚未确定'
          if (!options.silentDirectResult) {
            setActiveAssistantMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: `「${file.name}」暂未入库：${reason}` }])
          }
          return { status: 'blocked' as const, fileName: file.name, recordCount, reason }
        }
        if (saved.result.client?.id) {
          try {
            const refreshed = await apiGet<TaxDataSummary>(`/api/tax-data/summary?clientId=${encodeURIComponent(saved.result.client.id)}`)
            onTaxDataSummaryUpdate(refreshed)
          } catch (error) {
            console.warn('Failed to refresh tax data summary after direct intake.', error)
          }
        }
        if (!options.silentDirectResult) {
          setActiveAssistantMessages((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: [
                `已直接收录「${file.name}」。`,
                `原始资料：${sourceFileCount} 个；标准记录：${recordCount} 条。`,
                requiredQuestions.length
                  ? `仍有 ${requiredQuestions.length} 项真实冲突待确认：${requiredQuestions.map((question) => question.label).join('、')}。`
                  : '模板、期间和逐条数据校验均已通过。',
              ].join('\n'),
            },
          ])
        }
        if (!requiredQuestions.length) {
          setActiveAssistantDrafts((current) => current.filter((item) => item.id !== draft.id))
          structuredIntakeByDraftId.current.delete(draft.id)
        }
        return { status: 'saved' as const, fileName: file.name, recordCount, client: saved.result.client, pendingCount: requiredQuestions.length }
      }
      const autoCleanMessages: AiAssistantMessage[] = [
        ...contextMessages,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: assistantUploadCustomerMessage(draft, file.name, parsedImport.taxDataIntake?.records.length || 0),
        },
      ]
      setActiveAssistantMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: assistantUploadCustomerMessage(draft, file.name, parsedImport.taxDataIntake?.records.length || 0),
        },
      ])
      await askAssistantToCleanUploadedDraft(draft, materialSummary, userNote
        ? [
            ...autoCleanMessages,
            {
              id: crypto.randomUUID(),
              role: 'user',
              content: `我对「${file.name}」的说明：${userNote}`,
            },
          ]
        : autoCleanMessages)
    } catch (error) {
      console.warn('Failed to import assistant file.', error)
      setAssistantError('文件解析失败，请检查 Excel、CSV、TSV、JSON、文本或 PDF 是否完整且未加密。')
      return { status: 'failed' as const, fileName: file?.name || '未知文件', recordCount: 0, reason: error instanceof Error ? error.message : String(error) }
    }
  }
  const handleAssistantDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault()
    setAssistantDragActive(false)
    if (assistantLoading) return
    addAssistantPendingFiles(event.dataTransfer.files)
  }
  const handleAssistantDragOver = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault()
    if (!assistantLoading) setAssistantDragActive(true)
  }
  const handleAssistantDragLeave = (event: React.DragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setAssistantDragActive(false)
  }
  const applyCleaningMessageToDraft = (message: string) => {
    const inferred = inferAssistantCleaningPatch(message, assistantDrafts[0]?.client)
    const resolvedFields = resolvedConfirmationFields(message, inferred?.patch || {})
    if (!inferred && !resolvedFields.size) return null
    if (!assistantDrafts.length && !inferred) return null
    const patch = inferred?.patch || {}
    const labels = Object.keys(patch).map(fieldLabel)
    const resolvedLabels = assistantDrafts[0]?.confirmationQuestions
      .filter((question) => resolvedFields.has(question.field))
      .map((question) => question.label) || []
    const changeDetail = [
      ...(inferred?.changes || []),
      ...(resolvedLabels.length ? [`已确认：${resolvedLabels.join('、')}`] : []),
    ].join('、')
    const now = formatDate()

    if (!assistantDrafts.length) {
      const draft = buildAssistantDraft(patch, {
        mappings: [],
        unmappedHeaders: [],
        detectedTables: [],
        sourceType: '对话确认',
      })
      draft.changeLog = [
        ...draft.changeLog,
        { id: crypto.randomUUID(), at: now, source: '用户确认', detail: changeDetail },
      ]
      draft.updatedAt = now
      setActiveAssistantDrafts([draft])
      return { labels, detail: changeDetail }
    }

    setActiveAssistantDrafts((current) => current.map((draft, index) => {
      if (index !== 0) return draft
      const client = applyExplicitDerivedPatch(draft.client, patch, '用户对话明确值')
      const confirmationQuestions = draft.confirmationQuestions.filter((question) => !resolvedFields.has(question.field))
      return {
        ...draft,
        client,
        labels: uniqueLabels([...draft.labels, ...labels]),
        changeLog: [
          { id: crypto.randomUUID(), at: now, source: '用户确认', detail: changeDetail },
          ...draft.changeLog,
        ].slice(0, 8),
        updatedAt: now,
        missingSaveLabels: validateClientForSave(client).map((issue) => issue.label).slice(0, 6),
        confirmationQuestions,
        rawMaterials: draft.rawMaterials.map((material) => ({
          ...material,
          confirmationQuestions: (material.confirmationQuestions || []).filter((question) => !resolvedFields.has(question.field)),
        })),
      }
    }))
    return { labels, detail: changeDetail }
  }
  const applyAssistantDraftPatch = (patch: Partial<Client> | undefined, source = 'AI 工具调用') => {
    if (!patch || !Object.keys(patch).length) return null
    const labels = Object.keys(patch).map(fieldLabel)
    const detail = labels.length ? `更新 ${labels.join('、')}` : '更新清洗草稿'
    const now = formatDate()

    if (!assistantDrafts.length) {
      const draft = buildAssistantDraft(patch, {
        mappings: [],
        unmappedHeaders: [],
        detectedTables: [],
        sourceType: source,
      })
      draft.changeLog = [
        { id: crypto.randomUUID(), at: now, source, detail },
        ...draft.changeLog,
      ]
      draft.updatedAt = now
      setActiveAssistantDrafts([draft])
      return { labels, detail }
    }

    setActiveAssistantDrafts((current) => current.map((draft, index) => {
      if (index !== 0) return draft
      const client = applyExplicitDerivedPatch(draft.client, patch, source)
      return {
        ...draft,
        client,
        labels: uniqueLabels([...draft.labels, ...labels]),
        changeLog: [
          { id: crypto.randomUUID(), at: now, source, detail },
          ...draft.changeLog,
        ].slice(0, 8),
        updatedAt: now,
        missingSaveLabels: validateClientForSave(client).map((issue) => issue.label).slice(0, 6),
      }
    }))
    return { labels, detail }
  }
  const appendAssistantSystemMessage = (content: string) => {
    setActiveAssistantMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'assistant', content },
    ])
  }
  const summarizeFilingChecklist = () => {
    const grouped = filingChecklist.reduce<Record<string, FilingChecklistItem[]>>((acc, item) => {
      acc[item.group] = [...(acc[item.group] || []), item]
      return acc
    }, {})
    return Object.entries(grouped).map(([group, items]) => {
      const lines = items.map((item) => {
        const status = item.status === 'ready'
          ? '已具备'
          : item.status === 'manual'
            ? '需人工确认'
            : item.status === 'optional'
              ? '按需补充'
              : '建议补充'
        const handling = item.handling === 'auto_import'
          ? '可自动导入'
          : item.handling === 'manual_confirm'
            ? '必须人工确认'
            : '可上传留档'
        return `- ${item.item}：${status}，${handling}。${item.note}`
      })
      return `${group}\n${lines.join('\n')}`
    }).join('\n\n')
  }
  const runAssistantChecklist = () => {
    if (taxDataSummary?.clientId === selectedClient.id && taxDataSummary.slotCatalog?.length) {
      const collectedSlots = taxDataSummary.slots.filter((slot) => taxDataSlotCoversMonth(slot, taxDataMonth))
      const collectedIds = new Set(collectedSlots.map((slot) => slot.slotId))
      const collectedNames = Array.from(new Set(collectedSlots.map((slot) => slot.name)))
      const missingItems = taxDataSummary.slotCatalog.filter((item) => !collectedIds.has(taxDataCatalogSlotId(item)))
      const missingNames = missingItems.map((item) => item.name)
      const historicalCoverage = missingItems.flatMap((item) => {
        const slotId = taxDataCatalogSlotId(item)
        const periods = Array.from(new Set(taxDataSummary.slots
          .filter((slot) => slot.status === 'collected' && slot.slotId === slotId && !taxDataSlotCoversMonth(slot, taxDataMonth))
          .map((slot) => slot.periodLabel)
          .filter(Boolean)))
        return periods.length ? [`${item.name}（${periods.join('、')}）`] : []
      })
      appendAssistantSystemMessage([
        `我按标准资料库核对了 ${taxDataMonth} 的企业资料：`,
        `本期已收录（${collectedNames.length}类）：${collectedNames.join('、') || '暂无'}。`,
        `本期尚未收录（${missingNames.length}类）：${missingNames.join('、') || '无'}。`,
        historicalCoverage.length ? `以下资料已在其他期间收录，本期仍缺：${historicalCoverage.join('、')}。` : '',
        '以上按期间分别判断；其他月份已有的资料不会误报为从未上传。',
      ].filter(Boolean).join('\n\n'))
      return
    }
    appendAssistantSystemMessage(`我按报税资料口径整理了当前客户资料清单：\n\n${summarizeFilingChecklist()}`)
  }
  const runAssistantBasicCompliance = () => {
    const lines = basicFindings.map((finding) => {
      const prefix = finding.level === 'ok' ? '通过' : finding.level === 'warning' ? '需复核' : '缺资料'
      return `- ${prefix}｜${finding.title}：${finding.detail}`
    })
    appendAssistantSystemMessage(`基础合规校验已完成。本板块只按已录入资料做确定性校验，不代表最终税务结论。\n\n${lines.join('\n')}`)
  }
  const runAssistantRiskDetection = () => {
    if (!risks.length) {
      appendAssistantSystemMessage('专业风险检测已运行：当前已录入资料下未命中中高风险规则。若资料不完整，仍建议先补充申报表、发票汇总、工资社保个税和往来明细后复核。')
      return
    }
    const lines = risks.slice(0, 8).map((risk) => `- ${plainRiskLevel(risk.level)}风险｜${risk.name}：${risk.reason(selectedClient)}`)
    appendAssistantSystemMessage(`专业风险检测已运行，当前命中 ${risks.length} 项，综合等级为${plainRiskLevel(getOverallLevel(risks))}风险。\n\n${lines.join('\n')}${risks.length > 8 ? '\n- 其余风险请在报告或风险检测页查看。' : ''}`)
  }
  const runAssistantReportGeneration = async () => {
    appendAssistantSystemMessage('我已收到生成报告指令，正在调用系统报告生成流程。报告仍基于已保存期间数据、连续期间选择和规则引擎结果生成。')
    await onGenerateReport()
  }
  const executeAssistantToolCalls = async (response: AiAssistantResponse) => {
    const results: string[] = []
    const draftPatch = response.draftPatch || {}
    const hasDraftPatch = Object.keys(draftPatch).length > 0
    const currentDraft = assistantDrafts[0]
    const verifiedContextClient = selectedClient.id === 'assistant-temp-client' ? null : selectedClient
    const draftForSave: AiAssistantDraft | null = currentDraft
      ? {
          ...currentDraft,
          client: applyExplicitDerivedPatch(currentDraft.client, draftPatch, 'AI 清洗确认值'),
        }
      : hasDraftPatch
        ? buildAssistantDraft(draftPatch, {
            mappings: [],
            unmappedHeaders: [],
            detectedTables: [],
            sourceType: 'AI 对话授权',
          })
        : verifiedContextClient
          ? buildAssistantDraft(verifiedContextClient, {
              mappings: [],
              unmappedHeaders: [],
              detectedTables: [],
              sourceType: '当前客户上下文',
            })
        : null
    const draftPatchResult = applyAssistantDraftPatch(response.draftPatch, 'AI 清洗')
    if (draftPatchResult) {
      results.push(`已更新清洗草稿：${draftPatchResult.detail}`)
    }

    const backendWriteToolCalls = (response.toolCalls || []).filter((toolCall) => assistantBackendWriteToolNames.has(toolCall.name))
    if (backendWriteToolCalls.length > 0) {
      if (!draftForSave) {
        results.push('暂未找到可保存的清洗草稿。')
      } else {
        const result = await onApplyClientDraft(draftForSave.client)
        if (result.status === 'saved' && result.client) {
          const ordinaryToolCalls = backendWriteToolCalls.filter((toolCall) => toolCall.name !== 'save_standardized_tax_data')
          if (ordinaryToolCalls.length) {
            results.push(...await executeAssistantSaveTool(result.client, ordinaryToolCalls, draftForSave))
          }
          const structuredMessages = await saveStructuredIntake(draftForSave, result.client)
          if (structuredMessages.length) {
            results.push(`已自动导入 ${Object.values(draftForSave.taxDataRecordCounts || {}).reduce((sum, value) => sum + value, 0)} 条标准记录。`)
          }
        }
        if (result.status === 'saved' && !result.message.includes('还缺') && currentDraft) {
          setActiveAssistantDrafts((current) => current.filter((item) => item.id !== currentDraft.id))
          structuredIntakeByDraftId.current.delete(currentDraft.id)
        }
        results.push(result.message)
      }
    }

    for (const toolCall of response.toolCalls || []) {
      if (toolCall.name === 'ask_missing_fields' && response.missingFields?.length) {
        results.push(`还需要确认：${response.missingFields.map((field) => field.label || field.field).join('、')}`)
      }
    }
    for (const toolCall of response.toolCalls || []) {
      if (toolCall.name === 'run_basic_compliance') {
        runAssistantBasicCompliance()
      } else if (toolCall.name === 'run_risk_detection') {
        runAssistantRiskDetection()
      } else if (toolCall.name === 'generate_report') {
        await runAssistantReportGeneration()
      } else if (toolCall.name === 'explain_current_report') {
        results.push(report
          ? `当前报告综合等级为${plainRiskLevel(report.riskLevel)}风险，包含 ${report.risks.length} 项规则命中。你可以继续问我某一项风险的依据、需要补充的资料或整改顺序。`
          : '当前还没有已生成报告。可以先保存期间数据，再让我生成报告。')
      }
    }
    return results
  }
  const askAssistant = async (message = assistantInput) => {
    const cleanMessage = message.trim()
    if ((!cleanMessage && !assistantPendingFiles.length) || assistantLoading) return
    if (assistantPendingFiles.length) {
      const directIntake = hasDirectIntakeAuthorization(cleanMessage)
      const filesToImport = directIntake
        ? [...assistantPendingFiles].sort((left, right) => Number(Boolean(extractCompanyNameFromText(right.name))) - Number(Boolean(extractCompanyNameFromText(left.name))))
        : assistantPendingFiles
      const attachmentSummary = filesToImport.map((file) => `- ${file.name}`).join('\n')
      const userContent = [
        attachmentSummary ? `上传文件：\n${attachmentSummary}` : '',
        cleanMessage ? `说明：${cleanMessage}` : '',
      ].filter(Boolean).join('\n\n')
      const nextMessages: AiAssistantMessage[] = [
        ...assistantMessages,
        { id: crypto.randomUUID(), role: 'user', content: userContent },
      ]
      setAssistantInput('')
      setAssistantPendingFiles([])
      updateAssistantThreadTitle(cleanMessage || filesToImport[0]?.name || '上传资料')
      setActiveAssistantMessages(nextMessages)
      setAssistantLoading(true)
      const processingStartedAt = Date.now()
      setAssistantProgress({
        totalFiles: filesToImport.length,
        currentFile: 1,
        completedFiles: 0,
        fileName: filesToImport[0]?.name || '上传资料',
        recordCount: 0,
        startedAt: processingStartedAt,
        elapsedSeconds: 0,
      })
      try {
        const outcomes: Array<Awaited<ReturnType<typeof importAssistantFile>>> = []
        let preferredClient = clients.find((client) => filesToImport.some((file) => extractCompanyNameFromText(file.name) === client.name))
        for (const [fileIndex, file] of filesToImport.entries()) {
          setAssistantProgress((current) => ({
            totalFiles: filesToImport.length,
            currentFile: fileIndex + 1,
            completedFiles: fileIndex,
            fileName: file.name,
            recordCount: current?.recordCount || 0,
            startedAt: current?.startedAt || processingStartedAt,
            elapsedSeconds: current?.elapsedSeconds || 0,
          }))
          const outcome = await importAssistantFile(file, cleanMessage, nextMessages, {
            silentDirectResult: directIntake && filesToImport.length > 1,
            preferredClient,
          })
          outcomes.push(outcome)
          if (outcome?.status === 'saved' && outcome.client) preferredClient = outcome.client
          setAssistantProgress((current) => current ? {
            ...current,
            completedFiles: fileIndex + 1,
            recordCount: current.recordCount + (outcome?.status === 'saved' ? outcome.recordCount : 0),
            elapsedSeconds: Math.max(1, (Date.now() - current.startedAt) / 1000),
          } : current)
        }
        if (directIntake && filesToImport.length > 1) {
          const saved = outcomes.filter((outcome) => outcome?.status === 'saved')
          const exceptions = outcomes.filter((outcome) => outcome?.status === 'blocked' || outcome?.status === 'failed')
          const pending = saved.filter((outcome) => (outcome?.pendingCount || 0) > 0)
          const recordCount = saved.reduce((sum, outcome) => sum + (outcome?.recordCount || 0), 0)
          setActiveAssistantMessages((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: [
                `整批处理完成：已收录 ${saved.length}/${filesToImport.length} 个文件，共 ${recordCount} 条标准记录。`,
                preferredClient?.name ? `归档企业：${preferredClient.name}。` : '',
                exceptions.length
                  ? `有 ${exceptions.length} 个文件未入库，需要确认：\n${exceptions.map((outcome) => `- ${outcome?.fileName}：${outcome && 'reason' in outcome ? outcome.reason : '解析失败'}`).join('\n')}`
                  : pending.length
                    ? `有 ${pending.length} 个文件存在跨资料冲突，已标记待确认：\n${pending.map((outcome) => `- ${outcome?.fileName}：${outcome?.pendingCount} 项`).join('\n')}`
                    : '全部文件均已通过模板、期间和逐条数据校验，无需重复确认。',
              ].filter(Boolean).join('\n\n'),
            },
          ])
        }
      } finally {
        setAssistantProgress(null)
        setAssistantLoading(false)
      }
      return
    }
    const parsedTextDraft: AiAssistantDraft | null = (() => {
      try {
        return addAssistantDraftFromParsedImport(parseClientImportText(cleanMessage))
      } catch {
        return null
      }
    })()
    const nextMessages: AiAssistantMessage[] = [
      ...assistantMessages,
      { id: crypto.randomUUID(), role: 'user', content: cleanMessage },
    ]
    setAssistantInput('')
    updateAssistantThreadTitle(cleanMessage)
    setActiveAssistantMessages(nextMessages)
    const instantReply = instantAssistantReply(cleanMessage)
    if (instantReply) {
      setActiveAssistantMessages([...nextMessages, { id: crypto.randomUUID(), role: 'assistant', content: instantReply }])
      return
    }
    if (isArchiveChecklistQuestion(cleanMessage)) {
      runAssistantChecklist()
      return
    }
    if (parsedTextDraft) {
      setActiveAssistantMessages([
        ...nextMessages,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `已整理出 ${parsedTextDraft.labels.length} 个可填字段。请直接在对话里确认是否导入；如果无误，回复“确认导入”或“按这个保存”。`,
        },
      ])
      setAssistantInput('')
      return
    }
    const cleaningUpdate = applyCleaningMessageToDraft(cleanMessage)
    if (cleaningUpdate) {
      setActiveAssistantMessages([
        ...nextMessages,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `已更新清洗后数据：${cleaningUpdate.detail}`,
        },
      ])
      setAssistantInput('')
      return
    }
    setAssistantLoading(true)
    setAssistantError('')
    try {
      const response = await apiSend<AiAssistantResponse>('/api/ai/assistant', 'POST', {
        message: cleanMessage,
        history: assistantMessages.map((item) => ({ role: item.role, content: item.content })),
        client: assistantDrafts[0]?.client || selectedClient,
        risks: assistantDrafts.length ? [] : risks,
        report: assistantDrafts.length ? null : report,
        assistantContext: buildAssistantContext(),
      })
      setActiveAssistantMessages([
        ...nextMessages,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: sanitizeAssistantAnswer(response.answer),
          response,
        },
      ])
      const toolResults = await executeAssistantToolCalls(response)
      if (toolResults.length) {
        setActiveAssistantMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: toolResults.join('\n'),
          },
        ])
      }
      setAssistantInput('')
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : String(error))
    } finally {
      setAssistantLoading(false)
    }
  }

  return (
    <section className="page assistant-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">AI 工作台</p>
          <h2>AI 财税助手</h2>
        </div>
      </header>
      <div className="assistant-workspace">
        <aside className="assistant-thread-sidebar">
          <button type="button" className="primary-button compact-button assistant-new-thread" onClick={startAssistantThread}>
            <Plus /> 新对话
          </button>
          <div className="assistant-thread-list">
            {assistantThreads.map((thread) => (
              <button
                type="button"
                key={thread.id}
                className={thread.id === activeAssistantThread?.id ? 'assistant-thread-item active' : 'assistant-thread-item'}
                onClick={() => {
                  setActiveAssistantThreadId(thread.id)
                  setAssistantInput('')
                  setAssistantError('')
                  setAssistantNotice('')
                }}
              >
                <span>
                  <strong>{thread.title}</strong>
                  <small>{thread.messages.length} 条消息 · {thread.drafts.length} 个草稿</small>
                </span>
                <i
                  role="button"
                  tabIndex={0}
                  aria-label="删除对话"
                  title="删除对话"
                  onClick={(event) => {
                    event.stopPropagation()
                    removeAssistantThread(thread.id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      event.stopPropagation()
                      removeAssistantThread(thread.id)
                    }
                  }}
                >
                  <Trash2 />
                </i>
              </button>
            ))}
          </div>
        </aside>
        <section className="ai-assistant-panel assistant-page-panel">
          <input
            ref={assistantFileInputRef}
            className="assistant-hidden-file-input"
            type="file"
            accept=".json,.csv,.tsv,.txt,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp,.ppt,.pptx"
            multiple
            onChange={(event) => {
              addAssistantPendingFiles(event.target.files || [])
              event.currentTarget.value = ''
            }}
          />
          <div className="assistant-workflow-panel">
            <button type="button" onClick={runAssistantChecklist}>
              <ClipboardList /> 资料清单
            </button>
            <button type="button" onClick={runAssistantBasicCompliance}>
              <ShieldCheck /> 基础校验
            </button>
            <button type="button" onClick={runAssistantRiskDetection}>
              <Gauge /> 专业风险
            </button>
            <button type="button" onClick={() => void runAssistantReportGeneration()}>
              <FileText /> 生成报告
            </button>
            <span>{dataCompleteness.label} · {dataCompleteness.score}% · {risks.length} 项风险线索</span>
          </div>
          <div
            className="ai-assistant-chat"
            aria-live="polite"
          >
              {assistantMessages.length ? (
                assistantMessages.map((item) => (
                  <article key={item.id} className={`ai-assistant-message ${item.role}`}>
                    <strong>{item.role === 'user' ? '你' : 'AI 助手'}</strong>
                    <div className="ai-assistant-message-content">
                      {assistantMessageBlocks(item.content).map((block, index) => (
                        block.type === 'list' ? (
                          <ol key={`list-${index}`}>
                            {block.items.map((listItem) => (
                              <li key={listItem}>
                                <span>{listItem}</span>
                                {item.role === 'assistant' && isBinaryAssistantQuestion(listItem) ? (
                                  <span className="assistant-binary-actions" aria-label={`回答：${listItem}`}>
                                    <button type="button" onClick={() => void askAssistant(binaryAssistantReplyMessage(listItem, '是'))} disabled={assistantLoading}>是</button>
                                    <button type="button" onClick={() => void askAssistant(binaryAssistantReplyMessage(listItem, '否'))} disabled={assistantLoading}>否</button>
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p key={`paragraph-${index}`}>{block.text}</p>
                        )
                      ))}
                    </div>
                    {item.response?.clientVerified === false ? (
                      <small>当前企业尚未入库，本轮先按临时内容处理。</small>
                    ) : null}
                    {item.response?.suggestions.length ? (
                      <div className="ai-assistant-suggestions">
                        {item.response.suggestions.map((suggestion, index) => (
                          <div key={`${suggestion.field}-${index}`}>
                            <strong>{suggestion.label || suggestion.field}</strong>
                            <span>{String(suggestion.value ?? '')}</span>
                            <small>{suggestion.target} / {suggestion.confidence} / {suggestion.source || 'AI 识别'}</small>
                            {suggestion.note ? <p>{suggestion.note}</p> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {item.response?.followUps.length ? (
                      <ul>
                        {item.response.followUps.map((followUp) => <li key={followUp}>{followUp}</li>)}
                      </ul>
                    ) : null}
                  </article>
                ))
              ) : (
                <div className="ai-assistant-empty-chat" aria-hidden="true" />
              )}
              {showAssistantProcessingMessage ? (
                <article className="ai-assistant-message assistant">
                  <strong>AI 助手</strong>
                  {assistantProgressText.split('\n').map((line) => <p key={line}>{line}</p>)}
                </article>
              ) : null}
            </div>
            <div
              className={`ai-assistant-composer ${assistantDragActive ? 'drag-active' : ''}`}
              onDrop={handleAssistantDrop}
              onDragOver={handleAssistantDragOver}
              onDragEnter={handleAssistantDragOver}
              onDragLeave={handleAssistantDragLeave}
            >
              {assistantPendingFiles.length ? (
                <div className="ai-assistant-attachments" aria-label="待发送附件">
                  {assistantPendingFiles.map((file, index) => (
                    <span key={`${file.name}-${file.size}-${index}`}>
                      <FileText />
                      {file.name}
                      <button type="button" aria-label={`移除 ${file.name}`} onClick={() => removeAssistantPendingFile(index)}>×</button>
                    </span>
                  ))}
                </div>
              ) : null}
              <textarea
                value={assistantInput}
                onChange={(event) => setAssistantInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
                  event.preventDefault()
                  void askAssistant()
                }}
                placeholder="把文件拖到这里，也可以补充说明：这是2025年3月工资表/明细账/申报表。"
              />
            </div>
            <div className="ai-assistant-actions">
              <button type="button" className="primary-button" onClick={() => void askAssistant()} disabled={assistantLoading || (!assistantInput.trim() && !assistantPendingFiles.length)}>
                <Sparkles /> {assistantLoading ? '正在处理...' : '发送'}
              </button>
              <button type="button" className="secondary-button compact-button" onClick={() => assistantFileInputRef.current?.click()} disabled={assistantLoading}>
                <FileText /> 上传文件
              </button>
            </div>
            {assistantNotice ? <div className="ai-assistant-notice">{assistantNotice}</div> : null}
            {assistantError ? <div className="ai-assistant-error">{assistantError}</div> : null}
        </section>
        <aside className="assistant-status-panel" aria-label="当前处理状态">
          <div>
            <span>当前企业</span>
            <strong>{currentAssistantDraft?.client.name || selectedClient.name || '待确认'}</strong>
          </div>
          <div>
            <span>已上传资料</span>
            <strong>{currentUploadCount} 份</strong>
            {currentMaterialSummary?.fileName ? <small>{currentMaterialSummary.fileName}</small> : null}
          </div>
          <div>
            <span>待确认问题</span>
            <strong>{currentQuestionCount} 项</strong>
            <small>{currentQuestionCount ? '请直接在对话里回答' : '暂无必须确认项'}</small>
          </div>
          <div>
            <span>可收录数据</span>
            <strong>{currentRecordCount} 条</strong>
            <small>{currentRecordCount ? '确认后自动入库' : '上传资料后自动识别'}</small>
          </div>
          <div>
            <span>资料完整度</span>
            <strong>{dataCompleteness.score}%</strong>
            <small>{dataCompleteness.label}</small>
          </div>
        </aside>
      </div>
    </section>
  )
}

function ReportPage({
  report,
  client,
  risks,
  onGenerate,
  aiStage,
  onUpdate,
}: {
  report?: Report
  client: Client
  risks: RiskResult[]
  onGenerate: () => void
  aiStage: 'reviewing' | 'generating' | null
  onUpdate: (content: string) => void
}) {
  const safeRisks = Array.isArray(risks) ? risks : []
  const structured = isCompleteStructuredReport(report?.structured)
    ? report.structured
    : buildStructuredReport(client, safeRisks)
  const fallbackContent = report ? reportTextContent(report) : buildProfessionalReportContent(structured)
  const draft = sanitizePublicReportContent(fallbackContent || buildReportContent(client, safeRisks))
  const aiMessage = aiStage === 'reviewing'
    ? 'AI 正在复核数据...'
    : aiStage === 'generating'
      ? 'AI 正在生成报告...'
      : ''
  const aiStepText = aiStage === 'reviewing'
    ? '正在比对企业输入数据、规则条件和命中结果，识别字段冲突、边界值和需要人工复核的事项。'
    : '正在把确定性规则结果和数据复核意见整合成正式税务风险体检报告。'
  const [assistantInput, setAssistantInput] = useState('')
  const [assistantResponse, setAssistantResponse] = useState<AiAssistantResponse | null>(null)
  const [assistantLoading, setAssistantLoading] = useState(false)
  const [assistantError, setAssistantError] = useState('')
  const assistantExamples = [
    '解释当前报告，告诉我应该先和客户沟通什么。',
    '我把客户发来的利润表粘贴给你，请识别能填入系统的字段。',
    '帮我生成一段发给客户的补资料微信话术。',
  ]
  const askAssistant = async (message = assistantInput) => {
    const cleanMessage = message.trim()
    if (!cleanMessage || assistantLoading) return
    setAssistantInput('')
    setAssistantLoading(true)
    setAssistantError('')
    try {
      const response = await apiSend<AiAssistantResponse>('/api/ai/assistant', 'POST', {
        message: cleanMessage,
        client,
        risks: safeRisks,
        report,
      })
      setAssistantResponse(response)
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : String(error))
    } finally {
      setAssistantLoading(false)
    }
  }
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">报告预览</p>
          <h2>{client.name}</h2>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={onGenerate} disabled={Boolean(aiStage)}>
            <Sparkles /> {aiMessage || '重新生成'}
          </button>
          <button
            className="primary-button"
            disabled={Boolean(aiStage)}
            onClick={() => downloadWord(report || {
              id: crypto.randomUUID(),
              clientId: client.id,
              clientName: client.name,
              riskLevel: getOverallLevel(safeRisks),
              createdAt: formatDate(),
              risks: safeRisks,
              content: draft,
              structured,
            })}
          >
            <Download /> 导出 Word
          </button>
          <button
            className="secondary-button"
            disabled={Boolean(aiStage)}
            onClick={() => printReportPdf(report || {
              id: crypto.randomUUID(),
              clientId: client.id,
              clientName: client.name,
              riskLevel: getOverallLevel(safeRisks),
              createdAt: formatDate(),
              risks: safeRisks,
              content: draft,
              structured,
            })}
          >
            <Printer /> 打印 / PDF
          </button>
        </div>
      </header>
      {aiStage ? (
        <div className="ai-process-panel">
          <div className="ai-orbit" aria-hidden="true">
            <Sparkles />
          </div>
          <p className="eyebrow">AI 税务风控流程</p>
          <h3>{aiMessage}</h3>
          <p>{aiStepText}</p>
          <div className="ai-process-steps">
            <span className="done">规则引擎检测完成</span>
            <span className={aiStage === 'reviewing' ? 'active' : 'done'}>AI 复核数据</span>
            <span className={aiStage === 'generating' ? 'active' : ''}>AI 生成报告</span>
          </div>
          <small>在 AI 完成复核和生成前，系统不会展示未经核对的模板报告。</small>
        </div>
      ) : (
        <div className="report-workspace">
          <section className="ai-assistant-panel">
            <div className="ai-assistant-header">
              <div>
                <p className="eyebrow">AI 财税工作助理</p>
                <h3>可以解释报告，也可以把粘贴资料整理成待确认草稿</h3>
              </div>
              <span>不会自动写入数据</span>
            </div>
            <div className="ai-assistant-examples">
              {assistantExamples.map((example) => (
                <button type="button" key={example} onClick={() => void askAssistant(example)} disabled={assistantLoading}>
                  {example}
                </button>
              ))}
            </div>
            <textarea
              value={assistantInput}
              onChange={(event) => setAssistantInput(event.target.value)}
              placeholder="可以直接粘贴利润表、资产负债表、客户微信文字，或问：这份报告怎么和客户解释？"
            />
            <div className="ai-assistant-actions">
              <button type="button" className="primary-button" onClick={() => void askAssistant()} disabled={assistantLoading || !assistantInput.trim()}>
                <Sparkles /> {assistantLoading ? 'AI 正在处理...' : '发送给 AI 助手'}
              </button>
              <small>AI 只生成建议和预填草稿，应用到系统前需要人工确认。</small>
            </div>
            {assistantError ? <div className="ai-assistant-error">{assistantError}</div> : null}
            {assistantResponse ? (
              <div className="ai-assistant-result">
                <article>
                  <h4>AI 回复</h4>
                  <p>{assistantResponse.answer}</p>
                </article>
                {assistantResponse.suggestions.length ? (
                  <article>
                    <h4>待确认字段草稿</h4>
                    <div className="ai-assistant-suggestions">
                      {assistantResponse.suggestions.map((item, index) => (
                        <div key={`${item.field}-${index}`}>
                          <strong>{item.label || item.field}</strong>
                          <span>{String(item.value ?? '')}</span>
                          <small>{item.target} · {item.confidence} · {item.source || 'AI 识别'}</small>
                          {item.note ? <p>{item.note}</p> : null}
                        </div>
                      ))}
                    </div>
                  </article>
                ) : null}
                {assistantResponse.followUps.length ? (
                  <article>
                    <h4>建议补充资料</h4>
                    <ul>
                      {assistantResponse.followUps.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </article>
                ) : null}
              </div>
            ) : null}
          </section>
          <div className="professional-report-layout">
            <aside>
              <h3>报告目录</h3>
              {['项目背景及工作范围', '报告摘要：我们的观点', '重要事项汇总', '分税种风险摘要', '重要事项章节', '专家核查清单', '责任边界'].map((item) => (
                <span key={item}>{item}</span>
              ))}
            </aside>
            <div className="professional-report-main">
              <StructuredReportPreview report={structured} />
              <details className="report-plain-editor">
                <summary>查看 / 微调纯文本版本</summary>
                <textarea value={draft} onChange={(event) => onUpdate(event.target.value)} />
              </details>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default App
