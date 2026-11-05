type FieldKind = 'text' | 'amount' | 'date' | 'identity'
type MappingField = { key: string; label: string; kind: FieldKind; required: boolean }
type MappingSchema = { label: string; recordType: string; subtype: string; fields: MappingField[] }

export const confirmedExcelSource = '用户确认的 Excel 列映射'

const field = (key: string, label: string, kind: FieldKind = 'text', required = false): MappingField => (
  { key, label, kind, required }
)
const money = (key: string, label: string, required = false) => field(key, label, 'amount', required)
const statementFields = [
  field('lineName', '项目名称', 'text', true),
  field('lineCode', '项目行次'),
]
const incomeFields = [...statementFields, money('currentAmount', '本期金额'), money('cumulativeAmount', '本年累计金额')]
const accountFields = [field('accountCode', '科目编码', 'text', true), field('accountName', '科目名称', 'text', true)]
const invoiceFields = [
  field('invoiceNo', '发票号码', 'text', true), field('invoiceDate', '开票日期', 'date', true),
  money('amount', '不含税金额', true), money('taxAmount', '税额', true),
  field('counterpartyName', '对方单位名称'), field('counterpartyCreditCode', '对方纳税人识别号'),
]

export const excelMappingSchemas: Record<string, MappingSchema> = {
  income_statement: { label: '利润表', recordType: 'financial_statement', subtype: 'income_statement', fields: incomeFields },
  cash_flow_statement: { label: '现金流量表', recordType: 'financial_statement', subtype: 'cash_flow_statement', fields: incomeFields },
  balance_sheet: {
    label: '资产负债表', recordType: 'financial_statement', subtype: 'balance_sheet',
    fields: [...statementFields, money('endingAmount', '期末余额'), money('beginningAmount', '期初余额')],
  },
  account_balance: {
    label: '科目余额表', recordType: 'account_balance', subtype: 'account_balance_line',
    fields: [...accountFields, money('openingDebit', '期初借方'), money('openingCredit', '期初贷方'),
      money('currentDebit', '本期借方'), money('currentCredit', '本期贷方'), money('ytdDebit', '累计借方'),
      money('ytdCredit', '累计贷方'), money('endingDebit', '期末借方'), money('endingCredit', '期末贷方')],
  },
  ledger: {
    label: '明细账', recordType: 'ledger', subtype: 'ledger_entry',
    fields: [...accountFields, field('entryDate', '交易日期', 'date', true), field('voucherNo', '凭证字号'),
      field('summary', '摘要'), money('debitAmount', '借方金额'), money('creditAmount', '贷方金额'), money('balanceAmount', '余额')],
  },
  input_invoice: {
    label: '进项发票清单', recordType: 'invoice_list', subtype: 'input_invoice',
    fields: [...invoiceFields, money('effectiveDeductionTax', '有效抵扣税额')],
  },
  output_invoice: { label: '销项发票清单', recordType: 'invoice_list', subtype: 'output_invoice', fields: invoiceFields },
  payroll: {
    label: '工资表', recordType: 'payroll', subtype: 'payroll_line',
    fields: [field('employeeName', '员工姓名', 'text', true), field('idNumber', '证件号码', 'identity', true),
      money('grossPay', '应发工资', true), money('netPay', '实发工资'), money('socialSecurity', '个人社保合计'),
      money('housingFund', '个人公积金'), money('taxableIncome', '应纳税所得额'), money('taxWithheld', '代扣个税')],
  },
  iit_withholding: {
    label: '个税扣缴明细', recordType: 'iit_withholding', subtype: 'iit_return_line',
    fields: [field('personName', '人员姓名', 'text', true), field('idNumberMasked', '证件号码', 'identity', true),
      field('incomeItem', '所得项目'), money('currentIncome', '本期收入'), money('cumulativeIncome', '累计收入'),
      money('taxableIncome', '应纳税所得额'), money('taxWithheld', '本期扣缴税额')],
  },
}

export type ExcelColumnMapping = { kind: string; columns: Record<string, number> }

export function validateExcelColumnMapping(value: unknown, headers: string[]): ExcelColumnMapping | null {
  if (!value || typeof value !== 'object') return null
  const { kind, columns } = value as Partial<ExcelColumnMapping>
  if (!kind || !Object.hasOwn(excelMappingSchemas, kind) || !columns || typeof columns !== 'object' || Array.isArray(columns)) return null
  const allowed = new Set(excelMappingSchemas[kind].fields.map(({ key }) => key))
  const entries = Object.entries(columns)
  const indexes = entries.map(([, column]) => column)
  if (new Set(indexes).size !== indexes.length || entries.some(([key, column]) => (
    !allowed.has(key) || !Number.isInteger(column) || column < 0 || !headers[column]?.trim()
  ))) return null
  return { kind, columns: Object.fromEntries(entries) }
}
