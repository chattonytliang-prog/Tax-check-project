export const intakeDocumentTypes = [
  'business_license',
  'financial_statement',
  'account_balance',
  'ledger',
  'vat_return',
  'vat_return_schedule',
  'invoice_list',
  'payroll',
  'iit_withholding',
  'social_security',
  'housing_fund',
  'bank_statement',
  'contract',
  'voucher',
  'other_material',
] as const

export type IntakeDocumentType = (typeof intakeDocumentTypes)[number]

export type IntakePeriodType = 'monthly' | 'quarterly' | 'annual' | 'range' | 'unknown'

export type IntakeMaterialSignal = {
  fileName?: string
  sheetNames?: string[]
  textSample?: string
}

export type IntakeClassification = {
  documentType: IntakeDocumentType
  confidence: 'high' | 'medium' | 'low'
  sourceSystem: string
  reasons: string[]
  requiresSpecializedParser: boolean
}

export type IntakePeriodDetection = {
  periodType: IntakePeriodType
  periodStart: string
  periodEnd: string
  evidence: string
}

const specializedTypes = new Set<IntakeDocumentType>([
  'financial_statement',
  'account_balance',
  'ledger',
  'vat_return',
  'vat_return_schedule',
  'invoice_list',
  'payroll',
  'iit_withholding',
  'bank_statement',
])

function normalizedSignal(input: IntakeMaterialSignal) {
  return [
    input.fileName || '',
    ...(input.sheetNames || []),
    input.textSample || '',
  ].join('\n').replace(/\s+/g, '')
}

function classifyByPattern(text: string): Pick<IntakeClassification, 'documentType' | 'reasons'> {
  if (/个人所得税扣缴申报表|综合所得申报|扣缴义务人|正常工资薪金/.test(text)) return { documentType: 'iit_withholding', reasons: ['识别到个税扣缴申报结构'] }
  if (/工资表|应发工资|累计收入额|身份证件号码/.test(text)) return { documentType: 'payroll', reasons: ['识别到工资表或薪酬明细字段'] }
  if (/增值税及附加税费申报表附列资料|税额抵减情况表|加计抵减情况/.test(text)) return { documentType: 'vat_return_schedule', reasons: ['识别到增值税申报附表'] }
  if (/增值税及附加税费申报表|增值税申报表|销项税额|进项税额|应纳税额合计/.test(text)) return { documentType: 'vat_return', reasons: ['识别到增值税申报主表'] }
  if (/发票清单|数电发票|发票号码|销售方纳税人名称|有效抵扣税额/.test(text)) return { documentType: 'invoice_list', reasons: ['识别到发票清单字段'] }
  if (/资产负债表|利润表|现金流量表|会小企0[123]表/.test(text)) return { documentType: 'financial_statement', reasons: ['识别到财务报表结构'] }
  if (/明细账|账簿目录表|凭证字号/.test(text)) return { documentType: 'ledger', reasons: ['识别到明细账/账簿结构'] }
  if (/科目余额表|余额表|期初余额|本期发生额|期末余额/.test(text)) return { documentType: 'account_balance', reasons: ['识别到科目余额表结构'] }
  if (/营业执照|统一社会信用代码|市场监督管理局/.test(text)) return { documentType: 'business_license', reasons: ['识别到营业执照或工商登记关键词'] }
  if (/社保|社会保险|养老保险|医疗保险|失业保险/.test(text)) return { documentType: 'social_security', reasons: ['识别到社保资料关键词'] }
  if (/公积金|住房公积金/.test(text)) return { documentType: 'housing_fund', reasons: ['识别到公积金资料关键词'] }
  if (/银行流水|交易流水|对账单|收款账号|付款账号/.test(text)) return { documentType: 'bank_statement', reasons: ['识别到银行流水关键词'] }
  if (/合同|协议|甲方|乙方/.test(text)) return { documentType: 'contract', reasons: ['识别到合同资料关键词'] }
  if (/凭证|记账凭证|原始凭证|附件张数/.test(text)) return { documentType: 'voucher', reasons: ['识别到凭证资料关键词'] }
  return { documentType: 'other_material', reasons: ['未命中已知资料类型'] }
}

function detectSourceSystem(text: string) {
  if (/金蝶|KIS|K3|云星空/.test(text)) return '金蝶'
  if (/云代账/.test(text)) return '云代账'
  if (/金亿财税/.test(text)) return '金亿财税'
  if (/电子税务局|税务局|申报表/.test(text)) return '电子税务局'
  if (/Excel|\.xls|\.xlsx/i.test(text)) return 'Excel/ERP导出'
  return ''
}

function confidenceFor(documentType: IntakeDocumentType, reasons: string[], hasFileName: boolean) {
  if (documentType === 'other_material') return 'low'
  if (reasons.length && hasFileName) return 'high'
  return 'medium'
}

export function classifyIntakeMaterial(input: IntakeMaterialSignal): IntakeClassification {
  const text = normalizedSignal(input)
  const { documentType, reasons } = classifyByPattern(text)
  return {
    documentType,
    confidence: confidenceFor(documentType, reasons, Boolean(input.fileName)),
    sourceSystem: detectSourceSystem(text),
    reasons,
    requiresSpecializedParser: specializedTypes.has(documentType),
  }
}

function pad2(value: string) {
  return value.padStart(2, '0')
}

function lastDayOfMonth(year: string, month: string) {
  return String(new Date(Number(year), Number(month), 0).getDate()).padStart(2, '0')
}

function monthPeriod(year: string, month: string, evidence: string): IntakePeriodDetection {
  const mm = pad2(month)
  return {
    periodType: 'monthly',
    periodStart: `${year}-${mm}-01`,
    periodEnd: `${year}-${mm}-${lastDayOfMonth(year, mm)}`,
    evidence,
  }
}

function rangePeriod(startYear: string, startMonth: string, endYear: string, endMonth: string, evidence: string): IntakePeriodDetection {
  const start = `${startYear}-${pad2(startMonth)}-01`
  const endMonthPadded = pad2(endMonth)
  const end = `${endYear}-${endMonthPadded}-${lastDayOfMonth(endYear, endMonthPadded)}`
  const periodType = startYear === endYear && pad2(startMonth) === endMonthPadded
    ? 'monthly'
    : startYear === endYear && pad2(startMonth) === '01' && endMonthPadded === '12'
      ? 'annual'
      : 'range'
  return { periodType, periodStart: start, periodEnd: end, evidence }
}

function dateRangePeriod(startYear: string, startMonth: string, startDay: string, endYear: string, endMonth: string, endDay: string, evidence: string): IntakePeriodDetection {
  return {
    periodType: startYear === endYear && startMonth === endMonth ? 'monthly' : 'range',
    periodStart: `${startYear}-${pad2(startMonth)}-${pad2(startDay)}`,
    periodEnd: `${endYear}-${pad2(endMonth)}-${pad2(endDay)}`,
    evidence,
  }
}

function slashYear(year: string) {
  return year.length === 2 ? `20${year}` : year
}

function detectSlashMonthRange(text: string): IntakePeriodDetection | null {
  const matches = [...text.matchAll(/\b(0?[1-9]|1[0-2])\/1\/(\d{2,4})\b/g)]
  if (matches.length < 2) return null
  const first = matches[0]
  const last = matches[matches.length - 1]
  return rangePeriod(slashYear(first[2]), first[1], slashYear(last[2]), last[1], `${first[0]} 至 ${last[0]}`)
}

export function detectIntakePeriod(input: IntakeMaterialSignal): IntakePeriodDetection {
  const text = [
    input.fileName || '',
    ...(input.sheetNames || []),
    input.textSample || '',
  ].join('\n')

  const dateRange = text.match(/(20\d{2})[年/-]\s*(0?[1-9]|1[0-2])[月/-]\s*(3[01]|[12]\d|0?[1-9])日?\s*(?:至|到|-)\s*(20\d{2})[年/-]\s*(0?[1-9]|1[0-2])[月/-]\s*(3[01]|[12]\d|0?[1-9])日?/)
  if (dateRange) return dateRangePeriod(dateRange[1], dateRange[2], dateRange[3], dateRange[4], dateRange[5], dateRange[6], dateRange[0])

  const compactRange = text.match(/(20\d{2})(0[1-9]|1[0-2])\s*[-至到]\s*(20\d{2})(0[1-9]|1[0-2])/)
  if (compactRange) return rangePeriod(compactRange[1], compactRange[2], compactRange[3], compactRange[4], compactRange[0])

  const chineseRange = text.match(/(20\d{2})\s*年\s*(0?[1-9]|1[0-2])\s*月\s*(?:-|至|到)\s*(20\d{2})?\s*年?\s*(0?[1-9]|1[0-2])\s*月/)
  if (chineseRange) return rangePeriod(chineseRange[1], chineseRange[2], chineseRange[3] || chineseRange[1], chineseRange[4], chineseRange[0])

  const compactMonth = text.match(/(?:^|[^\d])(?:税款所属期|所属期|期间)?[：:\s（(]*(20\d{2})(0[1-9]|1[0-2])(?:[）)]|$|[^\d])/)
  if (compactMonth) return monthPeriod(compactMonth[1], compactMonth[2], compactMonth[0].trim())

  const chineseMonth = text.match(/(20\d{2})\s*年\s*(0?[1-9]|1[0-2])\s*月/)
  if (chineseMonth) return monthPeriod(chineseMonth[1], chineseMonth[2], chineseMonth[0])

  const slashRange = detectSlashMonthRange(text)
  if (slashRange) return slashRange

  return {
    periodType: 'unknown',
    periodStart: '',
    periodEnd: '',
    evidence: '',
  }
}
