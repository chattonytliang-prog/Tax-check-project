import { detectTaxDataPeriod } from './taxDataIntakeParser'
import { legacyVatTemplate, type VatFormVersion } from './filingValidation'

export const vatGeneralReturnLines = [
  ['1', '（一）按适用税率计税销售额'], ['2', '其中：应税货物销售额'], ['3', '应税劳务销售额'], ['4', '纳税检查调整的销售额'],
  ['5', '（二）按简易办法计税销售额'], ['6', '其中：纳税检查调整的销售额'], ['7', '（三）免、抵、退办法出口销售额'], ['8', '（四）免税销售额'], ['9', '其中：免税货物销售额'], ['10', '免税劳务销售额'],
  ['11', '销项税额'], ['12', '进项税额'], ['13', '上期留抵税额'], ['14', '进项税额转出'], ['15', '免、抵、退应退税额'], ['16', '按适用税率计算的纳税检查应补缴税额'],
  ['17=12+13-14-15+16', '应抵扣税额合计'], ['18（如17＜11，则为17，否则为11）', '实际抵扣税额'], ['19=11-18', '应纳税额'], ['20=17-18', '期末留抵税额'], ['21', '简易计税办法计算的应纳税额'], ['22', '按简易计税办法计算的纳税检查应补缴税额'], ['23', '应纳税额减征额'], ['24=19+21-23', '应纳税额合计'],
  ['25', '期初未缴税额（多缴为负数）'], ['26', '实收出口开具专用缴款书退税额'], ['27=28+29+30+31', '本期已缴税额'], ['28', '①分次预缴税额'], ['29', '②出口开具专用缴款书预缴税额'], ['30', '③本期缴纳上期应纳税额'], ['31', '④本期缴纳欠缴税额'], ['32=24+25+26-27', '期末未缴税额（多缴为负数）'], ['33=25+26-27', '其中：欠缴税额（≥0）'], ['34=24-28-29', '本期应补（退）税额'], ['35', '即征即退实际退税额'], ['36', '期初未缴查补税额'], ['37', '本期入库查补税额'], ['38=16+22+36-37', '期末未缴查补税额'],
  ['39', '城市维护建设税本期应补（退）税额'], ['40', '教育费附加本期应补（退）费额'], ['41', '地方教育附加本期应补（退）费额'],
] as const

const pilotLines = [
  ['0A00', '全部销售额'], ['0A00a', '其中：线上交易销售额'], ['0A00b', '未达起征点免税销售额'],
  ['0B01', '销项税额'], ['0B02', '进项税额'], ['0B03', '上期留抵税额'], ['0B04', '进项税额转出'], ['0B05=0B02+0B03-0B04', '应抵扣税额合计'], ['0B06（如0B05＜0B01，则为0B05，否则为0B01）', '实际抵扣税额'],
  ['0B07=0B01-0B06', '按一般计税方法计算的应纳税额'], ['0B08=0B05-0B06', '期末留抵税额'], ['0B09', '加计抵减额'], ['0B10', '按简易计税方法计算的应纳税额'], ['0B11（如0B07−0B09+0B10＞0，则0B11≤0B07−0B09+0B10；如0B07−0B09+0B10＜0，则0B11≤0）', '应纳税额减征额'], ['0B20=0B07-0B09+0B10-0B11', '应纳税额合计'],
  ['0C01（0C01≤0B20）', '本期抵减预缴税额'], ['0C02=0B20-0C01', '本期应补（退）税额'],
  ['0D01', vatGeneralReturnLines[38][1]], ['0D02', vatGeneralReturnLines[39][1]], ['0D03', vatGeneralReturnLines[40][1]],
] as const

const legacyBlocked: Record<string, number[]> = {
  7: [2, 3], 8: [2, 3], 9: [2, 3], 10: [2, 3], 13: [1], 15: [2, 3], 16: [2, 3], 17: [1, 3], 20: [1], 22: [2, 3],
  26: [2, 3], 28: [1, 3], 29: [1, 2, 3], 33: [1, 3], 34: [1, 3], 35: [0, 1], 36: [2, 3], 37: [2, 3], 38: [2, 3], 39: [2, 3], 40: [2, 3], 41: [2, 3],
}
export const vatFormGroups = ['销售额', '税款计算', '税款缴纳', '附加税费']
export const vatColumns = {
  legacy: ['一般项目本月数', '一般项目本年累计', '即征即退项目本月数', '即征即退项目本年累计'],
  pilot: ['一般项目本期数', '即征即退项目本期数'],
} as const
export const vatRowCode = (value: unknown) => String(value ?? '').normalize('NFKC').trim().match(/^(0[ABCD]\d{2}[ab]?|\d{1,2})(?=\s|[=(：:]|$)/i)?.[1].replace(/^0[a-d]/i, (x) => x.toUpperCase()).replace(/[AB]$/, (x) => x.toLowerCase())
export const vatFormLines = {
  legacy: vatGeneralReturnLines.map(([reference, label], index) => ({ code: String(index + 1), reference, label, group: index < 10 ? 0 : index < 24 ? 1 : index < 38 ? 2 : 3, blocked: legacyBlocked[index + 1] ?? [] })),
  pilot: pilotLines.map(([reference, label]) => ({ code: vatRowCode(reference)!, reference, label, group: 'ABCD'.indexOf(reference[1]), blocked: reference.startsWith('0D') ? [1] : [] })),
}

export type VatAmounts = Record<string, string[]>
export type VatMetadata = { taxpayer?: string; taxId?: string; periodStart?: string; periodEnd?: string; filledOn?: string }
export type VatDraftData = { version: VatFormVersion; meta: VatMetadata; amounts: VatAmounts; notices: string[] }
type Grid = { name: string; rows: unknown[][] }
const compact = (value: unknown) => String(value ?? '').normalize('NFKC').replace(/\s/g, '')
const labelKey = (value: unknown) => compact(value).replace(/[\p{P}\d]/gu, '').replace(/^(其中|[一二三四①②③④])/, '')
function validLabel(text: string, label: string, code: string) {
  const target = labelKey(label)
  const actual = labelKey(text)
  return actual.endsWith(target) || (code === '3' && actual.endsWith('应税服务无形资产和不动产销售额'))
    || (code === '7' && actual.endsWith('免抵退办法出口货物销售额'))
    || (code === '10' && actual.endsWith('免税服务无形资产和不动产销售额'))
    || ((code === '34' || code === '0C02') && actual.endsWith('本期应补退税额'))
}

export function vatAmount(input: unknown) {
  if (typeof input !== 'number' && typeof input !== 'string') return ''
  const text = String(input).normalize('NFKC').trim().replace(/^−/, '-')
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) return ''
  const ungrouped = text.replace(/,/g, '')
  return /^-?\d{1,11}(?:\.\d{1,2})?$/.test(ungrouped) ? Number(ungrouped).toFixed(2) : ''
}

export function vatMetadata(lines: string[]): VatMetadata {
  const text = lines.join('\n').normalize('NFKC')
  const periodLine = lines.findIndex((line) => /税\s*(?:[（(]费[）)]\s*)?款\s*所\s*属/.test(line))
  const periodText = periodLine < 0 ? '' : lines.slice(periodLine, periodLine + 2).join(' ').normalize('NFKC')
    .split(/填\s*表\s*日\s*期|纳\s*税\s*人|金\s*额\s*单\s*位/)[0]
  const taxPeriod = detectTaxDataPeriod(periodText)
  const taxpayer = text.match(/纳税人名称[ \t]*(?:\(\s*公\s*章\s*\))?[ \t]*[:：]?[ \t]*(?:\(\s*公\s*章\s*\))?[ \t]*([^\n]*?)(?=[ \t]*\(\s*公\s*章\s*\)|[ \t]*(?:金额单位|所属行业|填表日期|识别号|法定代表人|注册地址|生产经营地址)|\n|$)/)?.[1]?.trim()
  const taxId = text.match(/(?:纳税人识别号[\s(统一社会信用代码)]*|统一社会信用代码\)?)[:：\s]*([0-9A-Z]{15,20})(?![0-9A-Z])/i)?.[1]
  const filledOn = text.match(/填表日期[:：\s]*([0-9年月日/\-. ]{8,18})/)?.[1]?.trim()
  return { ...taxPeriod, taxpayer: taxpayer && /[\p{Script=Han}a-z]/iu.test(taxpayer) && !['项目', '栏次'].includes(taxpayer) ? taxpayer : undefined, taxId, filledOn }
}

function mergeAmounts(amounts: VatAmounts, code: string, cells: string[], conflicts: Set<string>) {
  const previous = amounts[code]
  if (!previous) { amounts[code] = cells; return }
  for (let col = 0; col < cells.length; col++) {
    const key = `${code}:${col}`
    if (conflicts.has(key)) continue
    if (cells[col] && previous[col] && cells[col] !== previous[col]) { previous[col] = ''; conflicts.add(key) }
    else if (!previous[col]) previous[col] = cells[col]
  }
}

function result(version: VatFormVersion, meta: VatMetadata, amounts: VatAmounts, conflicts: Set<string>, uncertain = false): VatDraftData {
  const notices: string[] = []
  if (conflicts.size) notices.push('原表同一单元格有不同金额，冲突项已留空。')
  if (uncertain) notices.push('部分金额无法对应到原表列，已留空，请对照原表。')
  return { version, meta, amounts, notices }
}

export function vatDraftFromArchive(records: readonly { confidence?: string; data: Record<string, unknown> }[]): VatDraftData {
  const amounts: VatAmounts = {}
  const conflicts = new Set<string>()
  for (const { data, confidence } of records) {
    const code = vatRowCode(data.rowNo ?? data.row_no)
    const line = vatFormLines.legacy.find((row) => row.code === code)
    if (!line || confidence === 'low' || ![legacyVatTemplate, 'confirmed_document_vat_main'].includes(String(data.templateId)) || data.templateValidationStatus === 'failed') continue
    const cells = [data.currentAmount ?? data.current_amount, data.cumulativeAmount ?? data.cumulative_amount, data.currentTax ?? data.current_tax, data.cumulativeTax ?? data.cumulative_tax]
    mergeAmounts(amounts, line.code, cells.map((value, i) => line.blocked.includes(i) ? '' : vatAmount(value)), conflicts)
  }
  return result('legacy', {}, amounts, conflicts)
}

function legacyColumn(value: unknown) {
  return /^(?:本月数|本期数|本年累计(?:数)?)$/.test(compact(value))
}

function supportedHeader(header: string) {
  return /增值税(?:及附加税费)?(?:纳税)?申报表/.test(header)
    && !/申报表.{0,4}(?:附列资料|小规模纳税人适用|预缴)|预缴税款表/.test(header)
    && !/金额单位[:：]?(?:万元|千元|美元|港元|欧元)/.test(header)
}

export function vatDraftFromWorkbook(sheets: Grid[]): VatDraftData {
  const candidates = sheets.flatMap(({ rows }) => {
    const rowHeader = rows.slice(0, 35).findIndex((cells) => cells.some((cell) => /^栏次[编号]*$/.test(compact(cell))))
    if (rowHeader < 0) return []
    const before = rows.slice(0, rowHeader + 1).map((row) => row.map(compact).join(' '))
    const header = before.join(' ').replace(/\s/g, '')
    if (!supportedHeader(header)) return []
    const headers = rows[rowHeader]
    const codeColumn = headers.findIndex((cell) => /^栏次[编号]*$/.test(compact(cell)))
    const columnsFor = (cells: unknown[], predicate: (x: unknown) => boolean) => cells.flatMap((cell, col) => col > codeColumn && predicate(cell) ? [col] : [])
    const pilotColumns = columnsFor(headers, (cell) => /^(?:一般项目|即征即退项目)本(?:期|月)数$/.test(compact(cell)))
    const legacyColumns = columnsFor(headers, legacyColumn).length === 4 ? columnsFor(headers, legacyColumn) : columnsFor(rows[rowHeader + 1] || [], legacyColumn)
    const version = pilotColumns.length === 2 && compact(headers[pilotColumns[0]]).startsWith('一般项目') && compact(headers[pilotColumns[1]]).startsWith('即征即退项目') ? 'pilot' : 'legacy'
    const columns = version === 'pilot' ? pilotColumns : legacyColumns
    const subhead = columnsFor(headers, legacyColumn).length === 4 ? headers : rows[rowHeader + 1] || []
    if (version === 'legacy' && (!header.includes('一般项目') || !header.includes('即征即退项目') || columns.length !== 4
      || columns.map((col) => compact(subhead[col]).includes('累计') ? 1 : 0).join() !== '0,1,0,1')) return []
    if (rows.slice(rowHeader + 1).some((cells) => /^栏次[编号]*$/.test(compact(cells[codeColumn]))
      && cells.slice(codeColumn + 1).some((cell) => /^(?:一般项目|一般项目本期数|一般项目本月数)$/.test(compact(cell))))) {
      throw new Error('文件里有重复的主表表头。请另存要核对的单期主表后重新上传。')
    }
    const amounts: VatAmounts = {}
    const conflicts = new Set<string>()
    let uncertain = false
    const matched = new Set<string>()
    for (const cells of rows.slice(rowHeader + 1)) {
      const code = vatRowCode(cells[codeColumn])
      const line = vatFormLines[version].find((row) => row.code === code && validLabel(cells.slice(0, codeColumn).map(compact).join(''), row.label, row.code))
      if (!line) continue
      matched.add(line.code)
      mergeAmounts(amounts, line.code, columns.map((col, index) => {
        if (line.blocked.includes(index)) return ''
        const value = vatAmount(cells[col])
        if (!value && !/^[—–-]*$/.test(compact(cells[col]))) uncertain = true
        return value
      }), conflicts)
    }
    if (matched.size < 3) return []
    return [result(version, vatMetadata(before), amounts, conflicts, uncertain)]
  })
  if (candidates.length > 1) throw new Error('文件里有多张增值税主表。请另存要核对的单期主表后重新上传。')
  if (!candidates.length) throw new Error('未识别到一般纳税人增值税主表。请上传带「栏次」和金额列的税局原表，不能只传附表或财务报表。')
  return candidates[0]
}

// Text PDFs only: never shift a value left when PDF text extraction omits an empty column.
export function vatDraftFromPdf(pages: string[], allowBlankMain = false): VatDraftData {
  const candidates = pages.flatMap((page) => {
    const key = compact(page)
    if (!key.includes('栏次') || !supportedHeader(key.split('栏次')[0]) || !/栏次.*一般项目.*即征即退项目/.test(key)) return []
    const version = key.includes('0B01') && key.includes('一般项目本期数') ? 'pilot' : 'legacy'
    if (version === 'legacy' && !/本(?:月|期)数本年累计(?:数)?本(?:月|期)数本年累计/.test(key)) return []
    const amounts: VatAmounts = {}
    const conflicts = new Set<string>()
    let uncertain = false
    const lines = page.normalize('NFKC').split(/\r?\n/)
    const matched = new Set<string>()
    for (const line of lines) {
      const columns = line.trim().split(/\s+/)
      const fields = vatFormLines[version].find((row) => columns.some((cell, index) => vatRowCode(cell) === row.code && validLabel(columns.slice(0, index).join(''), row.label, row.code)))
      if (!fields) continue
      const codeIndex = columns.findIndex((cell, index) => vatRowCode(cell) === fields.code && validLabel(columns.slice(0, index).join(''), fields.label, fields.code))
      matched.add(fields.code)
      const length = vatColumns[version].length
      const remaining = columns.slice(codeIndex + 1)
      const values = remaining.slice(-length)
      const prefix = remaining.slice(0, -length)
      const hasAmount = (token: string) => /^-?[\d,]+\.\d{1,2}$/.test(token) && !!vatAmount(token)
      const admissible = values.length === length && values.every((cell) => /^[—–-]+$/.test(cell) || /^-?[\d,]+\.\d{1,2}$/.test(cell) && vatAmount(cell))
      const prefixIsFormula = !prefix.length || /[=(]/.test(columns[codeIndex]) && !prefix.some(hasAmount)
      if (!admissible || !prefixIsFormula || fields.blocked.some((index) => !/^[—–-]+$/.test(values[index]))) {
        if (values.some(hasAmount)) uncertain = true
        continue
      }
      mergeAmounts(amounts, fields.code, values.map(vatAmount), conflicts)
    }
    return matched.size >= 3 ? [result(version, vatMetadata(lines), amounts, conflicts, uncertain)] : []
  })
  if (candidates.length !== 1) throw new Error(candidates.length ? 'PDF 中有多张主表，请上传单期主表。' : '未识别到可读的增值税主表。扫描件或特殊版式，请改用税局导出的 Excel 原表。')
  const draft = candidates[0]
  if (!Object.values(draft.amounts).some((row) => row.some(Boolean))) {
    if (!allowBlankMain) throw new Error('这份 PDF 没有可安全定位的金额，请改用税局导出的 Excel 原表。')
    draft.notices.push('已识别 PDF 主表，但没有可安全定位的金额；未校验，建议改传 Excel 原表。')
  }
  return draft
}
