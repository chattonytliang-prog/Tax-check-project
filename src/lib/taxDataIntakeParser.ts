import type { IntakeDocumentType } from './intakeClassifier'
import { matchPdfTemplate, matchWorkbookTemplate, type TemplateMatch, type TemplateValidation } from './taxDataTemplateRules'

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
  profilePatch?: {
    name?: string
    creditCode?: string
    taxpayerType?: string
  }
  documentTypes: IntakeDocumentType[]
  records: StandardTaxRecord[]
  evidenceFields: StandardTaxEvidence[]
  conflicts: StandardTaxConflict[]
  warnings: string[]
  recordCounts: Record<string, number>
  templateMatches: TemplateMatch[]
  autoImportEligible: boolean
}

type Period = { periodStart?: string; periodEnd?: string }

const amountPattern = /^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/

function clean(value: unknown) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function normalized(value: unknown) {
  return clean(value).replace(/[\s：:（）()_/-]/g, '')
}

function normalizeCreditCode(value: unknown) {
  const match = clean(value).toUpperCase().match(/[0-9A-Z]{15,20}/)
  return match?.[0] || ''
}

function isLikelyCompanyName(value: string) {
  return /公司|企业|厂|店|中心|事务所|合作社/.test(value) && !/名称|项目|科目|销售方|购买方|扣缴|纳税人/.test(value)
}

function mergeProfilePatch(result: ParsedTaxDataIntake, patch: ParsedTaxDataIntake['profilePatch']) {
  if (!patch) return
  result.profilePatch = {
    ...result.profilePatch,
    ...Object.fromEntries(Object.entries(patch).filter(([, value]) => clean(value))),
  }
}

function extractProfilePatchFromText(text: string): ParsedTaxDataIntake['profilePatch'] {
  const patch: ParsedTaxDataIntake['profilePatch'] = {}
  const creditCode = normalizeCreditCode(text.match(/(?:统一社会信用代码|纳税人识别号|税号)[^0-9A-Z]{0,30}([0-9A-Z]{15,20})/i)?.[1])
  if (creditCode) patch.creditCode = creditCode
  const nameMatch = text.match(/(?:纳税人名称|扣缴义务人名称|编制单位|核算单位|单位)[:：\s]*([^|。\n\r]{4,80})/)
  const name = clean(nameMatch?.[1]).replace(/金额单位.*$/, '').replace(/单位[:：]?.*$/, '').trim()
  if (isLikelyCompanyName(name)) patch.name = name
  if (/一般纳税人适用|一般纳税人/.test(text)) patch.taxpayerType = '一般纳税人'
  if (/小规模纳税人/.test(text)) patch.taxpayerType = '小规模纳税人'
  return patch
}

function extractProfilePatchFromRows(fileName: string, sheet: IntakeSheet): ParsedTaxDataIntake['profilePatch'] {
  const text = `${fileName}\n${sheet.name}\n${sheet.rows.slice(0, 25).map((row) => row.join(' | ')).join('\n')}`
  const patch = extractProfilePatchFromText(text) || {}
  for (const row of sheet.rows.slice(0, 15)) {
    for (let index = 0; index < row.length; index += 1) {
      const cell = clean(row[index])
      const next = clean(row[index + 1])
      if (!patch.creditCode && /^(?:统一社会信用代码|纳税人识别号|税号)$/.test(cell)) {
        const code = normalizeCreditCode(next)
        if (code) patch.creditCode = code
      }
      if (!patch.name && /^(?:纳税人名称|扣缴义务人名称|编制单位|核算单位|单位)$/.test(cell)) {
        if (isLikelyCompanyName(next)) patch.name = next
      }
    }
  }
  return patch
}

function amount(value: unknown) {
  const text = clean(value).replace(/[￥¥元，,\s]/g, '').replace(/^\((.+)\)$/, '-$1')
  if (!text || text === '-' || text === '--' || !amountPattern.test(text)) return null
  const result = Number(text)
  return Number.isFinite(result) ? result : null
}

function isoDate(value: unknown) {
  const text = clean(value)
  const normalMatch = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/)
  if (normalMatch) return `${normalMatch[1]}-${normalMatch[2].padStart(2, '0')}-${normalMatch[3].padStart(2, '0')}`
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

function shortDateMonthPeriod(text: string): Period {
  const match = text.match(/(?:^|\s)(\d{1,2})\/(\d{1,2})\/(\d{2})(?:\s|$)/)
  return match ? monthPeriod(`20${match[3]}`, match[1]) : {}
}

export function detectTaxDataPeriod(text: string): Period {
  const topCompactRange = text.match(/(20\d{2})(\d{2})\s*[-~—至到]\s*(20\d{2})(\d{2})/)
  if (topCompactRange) {
    return { periodStart: monthPeriod(topCompactRange[1], topCompactRange[2]).periodStart, periodEnd: monthPeriod(topCompactRange[3], topCompactRange[4]).periodEnd }
  }
  const normalDateRange = text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?\s*(?:至|到|-)\s*(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/)
  if (normalDateRange) {
    return {
      periodStart: `${normalDateRange[1]}-${normalDateRange[2].padStart(2, '0')}-${normalDateRange[3].padStart(2, '0')}`,
      periodEnd: `${normalDateRange[4]}-${normalDateRange[5].padStart(2, '0')}-${normalDateRange[6].padStart(2, '0')}`,
    }
  }
  const normalFullDates = Array.from(text.matchAll(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/g))
  if (normalFullDates.length >= 2) return { periodStart: isoDate(normalFullDates[0][0]), periodEnd: isoDate(normalFullDates[1][0]) }
  const annual = text.match(/(20\d{2})\s*(?:年年度|年度|年企业所得税年报|年年报)/)
  if (annual) return { periodStart: `${annual[1]}-01-01`, periodEnd: `${annual[1]}-12-31` }
  const shortQuarter = text.match(/(?:20)?(\d{2})\s*年\s*([1-4])\s*季度/)
  if (shortQuarter) {
    const year = `20${shortQuarter[1]}`
    const startMonth = (Number(shortQuarter[2]) - 1) * 3 + 1
    const endMonth = startMonth + 2
    return {
      periodStart: `${year}-${String(startMonth).padStart(2, '0')}-01`,
      periodEnd: monthPeriod(year, String(endMonth)).periodEnd,
    }
  }
  const normalCompactRange = text.match(/(20\d{2})(\d{2})\s*[-~—至到]\s*(20\d{2})(\d{2})/)
  if (normalCompactRange) {
    return { periodStart: monthPeriod(normalCompactRange[1], normalCompactRange[2]).periodStart, periodEnd: monthPeriod(normalCompactRange[3], normalCompactRange[4]).periodEnd }
  }
  const normalDottedRange = text.match(/(20\d{2})\.(\d{1,2})\s*-\s*(?:(20\d{2})\.)?(\d{1,2})/)
  if (normalDottedRange) {
    const start = monthPeriod(normalDottedRange[1], normalDottedRange[2])
    const end = monthPeriod(normalDottedRange[3] || normalDottedRange[1], normalDottedRange[4])
    return { periodStart: start.periodStart, periodEnd: end.periodEnd }
  }
  const normalMonthRange = text.match(/(20\d{2})\s*年?\s*(\d{1,2})\s*月?\s*(?:至|到|-)\s*(?:(20\d{2})\s*年?)?\s*(\d{1,2})\s*月?/)
  if (normalMonthRange) {
    const start = monthPeriod(normalMonthRange[1], normalMonthRange[2])
    const end = monthPeriod(normalMonthRange[3] || normalMonthRange[1], normalMonthRange[4])
    return { periodStart: start.periodStart, periodEnd: end.periodEnd }
  }
  const normalCompact = text.match(/(20\d{2})(\d{2})(?!\d)/)
  if (normalCompact) return monthPeriod(normalCompact[1], normalCompact[2])
  const normalMonth = text.match(/(20\d{2})\s*[年./-]\s*(\d{1,2})\s*月?/)
  if (normalMonth) return monthPeriod(normalMonth[1], normalMonth[2])
  const earlyCompactRange = text.match(/(20\d{2})(\d{2})\s*[-~—]\s*(20\d{2})(\d{2})/)
  if (earlyCompactRange) {
    return { periodStart: monthPeriod(earlyCompactRange[1], earlyCompactRange[2]).periodStart, periodEnd: monthPeriod(earlyCompactRange[3], earlyCompactRange[4]).periodEnd }
  }
  const earlyCompact = text.match(/(20\d{2})(\d{2})(?!\d)/)
  if (earlyCompact) return monthPeriod(earlyCompact[1], earlyCompact[2])
  const range = text.match(/(20\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-](?:\s*\d{1,2}\s*日?)?\s*(?:至|到|[-~—])\s*(20\d{2})\s*[年./-]\s*(\d{1,2})(?:\s*[月./-]\s*(\d{1,2})\s*日?)?/)
  if (range) {
    const start = monthPeriod(range[1], range[2])
    const end = monthPeriod(range[3], range[4])
    return { periodStart: start.periodStart, periodEnd: range[5] ? `${range[3]}-${range[4].padStart(2, '0')}-${range[5].padStart(2, '0')}` : end.periodEnd }
  }
  const fullDates = Array.from(text.matchAll(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/g))
  if (fullDates.length >= 2) return { periodStart: isoDate(fullDates[0][0]), periodEnd: isoDate(fullDates[1][0]) }
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

function ledgerAccountContext(sheetName: string) {
  const match = clean(sheetName).match(/^(\d{3,})\s+(.+)$/)
  return {
    parentAccountCode: match?.[1] || '',
    parentAccountName: match?.[2]?.trim() || '',
  }
}

function ledgerAuxiliaryName(accountName: string, parentAccountName: string) {
  const value = clean(accountName)
  if (!value || !parentAccountName) return ''
  const escapedParent = parentAccountName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return clean(value.replace(new RegExp(`^${escapedParent}\\s*[-_—－:]\\s*`), ''))
}

function parseLedger(sheet: IntakeSheet, period: Period) {
  const header = findHeaderRow(sheet.rows, [/日期/, /凭证字号|凭证号/, /摘要/, /借方/, /贷方/], 8)
  if (header < 0) return []
  const headers = sheet.rows[header]
  const accountContext = ledgerAccountContext(sheet.name)
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
      entryDate, voucherNo: clean(row[index.voucherNo]), accountCode, accountName,
      parentAccountCode: accountContext.parentAccountCode,
      parentAccountName: accountContext.parentAccountName,
      auxiliaryName: ledgerAuxiliaryName(accountName, accountContext.parentAccountName),
      sourceSheetName: sheet.name,
      summary,
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
  const headerRows = sheet.rows.map((row, index) => ({ row, index })).filter(({ row }) => (
    row.some((cell) => normalized(cell) === '姓名')
    && row.some((cell) => /身份证件号码|证件号码/.test(normalized(cell)))
    && row.some((cell) => /^工资$|应发工资/.test(normalized(cell)))
  ))
  const records: StandardTaxRecord[] = []
  headerRows.forEach(({ row: headers, index: header }, blockIndex) => {
    const idx = {
      sourceSequenceNo: headerIndex(headers, [/^\u5e8f\u53f7$/]),
      employeeName: headerIndex(headers, [/姓名/]), idType: headerIndex(headers, [/身份证件类型|证件类型/]), idNumber: headerIndex(headers, [/身份证件号码|证件号码/]),
      grossPay: headerIndex(headers, [/^工资$|应发工资|收入额/]), pension: headerIndex(headers, [/养老保险/]), medicalInsurance: headerIndex(headers, [/医疗保险/]),
      unemploymentInsurance: headerIndex(headers, [/失业保险/]), housingFund: headerIndex(headers, [/住房公积金|住房基金/]), taxableIncome: headerIndex(headers, [/应纳税所得额/]),
      cumulativeIncome: headerIndex(headers, [/\u7d2f\u8ba1\u6536\u5165\u989d/]),
      cumulativeDeduction: headerIndex(headers, [/\u7d2f\u8ba1\u6263\u9664|\u7d2f\u8ba1\u51cf\u9664/]),
      taxPayable: headerIndex(headers, [/\u5e94\u7eb3\u7a0e\u989d/]),
      paidTax: headerIndex(headers, [/\u5df2\u7f34\u7a0e\u989d|\u5df2\u6263\u7f34\u7a0e\u989d/]),
      taxDueRefund: headerIndex(headers, [/\u5e94\u8865.?\u9000\u7a0e\u989d/]),
      netPay: headerIndex(headers, [/\u5b9e\u9645\u53d1\u653e\u91d1\u989d|\u5b9e\u53d1\u5de5\u8d44/]),
      taxRate: headerIndex(headers, [/税率|预扣率/]), taxWithheld: headerIndex(headers, [/应补退税额|应纳税额|已扣缴税额/]),
    }
    const blockStart = header + 1
    const blockEnd = headerRows[blockIndex + 1]?.index ?? sheet.rows.length
    const context = sheet.rows.slice(Math.max(0, header - 4), header).flat().join(' ')
    const detectedBlockPeriod = detectTaxDataPeriod(context)
    const blockPeriod = detectedBlockPeriod.periodStart ? detectedBlockPeriod : shortDateMonthPeriod(context)
    const effectivePeriod = blockPeriod.periodStart && blockPeriod.periodEnd ? blockPeriod : period
    sheet.rows.slice(blockStart, blockEnd).forEach((dataRow, offset) => {
      const employeeName = clean(dataRow[idx.employeeName])
      const idNumber = clean(dataRow[idx.idNumber])
      if (!employeeName || /姓名|合计|单位/.test(employeeName) || !idNumber) return
      const pension = amount(dataRow[idx.pension])
      const medical = amount(dataRow[idx.medicalInsurance])
      const unemployment = amount(dataRow[idx.unemploymentInsurance])
      const sourceSequenceNo = clean(dataRow[idx.sourceSequenceNo >= 0 ? idx.sourceSequenceNo : 0]) || String(offset + 1)
      const cumulativeIncome = amount(dataRow[idx.cumulativeIncome >= 0 ? idx.cumulativeIncome : 8])
      const cumulativeDeduction = amount(dataRow[idx.cumulativeDeduction >= 0 ? idx.cumulativeDeduction : 9])
      const taxPayable = amount(dataRow[idx.taxPayable >= 0 ? idx.taxPayable : 12])
      const paidTax = amount(dataRow[idx.paidTax >= 0 ? idx.paidTax : 13])
      const taxDueRefund = amount(dataRow[idx.taxDueRefund >= 0 ? idx.taxDueRefund : 14])
      const netPay = amount(dataRow[idx.netPay >= 0 ? idx.netPay : 15])
      records.push(makeRecord('payroll', 'payroll_line', {
        sourceSequenceNo, employeeName, idType: clean(dataRow[idx.idType]), idNumber, idNumberMasked: maskId(idNumber), grossPay: amount(dataRow[idx.grossPay]),
        socialSecurity: [pension, medical, unemployment].reduce<number>((sum, value) => sum + (value || 0), 0), pensionInsurance: pension,
        medicalInsurance: medical, unemploymentInsurance: unemployment, housingFund: amount(dataRow[idx.housingFund]), cumulativeIncome, cumulativeDeduction, taxableIncome: amount(dataRow[idx.taxableIncome]),
        taxRate: amount(dataRow[idx.taxRate]), taxPayable, paidTax, taxDueRefund, taxWithheld: taxDueRefund ?? taxPayable ?? paidTax ?? amount(dataRow[idx.taxWithheld]), netPay, sourceRowNo: blockStart + offset + 1,
      }, effectivePeriod))
    })
  })
  return records
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

function parseAccountBalanceCn(sheet: IntakeSheet, period: Period) {
  const header = findHeaderRow(sheet.rows, [/科目编码/, /科目名称/, /期末余额|本期发生额/])
  if (header < 0) return []
  const second = sheet.rows[header + 1] || []
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
  return sheet.rows.slice(dataStart).flatMap((row, offset) => {
    const accountCode = clean(row[codeIndex])
    const accountName = clean(row[nameIndex])
    if (!/^\d{3,}$/.test(accountCode) || !accountName || /合计/.test(accountName)) return []
    const payload: Record<string, unknown> = { accountCode, accountName, sourceRowNo: dataStart + offset + 1 }
    Object.entries(indexes).forEach(([field, index]) => { if (index >= 0) payload[field] = amount(row[index]) })
    return [makeRecord('account_balance', 'account_balance_line', payload, period)]
  })
}

function parseLedgerCn(sheet: IntakeSheet, period: Period) {
  const header = findHeaderRow(sheet.rows, [/日期/, /凭证字号|凭证号/, /摘要/, /借方/, /贷方/], 8)
  if (header < 0) return []
  const headers = sheet.rows[header]
  const accountContext = ledgerAccountContext(sheet.name)
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
      entryDate, voucherNo: clean(row[index.voucherNo]), accountCode, accountName,
      parentAccountCode: accountContext.parentAccountCode,
      parentAccountName: accountContext.parentAccountName,
      auxiliaryName: ledgerAuxiliaryName(accountName, accountContext.parentAccountName),
      sourceSheetName: sheet.name,
      summary,
      debitAmount: amount(row[index.debitAmount]), creditAmount: amount(row[index.creditAmount]),
      direction: clean(row[index.direction]), balanceAmount: amount(row[index.balanceAmount]), sourceRowNo: header + offset + 2,
    }, period)]
  })
}

function parseFinancialStatementCn(sheet: IntakeSheet, period: Period) {
  const header = findHeaderRow(sheet.rows, [/项目|资产/, /行次/, /本年累计|本期金额|期末余额|年初余额/])
  if (header < 0) return []
  const headers = sheet.rows[header]
  const topText = sheet.rows.slice(0, 5).flat().join('')
  const subtype = /资产负债表/.test(topText) ? 'balance_sheet' : /现金流量表/.test(topText) ? 'cash_flow_statement' : 'income_statement'
  const records: StandardTaxRecord[] = []
  const addLine = (row: string[], labelIndex: number, rowNo: number) => {
    const lineName = clean(row[labelIndex])
    if (!lineName || /^(资产|负债和所有者权益|项目)$/.test(normalized(lineName))) return
    const lineCode = clean(row[labelIndex + 1])
    const payload: Record<string, unknown> = { statementType: subtype, lineName, lineCode, rowNo, sourceRowNo: rowNo }
    const assign = (headerText: string, value: unknown) => {
      if (/本年累计/.test(headerText)) payload.cumulativeAmount = amount(value)
      else if (/本期|本月/.test(headerText)) payload.currentAmount = amount(value)
      else if (/年初|期初/.test(headerText)) payload.beginningAmount = amount(value)
      else if (/期末/.test(headerText)) payload.endingAmount = amount(value)
    }
    assign(normalized(headers[labelIndex + 2]), row[labelIndex + 2])
    assign(normalized(headers[labelIndex + 3]), row[labelIndex + 3])
    if (![payload.currentAmount, payload.cumulativeAmount, payload.beginningAmount, payload.endingAmount].some((value) => value !== null && value !== undefined)) return
    records.push(makeRecord('financial_statement', subtype, payload, period))
  }
  sheet.rows.slice(header + 1).forEach((row, offset) => {
    addLine(row, 0, header + offset + 2)
    if (row.length >= 8) addLine(row, 4, header + offset + 2)
  })
  return records
}

function parsePayrollCn(sheet: IntakeSheet, period: Period) {
  const headerRows = sheet.rows.map((row, index) => ({ row, index })).filter(({ row }) => (
    row.some((cell) => normalized(cell) === '姓名')
    && row.some((cell) => /身份证件号码|证件号码/.test(normalized(cell)))
    && row.some((cell) => /^工资$|应发工资/.test(normalized(cell)))
  ))
  return headerRows.flatMap(({ row: headers, index: header }, blockIndex) => {
    const idx = {
      sourceSequenceNo: headerIndex(headers, [/^序号$/]),
      employeeName: headerIndex(headers, [/姓名/]), idType: headerIndex(headers, [/身份证件类型|证件类型/]), idNumber: headerIndex(headers, [/身份证件号码|证件号码/]),
      grossPay: headerIndex(headers, [/^工资$|应发工资|收入额/]), pension: headerIndex(headers, [/养老保险/]), medicalInsurance: headerIndex(headers, [/医疗保险/]),
      unemploymentInsurance: headerIndex(headers, [/失业保险/]), housingFund: headerIndex(headers, [/住房公积金|住房基金/]), taxableIncome: headerIndex(headers, [/应纳税所得额/]),
      cumulativeIncome: headerIndex(headers, [/累计收入额/]), cumulativeDeduction: headerIndex(headers, [/累计扣除|累计减除/]),
      taxPayable: headerIndex(headers, [/应纳税额/]), paidTax: headerIndex(headers, [/已缴税额|已扣缴税额/]),
      taxDueRefund: headerIndex(headers, [/应补.?退税额/]), netPay: headerIndex(headers, [/实际发放金额|实发工资/]), taxRate: headerIndex(headers, [/税率|预扣率/]),
    }
    const context = sheet.rows.slice(Math.max(0, header - 4), header).flat().join(' ')
    const detectedBlockPeriod = detectTaxDataPeriod(context)
    const blockPeriod = detectedBlockPeriod.periodStart ? detectedBlockPeriod : shortDateMonthPeriod(context)
    const effectivePeriod = blockPeriod.periodStart && blockPeriod.periodEnd ? blockPeriod : period
    const blockStart = header + 1
    const blockEnd = headerRows[blockIndex + 1]?.index ?? sheet.rows.length
    return sheet.rows.slice(blockStart, blockEnd).flatMap((dataRow, offset) => {
      const employeeName = clean(dataRow[idx.employeeName])
      const idNumber = clean(dataRow[idx.idNumber])
      if (!employeeName || /姓名|合计|单位/.test(employeeName) || !idNumber) return []
      const pension = amount(dataRow[idx.pension])
      const medical = amount(dataRow[idx.medicalInsurance])
      const unemployment = amount(dataRow[idx.unemploymentInsurance])
      const sourceSequenceNo = clean(dataRow[idx.sourceSequenceNo >= 0 ? idx.sourceSequenceNo : 0]) || String(offset + 1)
      return [makeRecord('payroll', 'payroll_line', {
        sourceSequenceNo, employeeName, idType: clean(dataRow[idx.idType]), idNumber, idNumberMasked: maskId(idNumber), grossPay: amount(dataRow[idx.grossPay]),
        socialSecurity: [pension, medical, unemployment].reduce<number>((sum, value) => sum + (value || 0), 0), pensionInsurance: pension,
        medicalInsurance: medical, unemploymentInsurance: unemployment, housingFund: amount(dataRow[idx.housingFund]), cumulativeIncome: amount(dataRow[idx.cumulativeIncome]),
        cumulativeDeduction: amount(dataRow[idx.cumulativeDeduction]), taxableIncome: amount(dataRow[idx.taxableIncome]), taxRate: amount(dataRow[idx.taxRate]),
        taxPayable: amount(dataRow[idx.taxPayable]), paidTax: amount(dataRow[idx.paidTax]), taxDueRefund: amount(dataRow[idx.taxDueRefund]),
        taxWithheld: amount(dataRow[idx.taxDueRefund]) ?? amount(dataRow[idx.taxPayable]) ?? amount(dataRow[idx.paidTax]), netPay: amount(dataRow[idx.netPay]), sourceRowNo: blockStart + offset + 1,
      }, effectivePeriod)]
    })
  })
}

function parseIitCn(sheet: IntakeSheet, period: Period) {
  const header = findHeaderRow(sheet.rows, [/姓名/, /身份证件号码|证件号码/, /所得项目/], 12)
  if (header < 0) return []
  const firstDataOffset = sheet.rows.slice(header + 1, header + 8).findIndex((row) => row.some((cell) => /^\d{10,18}[0-9Xx]?$/.test(clean(cell))))
  const dataStart = firstDataOffset >= 0 ? header + 1 + firstDataOffset : Math.min(header + 4, sheet.rows.length)
  const headerRows = sheet.rows.slice(header, dataStart)
  const width = Math.max(...headerRows.map((row) => row.length))
  const headers = Array.from({ length: width }, (_, column) => headerRows.map((row) => clean(row[column])).filter(Boolean).join(''))
  const idx = {
    personName: headerIndex(headers, [/姓名/]), idType: headerIndex(headers, [/身份证件类型|证件类型/]), idNumber: headerIndex(headers, [/身份证件号码|证件号码/]), incomeItem: headerIndex(headers, [/所得项目/]),
    currentIncome: headerIndex(headers, [/本月.*收入|收入额计算/]), cumulativeIncome: headerIndex(headers, [/累计收入额/]), cumulativeDeduction: headerIndex(headers, [/累计减除费用/]),
    taxableIncome: headerIndex(headers, [/应纳税所得额/]), taxRate: headerIndex(headers, [/税率|预扣率/]), taxWithheld: headerIndex(headers, [/应补.?退税额|应纳税额|已缴税额/]),
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

function parseInvoiceCn(sheet: IntakeSheet, period: Period) {
  const header = findHeaderRow(sheet.rows, [/发票号码|数电发票号码|海关缴款书号码/, /开票日期|填发日期/, /金额|税款金额/], 10)
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
  const normalSample = `${fileName} ${sheet.name} ${sheet.rows.slice(0, 10).flat().join(' ')}`
  if (/^(目录|封面|横向封面)$/.test(sheet.name.trim())) return 'other_material'
  if (/明细账|凭证字号/.test(normalSample)) return 'ledger'
  if (/科目余额表|余额表/.test(normalSample) && /期初余额|本期发生额|期末余额/.test(normalSample)) return 'account_balance'
  if (/个人所得税扣缴申报表|综合所得申报/.test(normalSample)) return 'iit_withholding'
  if (/工资表|应发工资/.test(normalSample) && /身份证件号码|证件号码/.test(normalSample)) return 'payroll'
  if (/发票清单|数电发票号码|海关缴款书/.test(normalSample)) return 'invoice_list'
  if (/资产负债表|利润表|现金流量表/.test(normalSample)) return 'financial_statement'
  if (/^(目录|封面|横向封面)$/.test(sheet.name.trim())) return 'other_material'
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
  return { profilePatch: {}, documentTypes: [], records: [], evidenceFields: [], conflicts: [], warnings: [], recordCounts: {}, templateMatches: [], autoImportEligible: false }
}

function addTemplateConflict(result: ParsedTaxDataIntake, match: TemplateMatch, sourceName: string) {
  if (match.autoImportEligible) return
  const failures = match.validations.filter((item) => item.blocking && item.status === 'failed').map((item) => item.label).join('、')
  result.conflicts.push({
    conflictType: 'template_validation_failed',
    fieldName: match.templateId,
    incomingValue: `${sourceName}：${failures || '模板未通过自动入库校验'}`,
    severity: 'high',
    status: 'open',
  })
}

function numeric(value: unknown) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

function recordIntegrityValidation(match: TemplateMatch, records: StandardTaxRecord[]): TemplateValidation {
  let invalidCount = 0
  let detail = `已核验 ${records.length} 条记录的必需字段`
  if (match.documentType === 'account_balance') {
    const seen = new Set<string>()
    let reconciliationDifferenceCount = 0
    records.forEach((record) => {
      const code = clean(record.payload.accountCode)
      const duplicate = !code || seen.has(code)
      seen.add(code)
      const opening = numeric(record.payload.openingDebit) - numeric(record.payload.openingCredit)
      const movement = numeric(record.payload.currentDebit) - numeric(record.payload.currentCredit)
      const ending = numeric(record.payload.endingDebit) - numeric(record.payload.endingCredit)
      if (duplicate || !clean(record.payload.accountName)) invalidCount += 1
      if (Math.abs(opening + movement - ending) > 0.011) reconciliationDifferenceCount += 1
    })
    if (invalidCount) {
      detail = `${invalidCount} 条科目记录存在重复编码或必需字段缺失`
    } else if (reconciliationDifferenceCount) {
      return {
        code: 'record_integrity',
        label: '逐条数据校验',
        status: 'warning',
        blocking: false,
        detail: `${records.length} 条科目记录编码唯一；${reconciliationDifferenceCount} 条存在借贷方向/负数展示导致的期末勾稽差异，已保留原值供复核`,
      }
    } else {
      detail = `${records.length} 条科目记录编码唯一，且期初余额 + 本期发生 = 期末余额`
    }
  } else if (match.documentType === 'ledger') {
    records.forEach((record) => {
      const debit = Math.abs(numeric(record.payload.debitAmount))
      const credit = Math.abs(numeric(record.payload.creditAmount))
      if (!clean(record.payload.entryDate) || !clean(record.payload.accountCode) || !clean(record.payload.accountName) || (debit > 0 && credit > 0)) invalidCount += 1
    })
    detail = invalidCount ? `${invalidCount} 条明细记录存在必需字段缺失或借贷同时有值` : `${records.length} 条明细记录日期、科目和借贷方向结构有效`
  } else if (match.documentType === 'invoice_list') {
    records.forEach((record) => {
      if (!clean(record.payload.invoiceNo) || !clean(record.payload.invoiceDate) || record.payload.amount === null || record.payload.taxAmount === null) invalidCount += 1
    })
    detail = invalidCount ? `${invalidCount} 条发票缺少号码、日期、金额或税额` : `${records.length} 条发票号码、日期、金额和税额完整`
  } else if (match.documentType === 'payroll' || match.documentType === 'iit_withholding') {
    records.forEach((record) => {
      const name = clean(record.payload.employeeName || record.payload.personName)
      if (!name || !clean(record.payload.idNumberMasked)) invalidCount += 1
    })
    detail = invalidCount ? `${invalidCount} 条人员记录缺少姓名或脱敏证件索引` : `${records.length} 条人员记录具备姓名和脱敏证件索引`
  } else if (match.documentType === 'vat_return' || match.documentType === 'vat_return_schedule') {
    const rowNos = records.map((record) => clean(record.payload.rowNo)).filter(Boolean)
    const duplicateRows = rowNos.length !== new Set(rowNos).size
    invalidCount = match.documentType === 'vat_return' || match.slotId === 'vat-schedule-4'
      ? Number(duplicateRows)
      : 0
    const requiredRows = match.documentType === 'vat_return'
      ? ['1', '11', '12', '19']
      : match.slotId === 'vat-schedule-4'
        ? ['1', '2', '3', '4', '5', '6', '7', '8']
        : []
    const missingRows = requiredRows.filter((rowNo) => !rowNos.some((value) => value === rowNo || value.startsWith(`${rowNo}=`)))
    invalidCount += missingRows.length
    if (!invalidCount && duplicateRows && match.documentType === 'vat_return_schedule' && match.slotId !== 'vat-schedule-4') {
      return {
        code: 'record_integrity',
        label: '逐条数据校验',
        status: 'warning',
        blocking: false,
        detail: `${records.length} 条附表记录已保留；同页不同分区存在重复栏次，使用项目名称和原始位置共同区分`,
      }
    }
    detail = invalidCount
      ? `申报表存在重复栏次或缺少关键栏次：${missingRows.join('、') || '重复栏次'}`
      : requiredRows.length
        ? `关键栏次 ${requiredRows.join('、')} 均已落表且无重复`
        : `${records.length} 条附表记录已按栏次和原始数值落表`
  } else if (match.documentType === 'financial_statement' || match.documentType === 'cit_return') {
    const seen = new Set<string>()
    records.forEach((record) => {
      const rowNo = clean(record.payload.rowNo)
      const lineName = clean(record.payload.lineName || record.payload.itemName)
      const key = `${rowNo}:${lineName}`
      if (!lineName || seen.has(key)) invalidCount += 1
      seen.add(key)
    })
    detail = invalidCount ? `${invalidCount} 条记录存在重复行次或缺少项目名称` : `${records.length} 条记录行次、项目和期间结构有效`
  }
  return {
    code: 'record_integrity', label: '逐条数据校验', status: invalidCount ? 'failed' : 'passed', blocking: true, detail,
  }
}

function finalizeTemplateMatch(match: TemplateMatch, records: StandardTaxRecord[]) {
  match.validations.push(recordIntegrityValidation(match, records))
  match.autoImportEligible = match.matched && match.validations.every((item) => !item.blocking || item.status === 'passed')
  match.confidence = match.autoImportEligible ? 'high' : match.matched ? 'medium' : 'low'
  return match
}

export function parseTaxDataWorkbook(fileName: string, sheets: IntakeSheet[]): ParsedTaxDataIntake {
  const result = emptyResult()
  sheets.forEach((sheet) => {
    if (!sheet.rows.length) return
    mergeProfilePatch(result, extractProfilePatchFromRows(fileName, sheet))
    const documentType = classifySheet(fileName, sheet)
    if (documentType === 'other_material') return
    const period = detectTaxDataPeriod(`${fileName} ${sheet.rows.slice(0, 6).flat().join(' ')}`)
    let records: StandardTaxRecord[] = []
    if (documentType === 'ledger') records = parseLedgerCn(sheet, period)
    if (documentType === 'account_balance') records = parseAccountBalanceCn(sheet, period)
    if (documentType === 'financial_statement') records = parseFinancialStatementCn(sheet, period)
    if (documentType === 'payroll') records = parsePayrollCn(sheet, period)
    if (documentType === 'iit_withholding') records = parseIitCn(sheet, period)
    if (documentType === 'invoice_list') records = parseInvoiceCn(sheet, period)
    if (!records.length && documentType === 'ledger') records = parseLedger(sheet, period)
    if (!records.length && documentType === 'account_balance') records = parseAccountBalance(sheet, period)
    if (!records.length && documentType === 'financial_statement') records = parseFinancialStatement(sheet, period)
    if (!records.length && documentType === 'payroll') records = parsePayroll(sheet, period)
    if (!records.length && documentType === 'iit_withholding') records = parseIit(sheet, period)
    if (!records.length && documentType === 'invoice_list') records = parseInvoice(sheet, period)
    const nonEmptyRows = sheet.rows.filter((row) => row.some((cell) => clean(cell))).length
    if (!records.length && nonEmptyRows <= 3) return
    if (!records.length && documentType === 'ledger') {
      const hasTransaction = sheet.rows.some((row) => row.some((cell) => /^记[-－]?\d+/.test(clean(cell))))
      if (!hasTransaction) return
    }
    if (!records.length) result.warnings.push(`${sheet.name} 已识别为${documentType}，但未找到可落表的数据行。`)
    const rawTemplateMatch = matchWorkbookTemplate(fileName, sheet, documentType, Boolean(period.periodStart && period.periodEnd), records.length)
    const templateMatch = rawTemplateMatch ? finalizeTemplateMatch(rawTemplateMatch, records) : undefined
    if (templateMatch) {
      result.templateMatches.push(templateMatch)
      addTemplateConflict(result, templateMatch, sheet.name)
      records.forEach((record) => {
        if (templateMatch.autoImportEligible) record.confidence = 'high'
        record.payload.templateId = templateMatch.templateId
        record.payload.templateVersion = templateMatch.version
        record.payload.templateValidationStatus = templateMatch.autoImportEligible ? 'passed' : 'failed'
      })
    }
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
  result.autoImportEligible = result.templateMatches.length > 0
    && result.templateMatches.every((match) => match.autoImportEligible)
    && !result.conflicts.some((conflict) => conflict.severity === 'high')
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

export function parseVatScheduleFourRecords(text: string, period: Period = {}) {
  const records: StandardTaxRecord[] = []
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  let pending: { rowNo: string; itemName: string } | null = null
  for (const rawLine of lines) {
    let line = rawLine
    if (pending && !/^\d{1,2}\s+/.test(line)) {
      line = `${pending.rowNo} ${pending.itemName}${line}`
      pending = null
    }
    const start = line.match(/^(\d{1,2})\s+(.+)$/)
    if (!start) continue
    const rowNo = start[1]
    if (!/^[1-8]$/.test(rowNo)) continue
    const values = Array.from(line.matchAll(/-?[\d,]+\.\d{2}/g)).map((match) => amount(match[0]))
    const itemName = start[2].replace(/(?:\s+-?[\d,]+\.\d{2})+\s*$/, '').trim()
    if (!values.length) {
      pending = { rowNo, itemName }
      continue
    }
    const combinedName = itemName
    const payload: Record<string, unknown> = {
      formName: '增值税及附加税费申报表附列资料（四）', rowNo, itemName: combinedName,
      beginningAmount: values[0], currentOccurrenceAmount: values[1],
      fieldCode: `vat_schedule4_row_${rowNo}`,
    }
    if (Number(rowNo) <= 5) {
      payload.currentDeductibleAmount = values[2]
      payload.actualDeductionAmount = values[3]
      payload.endingAmount = values[4]
      payload.currentAmount = values[1]
      payload.cumulativeAmount = values[4]
      payload.currentTax = values[3]
    } else {
      payload.currentDecreaseAmount = values[2]
      payload.currentDeductibleAmount = values[3]
      payload.actualDeductionAmount = values[4]
      payload.endingAmount = values[5]
      payload.currentAmount = values[1]
      payload.cumulativeAmount = values[5]
      payload.currentTax = values[4]
    }
    records.push(makeRecord('vat_return', 'vat_return_line', payload, period, 'high'))
  }
  return records
}

const pdfAmountToken = '-?[\\d,]+(?:\\.\\d{1,2})'

function pdfEvidence(record: StandardTaxRecord, pageNo: number) {
  return Object.entries(record.payload)
    .filter(([field, value]) => !/^source|template/.test(field) && clean(value))
    .slice(0, 6)
    .map(([field, value]) => ({
      ...evidenceFor(record, '', Number(record.payload.sourceRowNo) || 1, [[field, value]])[0],
      pageNo,
    }))
    .filter(Boolean) as StandardTaxEvidence[]
}

function pdfLineRecords(
  text: string,
  period: Period,
  recordType: string,
  recordSubtype: string,
  formName: string,
  pageNo: number,
) {
  const records: StandardTaxRecord[] = []
  const seen = new Set<string>()
  text.split(/\r?\n/).map((line) => line.replace(/\u00a0/g, ' ').trim()).filter(Boolean).forEach((line, lineIndex) => {
    const values = Array.from(line.matchAll(new RegExp(pdfAmountToken, 'g'))).map((match) => amount(match[0])).filter((value) => value !== null)
    if (!values.length) return
    const firstValueIndex = line.search(new RegExp(pdfAmountToken))
    const prefix = firstValueIndex >= 0 ? line.slice(0, firstValueIndex).trim() : line
    const rowMatch = prefix.match(/(?:^|\s)(\d{1,3}(?:\.\d+)?)\s*(?:=\\?[^ ]+)?\s*$/)
      || prefix.match(/^(\d{1,3}(?:\.\d+)?)\s+/)
    const rowNo = clean(rowMatch?.[1])
    let itemName = prefix
      .replace(/^\d{1,3}(?:\.\d+)?\s*/, '')
      .replace(/\s+\d{1,3}(?:\.\d+)?(?:=\\?[^ ]+)?\s*$/, '')
      .trim()
    if (!itemName && rowMatch) itemName = prefix.replace(rowMatch[0], '').trim()
    if (!itemName || /^(项目|栏次|行次|金额|税额)$/.test(normalized(itemName))) return
    const key = `${rowNo}:${itemName}`
    if (seen.has(key)) return
    seen.add(key)
    records.push(makeRecord(recordType, recordSubtype, {
      formName,
      rowNo,
      itemName,
      lineName: itemName,
      currentAmount: values[0],
      cumulativeAmount: values[1] ?? null,
      currentTax: values[2] ?? null,
      cumulativeTax: values[3] ?? null,
      values,
      sourcePageNo: pageNo,
      sourceRowNo: lineIndex + 1,
    }, period))
  })
  return records
}

function financialPdfRecords(text: string, period: Period, pageNo: number) {
  const subtype = /资产负债表/.test(text) ? 'balance_sheet'
    : /现金流量表/.test(text) ? 'cash_flow_statement'
      : 'income_statement'
  const records: StandardTaxRecord[] = []
  const seen = new Set<string>()
  const blockPattern = new RegExp(`([^\\n\\d][^\\n]*?)\\s+(\\d{1,3})\\s+(${pdfAmountToken})\\s+(${pdfAmountToken})`, 'g')
  text.split(/\r?\n/).map((line) => line.replace(/\u00a0/g, ' ').trim()).filter(Boolean).forEach((line, lineIndex) => {
    for (const match of line.matchAll(blockPattern)) {
      const lineName = clean(match[1]).replace(/^(其中：|加：|减：)\s*/, '$1').trim()
      const rowNo = clean(match[2])
      const key = `${rowNo}:${lineName}`
      if (!lineName || /^(资产|负债和所有者权益|项目|行次)/.test(normalized(lineName)) || seen.has(key)) continue
      seen.add(key)
      const first = amount(match[3])
      const second = amount(match[4])
      const payload: Record<string, unknown> = {
        statementType: subtype,
        accountingStandard: '小企业会计准则',
        lineName,
        lineCode: rowNo,
        rowNo,
        sourcePageNo: pageNo,
        sourceRowNo: lineIndex + 1,
      }
      if (subtype === 'balance_sheet') {
        payload.endingAmount = first
        payload.beginningAmount = second
      } else {
        payload.currentAmount = first
        payload.cumulativeAmount = second
      }
      records.push(makeRecord('financial_statement', subtype, payload, period))
    }
  })
  return records
}

function vatScheduleName(text: string) {
  const match = text.match(/增值税及附加税费申报表(?:（一般纳税人适用）)?附列资料[（(]?([一二三四五六\d])?[）)]?/)
  if (match) return match[1] ? `增值税及附加税费申报表附列资料（${match[1]}）` : clean(match[0])
  if (/税额抵减情况表/.test(text)) return '增值税及附加税费申报表附列资料（四）'
  return '增值税及附加税费申报表其他附表'
}

function addPdfPageResult(
  result: ParsedTaxDataIntake,
  fileName: string,
  pageText: string,
  pageNo: number,
  documentType: IntakeDocumentType,
  records: StandardTaxRecord[],
  period: Period,
) {
  if (!records.length) {
    result.warnings.push(`${fileName} 第 ${pageNo} 页已识别为 ${documentType}，但没有匹配到可入库数据行。`)
    return
  }
  const rawTemplateMatch = matchPdfTemplate(fileName, pageText, documentType, Boolean(period.periodStart && period.periodEnd), records.length)
  const templateMatch = rawTemplateMatch ? finalizeTemplateMatch(rawTemplateMatch, records) : undefined
  if (templateMatch) {
    result.templateMatches.push(templateMatch)
    addTemplateConflict(result, templateMatch, `${fileName} 第 ${pageNo} 页`)
    records.forEach((record) => {
      record.payload.templateId = templateMatch.templateId
      record.payload.templateVersion = templateMatch.version
      record.payload.templateValidationStatus = templateMatch.autoImportEligible ? 'passed' : 'failed'
    })
  }
  result.documentTypes.push(documentType)
  result.records.push(...records)
  records.forEach((record) => result.evidenceFields.push(...pdfEvidence(record, pageNo)))
}

export function parseTaxDataPdfText(fileName: string, pages: string[]): ParsedTaxDataIntake {
  const result = emptyResult()
  const text = pages.join('\n')
  mergeProfilePatch(result, extractProfilePatchFromText(`${fileName}\n${text.slice(0, 5000)}`))
  pages.forEach((pageText, index) => {
    const pageNo = index + 1
    const sourceText = `${fileName}\n${pageText}`
    const period = detectTaxDataPeriod(sourceText)
    if (/企业所得税年度纳税申报(?:表|主表)/.test(pageText) && /营业收入|应纳税所得额|应纳税额/.test(pageText)) {
      addPdfPageResult(result, fileName, pageText, pageNo, 'cit_return', pdfLineRecords(pageText, period, 'cit_return', 'annual_return', '企业所得税年度纳税申报表（A类）', pageNo), period)
      return
    }
    if (/企业所得税月（季）度预缴纳税申报表/.test(sourceText)) {
      addPdfPageResult(result, fileName, pageText, pageNo, 'cit_return', pdfLineRecords(pageText, period, 'cit_return', 'quarterly_prepayment', '企业所得税月（季）度预缴纳税申报表（A类）', pageNo), period)
      return
    }
    if (/企业所得税|纳税调整|弥补亏损|减免所得税/.test(pageText) && /行次|项目|年度/.test(pageText)) {
      const title = clean(pageText.split(/\r?\n/).find((line) => /企业所得税|纳税调整|弥补亏损|减免所得税/.test(line)) || '企业所得税年度纳税申报附表')
      addPdfPageResult(result, fileName, pageText, pageNo, 'cit_return', pdfLineRecords(pageText, period, 'cit_return', 'annual_schedule', title, pageNo), period)
      return
    }
    if (/资产负债表|利润表|现金流量表/.test(pageText) && /税款所属期|纳税人识别号|小企会0[123]表|编制单位/.test(pageText)) {
      addPdfPageResult(result, fileName, pageText, pageNo, 'financial_statement', financialPdfRecords(pageText, period, pageNo), period)
      return
    }
    if (/增值税|附加税费/.test(sourceText)) {
      if (/附列资料（四）|附列资料\(四\)|税额抵减情况表/.test(pageText)) {
        const records = parseVatScheduleFourRecords(pageText, period)
        records.forEach((record) => {
          record.payload.sourcePageNo = pageNo
          record.payload.formName = '增值税及附加税费申报表附列资料（四）'
        })
        addPdfPageResult(result, fileName, pageText, pageNo, 'vat_return_schedule', records, period)
        return
      }
      if (/附列资料|附表|附加税费情况表|增值税减免税申报明细表|加计抵减情况/.test(pageText)) {
        const formName = vatScheduleName(pageText)
        addPdfPageResult(result, fileName, pageText, pageNo, 'vat_return_schedule', pdfLineRecords(pageText, period, 'vat_return', 'vat_return_schedule', formName, pageNo), period)
        return
      }
      if (!/增值税及附加税费申报表/.test(pageText)) return
      const records = vatLineRecords(pageText, period)
      records.forEach((record) => {
        record.payload.sourcePageNo = pageNo
        record.payload.formName = '增值税及附加税费申报表'
      })
      addPdfPageResult(result, fileName, pageText, pageNo, 'vat_return', records, period)
    }
  })
  result.documentTypes = Array.from(new Set(result.documentTypes))
  result.records.forEach((record) => {
    result.recordCounts[record.recordType] = (result.recordCounts[record.recordType] || 0) + 1
  })
  if (!result.records.length) result.warnings.push('PDF 已提取文本，但尚无匹配的专用解析器或没有可落表数据。')
  if (result.records.some((record) => !record.periodStart || !record.periodEnd)) {
    result.conflicts.push({ conflictType: 'missing_period', fieldName: 'period', incomingValue: fileName, severity: 'high', status: 'open' })
  }
  result.autoImportEligible = result.records.length > 0
    && result.templateMatches.length > 0
    && result.templateMatches.every((match) => match.autoImportEligible)
    && !result.conflicts.some((conflict) => conflict.severity === 'high')
  return result
}
