export const filingSources = {
  legacy: 'https://12366.chinatax.gov.cn/bzds/009/009.html',
  pilot: 'https://shanghai.chinatax.gov.cn/gate/big5/shanghai.chinatax.gov.cn/public/pdf/202606/P020260605646987770482.pdf',
} as const

export const legacyVatTemplate = 'vat_general_return_main_pdf_v1'
export type VatFormVersion = keyof typeof filingSources
export type FilingStatus = 'matched' | 'difference' | 'missing'
type Formula = { id: string; name: string; target: string; operands: readonly string[]; formula: string; calculate: (values: number[]) => number }

export const filingFormulas = {
  legacy: [
    { id: 'FILING-VAT-L17', name: '应抵扣税额合计', target: '17', operands: ['12', '13', '14', '15', '16'], formula: '17 = 12 + 13 − 14 − 15 + 16', calculate: ([a, b, c, d, e]) => a + b - c - d + e },
    { id: 'FILING-VAT-L18', name: '实际抵扣税额', target: '18', operands: ['17', '11'], formula: '18 = 17 与 11 的较小值', calculate: ([a, b]) => Math.min(a, b) },
    { id: 'FILING-VAT-L20', name: '期末留抵税额', target: '20', operands: ['17', '18'], formula: '20 = 17 − 18', calculate: ([a, b]) => a - b },
  ],
  pilot: [
    { id: 'FILING-VAT-P05', name: '应抵扣税额合计', target: '0B05', operands: ['0B02', '0B03', '0B04'], formula: '0B05 = 0B02 + 0B03 − 0B04', calculate: ([a, b, c]) => a + b - c },
    { id: 'FILING-VAT-P06', name: '实际抵扣税额', target: '0B06', operands: ['0B05', '0B01'], formula: '0B06 = 0B05 与 0B01 的较小值', calculate: ([a, b]) => Math.min(a, b) },
    { id: 'FILING-VAT-P07', name: '一般计税应纳税额', target: '0B07', operands: ['0B01', '0B06'], formula: '0B07 = 0B01 − 0B06', calculate: ([a, b]) => a - b },
    { id: 'FILING-VAT-P08', name: '期末留抵税额', target: '0B08', operands: ['0B05', '0B06'], formula: '0B08 = 0B05 − 0B06', calculate: ([a, b]) => a - b },
    { id: 'FILING-VAT-P20', name: '应纳税额合计', target: '0B20', operands: ['0B07', '0B09', '0B10', '0B11'], formula: '0B20 = 0B07 − 0B09 + 0B10 − 0B11', calculate: ([a, b, c, d]) => a - b + c - d },
    { id: 'FILING-VAT-P02', name: '本期应补（退）税额', target: '0C02', operands: ['0B20', '0C01'], formula: '0C02 = 0B20 − 0C01', calculate: ([a, b]) => a - b },
  ],
} satisfies Record<VatFormVersion, readonly Formula[]>

export type FilingFinding = {
  id: string; name: string; target: string; formula: string; status: FilingStatus; missing: string[]
  inputs: { row: string; amountFen?: number }[]; actualFen?: number; expectedFen?: number
}

function fen(input: unknown) {
  if (typeof input !== 'number' && typeof input !== 'string') return undefined
  if (typeof input === 'number' && !Number.isFinite(input)) return undefined
  const text = String(input).trim()
  const match = /^(-?)(\d{1,11})(?:\.(\d{1,2}))?$/.exec(text)
  if (!match) return undefined
  const value = Number(match[2]) * 100 + Number((match[3] || '').padEnd(2, '0'))
  return value * (match[1] ? -1 : 1)
}

export function validateVatFiling(version: VatFormVersion, entries: readonly { row: string; amount: unknown }[]): FilingFinding[] {
  const byRow = new Map<string, Set<number | undefined>>()
  for (const entry of entries) {
    const values = byRow.get(entry.row) || new Set<number | undefined>()
    values.add(fen(entry.amount))
    byRow.set(entry.row, values)
  }
  const get = (row: string) => {
    const values = byRow.get(row)
    return values?.size === 1 ? values.values().next().value : undefined
  }
  return filingFormulas[version].map(({ id, name, target, formula, operands, calculate }) => {
    const inputs = operands.map((row) => ({ row, amountFen: get(row) }))
    const actualFen = get(target)
    const missing = [target, ...operands].filter((row) => get(row) === undefined)
    const expectedFen = inputs.every((input) => input.amountFen !== undefined) ? calculate(inputs.map(({ amountFen }) => amountFen!)) : undefined
    const status = missing.length ? 'missing' : actualFen === expectedFen ? 'matched' : 'difference'
    return { id, name, target, formula, status, missing, inputs, actualFen, expectedFen }
  })
}

export function vatFilingRowsFromArchive(records: readonly { confidence?: string; data: Record<string, unknown> }[]) {
  return records.flatMap(({ data, confidence }) => {
    if (data.templateId !== legacyVatTemplate || confidence === 'low') return []
    const row = String(data.rowNo || '').split('=')[0].trim()
    if (!/^\d{1,2}$/.test(row)) return []
    return [{ row, amount: data.currentAmount }]
  })
}
