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
  Gauge,
  Info,
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
import {
  areMonthsContinuous,
  createPeriodEntry,
  findPeriodConsistencyWarnings,
  formatAnalysisPeriod,
  formatMonthRange,
  getClientPeriodMonths,
  monthFromIndex,
  monthIndex,
  summarizePeriodEntries,
  upsertPeriodEntry,
  type AnalysisPeriodType,
  type AnalysisQuarter,
  type DataBasis,
  type PeriodEntry,
} from './lib/periodAnalysis'
import './App.css'

type Page = 'dashboard' | 'clients' | 'form' | 'result' | 'report' | 'reports' | 'rules' | 'admin'
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

type Report = {
  id: string
  clientId: string
  clientName: string
  riskLevel: RiskLevel
  createdAt: string
  risks: RiskResult[]
  content: string
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
  dataBasis: '',
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

function attachDemoPeriod(client: Client): Client {
  const snapshot = { ...client, periodEntries: [] }
  const periodEntry = createPeriodEntry(client, snapshot, '2026/06/23 10:00:00')
  return { ...client, periodEntries: [periodEntry] }
}

function createDemoClient(seed: Partial<Client>): Client {
  return attachDemoPeriod({
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

const demoClients: Client[] = createDemoClients()
const demoCaseCreditCodes = new Set(demoClients.map((client) => client.creditCode))

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
]

const allBuiltInRules = [...rules, ...candidateRules]

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
  分析口径: 'required',
  所属年度: 'required',
  所属季度: 'conditional',
  所属月份: 'conditional',
  期间开始: 'conditional',
  期间结束: 'conditional',
  数据口径: 'required',
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

function periodRequirementLabels(client: Client) {
  const labels = ['分析口径', '所属年度', '数据口径']
  if (client.analysisPeriodType === '季度') labels.push('所属季度')
  if (client.analysisPeriodType === '月度') labels.push('所属月份')
  if (client.analysisPeriodType === '年初至今' || client.analysisPeriodType === '自定义期间') {
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

  add('name', '企业名称', isBlankText(client.name))
  add('creditCode', '统一社会信用代码', isBlankText(client.creditCode))
  add('region', '地区', isBlankText(client.region))
  add('industry', '行业', !hasValidIndustry(client.industry))
  add('taxpayerType', '纳税人类型', isBlankText(client.taxpayerType))
  add('establishedAt', '成立时间', isBlankText(client.establishedAt))
  add('analysisPeriodType', '分析口径', isBlankText(client.analysisPeriodType))
  add('analysisYear', '所属年度', isBlankText(client.analysisYear))
  add('analysisQuarter', '所属季度', client.analysisPeriodType === '季度' && isBlankText(client.analysisQuarter), '季度分析需要选择所属季度')
  add('analysisMonth', '所属月份', client.analysisPeriodType === '月度' && isBlankText(client.analysisMonth), '月度分析需要选择所属月份')
  add('periodStartDate', '期间开始', (client.analysisPeriodType === '年初至今' || client.analysisPeriodType === '自定义期间') && isBlankText(client.periodStartDate), '期间分析需要填写开始日期')
  add('periodEndDate', '期间结束', (client.analysisPeriodType === '年初至今' || client.analysisPeriodType === '自定义期间') && isBlankText(client.periodEndDate), '期间分析需要填写结束日期')
  add('dataBasis', '数据口径', isBlankText(client.dataBasis))
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
    dataBasis: (client.dataBasis ?? '') as DataBasis,
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

function applyAutoDerivedMetrics(_previous: Client, next: Client) {
  return deriveClientMetrics(next)
}

function getManualOverrideErrors(client: Client) {
  return autoDerivedFieldConfigs.filter((field) => (
    isManualDerivedField(client, field.key) && !String(client.manualDerivedReasons?.[String(field.key)] || '').trim()
  ))
}

const importFieldAliases: Record<string, keyof Client> = {
  企业名称: 'name',
  统一社会信用代码: 'creditCode',
  地区: 'region',
  行业: 'industry',
  纳税人类型: 'taxpayerType',
  成立时间: 'establishedAt',
  分析口径: 'analysisPeriodType',
  分析类型: 'analysisPeriodType',
  分析期间: 'analysisPeriodType',
  所属年度: 'analysisYear',
  年度: 'analysisYear',
  所属季度: 'analysisQuarter',
  季度: 'analysisQuarter',
  所属月份: 'analysisMonth',
  月份: 'analysisMonth',
  期间开始: 'periodStartDate',
  期间起始日: 'periodStartDate',
  开始日期: 'periodStartDate',
  期间结束: 'periodEndDate',
  期间截止日: 'periodEndDate',
  结束日期: 'periodEndDate',
  数据口径: 'dataBasis',
  数据来源口径: 'dataBasis',
  对比期间: 'comparisonPeriod',
  月收入: 'monthlyRevenue',
  月成本费用: 'monthlyCost',
  月利润: 'monthlyProfit',
  年销售收入: 'annualRevenue',
  收款流水: 'collectionFlow',
  员工人数: 'employees',
  社保人数: 'socialSecurityCount',
  工资申报人数: 'salaryDeclaredCount',
  上季度末人数: 'previousQuarterEmployees',
  本季度收入: 'quarterRevenue',
  上季度收入: 'previousQuarterRevenue',
  本季度成本费用: 'quarterCostExpense',
  上季度成本费用: 'previousQuarterCostExpense',
  本年累计收入: 'ytdRevenue',
  本年累计成本费用: 'ytdCostExpense',
  本年累计利润: 'ytdProfit',
  预算收入: 'budgetRevenue',
  上年同期收入: 'previousYearRevenue',
  主营业务收入: 'mainBusinessRevenue',
  主营业务成本: 'mainBusinessCost',
  人员相关成本费用: 'peopleRelatedExpense',
  承租面积: 'rentalArea',
  转租面积: 'subleaseArea',
  装修费用: 'decorationExpense',
  月开票金额: 'monthlyInvoice',
  连续12个月销售额: 'consecutive12MonthSales',
  平台收入: 'platformRevenue',
  销项税额: 'outputTax',
  进项税额: 'inputTax',
  增值税应纳税额: 'vatTaxPayable',
  增值税入库税额: 'vatTaxPayable',
  增值税应税销售额: 'taxableSales',
  理论增值税税额: 'theoreticalVatTax',
  预算增值税税额: 'budgetVatTax',
  上期应税销售额: 'priorTaxableSales',
  上期增值税税额: 'priorVatTaxPayable',
  业务招待费: 'entertainmentExpense',
  广告宣传费: 'adExpense',
  职工福利费: 'welfareExpense',
  工会经费: 'unionExpense',
  职工教育经费: 'educationExpense',
  应纳税所得额: 'taxableIncome',
  资产总额: 'assetsTotal',
  全年平均人数: 'employeeAnnualAvg',
  营业外支出发生额: 'nonOperatingExpense',
  营业外收入发生额: 'nonOperatingIncome',
  其他应收代收代付余额: 'otherReceivableAgencyBalance',
  工资薪金总额: 'payrollTotal',
  向个人支付非工资薪金所得: 'nonPayrollPersonalPayment',
}

const clientFieldLabels = Object.entries(importFieldAliases).reduce<Record<string, string>>((labels, [label, field]) => {
  if (!labels[String(field)] || label.length < labels[String(field)].length) {
    labels[String(field)] = label
  }
  return labels
}, {})

function normalizeImportKey(key: string) {
  return key.replace(/[：:\s（）()_/-]/g, '').trim()
}

function resolveImportField(key: string): keyof Client | null {
  const normalized = normalizeImportKey(key)
  const direct = importFieldAliases[key] || importFieldAliases[normalized]
  if (direct) return direct
  const matched = Object.entries(importFieldAliases).find(([label]) => normalizeImportKey(label) === normalized)
  if (matched) return matched[1]
  return conditionFields.some((field) => field.value === key) ? key as keyof Client : null
}

function parseDelimitedRows(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/,|\t/).map((cell) => cell.trim()))
}

function parseClientImportRows(rows: string[][]) {
  const patch: Partial<Client> = {}
  if (!rows.length) return patch

  const firstRowLooksLikeHeader = rows[0].length > 2
  if (firstRowLooksLikeHeader && rows[1]) {
    rows[0].forEach((header, index) => {
      const field = resolveImportField(header)
      if (field) patch[field] = rows[1][index] as never
    })
  } else {
    rows.forEach(([key, value]) => {
      const field = resolveImportField(key)
      if (field) patch[field] = value as never
    })
  }

  return patch
}

function parseClientImportText(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return {}
  if (trimmed.startsWith('{')) return JSON.parse(trimmed) as Partial<Client>

  return parseClientImportRows(parseDelimitedRows(trimmed))
}

async function parseClientImportWorkbook(buffer: ArrayBuffer) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName = workbook.SheetNames.find((name) => {
    const sheet = workbook.Sheets[name]
    return sheet && XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }).length > 0
  })
  if (!sheetName) return {}

  const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | Date | null>>(workbook.Sheets[sheetName], {
    header: 1,
    blankrows: false,
    defval: '',
    raw: false,
  })
    .map((row) => row.map((cell) => String(cell ?? '').trim()))
    .filter((row) => row.some(Boolean))

  return parseClientImportRows(rows)
}

function coerceImportedClientPatch(patch: Partial<Client>) {
  const coerced: Partial<Client> = {}
  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    const current = emptyClient[key as keyof Client]
    coerced[key as keyof Client] = (typeof current === 'number'
      ? Number(String(value).replace(/,/g, '')) || 0
      : typeof current === 'boolean'
        ? ['true', '是', '1', 'yes', 'Y'].includes(String(value).trim())
        : value) as never
  })
  return coerced
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
  return client.projectScope || '单主体'
}

function getEntityRole(client: Client): EntityRole {
  return (client.entityRole || (getProjectScope(client) === '集团项目' ? '经营主体' : '单体企业')) as EntityRole
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
  return conditionFields.find((item) => item.value === field)?.label || clientFieldLabels[field] || field
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
触发原因：${risk.reason(client)}
整改建议：${risk.suggestion}
需补资料：${risk.materials.join('、')}`).join('\n') : '本章节暂未命中风险。'}`)
    .join('\n\n')
  const groupName = getGroupName(client)
  const riskSummary = risks
    .slice(0, 8)
    .map((risk, index) => `${index + 1}. 【${risk.level}风险】${riskDisplayTitle(risk)}：${risk.reason(client)}`)
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
数据口径：${client.dataBasis || '未填写'}
对比期间：${client.comparisonPeriod || '未填写'}
最近检测时间：${formatDate()}

二、综合风险结论
本次系统共命中 ${risks.length} 项风险提示，其中高风险 ${highCount} 项，中风险 ${mediumCount} 项，综合风险等级为【${level}】。
${reportMissingFields.length ? `本次基础检测资料仍缺少：${validationSummary(reportMissingFields)}。报告结论应作为风险线索参考，补齐资料后建议重新生成。` : '本次基础检测必填资料已补齐，可支持初步风险判断。'}
本结论基于已选档案期间数据和系统规则库生成，建议由财税专业人员结合原始凭证、账套、申报表、合同、资金流水进一步复核。
本报告仅适用于上述数据期间和数据口径；期间或口径变化后，建议重新生成报告。

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
触发原因：${risk.reason(client)}
政策/案例依据：${risk.basis}
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

function sanitizePublicReportContent(content: string) {
  return content
    .replace(/[（(]\s*Issue\s+[A-Z-]*\d+\s*[)）]/gi, '')
    .replace(/\bIssue\s+[A-Z-]*\d+\b/gi, '风险事项')
    .replace(/\b(issueId|code)\s*[:：=]\s*[A-Z-]*\d+\b/gi, '')
    .replace(/\b[a-z][A-Za-z0-9_]*(?:\s*[=!<>]=?\s*(?:true|false|\d+(?:\.\d+)?|'[^']*'|"[^"]*"))/g, '相关规则条件')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function downloadWord(report: Report) {
  const safeContent = sanitizePublicReportContent(report.content)
  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${report.clientName}税务风险体检报告</title>
        <style>
          body { font-family: "Microsoft YaHei", SimSun, sans-serif; line-height: 1.75; color: #1f2937; }
          h1 { font-size: 24px; text-align: center; }
          pre { white-space: pre-wrap; font-family: "Microsoft YaHei", SimSun, sans-serif; font-size: 14px; }
        </style>
      </head>
      <body><pre>${escapeHtml(safeContent)}</pre></body>
    </html>`
  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${report.clientName}-税务风险体检报告.doc`
  link.click()
  URL.revokeObjectURL(url)
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function apiGet<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

async function apiSend<T>(url: string, method: 'POST' | 'PUT', body: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error || data?.detail || `API request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

async function apiDelete<T>(url: string): Promise<T> {
  const response = await fetch(url, { method: 'DELETE' })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error || data?.detail || `API request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
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
      resize = () => chart?.resize()
      observer = new ResizeObserver(resize)
      observer.observe(container)
      window.addEventListener('resize', resize)
    }

    mountChart()

    return () => {
      disposed = true
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
  const [clients, setClients] = useState<Client[]>(demoClients)
  const [selectedClientId, setSelectedClientId] = useState(demoClients[0].id)
  const [editingClient, setEditingClient] = useState<Client>(blankDraftClient())
  const [reports, setReports] = useState<Report[]>([])
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([])
  const [managedRules, setManagedRules] = useState<ManagedRule[]>([])
  const [restrictedRuleCount, setRestrictedRuleCount] = useState(0)
  const [ruleDraft, setRuleDraft] = useState<ManagedRule>(emptyManagedRule)
  const [editingRuleCode, setEditingRuleCode] = useState('')
  const [selectedPeriodEntryIds, setSelectedPeriodEntryIds] = useState<string[]>([])
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

        const normalizedClients = clientsResponse.clients.map((client) => deriveClientMetrics(normalizeClient(client)))
        const visibleClients = normalizedClients.length ? normalizedClients : createDemoClients()
        setClients(visibleClients)
        setReports(reportsResponse.reports)
        if (visibleClients[0]) {
          setSelectedClientId(visibleClients[0].id)
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
  const selectedPeriodEntries = useMemo(() => {
    if (!selectedClient) return []
    const selected = selectedClient.periodEntries.filter((entry) => selectedPeriodEntryIds.includes(entry.id))
    return selected.sort((a, b) => monthIndex(a.months[0] || '') - monthIndex(b.months[0] || ''))
  }, [selectedClient, selectedPeriodEntryIds])
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
  const dashboardLevelRows = useMemo<ChartDatum[]>(() => {
    const clientStats = clients.map((client) => detectRisks(client, managedRules))
    return [
      { name: '高风险企业', value: clientStats.filter((risks) => getOverallLevel(risks) === '高').length },
      { name: '中风险企业', value: clientStats.filter((risks) => getOverallLevel(risks) === '中').length },
      { name: '低风险企业', value: clientStats.filter((risks) => getOverallLevel(risks) === '低').length },
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
  const dashboardLevelOption = useMemo<EChartsOption>(() => ({
    color: ['#b63136', '#b76a20', '#0c8c82'],
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['52%', '78%'],
        center: ['50%', '50%'],
        label: { color: '#102027', formatter: '{b}\n{c}' },
        data: dashboardLevelRows,
      },
    ],
  }), [dashboardLevelRows])
  const dashboardTaxOption = useMemo<EChartsOption>(() => ({
    color: ['#12aeea'],
    tooltip: { trigger: 'axis' },
    grid: { left: 24, right: 16, top: 18, bottom: 32, containLabel: true },
    xAxis: { type: 'category', data: dashboardTaxRows.map((row) => row.name), axisLabel: { color: '#637781' } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#637781' }, splitLine: { lineStyle: { color: 'rgba(31, 71, 82, 0.12)' } } },
    series: [{ type: 'bar', data: dashboardTaxRows.map((row) => row.value), barMaxWidth: 34, itemStyle: { borderRadius: [6, 6, 0, 0] } }],
  }), [dashboardTaxRows])
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
        radius: '72%',
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
  const periodEntriesForMonth = (client: Client, year: string, monthIndexValue: number) => {
    const month = `${year}-${String(monthIndexValue + 1).padStart(2, '0')}`
    return client.periodEntries.filter((entry) => entry.months.includes(month))
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
    setPage('result')
  }

  const analyzeMonth = (client: Client, entries: ClientPeriodEntry[]) => {
    if (!entries.length) return
    setSelectedClientId(client.id)
    setSelectedPeriodEntryIds([entries[0].id])
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

  const loadRiskDemoCases = async () => {
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

    try {
      await Promise.all(
        demoCases.map((client) =>
          apiSend<{ client: Client }>('/api/clients', 'POST', {
            ...client,
            riskLevel: getOverallLevel(detectRisks(client, managedRules)),
          }),
        ),
      )
      setDataStatus('connected')
      window.alert('已载入低风险、中风险、高风险 3 个测试案例。')
    } catch (error) {
      console.warn('Demo cases saved locally only.', error)
      setDataStatus('fallback')
      window.alert('已在本地载入测试案例；当前环境未连接后端，刷新后可能不会保留。')
    }
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
        candidateRules.map((rule) =>
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
      ...normalizeClient(editingClient),
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
      focusFieldByLabel('分析口径')
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
    const baseReport: Report = {
      id: crypto.randomUUID(),
      clientId: reportClient.id,
      clientName: reportClient.name,
      riskLevel: getOverallLevel(risks),
      createdAt: formatDate(),
      risks,
      content: buildReportContent(reportClient, risks),
    }
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
      const reviewStartedAt = Date.now()
      const reviewResponse = await apiSend<{ review: AiReview; model: string; usage?: unknown }>('/api/ai/review', 'POST', {
        client: reportClient,
        risks: risksForAi,
      })
      const reviewElapsed = Date.now() - reviewStartedAt
      if (reviewElapsed < 2000) {
        await wait(2000 - reviewElapsed)
      }

      setAiReportStage('generating')
      const reportResponse = await apiSend<{ content: string; model: string; usage?: unknown }>('/api/ai/report', 'POST', {
        client: reportClient,
        risks: risksForAi,
        content: baseReport.content,
        aiReview: reviewResponse.review,
      })

      report = {
        ...baseReport,
        content: sanitizePublicReportContent(reportResponse.content),
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
    setSelectedClientId(client.id)
    setSelectedPeriodEntryIds([])
    setPage('result')
  }

  const runClientRiskDetection = (client: Client) => {
    setSelectedClientId(client.id)
    if (!client.periodEntries.length) {
      setSelectedPeriodEntryIds([])
      setPage('result')
      window.alert('当前企业还没有保存期间数据，请先到数据录入页保存一条期间数据。')
      return
    }
    const months = client.periodEntries.flatMap((entry) => entry.months)
    if (client.periodEntries.length > 1 && !areMonthsContinuous(months)) {
      setSelectedPeriodEntryIds([])
      setPage('result')
      window.alert('当前企业的已录入月份不连续，不能一键检测。请先点击“期间选择”，选择连续月份后再生成检测结果。')
      return
    }
    setSelectedPeriodEntryIds(client.periodEntries.map((entry) => entry.id))
    setPage('result')
  }

  const openRiskDetectionPage = () => {
    setSelectedPeriodEntryIds([])
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
        <nav>
          <button className={page === 'dashboard' ? 'active' : ''} onClick={() => setPage('dashboard')}>
            <LayoutDashboard /> 首页
          </button>
          <button className={page === 'clients' ? 'active' : ''} onClick={() => setPage('clients')}>
            <Building2 /> 企业档案
          </button>
          <button
            className={page === 'form' ? 'active' : ''}
            onClick={() => {
              setEditingClient(blankDraftClient())
              setPage('form')
            }}
          >
            <Plus /> 数据录入
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
                <p className="eyebrow">今日工作台</p>
                <h2>税务风险体检总览</h2>
              </div>
              <button
                className="primary-button"
                onClick={() => {
                  setEditingClient(blankDraftClient())
                  setPage('form')
                }}
              >
                <Plus /> 录入期间数据
              </button>
            </header>
            <div className="stat-grid">
              <StatCard label="企业档案" value={clients.length} icon={<Building2 />} />
              <StatCard label="集团项目" value={stats.groups} icon={<ClipboardList />} tone="green" />
              <StatCard label="命中风险" value={stats.detections} icon={<AlertTriangle />} tone="orange" />
              <StatCard label="高风险企业" value={stats.high} icon={<Gauge />} tone="red" />
            </div>
            <div className="analytics-grid">
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
                rows={dashboardTaxRows}
              />
              <RiskOrbit
                high={stats.high}
                medium={stats.medium}
                low={Math.max(clients.length - stats.high - stats.medium, 0)}
              />
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
                        setSelectedClientId(client.id)
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

        {page === 'clients' && (
          <section className="page">
            <header className="page-header">
              <div>
                <p className="eyebrow">企业档案</p>
                <h2>企业档案与期间数据</h2>
              </div>
              <div className="header-actions">
                <button type="button" className="secondary-button" onClick={loadRiskDemoCases}>
                  <ClipboardList /> 载入测试案例
                </button>
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
                          <span>{entry.label}</span>
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
                      <td>{client.industry}</td>
                      <td>{client.taxpayerType}</td>
                      <td>{client.region}</td>
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
                <h2>选择企业和期间数据</h2>
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
                <button className="primary-button" onClick={() => createReport()} disabled={Boolean(aiReportStage)}>
                  <Sparkles /> {aiReportStage === 'reviewing' ? 'AI 正在复核数据...' : aiReportStage === 'generating' ? 'AI 正在生成报告...' : '生成报告'}
                </button>
              </div>
            </header>
            <section className="panel archive-overview-panel">
              <div className="panel-title">
                <div>
                  <p className="eyebrow">已有档案</p>
                  <h3>从已保存期间发起检测</h3>
                  <p className="section-helper">风险检测只基于企业档案中的期间数据。先做期间选择，或在期间连续时直接检测。</p>
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
                          <button onClick={() => openClientForPeriodSelection(client)}>
                            期间选择
                          </button>
                          <button onClick={() => runClientRiskDetection(client)}>
                            检测
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="panel period-analysis-panel">
              <div className="panel-title">
                <div>
                  <p className="eyebrow">期间数据</p>
                  <h3>选择连续月份生成分析</h3>
                  <p className="section-helper">最小单位为月份。可以选择单月、连续多月、季度或全年；不连续月份不能合并成一份报告。</p>
                </div>
                <span>{selectedPeriodLabel}</span>
              </div>
              {selectedClient.periodEntries.length > 0 ? (
                <>
                  <div className="period-entry-grid">
                    {selectedClient.periodEntries.map((entry) => {
                      const checked = selectedPeriodEntryIds.includes(entry.id)
                      return (
                        <article
                          key={entry.id}
                          className={checked ? 'period-entry-card active' : 'period-entry-card'}
                        >
                          <span>{entry.label}</span>
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
                      选择全部期间
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
            </section>
            {selectedDetectionClient ? (
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
            ) : (
              <div className="empty-state wide">
                <ClipboardList />
                <h3>请选择已有档案期间</h3>
                <p>风险检测和报告生成必须基于已保存的期间数据。请选择单月、季度、连续多月或全年后再生成结果。</p>
              </div>
            )}
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
                  <span>数据口径</span>
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

        {page === 'report' && selectedClient && (
          <ReportPage
            report={reports.find((report) => report.clientId === selectedClient.id)}
            client={selectedClient}
            risks={currentRisks}
            onGenerate={() => createReport()}
            aiStage={aiReportStage}
            onUpdate={(content) =>
              setReports((current) =>
                current.map((report) => (report.clientId === selectedClient.id ? { ...report, content } : report)),
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
      </main>
    </div>
  )
}

function ClientForm({ client, clients, onChange }: { client: Client; clients: Client[]; onChange: (client: Client) => void }) {
  const [numberDrafts, setNumberDrafts] = useState<Record<string, string>>({})
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
    { id: 'intake-period', label: '期间', missing: countMissingLabels(['分析口径', '所属年度', '所属季度', '所属月份', '期间开始', '期间结束', '数据口径']) },
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
      const parsedPatch = isExcelFile
        ? await parseClientImportWorkbook(await file.arrayBuffer())
        : parseClientImportText(await file.text())
      const patchData = coerceImportedClientPatch(parsedPatch)
      const importedLabels = Object.keys(patchData).map(fieldLabel)
      if (!importedLabels.length) {
        window.alert('未识别到可填充字段。请确认表头或字段名使用系统字段名、中文字段名，或采用“字段名 / 值”两列格式。')
        return
      }
      onChange(deriveClientMetrics({ ...client, ...patchData }))
      window.alert(`已从表格填充 ${importedLabels.length} 个字段：${importedLabels.slice(0, 12).join('、')}${importedLabels.length > 12 ? '等' : ''}`)
    } catch (error) {
      console.warn('Failed to import client file.', error)
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
  const periodDatesForYear = (year: string) => ({
    periodStartDate: year ? `${year}-01-01` : '',
    periodEndDate: year ? `${year}-12-31` : '',
  })
  const changeAnalysisPeriodType = (analysisPeriodType: AnalysisPeriodType) => {
    const analysisYear = client.analysisYear || String(new Date().getFullYear())
    const patchData: Partial<Client> = { analysisPeriodType, analysisYear }
    if (analysisPeriodType === '年度') {
      Object.assign(patchData, periodDatesForYear(analysisYear), { analysisQuarter: '', analysisMonth: '' })
    }
    if (analysisPeriodType === '季度') {
      Object.assign(patchData, { analysisMonth: '', periodStartDate: '', periodEndDate: '' })
    }
    if (analysisPeriodType === '月度') {
      Object.assign(patchData, { analysisQuarter: '', periodStartDate: '', periodEndDate: '' })
    }
    if (analysisPeriodType === '年初至今') {
      Object.assign(patchData, { analysisQuarter: '', analysisMonth: '', periodStartDate: analysisYear ? `${analysisYear}-01-01` : '' })
    }
    if (analysisPeriodType === '自定义期间') {
      Object.assign(patchData, { analysisQuarter: '', analysisMonth: '' })
    }
    patchPeriod(patchData)
  }
  const changeAnalysisYear = (analysisYear: string) => {
    const patchData: Partial<Client> = { analysisYear }
    if (client.analysisPeriodType === '年度') Object.assign(patchData, periodDatesForYear(analysisYear))
    if (client.analysisPeriodType === '年初至今') Object.assign(patchData, { periodStartDate: analysisYear ? `${analysisYear}-01-01` : '' })
    patchPeriod(patchData)
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
    dataBasis: '',
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
        <div>
          <p className="eyebrow">录入路线</p>
          <h3>按税务健康检查口径采集资料</h3>
          <p className="section-helper">
            先录入企业共用画像，再按增值税、企业所得税、个人所得税与综合线索补充关键字段。多主体项目建议按主体分别建档，集团口径另行汇总。当前版本只采集可量化信息和风险标记，不要求访谈、抽凭或上传底稿。
          </p>
          <p className="auto-fill-note">除标注“必填 / 条件必填 / 检测必填 / 系统计算”的字段外，其余字段均为选填。为提高检查准确度，建议有数据、能确认的字段尽量填写。</p>
          <p className="auto-fill-note">系统会根据基础数据自动计算部分检测口径；如需改用特殊口径，请在对应字段切换“手动填写”并说明原因。</p>
          <div className="intake-overview-actions">
            <label className="secondary-button compact-button file-import-button">
              <FileText /> 上传表格填充
              <input type="file" accept=".json,.csv,.tsv,.txt,.xlsx,.xls" onChange={(event) => void importClientFile(event.target.files?.[0] || null)} />
            </label>
            {firstMissingIssue && (
              <button type="button" className="secondary-button compact-button" onClick={() => focusFieldByLabel(firstMissingIssue.label)}>
                <AlertTriangle /> 补第一个缺失项
              </button>
            )}
          </div>
        </div>
        <div className="intake-score">
          <span>{completeness.label}</span>
          <strong>{completeness.score}%</strong>
          <small>{completeness.note}</small>
        </div>
      </section>

      <section className="intake-requirement-panel">
        <div>
          <strong>建档必填 <span className="requirement-progress">{saveTotal - saveIssues.length}/{saveTotal}</span></strong>
          <div className="requirement-bar" aria-hidden="true"><span style={{ width: `${Math.round(((saveTotal - saveIssues.length) / saveTotal) * 100)}%` }} /></div>
          <small>缺失时不能保存并检测。</small>
          {renderMissingChips(saveIssues, '已补齐')}
        </div>
        <div>
          <strong>基础检测必填 <span className="requirement-progress">{reportTotal - reportIssues.length}/{reportTotal}</span></strong>
          <div className="requirement-bar" aria-hidden="true"><span style={{ width: `${Math.round(((reportTotal - reportIssues.length) / reportTotal) * 100)}%` }} /></div>
          <small>缺失时仍可生成报告，但会提示资料不足。</small>
          {renderMissingChips(reportIssues, '已补齐')}
        </div>
        {(saveIssues.length > 0 || reportIssues.length > 0) && (
          <div className="requirement-copy-row">
            <button type="button" className="secondary-button compact-button" onClick={copyMissingSummary}>
              <ClipboardList /> 复制缺失清单
            </button>
          </div>
        )}
      </section>

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
            <p className="section-helper">用于标记本次录入资料对应的时间点或时间段，报告和后续规则会以此作为分析边界。</p>
            {renderSectionRequirementSummary(periodLabels)}
          </div>
          {renderSectionActions('数据期间', 'Step 2', clearPeriodSection)}
        </div>
        <div className="form-grid">
          <Field label="分析口径" missing={missingStateForLabel('分析口径')}>
            <select value={client.analysisPeriodType} onChange={(e) => changeAnalysisPeriodType(e.target.value as AnalysisPeriodType)}>
              <option value="">未选择</option>
              <option>年度</option>
              <option>季度</option>
              <option>月度</option>
              <option>年初至今</option>
              <option>自定义期间</option>
            </select>
          </Field>
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
          <Field label="数据口径" missing={missingStateForLabel('数据口径')}>
            <select value={client.dataBasis} onChange={(e) => patch('dataBasis', e.target.value as DataBasis)}>
              <option value="">未选择</option>
              <option>申报数据</option>
              <option>管理报表</option>
              <option>暂估数据</option>
              <option>混合口径</option>
            </select>
          </Field>
          <Field label="所属季度" requirement={client.analysisPeriodType === '季度' ? 'conditional' : 'optional'} missing={missingStateForLabel('所属季度')}>
            <select
              value={client.analysisQuarter}
              disabled={client.analysisPeriodType !== '季度'}
              onChange={(e) => patch('analysisQuarter', e.target.value as AnalysisQuarter)}
            >
              <option value="">未选择</option>
              <option>Q1</option>
              <option>Q2</option>
              <option>Q3</option>
              <option>Q4</option>
            </select>
          </Field>
          <Field label="所属月份" requirement={client.analysisPeriodType === '月度' ? 'conditional' : 'optional'} missing={missingStateForLabel('所属月份')}>
            <input
              type="month"
              value={client.analysisMonth}
              disabled={client.analysisPeriodType !== '月度'}
              onChange={(e) => patchPeriod({ analysisMonth: e.target.value, analysisYear: e.target.value ? e.target.value.slice(0, 4) : client.analysisYear })}
            />
          </Field>
          <Field label="期间开始" requirement={client.analysisPeriodType === '年初至今' || client.analysisPeriodType === '自定义期间' ? 'conditional' : 'optional'} missing={missingStateForLabel('期间开始')}>
            <input
              type="date"
              value={client.periodStartDate}
              disabled={client.analysisPeriodType !== '年初至今' && client.analysisPeriodType !== '自定义期间'}
              onChange={(e) => patch('periodStartDate', e.target.value)}
            />
          </Field>
          <Field label="期间结束" requirement={client.analysisPeriodType === '年初至今' || client.analysisPeriodType === '自定义期间' ? 'conditional' : 'optional'} missing={missingStateForLabel('期间结束')}>
            <input
              type="date"
              value={client.periodEndDate}
              disabled={client.analysisPeriodType !== '年初至今' && client.analysisPeriodType !== '自定义期间'}
              onChange={(e) => patch('periodEndDate', e.target.value)}
            />
          </Field>
          <Field label="对比期间">
            <input
              value={client.comparisonPeriod}
              placeholder="例如：上年同期 / 上季度 / 上月"
              onChange={(e) => patch('comparisonPeriod', e.target.value)}
            />
          </Field>
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
  const draft = sanitizePublicReportContent(report?.content || buildReportContent(client, risks))
  const aiMessage = aiStage === 'reviewing'
    ? 'AI 正在复核数据...'
    : aiStage === 'generating'
      ? 'AI 正在生成报告...'
      : ''
  const aiStepText = aiStage === 'reviewing'
    ? '正在比对企业输入数据、规则条件和命中结果，识别字段冲突、边界值和需要人工复核的事项。'
    : '正在把确定性规则结果和数据复核意见整合成正式税务风险体检报告。'
  const reviewGroups = [
    {
      title: '输入数据疑点',
      items: report?.aiReview?.dataQualityWarnings || [],
      empty: 'AI 未发现明显字段冲突或缺失。',
    },
    {
      title: '接近阈值提醒',
      items: report?.aiReview?.nearThresholdWarnings || [],
      empty: '暂无接近规则阈值的观察项。',
    },
    {
      title: '命中风险复核',
      items: report?.aiReview?.riskReviewNotes || [],
      empty: '暂无额外复核说明。',
    },
  ]

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
              riskLevel: getOverallLevel(risks),
              createdAt: formatDate(),
              risks,
              content: draft,
            })}
          >
            <Download /> 导出 Word
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
          <section className="ai-review-panel">
            <div className="ai-review-header">
              <div>
                <p className="eyebrow">AI 数据复核提示</p>
                <h3>复核结果不改变规则引擎命中结论</h3>
              </div>
              <span className={report?.aiGenerated ? 'ai-review-status active' : 'ai-review-status'}>
                {report?.aiGenerated ? 'AI 已复核' : '本地模板'}
              </span>
            </div>
            {report?.aiReview ? (
              <div className="ai-review-grid">
                {reviewGroups.map((group) => (
                  <article className="ai-review-card" key={group.title}>
                    <h4>{group.title}</h4>
                    {group.items.length ? (
                      <ul>
                        {group.items.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    ) : (
                      <p>{group.empty}</p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="ai-review-empty">
                <Info />
                <p>当前报告没有可展示的 AI 复核明细。重新生成报告后，系统会自动调用 AI 复核并在此展示数据疑点、阈值提醒和风险复核说明。</p>
              </div>
            )}
          </section>
          <div className="report-editor">
            <aside>
              <h3>报告目录</h3>
              {['企业基本情况', '综合风险结论', '资料完整性说明', '分税种风险摘要', '风险明细', '整改优先级', '免责声明'].map((item) => (
                <span key={item}>{item}</span>
              ))}
            </aside>
            <textarea value={draft} onChange={(event) => onUpdate(event.target.value)} />
          </div>
        </div>
      )}
    </section>
  )
}

export default App
