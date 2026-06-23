import { useEffect, useMemo, useState } from 'react'
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
  isExecutableCondition,
  isSimpleCondition,
  type RuleCondition,
  type RiskLevel,
  type SimpleRuleCondition,
} from './lib/ruleEngine'
import './App.css'

type Page = 'dashboard' | 'clients' | 'form' | 'result' | 'report' | 'reports' | 'rules' | 'admin'
type TaxpayerType = '小规模纳税人' | '一般纳税人' | '个体工商户'

type Client = {
  id: string
  name: string
  creditCode: string
  region: string
  industry: string
  taxpayerType: TaxpayerType
  establishedAt: string
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
}

type RiskResult = RiskRule & {
  triggeredAt: string
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
  creditCode: '',
  region: '上海',
  industry: '商贸',
  taxpayerType: '小规模纳税人',
  establishedAt: '2024-01-01',
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
}

const demoClients: Client[] = [
  {
    ...emptyClient,
    id: crypto.randomUUID(),
    name: '上海辰光商贸有限公司',
    creditCode: '91310000MVP000001',
    region: '上海',
    industry: '商贸',
    monthlyRevenue: 168000,
    monthlyInvoice: 83000,
    annualRevenue: 5160000,
    consecutive12MonthSales: 5160000,
    collectionFlow: 172000,
    privateAccountCollection: true,
    unbilledIncome: true,
    serviceFeeInvoices: true,
    supplierNoInput: true,
    purchaseSalesMismatch: true,
    smallProfitEnjoyed: false,
  },
  {
    ...emptyClient,
    id: crypto.randomUUID(),
    name: '杭州星河直播工作室',
    creditCode: '92330000MVP000002',
    region: '浙江',
    industry: '直播自媒体',
    taxpayerType: '个体工商户',
    monthlyRevenue: 260000,
    monthlyInvoice: 48000,
    annualRevenue: 3120000,
    consecutive12MonthSales: 3120000,
    platformRevenue: 280000,
    collectionFlow: 290000,
    privateAccountCollection: true,
    noIitWithholding: true,
    salarySplit: true,
    individualVendorRelated: true,
  },
  {
    ...emptyClient,
    id: crypto.randomUUID(),
    name: '苏州精密制造有限公司',
    creditCode: '91320000MVP000003',
    region: '江苏',
    industry: '制造',
    taxpayerType: '一般纳税人',
    monthlyRevenue: 820000,
    monthlyInvoice: 800000,
    annualRevenue: 9840000,
    consecutive12MonthSales: 9840000,
    employees: 42,
    socialSecurityCount: 28,
    salaryDeclaredCount: 42,
    payrollTotal: 2800000,
    welfareExpense: 460000,
    unionExpense: 68000,
    educationExpense: 88000,
    entertainmentExpense: 120000,
    adExpense: 1800000,
    rdDeductionEnjoyed: true,
    rdDocsInsufficient: true,
    inventoryAbnormal: true,
  },
]

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
  const checks = [
    Boolean(client.name),
    Boolean(client.creditCode),
    Boolean(client.region),
    Boolean(client.industry),
    Boolean(client.taxpayerType),
    Boolean(client.establishedAt),
    client.monthlyRevenue > 0,
    client.annualRevenue > 0,
    client.monthlyInvoice > 0,
    client.collectionFlow > 0,
    client.monthlyCost > 0,
    client.employees > 0,
    client.socialSecurityCount > 0,
    client.salaryDeclaredCount > 0,
    client.payrollTotal > 0,
  ]
  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100)
  const label = score >= 85 ? '资料较完整' : score >= 55 ? '资料部分缺失' : '资料不足'
  const note = score >= 85
    ? '当前录入信息可支持初步风险判断，建议结合原始凭证、申报表和合同继续复核。'
    : score >= 55
      ? '当前录入信息可支持初筛，但部分关键资料尚不完整，报告结论应作为风险提示使用。'
      : '当前信息不足以支持充分判断，本次结果仅适合作为线索提示，需补充资料后重新复核。'
  const suggestedMaterials = Array.from(new Set(risks.flatMap((risk) => risk.materials))).slice(0, 12)

  return { score, label, note, suggestedMaterials }
}

function riskIssueId(risk: RiskResult) {
  return `Issue ${risk.code}`
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

function managedRuleToRisk(rule: ManagedRule): RiskRule {
  return {
    code: rule.code,
    name: rule.name,
    taxType: rule.taxType,
    level: rule.level,
    basis: rule.basis,
    caseRef: rule.conditionText,
    trigger: (client) => evaluateCondition(client, rule.conditionJson),
    reason: () => {
      return `规则条件命中：${conditionSummary(rule.conditionJson)}。`
    },
    suggestion: rule.suggestion,
    materials: rule.materials,
  }
}

function detectRisks(client: Client, managed: ManagedRule[] = []): RiskResult[] {
  const executableRules = managed
    .filter((rule) => rule.enabled && isExecutableCondition(rule.conditionJson))
    .map(managedRuleToRisk)
  const sourceRules = executableRules.length ? executableRules : rules

  return sourceRules
    .filter((rule) => rule.trigger(client))
    .sort((a, b) => riskRank(b.level) - riskRank(a.level))
    .map((rule) => ({ ...rule, triggeredAt: formatDate() }))
}

function buildReportContent(client: Client, risks: RiskResult[]) {
  const level = getOverallLevel(risks)
  const highCount = risks.filter((r) => r.level === '高').length
  const mediumCount = risks.filter((r) => r.level === '中').length
  const completeness = getDataCompleteness(client, risks)
  const byTaxType = taxTypeSummary(risks).join('\n')
  const riskSummary = risks
    .slice(0, 8)
    .map((risk, index) => `${index + 1}. ${riskIssueId(risk)}｜【${risk.level}风险】${risk.name}：${risk.reason(client)}`)
    .join('\n')

  return `《企业税务风险体检报告》

一、企业基本情况
企业名称：${client.name}
统一社会信用代码：${client.creditCode || '未填写'}
所属地区：${client.region}
所属行业：${client.industry}
纳税人类型：${client.taxpayerType}
最近检测时间：${formatDate()}

二、综合风险结论
本次系统共命中 ${risks.length} 项风险提示，其中高风险 ${highCount} 项，中风险 ${mediumCount} 项，综合风险等级为【${level}】。
本结论基于当前录入数据和系统规则库生成，建议由财税专业人员结合原始凭证、账套、申报表、合同、资金流水进一步复核。

三、资料完整性说明
资料完整度：${completeness.score}%（${completeness.label}）
说明：${completeness.note}
建议优先补充资料：${completeness.suggestedMaterials.length ? completeness.suggestedMaterials.join('、') : '当前未形成明确补充资料清单。'}

四、分税种风险摘要
${byTaxType || '暂未形成分税种风险提示。'}

五、重点风险事项
${riskSummary || '未发现明显高频风险。建议继续完善资料后复核。'}

六、Issue 明细与整改建议
${risks
  .map(
    (risk, index) => `${index + 1}. ${riskIssueId(risk)}：${risk.name}
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

七、整改优先级
${risks.length
  ? risks.map((risk, index) => `${index + 1}. ${riskPriority(risk)}｜${riskIssueId(risk)}｜${risk.name}`).join('\n')
  : '当前暂无需列入整改清单的风险事项。'}

八、后续处理建议
建议基于本报告推进以下事项：
1. 补充缺失资料，先完成账税数据一致性复核。
2. 对高风险事项建立整改清单和责任人。
3. 按月输出风险跟踪表，形成持续合规管理机制。
4. 对涉及发票、收入、个人账户和优惠政策的事项优先处理。

九、免责声明
本报告基于企业提供资料及系统规则进行辅助分析，仅供经营和税务风险管理参考。具体税务处理应结合完整原始资料、适用地区口径及最新政策，并由专业人员进一步复核确认。`
}

function downloadWord(report: Report) {
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
      <body><pre>${escapeHtml(report.content)}</pre></body>
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
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function BoolField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className={`check-field ${checked ? 'checked' : ''}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
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
  const [editingClient, setEditingClient] = useState<Client>({ ...emptyClient, id: crypto.randomUUID() })
  const [reports, setReports] = useState<Report[]>([])
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([])
  const [managedRules, setManagedRules] = useState<ManagedRule[]>([])
  const [restrictedRuleCount, setRestrictedRuleCount] = useState(0)
  const [ruleDraft, setRuleDraft] = useState<ManagedRule>(emptyManagedRule)
  const [editingRuleCode, setEditingRuleCode] = useState('')
  const [query, setQuery] = useState('')
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
        setAuthUser(null)
        setLoggedIn(false)
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

        setClients(clientsResponse.clients)
        setReports(reportsResponse.reports)
        if (clientsResponse.clients[0]) {
          setSelectedClientId(clientsResponse.clients[0].id)
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
          setManagedRules(response.rules)
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
  const currentRisks = useMemo(() => (selectedClient ? detectRisks(selectedClient, managedRules) : []), [selectedClient, managedRules])
  const overallLevel = getOverallLevel(currentRisks)
  const currentCompleteness = selectedClient ? getDataCompleteness(selectedClient, currentRisks) : null

  const clientRows = useMemo(() => {
    return clients
      .filter((client) => client.name.includes(query) || client.creditCode.includes(query))
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

  const stats = useMemo(() => {
    const clientStats = clients.map((client) => detectRisks(client, managedRules))
    return {
      high: clientStats.filter((risks) => getOverallLevel(risks) === '高').length,
      medium: clientStats.filter((risks) => getOverallLevel(risks) === '中').length,
      detections: clientStats.reduce((sum, risks) => sum + risks.length, 0),
    }
  }, [clients, managedRules])

  const canUseAdmin = authUser?.role === 'admin' || authUser?.actor?.role === 'admin'

  const refreshAdminUsers = async () => {
    const response = await apiGet<{ users: AdminUser[] }>('/api/admin/users')
    setAdminUsers(response.users)
  }

  const refreshRules = async () => {
    const response = await apiGet<{ rules: ManagedRule[]; restrictedCount?: number }>('/api/rules')
    setManagedRules(response.rules)
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
        rules.map((rule) =>
          apiSend<{ rule: ManagedRule }>('/api/rules', 'POST', {
            code: rule.code,
            name: rule.name,
            taxType: rule.taxType,
            level: rule.level,
            basis: rule.basis,
            suggestion: rule.suggestion,
            enabled: true,
            conditionText: rule.caseRef,
            conditionJson: builtInRuleConditions[rule.code] || { field: '', operator: '=', value: '' },
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

  const saveClient = async () => {
    const normalized = editingClient.name.trim()
      ? editingClient
      : { ...editingClient, name: `未命名企业 ${clients.length + 1}` }

    setClients((current) => {
      const exists = current.some((client) => client.id === normalized.id)
      return exists ? current.map((client) => (client.id === normalized.id ? normalized : client)) : [normalized, ...current]
    })
    setSelectedClientId(normalized.id)
    setPage('result')

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

  const createReport = async () => {
    if (!selectedClient || aiReportStage) return

    const startedAt = Date.now()
    const risks = detectRisks(selectedClient, managedRules)
    const baseReport: Report = {
      id: crypto.randomUUID(),
      clientId: selectedClient.id,
      clientName: selectedClient.name,
      riskLevel: getOverallLevel(risks),
      createdAt: formatDate(),
      risks,
      content: buildReportContent(selectedClient, risks),
    }
    setPage('report')

    let report = baseReport
    const risksForAi = risks.map((risk) => ({
      ...risk,
      issueId: riskIssueId(risk),
      priority: riskPriority(risk),
      reason: risk.reason(selectedClient),
    }))
    try {
      setAiReportStage('reviewing')
      const reviewStartedAt = Date.now()
      const reviewResponse = await apiSend<{ review: AiReview; model: string; usage?: unknown }>('/api/ai/review', 'POST', {
        client: selectedClient,
        risks: risksForAi,
      })
      const reviewElapsed = Date.now() - reviewStartedAt
      if (reviewElapsed < 2000) {
        await wait(2000 - reviewElapsed)
      }

      setAiReportStage('generating')
      const reportResponse = await apiSend<{ content: string; model: string; usage?: unknown }>('/api/ai/report', 'POST', {
        client: selectedClient,
        risks: risksForAi,
        content: baseReport.content,
        aiReview: reviewResponse.review,
      })

      report = {
        ...baseReport,
        content: reportResponse.content,
        aiReview: reviewResponse.review,
        aiGenerated: true,
        aiModel: reportResponse.model || reviewResponse.model,
      }
    } catch (error) {
      console.warn('AI report generation failed, using local report template.', error)
      report = {
        ...baseReport,
        content: `${baseReport.content}\n\nAI 处理提示：本次 AI 数据复核或报告生成失败，系统已使用本地规则模板生成报告。`,
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

    setReports((current) => [report, ...current.filter((item) => item.clientId !== selectedClient.id)])

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
            <Building2 /> 企业
          </button>
          <button
            className={page === 'form' ? 'active' : ''}
            onClick={() => {
              setEditingClient({ ...emptyClient, id: crypto.randomUUID() })
              setPage('form')
            }}
          >
            <Plus /> 新建体检
          </button>
          <button className={page === 'result' ? 'active' : ''} onClick={() => setPage('result')}>
            <Gauge /> 风险结果
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
                  setEditingClient({ ...emptyClient, id: crypto.randomUUID() })
                  setPage('form')
                }}
              >
                <Plus /> 新建风险体检
              </button>
            </header>
            <div className="stat-grid">
              <StatCard label="企业档案" value={clients.length} icon={<Building2 />} />
              <StatCard label="命中风险" value={stats.detections} icon={<AlertTriangle />} tone="orange" />
              <StatCard label="高风险企业" value={stats.high} icon={<Gauge />} tone="red" />
              <StatCard label="已生成报告" value={reports.length} icon={<FileText />} tone="green" />
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
                  <li>自动识别增值税、所得税、发票和资金风险</li>
                  <li>生成风险体检报告并支持 Word 导出</li>
                </ul>
              </section>
            </div>
          </section>
        )}

        {page === 'clients' && (
          <section className="page">
            <header className="page-header">
              <div>
                <p className="eyebrow">企业管理</p>
                <h2>企业档案列表</h2>
              </div>
              <button
                className="primary-button"
                onClick={() => {
                  setEditingClient({ ...emptyClient, id: crypto.randomUUID() })
                  setPage('form')
                }}
              >
                <Plus /> 新建企业
              </button>
            </header>
            <div className="toolbar">
              <Search />
              <input placeholder="搜索企业名称或统一社会信用代码" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <div className="table-panel">
              <table>
                <thead>
                  <tr>
                    <th>企业名称</th>
                    <th>行业</th>
                    <th>纳税人类型</th>
                    <th>地区</th>
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
                      <td>{client.industry}</td>
                      <td>{client.taxpayerType}</td>
                      <td>{client.region}</td>
                      <td><LevelBadge level={level} /></td>
                      <td>{report ? '已生成' : '未生成'}</td>
                      <td className="row-actions">
                        <button
                          onClick={() => {
                            setSelectedClientId(client.id)
                            setPage('result')
                          }}
                        >
                          检测
                        </button>
                        <button
                          onClick={() => {
                            setEditingClient(client)
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
                <p className="eyebrow">资料录入</p>
                <h2>企业财税画像</h2>
              </div>
              <button className="primary-button" onClick={saveClient}>
                <ShieldCheck /> 保存并检测
              </button>
            </header>
            <ClientForm client={editingClient} onChange={setEditingClient} />
          </section>
        )}

        {page === 'result' && selectedClient && (
          <section className="page">
            <header className="page-header">
              <div>
                <p className="eyebrow">风险检测结果</p>
                <h2>{selectedClient.name}</h2>
              </div>
              <div className="header-actions">
                <button className="secondary-button" onClick={() => setPage('form')}>
                  <RefreshCcw /> 编辑资料
                </button>
                <button className="primary-button" onClick={createReport} disabled={Boolean(aiReportStage)}>
                  <Sparkles /> {aiReportStage === 'reviewing' ? 'AI 正在复核数据...' : aiReportStage === 'generating' ? 'AI 正在生成报告...' : '生成报告'}
                </button>
              </div>
            </header>
            <div className="result-summary">
              <StatCard label="综合等级" value={`${overallLevel}风险`} icon={<Gauge />} tone={overallLevel === '高' ? 'red' : overallLevel === '中' ? 'orange' : 'green'} />
              <StatCard label="风险事项" value={currentRisks.length} icon={<ClipboardList />} tone="orange" />
              <StatCard label="高风险" value={currentRisks.filter((risk) => risk.level === '高').length} icon={<AlertTriangle />} tone="red" />
              <StatCard label="中风险" value={currentRisks.filter((risk) => risk.level === '中').length} icon={<BarChart3 />} />
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
              </section>
            )}
            <div className="risk-list">
              {currentRisks.map((risk) => (
                <article className="risk-card" key={risk.code}>
                  <div className="risk-card-head">
                    <span className="rule-code">{riskIssueId(risk)}</span>
                    <LevelBadge level={risk.level} />
                  </div>
                  <h3>{risk.name}</h3>
                  <p><strong>涉及税种：</strong>{risk.taxType}</p>
                  <p><strong>整改优先级：</strong>{riskPriority(risk)}</p>
                  <p><strong>触发原因：</strong>{risk.reason(selectedClient)}</p>
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
          </section>
        )}

        {page === 'report' && selectedClient && (
          <ReportPage
            report={reports.find((report) => report.clientId === selectedClient.id)}
            client={selectedClient}
            risks={currentRisks}
            onGenerate={createReport}
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
                  <button className="primary-button" onClick={importBuiltInRules}>
                    <Plus /> 导入内置规则
                  </button>
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
                </div>
                <div className="header-actions">
                  <button className="primary-button" onClick={saveManagedRule}>
                    <ShieldCheck /> 保存规则
                  </button>
                  <button className="secondary-button" onClick={resetRuleDraft}>清空</button>
                </div>
              </section>
            )}
            <div className="rules-grid">
              {managedRules.map((rule) => (
                <article className="rule-card" key={rule.code}>
                  <div>
                    <span className="rule-code">{rule.code}</span>
                    <LevelBadge level={rule.level} />
                  </div>
                  <h3>{rule.name}</h3>
                  <p>{rule.taxType || '未填写税种'} / {rule.enabled ? '启用' : '停用'}</p>
                  {conditionSummary(rule.conditionJson) !== '不参与自动检测' && <small>执行条件：{conditionSummary(rule.conditionJson)}</small>}
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

function ClientForm({ client, onChange }: { client: Client; onChange: (client: Client) => void }) {
  const patch = <K extends keyof Client>(key: K, value: Client[K]) => {
    onChange({ ...client, [key]: value })
  }
  const num = (key: keyof Client) => (event: React.ChangeEvent<HTMLInputElement>) => {
    patch(key, Number(event.target.value || 0) as never)
  }

  return (
    <div className="form-layout">
      <section className="form-section">
        <h3>基本信息</h3>
        <div className="form-grid">
          <Field label="企业名称"><input value={client.name} onChange={(e) => patch('name', e.target.value)} /></Field>
          <Field label="统一社会信用代码"><input value={client.creditCode} onChange={(e) => patch('creditCode', e.target.value)} /></Field>
          <Field label="地区"><input value={client.region} onChange={(e) => patch('region', e.target.value)} /></Field>
          <Field label="行业">
            <select value={client.industry} onChange={(e) => patch('industry', e.target.value)}>
              {['商贸', '电商', '服务', '建筑', '劳务', '直播自媒体', '制造', '个体户'].map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="纳税人类型">
            <select value={client.taxpayerType} onChange={(e) => patch('taxpayerType', e.target.value as TaxpayerType)}>
              <option>小规模纳税人</option>
              <option>一般纳税人</option>
              <option>个体工商户</option>
            </select>
          </Field>
          <Field label="成立时间"><input type="date" value={client.establishedAt} onChange={(e) => patch('establishedAt', e.target.value)} /></Field>
        </div>
      </section>

      <section className="form-section">
        <h3>经营与收款数据</h3>
        <div className="form-grid">
          <Field label="月收入"><input type="number" value={client.monthlyRevenue} onChange={num('monthlyRevenue')} /></Field>
          <Field label="月开票金额"><input type="number" value={client.monthlyInvoice} onChange={num('monthlyInvoice')} /></Field>
          <Field label="月成本费用"><input type="number" value={client.monthlyCost} onChange={num('monthlyCost')} /></Field>
          <Field label="月利润"><input type="number" value={client.monthlyProfit} onChange={num('monthlyProfit')} /></Field>
          <Field label="年销售收入"><input type="number" value={client.annualRevenue} onChange={num('annualRevenue')} /></Field>
          <Field label="连续 12 个月销售额"><input type="number" value={client.consecutive12MonthSales} onChange={num('consecutive12MonthSales')} /></Field>
          <Field label="平台收入"><input type="number" value={client.platformRevenue} onChange={num('platformRevenue')} /></Field>
          <Field label="收款流水"><input type="number" value={client.collectionFlow} onChange={num('collectionFlow')} /></Field>
        </div>
      </section>

      <section className="form-section">
        <h3>人员与费用</h3>
        <div className="form-grid">
          <Field label="员工人数"><input type="number" value={client.employees} onChange={num('employees')} /></Field>
          <Field label="社保人数"><input type="number" value={client.socialSecurityCount} onChange={num('socialSecurityCount')} /></Field>
          <Field label="工资申报人数"><input type="number" value={client.salaryDeclaredCount} onChange={num('salaryDeclaredCount')} /></Field>
          <Field label="劳务人员人数"><input type="number" value={client.laborCount} onChange={num('laborCount')} /></Field>
          <Field label="工资薪金总额"><input type="number" value={client.payrollTotal} onChange={num('payrollTotal')} /></Field>
          <Field label="业务招待费"><input type="number" value={client.entertainmentExpense} onChange={num('entertainmentExpense')} /></Field>
          <Field label="广告宣传费"><input type="number" value={client.adExpense} onChange={num('adExpense')} /></Field>
          <Field label="职工福利费"><input type="number" value={client.welfareExpense} onChange={num('welfareExpense')} /></Field>
          <Field label="工会经费"><input type="number" value={client.unionExpense} onChange={num('unionExpense')} /></Field>
          <Field label="职工教育经费"><input type="number" value={client.educationExpense} onChange={num('educationExpense')} /></Field>
        </div>
      </section>

      <section className="form-section">
        <h3>优惠与年度指标</h3>
        <div className="form-grid">
          <Field label="应纳税所得额"><input type="number" value={client.taxableIncome} onChange={num('taxableIncome')} /></Field>
          <Field label="资产总额"><input type="number" value={client.assetsTotal} onChange={num('assetsTotal')} /></Field>
          <Field label="全年平均人数"><input type="number" value={client.employeeAnnualAvg} onChange={num('employeeAnnualAvg')} /></Field>
        </div>
      </section>

      <section className="form-section">
        <h3>异常标记</h3>
        <div className="check-grid">
          {[
            ['privateAccountCollection', '个人账户收取经营款'],
            ['unbilledIncome', '存在大额未开票收入'],
            ['largeExpenseNoInvoice', '大额费用无票'],
            ['serviceFeeInvoices', '大额服务费/咨询费发票'],
            ['relatedTransactions', '存在关联交易'],
            ['longTermZeroDeclaration', '长期零申报'],
            ['longTermLoss', '长期亏损'],
            ['inventoryAbnormal', '库存异常'],
            ['purchaseSalesMismatch', '进销品类不匹配'],
            ['relatedEntitiesNearThreshold', '关联主体接近 500 万临界点'],
            ['nearVatExemption', '长期接近小规模免税临界点'],
            ['prepaidLongTerm', '预收款长期挂账'],
            ['supplierNoInput', '供应商只有销项少进项'],
            ['invoiceNameMismatch', '发票品名与业务不符'],
            ['fundsReturn', '采购付款后资金回流'],
            ['abnormalInvoice', '异常/重复发票入账'],
            ['nonFinancialInterestAbnormal', '非金融借款利息异常'],
            ['intercompanyManagementFee', '企业间管理费异常'],
            ['relatedPricingAbnormal', '关联交易价格异常'],
            ['salarySplit', '工资拆分为报销/劳务/个体户发票'],
            ['noIitWithholding', '劳务佣金未见个税扣缴'],
            ['individualVendorRelated', '关联个体户承接服务'],
            ['smallProfitEnjoyed', '享受小型微利优惠'],
            ['taxBenefitDataMissing', '优惠资料不足'],
            ['rdDeductionEnjoyed', '享受研发加计扣除'],
            ['rdDocsInsufficient', '研发资料不足'],
            ['agencyComplianceRisk', '涉税服务/内部协助风险'],
          ].map(([key, label]) => (
            <BoolField
              key={key}
              label={label}
              checked={client[key as keyof Client] as boolean}
              onChange={(value) => patch(key as keyof Client, value as never)}
            />
          ))}
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
  const draft = report?.content || buildReportContent(client, risks)
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
              {['企业基本情况', '综合风险结论', '资料完整性说明', '分税种风险摘要', 'Issue 明细', '整改优先级', '免责声明'].map((item) => (
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
