import type { IntakeDocumentType } from './intakeClassifier'

export type IntakeSheet = {
  name: string
  rows: string[][]
}

export type StandardTaxRecord = {
  id: string
  recordType: string
  recordSubtype?: string
  periodStart?: string
  periodEnd?: string
  confidence: 'high' | 'medium' | 'low'
  payload: Record<string, unknown>
}

export type StandardTaxEvidence = {
  targetId: string
  targetTable: string
  targetField: string
  rawValue: string
  normalizedValue: string
  confidence: 'high' | 'medium' | 'low'
  sheetName?: string
  rowNo?: number
  columnNo?: number
  pageNo?: number
  note?: string
}

export type StandardTaxConflict = {
  conflictType: string
  fieldName: string
  incomingValue: string
  severity: 'low' | 'medium' | 'high'
  status: 'open'
}

export type ParsedTaxDataIntake = {
  documentTypes: IntakeDocumentType[]
  records: StandardTaxRecord[]
  evidenceFields: StandardTaxEvidence[]
  conflicts: StandardTaxConflict[]
  warnings: string[]
  recordCounts: Record<string, number>
}

type Period = { periodStart?: string; periodEnd?: string }

const amountPattern = /^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/

function clean(value: unknown) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function normalized(value: unknown) {
  return clean(value).replace(/[\s：:（）()_/-]/g, '')
}

function amount(value: unknown) {
  const text = clean(value).replace(/[￥¥元，,\s]/g, '').replace(/^\((.+)\)$/, '-$1')
  if (!text || text === '-' || text === '--' || !amountPattern.test(text)) return null
  const result = Number(text)
  return Number.isFinite(result) ? result : null
}

function isoDate(value: unknown) {
  const text = clean(value)
  const match = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/)
  if (!match) return ''
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
}

function monthPeriod(year: string, month: string): Period {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return {}
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return {
    periodStart: `${year}-${String(m).padStart(2, '0')}-01`,
    periodEnd: `${year}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function detectTaxDataPeriod(text: string): Period {
  const range = text.match(/(20\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-](?:\s*\d{1,2}\s*日?)?\s*(?:至|到|[-~—])\s*(20\d{2})\s*[年./-]\s*(\d{1,2})(?:\s*[月./-]\s*(\d{1,2})\s*日?)?/)
  if (range) {
    const start = monthPeriod(range[1], range[2])
    const end = monthPeriod(range[3], range[4])
    return { periodStart: start.periodStart, periodEnd: range[5] ? `${range[3]}-${range[4].padStart(2, '0')}-${range[5].padStart(2, '0')}` : end.periodEnd }
  }
  const compactRange = text.match(/(20\d{2})(\d{2})\s*[-~—]\s*(20\d{2})(\d{2})/)
  if (compactRange) {
    return { periodStart: monthPeriod(compactRange[1], compactRange[2]).periodStart, periodEnd: monthPeriod(compactRange[3], compactRange[4]).periodEnd }
  }
  const fullDates = Array.from(text.matchAll(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/g))
  if (fullDates.length >= 2) return { periodStart: isoDate(fullDates[0][0]), periodEnd: isoDate(fullDates[1][0]) }
  const compact = text.match(/(20\d{2})(\d{2})(?!\d)/)
  if (compact) return monthPeriod(compact[1], compact[2])
  const month = text.match(/(20\d{2})\s*[年./-]\s*(\d{1,2})\s*月?/)
  return month ? monthPeriod(month[1], month[2]) : {}
}

function maskId(value: unknown) {
  const text = clean(value)
  if (!text) return ''
  if (text.includes('*')) return text
  if (text.length <= 8) return `${text.slice(0, 2)}****${text.slice(-2)}`
  return `${text.slice(0, 4)}**********${text.slice(-4)}`
}

function headerIndex(headers: string[], patterns: RegExp[]) {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(normalized(header))))
}

function findHeaderRow(rows: string[][], required: RegExp[], limit = 12) {
  let best = { index: -1, score: 0 }
  rows.slice(0, limit).forEach((row, index) => {
    const score = required.filter((pattern) => row.some((cell) => pattern.test(normalized(cell)))).length
    if (score > best.score) best = { index, score }
  })
  return best.score >= Math.min(2, required.length) ? best.index : -1
}

function makeRecord(type: string, subtype: string, payload: Record<string, unknown>, period: Period, confidence: StandardTaxRecord['confidence'] = 'high') {
  return {
    id: crypto.randomUUID(),
    recordType: type,
    recordSubtype: subtype,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    confidence,
    payload,
  } satisfies StandardTaxRecord
}

function evidenceFor(record: StandardTaxRecord, sheetName: string, rowNo: number, fields: Array<[string, unknown, number?]>) {
  return fields.filter(([, value]) => clean(value)).map(([field, value, columnNo]) => ({
    targetId: record.id,
    targetTable: 'tax_data_standard_records',
    targetField: field,
    rawValue: field.toLowerCase().includes('idnumber') ? maskId(value) : clean(value),
    normalizedValue: field.toLowerCase().includes('idnumber') ? maskId(value) : clean(value),
    confidence: record.confidence,
    sheetName,
    rowNo,
    columnNo,
  } satisfies StandardTaxEvidence))
}

function parseAccountBalance(sheet: IntakeSheet, period: Period) {
  const header = findHeaderRow(sheet.rows, [/科目编码/, /科目名称/, /期末余额|本期发生额/])
  if (header < 0) return []
  const second = sheet.rows[header + 1] || []
  const records: StandardTaxRecord[] = []
  const headers = sheet.rows[header].map((cell, index) => `${cell}${second[index] || ''}`)
  const codeIndex = headerIndex(headers, [/科目编码/])
  const nameIndex = headerIndex(headers, [/科目名称/])
  const indexes = {
    openingDebit: headerIndex(headers, [/期初余额借方/]), openingCredit: headerIndex(headers, [/期初余额贷方/]),
    currentDebit: headerIndex(headers, [/本期发生额借方/]), currentCredit: headerIndex(headers, [/本期发生额贷方/]),
    ytdDebit: headerIndex(headers, [/本年累计发生额借方/]), ytdCredit: headerIndex(headers, [/本年累计发生额贷方/]),
    endingDebit: headerIndex(headers, [/期末余额借方/]), endingCredit: headerIndex(headers, [/期末余额贷方/]),
  }
  const dataStart = header + (second.some((cell) => /借方|贷方/.test(cell)) ? 2 : 1)
  sheet.rows.slice(dataStart).forEach((row, offset) => {
    const accountCode = clean(row[codeIndex])
    const accountName = clean(row[nameIndex])
    if (!/^\d{3,}$/.test(accountCode) || !accountName || /合计/.test(accountName)) return
    const payload: Record<string, unknown> = { accountCode, accountName, sourceRowNo: dataStart + offset + 1 }
    Object.entries(indexes).forEach(([field, index]) => { if (index >= 0) payload[field] = amount(row[index]) })
    const record = makeRecord('account_balance', 'account_balance_line', payload, period)
    records.push(record)
    records.push(...[])
  })
  return records
}

function parseLedger(sheet: IntakeSheet, period: Period) {
  const header = findHeaderRow(sheet.rows, [/日期/, /凭证字号|凭证号/, /摘要/, /借方/, /贷方/], 8)
  if (header < 0) return []
  const headers = sheet.rows[header]
  const index = {
    date: headerIndex(headers, [/日期/]), voucherNo: headerIndex(headers, [/凭证字号|凭证号/]),
    accountCode: headerIndex(headers, [/科目编码/]), accountName: headerIndex(headers, [/科目名称/]), summary: headerIndex(headers, [/摘要/]),
    debitAmount: headerIndex(headers, [/^借方$/]), creditAmount: headerIndex(headers, [/^贷方$/]), direction: headerIndex(headers, [/方向/]), balanceAmount: headerIndex(headers, [/余额/]),
  }
  return sheet.rows.slice(header + 1).flatMap((row, offset) => {
    const entryDate = isoDate(row[index.date])
    const accountCode = clean(row[index.accountCode])
    const accountName = clean(row[index.accountName])
    const summary = clean(row[index.summary])
    if (!entryDate || !accountCode || !accountName || /^(期初余额|本期合计|本年累计)$/.test(summary)) return []
    return [makeRecord('ledger', 'ledger_entry', {
      entryDate, voucherNo: clean(row[index.voucherNo]), accountCode, accountName, summary,
      debitAmount: amount(row[index.debitAmount]), creditAmount: amount(row[index.creditAmount]),
      direction: clean(row[index.direction]), balanceAmount: amount(row[index.balanceAmount]), sourceRowNo: header + offset + 2,
    }, period)]
  })
}

function parseFinancialStatement(sheet: IntakeSheet, period: Period) {
  const header = findHeaderRow(sheet.rows, [/项目|资产/, /行次/, /本年累计|本期金额|期末余额|年初余额/])
  if (header < 0) return []
  const headers = sheet.rows[header]
  const subtype = /资产负债表/.test(sheet.rows.slice(0, 5).flat().join('')) ? 'balance_sheet'
    : /现金流量表/.test(sheet.rows.slice(0, 5).flat().join('')) ? 'cash_flow_statement' : 'income_statement'
  const records: StandardTaxRecord[] = []
  const addLine = (row: string[], labelIndex: number, rowNo: number) => {
    const lineName = clean(row[labelIndex])
    if (!lineName || /^(资产|负债|所有者权益|项目)$/.test(normalized(lineName)) || /：$/.test(lineName)) return
    const lineCode = clean(row[labelIndex + 1])
    const firstHeader = normalized(headers[labelIndex + 2])
    const secondHeader = normalized(headers[labelIndex + 3])
    const payload: Record<string, unknown> = { statementType: subtype, lineName, lineCode, rowNo, sourceRowNo: rowNo }
    const assign = (headerText: string, value: unknown) => {
      if (/本年累计/.test(headerText)) payload.cumulativeAmount = amount(value)
      else if (/本期|本月/.test(headerText)) payload.currentAmount = amount(value)
      else if (/年初|期初/.test(headerText)) payload.beginningAmount = amount(value)
      else if (/期末/.test(headerText)) payload.endingAmount = amount(value)
    }
    assign(firstHeader, row[labelIndex + 2]); assign(secondHeader, row[labelIndex + 3])
    if (![payload.currentAmount, payload.cumulativeAmount, payload.beginningAmount, payload.endingAmount].some((value) => value !== null && value !== undefined)) return
    records.push(makeRecord('financial_statement', subtype, payload, period))
  }
  sheet.rows.slice(header + 1).forEach((row, offset) => {
    addLine(row, 0, header + offset + 2)
    if (row.length >= 8) addLine(row, 4, header + offset + 2)
  })
  return records
}

function parsePayroll(sheet: IntakeSheet, period: Period) {
  const header = findHeaderRow(sheet.rows, [/姓名/, /身份证件号码|证件号码/, /工资|应发工资/, /税率|应纳税所得额/])
  if (header < 0) return []
  const headers = sheet.rows[header]
  const idx = {
    employeeName: headerIndex(headers, [/姓名/]), idType: headerIndex(headers, [/身份证件类型|证件类型/]), idNumber: headerIndex(headers, [/身份证件号码|证件号码/]),
    grossPay: headerIndex(headers, [/^工资$|应发工资|收入额/]), pension: headerIndex(headers, [/养老保险/]), medicalInsurance: headerIndex(headers, [/医疗保险/]),
    unemploymentInsurance: headerIndex(headers, [/失业保险/]), housingFund: headerIndex(headers, [/住房公积金|住房基金/]), taxableIncome: headerIndex(headers, [/应纳税所得额/]),
    taxRate: headerIndex(headers, [/税率|预扣率/]), taxWithheld: headerIndex(headers, [/应补退税额|应纳税额|已扣缴税额/]),
  }
  return sheet.rows.slice(header + 1).flatMap((row, offset) => {
    const employeeName = clean(row[idx.employeeName])
    if (!employeeName || /合计/.test(employeeName)) return []
    const pension = amount(row[idx.pension])
    const medical = amount(row[idx.medicalInsurance])
    const unemployment = amount(row[idx.unemploymentInsurance])
    return [makeRecord('payroll', 'payroll_line', {
      employeeName, idType: clean(row[idx.idType]), idNumberMasked: maskId(row[idx.idNumber]), grossPay: amount(row[idx.grossPay]),
      socialSecurity: [pension, medical, unemployment].reduce<number>((sum, value) => sum + (value || 0), 0), medicalInsurance: medical,
      unemploymentInsurance: unemployment, housingFund: amount(row[idx.housingFund]), taxableIncome: amount(row[idx.taxableIncome]),
      taxRate: amount(row[idx.taxRate]), taxWithheld: amount(row[idx.taxWithheld]), sourceRowNo: header + offset + 2,
    }, period)]
  })
}

function parseIit(sheet: IntakeSheet, period: Period) {
  const header = findHeaderRow(sheet.rows, [/姓名/, /身份证件号码|证件号码/, /所得项目/], 12)
  if (header < 0) return []
  const firstDataOffset = sheet.rows.slice(header + 1, header + 5).findIndex((row) => (
    row.some((cell) => /^\d{10,18}[0-9Xx]?$/.test(clean(cell)))
  ))
  const dataStart = firstDataOffset >= 0 ? header + 1 + firstDataOffset : Math.min(header + 4, sheet.rows.length)
  const headerRows = sheet.rows.slice(header, dataStart)
  const width = Math.max(...headerRows.map((row) => row.length))
  const headers = Array.from({ length: width }, (_, column) => headerRows.map((row) => clean(row[column])).filter(Boolean).join(''))
  const idx = {
    personName: headerIndex(headers, [/姓名/]), idType: headerIndex(headers, [/身份证件类型|证件类型/]), idNumber: headerIndex(headers, [/身份证件号码|证件号码/]), incomeItem: headerIndex(headers, [/所得项目/]),
    currentIncome: headerIndex(headers, [/本月次.*收入|收入额计算/]), cumulativeIncome: headerIndex(headers, [/累计收入额/]), cumulativeDeduction: headerIndex(headers, [/累计减除费用/]),
    taxableIncome: headerIndex(headers, [/应纳税所得额/]), taxRate: headerIndex(headers, [/税率|预扣率/]), taxWithheld: headerIndex(headers, [/应补退税额|应纳税额|已扣缴税额/]),
  }
  return sheet.rows.slice(dataStart).flatMap((row, offset) => {
    const personName = clean(row[idx.personName])
    if (!personName || /合计/.test(personName)) return []
    return [makeRecord('iit_withholding', 'iit_return_line', {
      personName, idType: clean(row[idx.idType]), idNumberMasked: maskId(row[idx.idNumber]), incomeItem: clean(row[idx.incomeItem]),
      currentIncome: amount(row[idx.currentIncome]), cumulativeIncome: amount(row[idx.cumulativeIncome]), cumulativeDeduction: amount(row[idx.cumulativeDeduction]),
      taxableIncome: amount(row[idx.taxableIncome]), taxRate: amount(row[idx.taxRate]), taxWithheld: amount(row[idx.taxWithheld]), sourceRowNo: dataStart + offset + 1,
    }, period, 'medium')]
  })
}

function parseInvoice(sheet: IntakeSheet, period: Period) {
  const header = findHeaderRow(sheet.rows, [/发票号码|数电发票号码/, /开票日期|填发日期/, /金额|税款金额/], 10)
  if (header < 0) return []
  const headers = sheet.rows[header]
  const idx = {
    invoiceNo: headerIndex(headers, [/数电发票号码|发票号码|海关缴款书号码|完税凭证号/]), invoiceCode: headerIndex(headers, [/发票代码/]), invoiceDate: headerIndex(headers, [/开票日期|填发日期/]),
    creditCode: headerIndex(headers, [/销售方纳税人识别号|被扣缴人纳税人识别号/]), name: headerIndex(headers, [/销售方纳税人名称|被扣缴人纳税人名称/]), goodsName: headerIndex(headers, [/货物|商品|服务名称/]),
    amount: headerIndex(headers, [/^金额$|计税金额|税款金额/]), taxAmount: headerIndex(headers, [/^税额$|实缴金额/]), deduction: headerIndex(headers, [/有效抵扣税额|本期加计扣除税额/]), status: headerIndex(headers, [/发票状态|勾选状态/]),
  }
  return sheet.rows.slice(header + 1).flatMap((row, offset) => {
    const invoiceNo = clean(row[idx.invoiceNo])
    const invoiceDate = isoDate(row[idx.invoiceDate])
    if ((!invoiceNo && !invoiceDate) || /合计/.test(row.join(''))) return []
    return [makeRecord('invoice_list', 'input_invoice', {
      invoiceDirection: 'input', invoiceNo, invoiceCode: clean(row[idx.invoiceCode]), invoiceDate,
      counterpartyCreditCode: clean(row[idx.creditCode]), counterpartyName: clean(row[idx.name]), goodsName: clean(row[idx.goodsName]),
      amount: amount(row[idx.amount]), taxAmount: amount(row[idx.taxAmount]), effectiveDeductionTax: amount(row[idx.deduction]), invoiceStatus: clean(row[idx.status]), sourceRowNo: header + offset + 2,
    }, period)]
  })
}

function classifySheet(fileName: string, sheet: IntakeSheet): IntakeDocumentType {
  const sample = `${fileName} ${sheet.name} ${sheet.rows.slice(0, 10).flat().join(' ')}`
  if (/明细账|凭证字号/.test(sample)) return 'ledger'
  if (/科目余额表|期初余额.*本期发生额.*期末余额/.test(sample)) return 'account_balance'
  if (/个人所得税扣缴申报表|综合所得申报/.test(sample)) return 'iit_withholding'
  if (/工资表|应发工资/.test(sample)) return 'payroll'
  if (/发票清单|数电发票号码|海关缴款书/.test(sample)) return 'invoice_list'
  if (/资产负债表|利润表|现金流量表/.test(sample)) return 'financial_statement'
  return 'other_material'
}

function emptyResult(): ParsedTaxDataIntake {
  return { documentTypes: [], records: [], evidenceFields: [], conflicts: [], warnings: [], recordCounts: {} }
}

export function parseTaxDataWorkbook(fileName: string, sheets: IntakeSheet[]): ParsedTaxDataIntake {
  const result = emptyResult()
  sheets.forEach((sheet) => {
    if (!sheet.rows.length) return
    const documentType = classifySheet(fileName, sheet)
    if (documentType === 'other_material') return
    const period = detectTaxDataPeriod(`${fileName} ${sheet.rows.slice(0, 6).flat().join(' ')}`)
    let records: StandardTaxRecord[] = []
    if (documentType === 'ledger') records = parseLedger(sheet, period)
    if (documentType === 'account_balance') records = parseAccountBalance(sheet, period)
    if (documentType === 'financial_statement') records = parseFinancialStatement(sheet, period)
    if (documentType === 'payroll') records = parsePayroll(sheet, period)
    if (documentType === 'iit_withholding') records = parseIit(sheet, period)
    if (documentType === 'invoice_list') records = parseInvoice(sheet, period)
    if (!records.length) result.warnings.push(`${sheet.name} 已识别为${documentType}，但未找到可落表的数据行。`)
    records.forEach((record, index) => {
      result.records.push(record)
      const sourceRowNo = Number(record.payload.sourceRowNo) || index + 1
      result.evidenceFields.push(...evidenceFor(record, sheet.name, sourceRowNo, Object.entries(record.payload).filter(([field]) => field !== 'sourceRowNo').slice(0, 3).map(([field, value]) => [field, value])))
    })
    result.documentTypes.push(documentType)
  })
  result.documentTypes = Array.from(new Set(result.documentTypes))
  result.records.forEach((record) => { result.recordCounts[record.recordType] = (result.recordCounts[record.recordType] || 0) + 1 })
  if (result.records.some((record) => !record.periodStart || !record.periodEnd)) {
    result.conflicts.push({ conflictType: 'missing_period', fieldName: 'period', incomingValue: '', severity: 'high', status: 'open' })
  }
  return result
}

function vatLineRecords(text: string, period: Period) {
  const records: StandardTaxRecord[] = []
  const formName = text.includes('附列资料（四）') ? '增值税及附加税费申报表附列资料（四）' : '增值税及附加税费申报表'
  const valuePattern = '-?[\\d,]+\\.\\d{2}'
  const patterns: Array<{ regex: RegExp; rowIndex: number; nameIndex: number; valueStartIndex: number }> = [
    { regex: new RegExp(`(?:^|\\n)\\s*(\\d{1,2})\\s+([^\\n]+?)\\s+(${valuePattern})(?:\\s+(${valuePattern}))?(?:\\s+(${valuePattern}))?(?:\\s+(${valuePattern}))?`, 'g'), rowIndex: 1, nameIndex: 2, valueStartIndex: 3 },
    { regex: new RegExp(`(?:^|\\n)\\s*([^\\n\\d][^\\n]*?)\\s+(\\d{1,2}(?:=[^\\s]+)?)\\s+(${valuePattern})(?:\\s+(${valuePattern}))?(?:\\s+(${valuePattern}))?(?:\\s+(${valuePattern}))?`, 'g'), rowIndex: 2, nameIndex: 1, valueStartIndex: 3 },
  ]
  const seen = new Set<string>()
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern.regex)) {
      const itemName = clean(match[pattern.nameIndex])
      const rowNo = clean(match[pattern.rowIndex])
      if (!itemName || /序号|项目|栏次/.test(itemName) || seen.has(`${rowNo}:${itemName}`)) continue
      const values = match.slice(pattern.valueStartIndex, pattern.valueStartIndex + 4).map((value) => amount(value))
      seen.add(`${rowNo}:${itemName}`)
      records.push(makeRecord('vat_return', 'vat_return_line', {
        formName,
        rowNo,
        itemName,
        currentAmount: values[0],
        cumulativeAmount: values[1],
        currentTax: values[2],
        cumulativeTax: values[3],
        fieldCode: `${formName.includes('附列资料（四）') ? 'vat_schedule4' : 'vat_main'}_row_${rowNo}`,
      }, period, 'medium'))
    }
  }
  return records
}

export function parseTaxDataPdfText(fileName: string, pages: string[]): ParsedTaxDataIntake {
  const result = emptyResult()
  const text = pages.join('\n')
  if (!/增值税.*申报表/.test(`${fileName} ${text}`)) {
    result.warnings.push('PDF 已提取文本，但尚无匹配的专用解析器。')
    return result
  }
  result.documentTypes = [/附列资料|附表/.test(`${fileName} ${text}`) ? 'vat_return_schedule' : 'vat_return']
  const period = detectTaxDataPeriod(`${fileName} ${text.slice(0, 1500)}`)
  result.records = vatLineRecords(text, period)
  result.recordCounts.vat_return = result.records.length
  result.records.forEach((record, index) => {
    result.evidenceFields.push(...evidenceFor(record, '', index + 1, Object.entries(record.payload).slice(0, 3).map(([field, value]) => [field, value])))
  })
  if (!result.records.length) result.warnings.push('已识别增值税申报表，但文本布局未匹配到明细行，需要人工复核或 OCR。')
  if (!period.periodStart || !period.periodEnd) result.conflicts.push({ conflictType: 'missing_period', fieldName: 'period', incomingValue: '', severity: 'high', status: 'open' })
  return result
}
