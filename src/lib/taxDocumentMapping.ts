export const confirmedTaxDocumentSource = '用户确认的 PDF 或 Word 字段定位'

export const taxDocumentKinds = {
  vat_main: '增值税申报主表',
  vat_schedule_four: '增值税附列资料（四）',
  income_statement: '利润表',
  balance_sheet: '资产负债表',
  cash_flow_statement: '现金流量表',
}

export type TaxDocumentMapping = {
  kind: keyof typeof taxDocumentKinds
  rows: Array<{ start: number; end: number }>
}

export function validateTaxDocumentMapping(value: unknown, lineCount: number): TaxDocumentMapping | null {
  if (!value || typeof value !== 'object') return null
  const { kind, rows } = value as Partial<TaxDocumentMapping>
  if (!kind || !Object.hasOwn(taxDocumentKinds, kind) || !Array.isArray(rows) || !rows.length || rows.length > 120) return null
  const occupied = new Set<number>()
  for (const row of rows) {
    if (!row || !Number.isInteger(row.start) || !Number.isInteger(row.end)
      || row.start < 0 || row.end < row.start || row.end >= lineCount || row.end - row.start > 3) return null
    for (let i = row.start; i <= row.end; i += 1) {
      if (occupied.has(i)) return null
      occupied.add(i)
    }
  }
  return { kind, rows: rows.map(({ start, end }) => ({ start, end })).sort((a, b) => a.start - b.start) }
}

export function taxDocumentLocatorInput(lines: string[]) {
  return lines.map((line) => {
    if (/纳税人名称|纳税人识别号|编制单位|开户银行|法定代表|身份证|电话号码|注册地址|盖章/.test(line)) {
      return line.match(/(?:金额)?单位\s*[:：]\s*(?:万元|千元|元)/)?.[0] || ''
    }
    if (!/增值税|申报表|附列资料|抵减|利润表|资产负债表|现金流量表|项目|行次|栏次|金额|期末|期初|本月|本期|累计|单位|一般项目|即征即退|^\s*\d{1,2}\s|\d[,.]\d|\t/.test(line)) return ''
    return line.replace(/-?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d+/g, '[金额]')
      .replace(/\d{10,}[0-9Xx]?/g, '[编号]').slice(0, 260)
  })
}
