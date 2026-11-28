import { vatAmount, type VatAmounts, type VatMetadata } from './filingDraft'
import type { FilingStatus, VatFormVersion } from './filingValidation'

export const annexNames = {
  cover: '申报表封面', business: '业务信息表', sale: '本期销售情况明细', deduction: '服务、不动产和无形资产扣除项目明细',
  unbilled: '未开具发票销售情况明细', pilotDeduction: '扣除项目明细', simplified: '简易计税明细',
  input: '本期进项税额明细', extraCredit: '本期加计抵减情况明细', relief: '增值税减免税申报明细表',
  credit: '税额抵减情况表', surchargeLegacy: '附加税费情况表', surchargePilot: '附加税费情况表',
} as const
export type AnnexKind = keyof typeof annexNames
const kit = {
  legacy: [['sale', '附表一'], ['deduction', '附表三'], ['input', '附表二'], ['credit', '附表四'], ['relief', '减免税明细'], ['surchargeLegacy', '附表五']],
  pilot: [['cover', '封面'], ['business', '业务信息'], ['unbilled', '附一·附1'], ['pilotDeduction', '附一·附2'], ['simplified', '附一·附3'], ['sale', '附表一'], ['extraCredit', '附二·附1'], ['input', '附表二'], ['relief', '减免税明细'], ['surchargePilot', '附表三']],
} as const
export const vatAnnexOrder = (version: VatFormVersion): readonly (readonly [AnnexKind, string])[] => kit[version]

export type AnnexCell = { row: number; col: number; text: string; raw: unknown; rowSpan?: number; colSpan?: number; number?: boolean; heading?: boolean; input?: 'amount' | 'text' }
export type AnnexField = { amountFen?: number; cell: AnnexCell }
export type VatAnnex = {
  id: string; kind: AnnexKind; title: string; source: string; meta: VatMetadata
  state: 'verified' | 'unconfirmed' | 'duplicate' | 'conflict' | 'pdf'
  grid?: AnnexCell[][]; width?: number; fields?: Record<string, AnnexField>; pdf?: { file: File; pages: number[] }
}
export const annexCellId = (annex: VatAnnex, field: AnnexField) => `${annex.id}-cell-${field.cell.row}-${field.cell.col}`

export function updateAnnexAmount(annex: VatAnnex, version: VatFormVersion, row: number, col: number, text: string): VatAnnex {
  if (!annex.grid) return annex
  const grid = annex.grid.map((line) => line[0]?.row !== row ? line : line.map((cell) => cell.col === col && cell.input ? { ...cell, raw: text, text } : cell))
  return { ...annex, grid, fields: annex.state === 'verified' ? readAnnexFields(annex.kind, version, grid) : annex.fields }
}

export const tidy = (value: unknown) => String(value ?? '').normalize('NFKC').replace(/\s/g, '')
const searchKey = (value: unknown) => tidy(value).replace(/[\p{P}\p{S}]/gu, '')

export function classifyVatAnnex(title: string): AnnexKind | undefined {
  const key = searchKey(title)
  if (/小规模纳税人适用|不启用|本期取得用于出口退税发票明细/.test(key)) return
  if (/增值税及附加税费申报表业务信息表/.test(key)) return 'business'
  if (/未开具发票销售情况明细/.test(key)) return 'unbilled'
  if (/本期加计抵减情况明细/.test(key)) return 'extraCredit'
  if (/简易计税明细/.test(key)) return 'simplified'
  if (/增值税减免税申报明细表/.test(key)) return 'relief'
  if (/附列资料一.*扣除项目明细/.test(key)) return 'pilotDeduction'
  if (/附列资料五.*附加税费情况表/.test(key)) return 'surchargeLegacy'
  if (/附列资料三.*附加税费情况表/.test(key)) return 'surchargePilot'
  if (/附列资料三.*扣除项目明细/.test(key)) return 'deduction'
  if (/附列资料四.*税额抵减情况表/.test(key)) return 'credit'
  if (/附列资料一.*本期销售情况明细/.test(key)) return 'sale'
  if (/附列资料二.*本期进项(?:税额|情况)明细/.test(key)) return 'input'
  if (/^(?:附件1)?增值税及附加税费申报表试行/.test(key) && !/主表|附列资料|填写说明/.test(key)) return 'cover'
}

export function annexIdentity(main: VatMetadata, annex: VatMetadata): 'verified' | 'unconfirmed' | 'conflict' {
  const sameNames = main.taxpayer && annex.taxpayer ? tidy(main.taxpayer) === tidy(annex.taxpayer) : undefined
  const sameIds = main.taxId && annex.taxId ? tidy(main.taxId).toUpperCase() === tidy(annex.taxId).toUpperCase() : undefined
  if (sameIds === false || sameNames === false) return 'conflict'
  for (const key of ['periodStart', 'periodEnd'] as const) if (main[key] && annex[key] && main[key] !== annex[key]) return 'conflict'
  return (sameIds || sameNames) && main.periodStart && annex.periodStart && main.periodEnd && annex.periodEnd ? 'verified' : 'unconfirmed'
}

function cents(value: unknown) {
  const normalized = vatAmount(value)
  return normalized ? Number(normalized.replace('.', '')) : undefined
}

// The column must be explicitly named in the preceding header block; never infer it from the last amount.
export function readAnnexFields(kind: AnnexKind, version: VatFormVersion, grid: AnnexCell[][]): Record<string, AnnexField> {
  const lookup = (code: string, label: RegExp, column: RegExp, codeRequired = true): AnnexField | undefined => {
    const possible = grid.filter((line) => label.test(line.map((c) => searchKey(c.raw)).join(''))
      && (!codeRequired || line.some((c) => tidy(c.raw).match(/^[A-Za-z0-9]+(?=$|[=(≤<:])/u)?.[0] === code)))
    if (possible.length !== 1) return
    const line = possible[0]
    const row = line[0].row
    for (let r = row - 1; r >= Math.max(0, row - 19); r--) {
      const headers = grid[r]?.filter((c) => column.test(searchKey(c.raw))) || []
      if (!headers.length) continue
      if (headers.length !== 1) return
      const { col, colSpan = 1 } = headers[0]
      const slots = line.filter((cell) => cell.col >= col && cell.col < col + colSpan)
      const values = slots.filter((cell) => cents(cell.raw) !== undefined)
      if (values.length > 1) return
      const cell = values[0] ?? slots[0]
      if (!cell) return
      return { cell, amountFen: cents(cell.raw) }
    }
  }
  const found: Record<string, AnnexField> = {}
  const put = (key: string, field?: AnnexField) => { if (field) found[key] = field }
  if (kind === 'sale' && version === 'legacy') {
    const header = grid.findIndex((row) => row.some((cell) => /^9=1\+3\+5\+7$/.test(tidy(cell.raw)))
      && row.some((cell) => /^10=2\+4\+6\+8$/.test(tidy(cell.raw))))
    const first = grid[header]?.find((cell) => cell.raw === 1 || tidy(cell.raw) === '1')?.col
    const col = grid[header]?.find((cell) => /^9=/.test(tidy(cell.raw)))?.col
    if (first && col !== undefined) for (const range of [[16, 17, /免抵退税/], [18, 19, /四免税/]] as const) {
      const [rowA, rowB, section] = range
      const rows = (code: number) => grid.slice(header + 1).filter((line) => line.some((cell) => cell.col === first - 1 && tidy(cell.raw) === String(code)))
      const a = rows(rowA), b = rows(rowB)
      if (a.length !== 1 || b.length !== 1 || !section.test(a[0].filter((cell) => cell.col < first - 1).map((cell) => searchKey(cell.raw)).join(''))) continue
      for (const [key, source] of [[rowA, a[0]], [rowB, b[0]]] as const) {
        const cell = source.find((value) => value.col === col)
        if (cell) put(String(key), { cell, amountFen: cents(cell.raw) })
      }
    }
  }
  if (kind === 'input' && version === 'legacy') {
    put('1', lookup('1', /认证相符的增值税专用发票/, /^税额$/))
    put('4', lookup('4', /其他扣税凭证/, /^税额$/))
    put('11', lookup('11', /外贸企业进项税额抵扣证明/, /^税额$/))
    put('12', lookup('12', /(?:当期|本期)申报抵扣进项税额合计/, /^税额$/))
    put('13', lookup('13', /本期进项税额转出额/, /^税额$/))
  }
  if (kind === 'input' && version === 'pilot') {
    put('2A00', lookup('2A00', /本期申报抵扣进项税额合计/, /^税额$/))
    put('2C01', lookup('2C01', /本期即征即退项目进项税额/, /^税额$/))
  }
  if (kind === (version === 'pilot' ? 'surchargePilot' : 'surchargeLegacy')) {
    const surcharge = /^本期应补退税费额$/
    put('1', lookup('1', /^城市维护建设税/, surcharge))
    put('2', lookup('2', /^教育费附加/, surcharge))
    put('3', lookup('3', /^地方教育附加/, surcharge))
  }
  return found
}

// PDF text output drops unprinted blank cells. Require the whole row's expected amount suffix, and known form headers.
export function readPdfInputAnnexFields(pages: readonly string[], version: VatFormVersion): Record<string, AnnexField> {
  const definitions = version === 'legacy'
    ? [['12', /(?:当期|本期)申报抵扣进项税额合计/, 3], ['13', /本期进项税额转出额/, 1]] as const
    : [['2A00', /本期申报抵扣进项税额合计/, 2], ['2C01', /本期即征即退项目进项税额/, 1]] as const
  const out: Record<string, AnnexField> = {}
  for (const [key, label, count] of definitions) {
    const matches: AnnexField[] = []
    for (const page of pages) {
      if (classifyVatAnnex(page.split('\n').slice(0, 4).join(' ')) !== 'input' || !/栏次(?:份数)?(?:金额)?税额/.test(tidy(page))) continue
      const lines = page.normalize('NFKC').split(/\r?\n/)
      for (const [index, line] of lines.entries()) {
        if (!label.test(searchKey(line))) continue
        const tokens = line.trim().split(/\s+/)
        const codeIndex = tokens.findIndex((token) => token.match(/^[A-Za-z0-9]+(?=$|[=(])/u)?.[0] === key)
        if (codeIndex < 1) continue
        const after = tokens.slice(codeIndex + 1)
        const values = after.slice(-count)
        const hasFen = (value: string) => /^-?[\d,]+\.\d{1,2}$/.test(value) && cents(value) !== undefined
        if (values.length !== count || !values.every((value, column) => version === 'legacy' && count === 3 && column === 0 ? /^\d+$/.test(value) : hasFen(value))) continue
        if (after.length > count && (!tokens[codeIndex].includes('=') || after.slice(0, -count).some(hasFen)
          || version === 'legacy' && count === 3 && /^\d+$/.test(after.at(-count - 1) || ''))) continue
        const raw = values.at(-1)!
        matches.push({ amountFen: cents(raw), cell: { row: index, col: count - 1, raw, text: raw, number: true } })
      }
    }
    if (matches.length === 1) out[key] = matches[0]
  }
  return out
}

export function checkVatAnnexInternal(annex: VatAnnex) {
  if (annex.kind !== 'input' || !annex.fields?.['1'] || !annex.fields?.['4'] || !annex.fields?.['11']) return
  const result = annex.fields['12']?.amountFen
  const refs = ['1', '4', '11'].map((key) => ({ key, field: annex.fields![key] }))
  const subtotal = refs.every(({ field }) => field.amountFen !== undefined) ? refs.reduce((sum, { field }) => sum + field.amountFen!, 0) : undefined
  return { refs, result, subtotal, status: result === undefined || subtotal === undefined ? 'missing' : result === subtotal ? 'matched' : 'difference' } as const
}

export type AnnexFinding = { id: string; target: string; mainCols: readonly number[]; name: string; reference: string; status: FilingStatus; mainFen?: number; annexFen?: number; sources: { field?: AnnexField; report?: VatAnnex; label: string }[]; absent?: string }
type LinkRule = { target: string; title: string; mainCols: readonly number[]; kind: AnnexKind; keys: readonly string[]; reference: string; subtract?: boolean }
const referenceRules: Record<VatFormVersion, readonly LinkRule[]> = {
  legacy: [
    { target: '7', title: '免抵退出口销售额', mainCols: [0], kind: 'sale', keys: ['16', '17'], reference: '附表一第9列第16、17行销售额之和' },
    { target: '8', title: '免税销售额', mainCols: [0], kind: 'sale', keys: ['18', '19'], reference: '附表一第9列第18、19行销售额之和' },
    { target: '12', title: '进项税额', mainCols: [0, 2], kind: 'input', keys: ['12'], reference: '主表第12栏一般项目与即征即退本期之和＝附表二第12栏税额' },
    { target: '14', title: '进项税额转出', mainCols: [0, 2], kind: 'input', keys: ['13'], reference: '主表第14栏一般项目与即征即退本期之和＝附表二第13栏税额' },
    ...['城市维护建设税', '教育费附加', '地方教育附加'].map((title, i): LinkRule => ({ target: String(39 + i), title, mainCols: [0], kind: 'surchargeLegacy', keys: [String(i + 1)], reference: `附表五第${i + 1}行本期应补（退）税（费）额` })),
  ],
  pilot: [
    { target: '0B02', title: '一般项目进项税额', mainCols: [0], kind: 'input', keys: ['2A00', '2C01'], reference: '附表二 2A00 税额 − 2C01 税额', subtract: true },
    { target: '0B02', title: '即征即退进项税额', mainCols: [1], kind: 'input', keys: ['2C01'], reference: '附表二 2C01 税额' },
    ...['城市维护建设税', '教育费附加', '地方教育附加'].map((title, i): LinkRule => ({ target: `0D0${i + 1}`, title, mainCols: [0], kind: 'surchargePilot', keys: [String(i + 1)], reference: `附表三第${i + 1}行本期应补（退）税（费）额` })),
  ],
}

export function checkVatAnnexes(version: VatFormVersion, amounts: VatAmounts, annexes: readonly VatAnnex[]): AnnexFinding[] {
  return referenceRules[version].map((rule, index) => {
    const matches = annexes.filter((annex) => annex.kind === rule.kind)
    const report = matches.length === 1 ? matches[0] : undefined
    const sources = rule.keys.map((key) => ({ report, field: report?.fields?.[key], label: `${annexNames[rule.kind]} ${key}` }))
    const read = rule.mainCols.map((column) => cents(amounts[rule.target]?.[column]))
    const mainFen = read.every((value) => value !== undefined) ? read.reduce<number>((sum, value) => sum + value!, 0) : undefined
    const subtotal = sources.map(({ field }) => field?.amountFen)
    const annexFen = report?.state === 'verified' && subtotal.every((value) => value !== undefined)
      ? subtotal.reduce<number>((sum, value, i) => sum + (rule.subtract && i > 0 ? -value! : value!), 0) : undefined
    const status = mainFen === undefined || annexFen === undefined ? 'missing' : mainFen === annexFen ? 'matched' : 'difference'
    const absent = matches.length > 1 ? '同类附表有多份，不能确定取数来源。' : !report ? '本套资料未读入该附表。'
      : report.state === 'pdf' ? 'PDF 原页仅用于人工核对；表间复算需要可读的 Excel 表。'
        : report.state !== 'verified' ? '附表与主表的纳税人和所属期未核实。'
          : annexFen === undefined ? '附表对应金额未识别或为空。' : mainFen === undefined ? '主表对应金额为空或格式不明。' : undefined
    return { id: `sheet-${index}`, target: rule.target, mainCols: rule.mainCols, name: rule.title, reference: rule.reference, status, mainFen, annexFen, sources, absent }
  })
}
