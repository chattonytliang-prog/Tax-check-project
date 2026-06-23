export type RiskLevel = '高' | '中' | '低'

export type ClientValue = string | number | boolean | undefined
export type ClientSnapshot = Record<string, ClientValue>

export type SimpleRuleCondition = {
  field: string
  operator: '>' | '>=' | '<' | '<=' | '=' | '!='
  value: string | number | boolean
  compareField?: string
  multiplier?: number
  transform?: 'absDiff'
}

export type RuleCondition = SimpleRuleCondition | { all: RuleCondition[] } | { any: RuleCondition[] }

export type ExecutableRule = {
  code: string
  enabled: boolean
  conditionJson: RuleCondition
  requiredFields?: string[]
}

export type RuleExecutionStatus = 'matched' | 'not_matched' | 'skipped_missing_data' | 'disabled' | 'not_executable'

export type RuleExecutionResult = {
  code: string
  status: RuleExecutionStatus
  missingFields: string[]
  matched: boolean
}

export const emptyRuleCondition: SimpleRuleCondition = { field: '', operator: '=', value: '' }

const positiveRequiredFields = new Set([
  'previousQuarterEmployees',
  'previousQuarterRevenue',
  'previousQuarterCostExpense',
  'previousYearEbitProfit',
  'budgetEbitProfit',
  'budgetRevenue',
  'previousYearRevenue',
  'theoreticalVatTax',
  'budgetVatTax',
  'priorTaxableSales',
  'priorVatTaxPayable',
  'payrollTotal',
  'annualRevenue',
])

export const conditionFields: Array<{ value: string; label: string }> = [
  { value: 'taxpayerType', label: '纳税人类型' },
  { value: 'consecutive12MonthSales', label: '连续 12 个月销售额' },
  { value: 'relatedEntitiesNearThreshold', label: '关联主体接近阈值' },
  { value: 'nearVatExemption', label: '接近小规模免税临界点' },
  { value: 'monthlyRevenue', label: '月收入' },
  { value: 'monthlyInvoice', label: '月开票金额' },
  { value: 'collectionFlow', label: '收款流水' },
  { value: 'annualRevenue', label: '年销售收入' },
  { value: 'entertainmentExpense', label: '业务招待费' },
  { value: 'adExpense', label: '广告宣传费' },
  { value: 'payrollTotal', label: '工资薪金总额' },
  { value: 'welfareExpense', label: '职工福利费' },
  { value: 'unionExpense', label: '工会经费' },
  { value: 'educationExpense', label: '职工教育经费' },
  { value: 'taxableIncome', label: '应纳税所得额' },
  { value: 'employeeAnnualAvg', label: '年平均从业人数' },
  { value: 'assetsTotal', label: '资产总额' },
  { value: 'employees', label: '员工人数' },
  { value: 'socialSecurityCount', label: '社保人数' },
  { value: 'salaryDeclaredCount', label: '工资申报人数' },
  { value: 'platformRevenue', label: '平台收入' },
  { value: 'privateAccountCollection', label: '个人账户收款' },
  { value: 'unbilledIncome', label: '存在未开票收入' },
  { value: 'longTermZeroDeclaration', label: '长期零申报' },
  { value: 'prepaidLongTerm', label: '预收款长期挂账' },
  { value: 'largeExpenseNoInvoice', label: '大额费用无票' },
  { value: 'serviceFeeInvoices', label: '服务费发票异常' },
  { value: 'supplierNoInput', label: '供应商无进项' },
  { value: 'invoiceNameMismatch', label: '发票品名不匹配' },
  { value: 'purchaseSalesMismatch', label: '进销不匹配' },
  { value: 'fundsReturn', label: '资金回流' },
  { value: 'abnormalInvoice', label: '异常发票' },
  { value: 'nonFinancialInterestAbnormal', label: '非金融利息异常' },
  { value: 'intercompanyManagementFee', label: '企业间管理费' },
  { value: 'relatedPricingAbnormal', label: '关联定价异常' },
  { value: 'salarySplit', label: '工资拆分发放' },
  { value: 'noIitWithholding', label: '未履行个税扣缴' },
  { value: 'individualVendorRelated', label: '关联个体户/个人独资' },
  { value: 'smallProfitEnjoyed', label: '享受小微企业优惠' },
  { value: 'taxBenefitDataMissing', label: '税费优惠资料不足' },
  { value: 'rdDeductionEnjoyed', label: '享受研发加计扣除' },
  { value: 'inventoryAbnormal', label: '库存异常' },
  { value: 'rdDocsInsufficient', label: '研发资料不足' },
  { value: 'agencyComplianceRisk', label: '涉税服务合规风险' },
  { value: 'previousQuarterEmployees', label: '上季度末人数' },
  { value: 'quarterRevenue', label: '本季度收入' },
  { value: 'previousQuarterRevenue', label: '上季度收入' },
  { value: 'quarterCostExpense', label: '本季度成本费用' },
  { value: 'previousQuarterCostExpense', label: '上季度成本费用' },
  { value: 'ytdRevenue', label: '本年累计收入' },
  { value: 'ytdCostExpense', label: '本年累计成本费用' },
  { value: 'ytdProfit', label: '本年累计利润' },
  { value: 'peopleRelatedExpense', label: '人员相关成本费用' },
  { value: 'rentalArea', label: '承租面积' },
  { value: 'subleaseArea', label: '转租面积' },
  { value: 'monthlyMealBenefitExpense', label: '月福利性质餐费' },
  { value: 'decorationExpense', label: '装修费用' },
  { value: 'ebitProfit', label: 'EBIT 利润' },
  { value: 'previousYearEbitProfit', label: '上年 EBIT 利润' },
  { value: 'budgetEbitProfit', label: '预算 EBIT 利润' },
  { value: 'budgetRevenue', label: '预算收入' },
  { value: 'previousYearRevenue', label: '上年同期收入' },
  { value: 'mainBusinessRevenue', label: '主营业务收入' },
  { value: 'mainBusinessCost', label: '主营业务成本' },
  { value: 'goodsSalesRevenue', label: '商品销售收入' },
  { value: 'goodsCost', label: '商品销售成本' },
  { value: 'redVatSpecialInvoiceAmount', label: '红字专票金额' },
  { value: 'outputTax', label: '销项税额' },
  { value: 'inputTax', label: '进项税额' },
  { value: 'vatTaxPayable', label: '增值税应纳/入库税额' },
  { value: 'taxableSales', label: '增值税应税销售额' },
  { value: 'theoreticalVatTax', label: '理论增值税税额' },
  { value: 'budgetVatTax', label: '预算增值税税额' },
  { value: 'priorTaxableSales', label: '上期应税销售额' },
  { value: 'priorVatTaxPayable', label: '上期增值税税额' },
  { value: 'vatRateSpread', label: '进销项税率差' },
  { value: 'advertisingServiceRevenue', label: '广告服务收入' },
  { value: 'cultureConstructionFeePaid', label: '文化事业建设费实缴' },
  { value: 'otherReceivableAgencyBalance', label: '其他应收代收代付余额' },
  { value: 'nonOperatingExpense', label: '营业外支出发生额' },
  { value: 'nonOperatingIncome', label: '营业外收入发生额' },
  { value: 'endingVatCredit', label: '期末留抵税额' },
  { value: 'nonPayrollPersonalPayment', label: '向个人支付非工资薪金所得' },
]

export const builtInRuleConditions: Record<string, RuleCondition> = {
  R001: { all: [{ field: 'taxpayerType', operator: '=', value: '小规模纳税人' }, { field: 'consecutive12MonthSales', operator: '>', value: 5000000 }] },
  R002: { field: 'relatedEntitiesNearThreshold', operator: '=', value: true },
  R003: { all: [{ field: 'taxpayerType', operator: '!=', value: '一般纳税人' }, { field: 'nearVatExemption', operator: '=', value: true }] },
  R004: { field: 'collectionFlow', operator: '>', value: 0, compareField: 'monthlyInvoice', multiplier: 1.2 },
  R005: { field: 'privateAccountCollection', operator: '=', value: true },
  R006: { all: [{ field: 'longTermZeroDeclaration', operator: '=', value: true }, { any: [{ field: 'employees', operator: '>', value: 0 }, { field: 'collectionFlow', operator: '>', value: 0 }, { field: 'monthlyInvoice', operator: '>', value: 0 }] }] },
  R007: { field: 'prepaidLongTerm', operator: '=', value: true },
  R008: { field: 'largeExpenseNoInvoice', operator: '=', value: true },
  R009: { field: 'serviceFeeInvoices', operator: '=', value: true },
  R010: { field: 'supplierNoInput', operator: '=', value: true },
  R011: { field: 'invoiceNameMismatch', operator: '=', value: true },
  R012: { field: 'purchaseSalesMismatch', operator: '=', value: true },
  R013: { field: 'fundsReturn', operator: '=', value: true },
  R014: { field: 'abnormalInvoice', operator: '=', value: true },
  R015: { any: [{ field: 'entertainmentExpense', operator: '>', value: 0, compareField: 'annualRevenue', multiplier: 0.005 }, { field: 'entertainmentExpense', operator: '>', value: 0 }] },
  R016: { field: 'adExpense', operator: '>', value: 0, compareField: 'annualRevenue', multiplier: 0.15 },
  R017: { any: [{ field: 'welfareExpense', operator: '>', value: 0, compareField: 'payrollTotal', multiplier: 0.14 }, { field: 'unionExpense', operator: '>', value: 0, compareField: 'payrollTotal', multiplier: 0.02 }, { field: 'educationExpense', operator: '>', value: 0, compareField: 'payrollTotal', multiplier: 0.08 }] },
  R018: { field: 'nonFinancialInterestAbnormal', operator: '=', value: true },
  R019: { field: 'intercompanyManagementFee', operator: '=', value: true },
  R020: { field: 'relatedPricingAbnormal', operator: '=', value: true },
  R021: { field: 'salaryDeclaredCount', operator: '>=', value: 3, compareField: 'socialSecurityCount', transform: 'absDiff' },
  R022: { field: 'salarySplit', operator: '=', value: true },
  R023: { field: 'noIitWithholding', operator: '=', value: true },
  R024: { all: [{ field: 'platformRevenue', operator: '>', value: 0 }, { field: 'platformRevenue', operator: '>', value: 0, compareField: 'monthlyRevenue', multiplier: 1.2 }] },
  R025: { field: 'individualVendorRelated', operator: '=', value: true },
  R026: { all: [{ field: 'smallProfitEnjoyed', operator: '=', value: true }, { any: [{ field: 'taxableIncome', operator: '>', value: 3000000 }, { field: 'employeeAnnualAvg', operator: '>', value: 300 }, { field: 'assetsTotal', operator: '>', value: 50000000 }] }] },
  R027: { field: 'taxBenefitDataMissing', operator: '=', value: true },
  R028: { all: [{ field: 'rdDeductionEnjoyed', operator: '=', value: true }, { field: 'rdDocsInsufficient', operator: '=', value: true }] },
  R029: { field: 'inventoryAbnormal', operator: '=', value: true },
  R030: { field: 'agencyComplianceRisk', operator: '=', value: true },
}

export function isSimpleCondition(condition: RuleCondition): condition is SimpleRuleCondition {
  return !('all' in condition) && !('any' in condition)
}

export function parseComparableValue(raw: ClientValue, sample: ClientValue) {
  if (typeof sample === 'number') return Number(raw || 0)
  if (typeof sample === 'boolean') return raw === true || raw === 'true' || raw === '是'
  return String(raw ?? '')
}

export function evaluateCondition(client: ClientSnapshot, condition?: RuleCondition): boolean {
  if (!condition) return false
  if ('all' in condition) return condition.all.every((item) => evaluateCondition(client, item))
  if ('any' in condition) return condition.any.some((item) => evaluateCondition(client, item))
  if (!condition.field) return false

  const rawLeft = condition.transform === 'absDiff'
    ? Math.abs(Number(client[condition.field]) - Number(condition.compareField ? client[condition.compareField] : 0))
    : client[condition.field]
  const rightBase = condition.transform === 'absDiff'
    ? condition.value
    : condition.compareField
      ? client[condition.compareField]
      : condition.value
  const right = typeof rightBase === 'number'
    ? rightBase * (condition.multiplier ?? 1)
    : parseComparableValue(rightBase, rawLeft)
  const left = rawLeft

  switch (condition.operator) {
    case '>':
      return Number(left) > Number(right)
    case '>=':
      return Number(left) >= Number(right)
    case '<':
      return Number(left) < Number(right)
    case '<=':
      return Number(left) <= Number(right)
    case '!=':
      return left !== right
    case '=':
    default:
      return left === right
  }
}

export function conditionRequiredFields(condition?: RuleCondition): string[] {
  if (!condition) return []
  if ('all' in condition) return Array.from(new Set(condition.all.flatMap(conditionRequiredFields)))
  if ('any' in condition) return Array.from(new Set(condition.any.flatMap(conditionRequiredFields)))
  if (!condition.field) return []

  return Array.from(new Set([condition.field, condition.compareField].filter(Boolean) as string[]))
}

export function isClientValuePresent(value: ClientValue) {
  return value !== undefined && value !== null && value !== ''
}

export function isClientFieldPresent(field: string, value: ClientValue) {
  if (!isClientValuePresent(value)) return false
  if (positiveRequiredFields.has(field)) return Number(value) > 0
  return true
}

export function missingRequiredFields(client: ClientSnapshot, condition?: RuleCondition, extraRequiredFields: string[] = []) {
  const fields = Array.from(new Set([...conditionRequiredFields(condition), ...extraRequiredFields]))
  return fields.filter((field) => !isClientFieldPresent(field, client[field]))
}

export function conditionSummary(condition?: RuleCondition): string {
  if (!condition) return '未设置执行条件'
  if ('all' in condition) return `全部满足：${condition.all.map(conditionSummary).join('；')}`
  if ('any' in condition) return `任一满足：${condition.any.map(conditionSummary).join('；')}`
  if (!condition.field) return '不参与自动检测'
  const labelOf = (field: string) => conditionFields.find((item) => item.value === field)?.label || field
  const right = condition.compareField
    ? `${labelOf(condition.compareField)}${condition.multiplier ? ` × ${condition.multiplier}` : ''}`
    : String(condition.value)
  const left = condition.transform === 'absDiff'
    ? `|${labelOf(condition.field)} - ${condition.compareField ? labelOf(condition.compareField) : ''}|`
    : labelOf(condition.field)
  return `${left} ${condition.operator} ${right}`
}

export function isExecutableCondition(condition?: RuleCondition) {
  return conditionSummary(condition) !== '不参与自动检测'
}

export function detectExecutableRuleCodes(client: ClientSnapshot, rules: ExecutableRule[]) {
  return rules
    .map((rule) => evaluateRuleExecution(client, rule))
    .filter((result) => result.status === 'matched')
    .map((result) => result.code)
}

export function evaluateRuleExecution(client: ClientSnapshot, rule: ExecutableRule): RuleExecutionResult {
  if (!rule.enabled) {
    return { code: rule.code, status: 'disabled', missingFields: [], matched: false }
  }

  if (!isExecutableCondition(rule.conditionJson)) {
    return { code: rule.code, status: 'not_executable', missingFields: [], matched: false }
  }

  const missingFields = missingRequiredFields(client, rule.conditionJson, rule.requiredFields)
  if (missingFields.length) {
    return { code: rule.code, status: 'skipped_missing_data', missingFields, matched: false }
  }

  const matched = evaluateCondition(client, rule.conditionJson)
  return {
    code: rule.code,
    status: matched ? 'matched' : 'not_matched',
    missingFields: [],
    matched,
  }
}

export function evaluateRuleExecutions(client: ClientSnapshot, rules: ExecutableRule[]) {
  return rules.map((rule) => evaluateRuleExecution(client, rule))
}

export function skippedMissingDataRules(client: ClientSnapshot, rules: ExecutableRule[]) {
  return evaluateRuleExecutions(client, rules)
    .filter((result) => result.status === 'skipped_missing_data')
    .map((rule) => rule.code)
}
