import { conditionFields } from './ruleEngine'

export type ImportMappingPreview = {
  source: string
  field: string
  label: string
}

export type ParsedClientImport = {
  patch: Record<string, unknown>
  mappings: ImportMappingPreview[]
  unmappedHeaders: string[]
  detectedTables: string[]
  detectedSourceType?: string
}

export const importFieldAliases: Record<string, string> = {
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
  数据来源: 'dataBasis',
  数据来源口径: 'dataBasis',
  对比期间: 'comparisonPeriod',
  月收入: 'monthlyRevenue',
  月成本费用: 'monthlyCost',
  月利润: 'monthlyProfit',
  年销售收入: 'annualRevenue',
  收款流水: 'collectionFlow',
  银行流水: 'collectionFlow',
  银行收款流水: 'collectionFlow',
  账户收款流水: 'collectionFlow',
  对公账户流水: 'collectionFlow',
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
  本月开票金额: 'monthlyInvoice',
  开票金额: 'monthlyInvoice',
  已开票金额: 'monthlyInvoice',
  发票金额: 'monthlyInvoice',
  连续12个月销售额: 'consecutive12MonthSales',
  连续十二个月销售额: 'consecutive12MonthSales',
  近12个月销售额: 'consecutive12MonthSales',
  最近12个月销售额: 'consecutive12MonthSales',
  十二个月累计销售额: 'consecutive12MonthSales',
  平台收入: 'platformRevenue',
  平台销售额: 'platformRevenue',
  电商平台收入: 'platformRevenue',
  电商平台销售额: 'platformRevenue',
  平台结算收入: 'platformRevenue',
  红字专票金额: 'redVatSpecialInvoiceAmount',
  红字发票金额: 'redVatSpecialInvoiceAmount',
  红冲发票金额: 'redVatSpecialInvoiceAmount',
  红字增值税专用发票金额: 'redVatSpecialInvoiceAmount',
  销项税额: 'outputTax',
  进项税额: 'inputTax',
  增值税应纳税额: 'vatTaxPayable',
  增值税入库税额: 'vatTaxPayable',
  增值税应税销售额: 'taxableSales',
  应纳税额合计: 'vatTaxPayable',
  销售额合计: 'taxableSales',
  货物及劳务销售额: 'taxableSales',
  理论增值税税额: 'theoreticalVatTax',
  预算增值税税额: 'budgetVatTax',
  上期销售额: 'priorTaxableSales',
  上期应税销售额: 'priorTaxableSales',
  上期应纳税额: 'priorVatTaxPayable',
  上期增值税税额: 'priorVatTaxPayable',
  上期增值税应纳税额: 'priorVatTaxPayable',
  上期增值税入库税额: 'priorVatTaxPayable',
  期末留抵税额: 'endingVatCredit',
  期末留抵税额合计: 'endingVatCredit',
  业务招待费: 'entertainmentExpense',
  广告宣传费: 'adExpense',
  职工福利费: 'welfareExpense',
  工会经费: 'unionExpense',
  职工教育经费: 'educationExpense',
  应纳税所得额: 'taxableIncome',
  年度应纳税所得额: 'taxableIncome',
  本年应纳税所得额: 'taxableIncome',
  累计应纳税所得额: 'taxableIncome',
  资产总额: 'assetsTotal',
  资产总计: 'assetsTotal',
  资产合计: 'assetsTotal',
  资产总额期末余额: 'assetsTotal',
  资产总计期末余额: 'assetsTotal',
  资产合计期末余额: 'assetsTotal',
  全年平均人数: 'employeeAnnualAvg',
  年平均从业人数: 'employeeAnnualAvg',
  平均从业人数: 'employeeAnnualAvg',
  从业人数平均值: 'employeeAnnualAvg',
  营业外支出发生额: 'nonOperatingExpense',
  营业外收入发生额: 'nonOperatingIncome',
  其他应收代收代付余额: 'otherReceivableAgencyBalance',
  工资薪金总额: 'payrollTotal',
  向个人支付非工资薪金所得: 'nonPayrollPersonalPayment',
}

export const clientImportFieldLabels = Object.entries(importFieldAliases).reduce<Record<string, string>>((labels, [label, field]) => {
  if (!labels[field] || label.length < labels[field].length) labels[field] = label
  return labels
}, {})

const importTemplateFields = [
  'name',
  'creditCode',
  'region',
  'industry',
  'taxpayerType',
  'analysisYear',
  'analysisMonth',
  'dataBasis',
  'monthlyRevenue',
  'monthlyCost',
  'monthlyProfit',
  'collectionFlow',
  'monthlyInvoice',
  'consecutive12MonthSales',
  'employees',
  'socialSecurityCount',
  'salaryDeclaredCount',
]

const importTemplateSampleRow: Array<string | number> = [
  '示例企业（请替换）',
  '请填写统一社会信用代码',
  '省市',
  '行业',
  '一般纳税人',
  2024,
  '2024-03',
  '管理报表',
  560000,
  420000,
  80000,
  620000,
  480000,
  4200000,
  35,
  32,
  35,
]

function emptyParsedClientImport(): ParsedClientImport {
  return { patch: {}, mappings: [], unmappedHeaders: [], detectedTables: [] }
}

function fieldLabel(field: string) {
  return conditionFields.find((item) => item.value === field)?.label || clientImportFieldLabels[field] || field
}

function csvCell(value: string | number) {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function createClientImportTemplateCsv() {
  return [
    importTemplateFields.map(fieldLabel).map(csvCell).join(','),
    importTemplateSampleRow.map(csvCell).join(','),
  ].join('\r\n')
}

function normalizeImportKey(key: string) {
  return key.replace(/^\uFEFF/, '').replace(/[：:\s（）()_/-]/g, '').trim()
}

function resolveImportField(key: string) {
  const normalized = normalizeImportKey(key)
  const direct = importFieldAliases[key] || importFieldAliases[normalized]
  if (direct) return direct
  const matched = Object.entries(importFieldAliases).find(([label]) => normalizeImportKey(label) === normalized)
  if (matched) return matched[1]
  return conditionFields.some((field) => field.value === key) ? key : null
}

function parseDelimitedRows(text: string) {
  const parseLine = (line: string) => {
    const cells: string[] = []
    let cell = ''
    let quoted = false

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]
      const next = line[index + 1]
      if (char === '"' && quoted && next === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        quoted = !quoted
      } else if (!quoted && (char === ',' || char === '\t')) {
        cells.push(cell.trim())
        cell = ''
      } else {
        cell += char
      }
    }

    cells.push(cell.trim())
    return cells
  }

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseLine)
}

function parseImportedAmount(value: string) {
  const normalized = String(value || '')
    .replace(/[,，\s]/g, '')
    .replace(/[￥¥元]/g, '')
    .replace(/[()（）]/g, (char) => (char === '(' || char === '（' ? '-' : ''))
  if (!normalized || normalized === '-' || normalized === '--') return null
  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : null
}

function isAmountLikeCell(value: string) {
  return parseImportedAmount(value) !== null
}

function normalizeFinancialLabel(value: string) {
  return normalizeImportKey(value).replace(/^[一二三四五六七八九十\d]+[、.．]/, '')
}

function getFinancialRowLabel(row: string[]) {
  const textCells = row
    .map((cell) => cell.trim())
    .filter((cell) => cell && !isAmountLikeCell(cell))
  return normalizeFinancialLabel(textCells.slice(0, 3).join(''))
}

const financialRowFieldRules: Array<{ field: string; patterns: string[] }> = [
  { field: 'name', patterns: ['企业名称', '公司名称', '纳税人名称', '单位名称'] },
  { field: 'creditCode', patterns: ['统一社会信用代码', '纳税人识别号', '税号'] },
  { field: 'analysisYear', patterns: ['所属年度', '会计年度', '年度'] },
  { field: 'analysisMonth', patterns: ['所属月份', '期间月份', '会计期间'] },
  { field: 'ytdRevenue', patterns: ['营业收入本年累计', '收入本年累计', '本年累计收入'] },
  { field: 'monthlyRevenue', patterns: ['营业收入本月', '收入本月', '本月收入'] },
  { field: 'mainBusinessRevenue', patterns: ['主营业务收入', '营业收入', '销售收入'] },
  { field: 'ytdCostExpense', patterns: ['营业成本本年累计', '成本费用本年累计', '本年累计成本'] },
  { field: 'monthlyCost', patterns: ['营业成本本月', '成本费用本月', '本月成本'] },
  { field: 'mainBusinessCost', patterns: ['主营业务成本', '营业成本', '销售成本'] },
  { field: 'ytdProfit', patterns: ['利润总额', '净利润', '营业利润'] },
  { field: 'assetsTotal', patterns: ['资产总计', '资产合计', '资产总额', '资产总额期末余额', '资产合计期末余额'] },
  { field: 'payrollTotal', patterns: ['工资薪金', '应付职工薪酬', '工资总额', '职工薪酬'] },
  { field: 'outputTax', patterns: ['销项税额', '应交增值税销项税额'] },
  { field: 'inputTax', patterns: ['进项税额', '应交增值税进项税额'] },
  { field: 'priorTaxableSales', patterns: ['上期应税销售额', '上期销售额', '上期货物及劳务销售额'] },
  { field: 'priorVatTaxPayable', patterns: ['上期应纳税额', '上期增值税税额', '上期增值税应纳税额', '上期增值税入库税额'] },
  { field: 'vatTaxPayable', patterns: ['应交增值税', '增值税应纳税额', '应纳税额合计'] },
  { field: 'taxableSales', patterns: ['应税销售额', '销售额合计', '货物及劳务销售额'] },
  { field: 'endingVatCredit', patterns: ['期末留抵税额', '期末留抵', '留抵税额'] },
  { field: 'collectionFlow', patterns: ['银行存款', '收款流水', '现金及银行存款'] },
  { field: 'entertainmentExpense', patterns: ['业务招待费'] },
  { field: 'adExpense', patterns: ['广告费', '业务宣传费', '广告宣传费'] },
  { field: 'welfareExpense', patterns: ['职工福利费'] },
  { field: 'unionExpense', patterns: ['工会经费'] },
  { field: 'educationExpense', patterns: ['职工教育经费'] },
  { field: 'nonOperatingExpense', patterns: ['营业外支出'] },
  { field: 'nonOperatingIncome', patterns: ['营业外收入'] },
  { field: 'otherReceivableAgencyBalance', patterns: ['其他应收款', '代收代付'] },
]

function detectImportSourceType(rows: string[][]) {
  const sample = rows.slice(0, 20).flat().join(' ')
  if (/金蝶|Kingdee|KIS|云星空|精斗云/i.test(sample)) return '金蝶导出表'
  if (/用友|Yonyou|YonSuite|U8|NC|好会计/i.test(sample)) return '用友导出表'
  if (/科目余额|利润表|资产负债表|增值税|申报表/.test(sample)) return '财务导出表'
  return undefined
}

function detectImportTables(rows: string[][]) {
  const sample = rows.slice(0, 30).flat().join(' ')
  const tables: string[] = []
  if (/科目余额|科目编码|科目名称|期初余额|期末余额/.test(sample)) tables.push('科目余额表')
  if (/利润表|营业收入|营业成本|利润总额|净利润/.test(sample)) tables.push('利润表')
  if (/资产负债表|资产总计|资产总额|资产合计|负债合计|所有者权益/.test(sample)) tables.push('资产负债表')
  if (/增值税|销项税额|进项税额|应税销售额|纳税申报|留抵税额/.test(sample)) tables.push('增值税数据')
  return Array.from(new Set(tables))
}

const defaultFinancialAmountHeaders = ['本年累计金额', '本期金额', '本月金额', '期末余额', '贷方发生额', '借方发生额', '金额', '税额', '销售额', '累计数', '本月数']

const fieldAmountHeaderPreferences: Record<string, string[]> = {
  mainBusinessRevenue: ['本期贷方', '贷方发生额', '本年累计贷方', '本年累计金额', '本期金额', '金额'],
  monthlyRevenue: ['本期贷方', '贷方发生额', '本月金额', '本期金额', '金额'],
  ytdRevenue: ['本年累计贷方', '本年累计金额', '贷方发生额', '本期贷方', '金额'],
  mainBusinessCost: ['本期借方', '借方发生额', '本年累计借方', '本年累计金额', '本期金额', '金额'],
  monthlyCost: ['本期借方', '借方发生额', '本月金额', '本期金额', '金额'],
  ytdCostExpense: ['本年累计借方', '本年累计金额', '借方发生额', '本期借方', '金额'],
  inputTax: ['本期借方', '借方发生额', '进项税额', '税额', '期末余额', '金额'],
  outputTax: ['本期贷方', '贷方发生额', '销项税额', '税额', '期末余额', '金额'],
  taxableSales: ['应税销售额', '销售额合计', '销售额', '货物及劳务销售额', '金额'],
  vatTaxPayable: ['应纳税额合计', '应纳税额', '增值税应纳税额', '入库税额', '税额', '金额'],
  priorTaxableSales: ['上期应税销售额', '上期销售额', '销售额', '货物及劳务销售额', '金额'],
  priorVatTaxPayable: ['上期应纳税额', '上期增值税税额', '上期增值税应纳税额', '上期增值税入库税额', '税额', '金额'],
  endingVatCredit: ['期末留抵税额合计', '期末留抵税额', '期末留抵', '留抵税额', '税额', '金额'],
  collectionFlow: ['本期借方', '借方发生额', '期末余额', '金额'],
  assetsTotal: ['期末余额', '期末数', '期末金额', '资产总额期末余额', '资产总计期末余额', '金额'],
}

function findFinancialAmount(row: string[], headerRow?: string[], field?: string) {
  const preferredHeaders = [
    ...(field ? fieldAmountHeaderPreferences[field] || [] : []),
    ...defaultFinancialAmountHeaders,
  ]
  if (headerRow) {
    const normalizedHeaders = headerRow.map(normalizeFinancialLabel)
    for (const header of preferredHeaders) {
      const index = normalizedHeaders.findIndex((item) => item.includes(normalizeFinancialLabel(header)))
      const amount = index >= 0 ? parseImportedAmount(row[index] || '') : null
      if (amount !== null) return amount
    }
  }
  const amounts = row.map(parseImportedAmount).filter((value): value is number => value !== null)
  return amounts.find((value) => value !== 0) ?? amounts[0] ?? null
}

function findFinancialTextValue(row: string[], patterns: string[]) {
  const normalizedPatterns = patterns.map(normalizeFinancialLabel)
  return row.find((cell) => {
    const normalized = normalizeFinancialLabel(cell)
    return normalized && !isAmountLikeCell(cell) && !normalizedPatterns.some((pattern) => normalized.includes(pattern))
  }) || ''
}

function mergeParsedClientImports(base: ParsedClientImport, extra: ParsedClientImport): ParsedClientImport {
  const patch = { ...extra.patch, ...base.patch }
  const seenMappings = new Set<string>()
  const mappings = [...base.mappings, ...extra.mappings].filter((item) => {
    const key = `${item.source}-${String(item.field)}`
    if (seenMappings.has(key)) return false
    seenMappings.add(key)
    return true
  })
  return {
    patch,
    mappings,
    unmappedHeaders: Array.from(new Set([...base.unmappedHeaders, ...extra.unmappedHeaders])).slice(0, 12),
    detectedTables: Array.from(new Set([...base.detectedTables, ...extra.detectedTables])),
    detectedSourceType: chooseImportSourceType(base.detectedSourceType, extra.detectedSourceType),
  }
}

function chooseImportSourceType(base?: string, extra?: string) {
  if (!base) return extra
  if (!extra) return base
  if (base === '财务导出表' && extra !== base) return extra
  return base
}

function parseFinancialExportRows(rows: string[][]): ParsedClientImport {
  const patch: Record<string, unknown> = {}
  const mappings: ImportMappingPreview[] = []
  const detectedTables = detectImportTables(rows)
  const detectedSourceType = detectImportSourceType(rows)
  const headerRow = rows.find((row) => row.some((cell) => /项目|科目|本期|本月|本年|期末|金额|税额|余额/.test(cell)))

  rows.forEach((row) => {
    const rowLabel = getFinancialRowLabel(row)
    if (!rowLabel) return
    const rule = financialRowFieldRules.find((item) => (
      item.patterns.some((pattern) => rowLabel.includes(normalizeFinancialLabel(pattern)))
    ))
    if (!rule) return
    const amount = findFinancialAmount(row, headerRow, rule.field)
    const rawValue = ['name', 'creditCode', 'analysisYear', 'analysisMonth'].includes(rule.field)
      ? findFinancialTextValue(row, rule.patterns) || row[row.length - 1]
      : amount
    if (rawValue === null || rawValue === undefined || rawValue === '') return
    patch[rule.field] = rawValue
    mappings.push({ source: row.slice(0, 3).filter(Boolean).join(' / '), field: rule.field, label: fieldLabel(rule.field) })
  })

  return {
    patch,
    mappings,
    unmappedHeaders: [],
    detectedTables,
    detectedSourceType,
  }
}

export function parseClientImportRows(rows: string[][]): ParsedClientImport {
  const patch: Record<string, unknown> = {}
  const mappings: ImportMappingPreview[] = []
  const unmappedHeaders: string[] = []
  if (!rows.length) return emptyParsedClientImport()

  const mapValue = (source: string, value: string) => {
    const normalizedSource = source.trim()
    if (!normalizedSource) return
    const field = resolveImportField(normalizedSource)
    if (field) {
      patch[field] = value
      mappings.push({ source: normalizedSource, field, label: fieldLabel(field) })
    } else {
      unmappedHeaders.push(normalizedSource)
    }
  }

  const firstRowFieldCount = rows[0].filter((cell) => resolveImportField(cell)).length
  const firstRowLooksLikeHeader = rows[0].length > 2 || Boolean(
    rows[1] && rows[0].length > 1 && firstRowFieldCount === rows[0].length && !resolveImportField(rows[1][0] || ''),
  )
  if (firstRowLooksLikeHeader && rows[1]) {
    rows[0].forEach((header, index) => {
      mapValue(header, rows[1][index])
    })
  } else {
    rows.forEach(([key, value]) => {
      mapValue(key, value)
    })
  }

  return mergeParsedClientImports({
    patch,
    mappings,
    unmappedHeaders: Array.from(new Set(unmappedHeaders)).slice(0, 12),
    detectedTables: detectImportTables(rows),
    detectedSourceType: detectImportSourceType(rows),
  }, parseFinancialExportRows(rows))
}

function parseClientImportObject(raw: Record<string, unknown>): ParsedClientImport {
  const patch: Record<string, unknown> = {}
  const mappings: ImportMappingPreview[] = []
  const unmappedHeaders: string[] = []
  Object.entries(raw).forEach(([source, value]) => {
    const field = resolveImportField(source)
    if (field) {
      patch[field] = value
      mappings.push({ source, field, label: fieldLabel(field) })
    } else {
      unmappedHeaders.push(source)
    }
  })
  return {
    patch,
    mappings,
    unmappedHeaders: Array.from(new Set(unmappedHeaders)).slice(0, 12),
    detectedTables: [],
  }
}

export function parseClientImportText(text: string): ParsedClientImport {
  const trimmed = text.trim()
  if (!trimmed) return emptyParsedClientImport()
  if (trimmed.startsWith('{')) return parseClientImportObject(JSON.parse(trimmed) as Record<string, unknown>)
  return parseClientImportRows(parseDelimitedRows(trimmed))
}

function looksLikeMojibake(text: string) {
  return text.includes('\uFFFD') || /[锟�]{2,}|[ÃÂ][\u0080-\u00ff]/.test(text)
}

export function decodeClientImportText(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer)
  if (!looksLikeMojibake(utf8)) return utf8
  try {
    const gb18030 = new TextDecoder('gb18030').decode(buffer)
    return looksLikeMojibake(gb18030) ? utf8 : gb18030
  } catch {
    return utf8
  }
}

export async function parseClientImportWorkbook(buffer: ArrayBuffer): Promise<ParsedClientImport> {
  const XLSX = await import('@e965/xlsx')
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  return workbook.SheetNames.reduce<ParsedClientImport>((parsed, sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) return parsed
    const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | Date | null>>(sheet, {
      header: 1,
      blankrows: false,
      defval: '',
      raw: false,
    })
      .map((row) => row.map((cell) => String(cell ?? '').trim()))
      .filter((row) => row.some(Boolean))
    if (!rows.length) return parsed

    return mergeParsedClientImports(parsed, parseClientImportRows(rows))
  }, emptyParsedClientImport())
}
