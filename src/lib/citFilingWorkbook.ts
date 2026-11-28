import { read, SSF, utils, type CellObject, type WorkSheet } from '@e965/xlsx'
import { compactCitText as compact, findCitIdentity, parseCitAmount, type CitCell, type CitForm, type CitIdentity, type CitRow, type CitSheet } from './citAdjustmentFiling'

const maxRows = 180
const maxColumns = 56
const sheetNamePattern: Record<CitForm, RegExp> = {
  A105000: /^(?:A105000(?:[-_.:、(]|$)|(?:A105000)?[《]?纳税调整项目明细表[》]?(?:\(?A105000\)?)?$)/i,
  A105060: /^(?:A105060(?:[-_.:、(]|$)|(?:A105060)?[《]?广告费和业务宣传费等?跨年度纳税调整明细表[》]?(?:\(?A105060\)?)?$)/i,
}
const rowLabels = {
  12: /^(?:七、)?本年(?:广告费和业务宣传费)?支出纳税调整金额(?:[([]|$)/,
  15: /^(?:\(三\))?业务招待费支出$/,
  16: /^(?:\(四\))?广告费和业务宣传费支出(?:\(填写A105060\))?$/,
}
const mainHeaders = [/^[账帐]载金额$/, /^税收金额$/, /^(?:纳税)?调增(?:金额|额)$/, /^(?:纳税)?调减(?:金额|额)$/]
const annexHeaders = [/^广告费和业务宣传费(?:支出)?$/]
const names = {
  A105000: ['账载金额', '税收金额', '调增金额', '调减金额'],
  A105060: ['广告费和业务宣传费'],
}

function metadataCell(cell: CellObject | undefined, date1904: boolean) {
  if (!cell || cell.t === 'e' || cell.v == null) return ''
  if (typeof cell.v === 'number' && cell.z && SSF.is_date(cell.z)) {
    const date = SSF.parse_date_code(cell.v, { date1904 })
    return date ? `${date.y}-${date.m}-${date.d}` : ''
  }
  // The 18-digit identification code must be text: Excel truncates numeric IDs after 15 digits.
  if (typeof cell.v === 'number' && (!Number.isSafeInteger(cell.v) || String(cell.v).length > 15)) return ''
  return compact(String(cell.v)).toUpperCase()
}

function amount(cell: CellObject | undefined): CitCell {
  if (!cell) return 'blank'
  if (cell.t === 'e' || cell.t === 'b' || cell.t === 'd' || cell.z && (SSF.is_date(cell.z) || /%/.test(String(cell.z)))) return 'unreadable'
  if (cell.v == null || cell.v === '') return cell.f || cell.F ? 'unreadable' : 'blank'
  if (typeof cell.v === 'number') {
    if (!Number.isFinite(cell.v)) return 'unreadable'
    const rounded = cell.v.toFixed(2)
    return Math.abs(cell.v - Number(rounded)) <= 0.00001 ? parseCitAmount(rounded) : 'unreadable'
  }
  return typeof cell.v === 'string' ? parseCitAmount(cell.v) : 'unreadable'
}

function sheetInputs(sheet: WorkSheet, name: string, date1904: boolean) {
  if (!sheet['!ref']) return
  const { s, e } = utils.decode_range(sheet['!ref'])
  if (s.r >= maxRows || s.c >= maxColumns) return
  const rowEnd = Math.min(e.r, maxRows - 1), colEnd = Math.min(e.c, maxColumns - 1)
  const at = (r: number, c: number): CellObject | undefined => sheet[utils.encode_cell({ r, c })]
  const readRow = (r: number) => ({
    r, columns: Array.from({ length: colEnd - s.c + 1 }, (_, index) => {
      const c = s.c + index
      return { c, text: metadataCell(at(r, c), date1904) }
    }),
  })
  const firstRows = Array.from({ length: Math.min(rowEnd - s.r + 1, 32) }, (_, index) => readRow(s.r + index))
  const headerRows = firstRows.filter((row) => row.columns.some(({ text }) => /^(?:行次|栏次)$/.test(text)) && row.columns.some(({ text }) => /^项目$/.test(text)))
  const top = firstRows.slice(0, Math.min(18, headerRows[0] ? headerRows[0].r - s.r : 18))
  const topCells = top.flatMap(({ columns }) => columns.map(({ text }) => text))
  const headerText = top.map(({ columns }) => columns.map(({ text }) => text).join(''))
  const identity = findCitIdentity(headerText.join('\n'))
  const cover = /^(?:封面|A100000)$/i.test(compact(name)) || topCells.some((text) =>
    /^(?:A100000)?(?:中华人民共和国企业所得税年度纳税申报表|企业所得税年度纳税申报主表)(?:\(A类[^)]*\))?$/.test(text))
  const formNames = (['A105000', 'A105060'] as const).filter((code) =>
    sheetNamePattern[code].test(compact(name)) || [...topCells, ...headerText].some((text) => sheetNamePattern[code].test(text)))
  // A conflicting title and tab name are never used to select a form.
  const form = formNames.length === 1 ? formNames[0] : undefined
  const rows = form ? [...firstRows, ...Array.from({ length: rowEnd - s.r + 1 - firstRows.length }, (_, index) => readRow(s.r + firstRows.length + index))] : firstRows
  const unitContext = [...headerText, ...headerRows.map((row) => row.columns.map(({ text }) => text).join(''))].join('\n')
  return { identity, cover, form, rows, headerRows, at, merges: sheet['!merges'] || [],
    badUnits: /(?:金额单位|单位)[:：]?(?:万元|千元|百元|美元|港元|欧元)/.test(unitContext) }
}

function fits(identity: CitIdentity, cover: CitIdentity) {
  return !identity.conflict && (!identity.taxId || identity.taxId === cover.taxId) && (!identity.period || identity.period === cover.period)
}

export function parseCitWorkbook(buffer: ArrayBuffer | Uint8Array, file: number): CitSheet[] {
  const book = read(buffer, { sheetRows: maxRows, cellFormula: true, cellNF: true, cellHTML: false, cellDates: false, bookVBA: false, sheetStubs: true })
  if (!book.SheetNames.length || book.SheetNames.length > 160) throw new Error('工作表数量超过读取上限。')
  const date1904 = !!book.Workbook?.WBProps?.date1904
  const inputs = book.SheetNames.flatMap((name, i) => {
    const data = sheetInputs(book.Sheets[name], name, date1904)
    return data ? [{ ...data, name, hidden: Boolean(book.Workbook?.Sheets?.[i]?.Hidden) }] : []
  })
  const cover = inputs.find((sheet) => sheet.cover && !sheet.identity.conflict && sheet.identity.taxId && sheet.identity.period)?.identity
  const shared = cover && inputs.every((sheet) => fits(sheet.identity, cover)) ? cover : undefined
  return inputs.flatMap((data): CitSheet[] => {
    const { form } = data
    if (!form) return []
    const identity = { ...data.identity, conflict: data.identity.conflict || !!cover && !shared,
      taxId: data.identity.taxId ?? shared?.taxId, period: data.identity.period ?? shared?.period }
    const result: CitSheet = { form, identity }
    if (data.badUnits) return [result]

    const layout = data.headerRows.flatMap((head) => {
      const header = (pattern: RegExp) => {
        const candidates = head.columns.filter(({ text }) => pattern.test(text))
        if (candidates.length !== 1) return undefined
        const { c } = candidates[0]
        const merge = data.merges.find(({ s }) => s.r === head.r && s.c === c)
        return { start: c, end: merge?.e.c ?? c }
      }
      const fields = (form === 'A105000' ? mainHeaders : annexHeaders).map(header)
      const row = header(/^(?:行次|栏次)$/), title = header(/^项目$/)
      if (!row || !title || !fields.every((column) => column !== undefined)) return []
      if (row.end >= title.start || fields.some((field, i) => field.start <= (i ? fields[i - 1].end : title.end) || field.end >= maxColumns)) return []
      const insurance = header(/^保险企业手续费及佣金支出$/)
      if (insurance && form === 'A105060' && fields[0].end >= insurance.start) return []
      return [{ r: head.r, row: row.start, title: title.start, fields }]
    })
    if (layout.length !== 1) return [result]
    const { r, row: rowCol, title, fields } = layout[0]
    const locate = (line: 12 | 15 | 16): CitRow | undefined => {
      const matching = data.rows.filter((row) => row.r > r && row.columns.find(({ c }) => c === rowCol)?.text === String(line)
        && rowLabels[line].test(row.columns.find(({ c }) => c === title)?.text || ''))
      if (matching.length !== 1) return
      const sheetRow = matching[0].r
      const readField = ({ start, end }: { start: number; end: number }, i: number) => {
        const occupied = Array.from({ length: end - start + 1 }, (_, offset) => start + offset).filter((c) => {
          const cell = data.at(sheetRow, c)
          return cell?.t === 'e' || cell?.v != null && cell.v !== '' || !!(cell?.f || cell?.F)
        })
        const c = occupied[0] ?? start, cell = data.at(sheetRow, c)
        const crossingMerge = data.merges.some(({ s, e }) => sheetRow >= s.r && sheetRow <= e.r && s.c <= end && e.c >= start
          && (s.r !== sheetRow || e.r !== sheetRow || s.c < start || e.c > end))
        const value = occupied.length > 1 || crossingMerge ? 'unreadable' : amount(cell)
        const display = cell?.w?.trim() || String(cell?.v ?? '').trim()
        const text = value === 'unreadable' ? /^\*+$/.test(display) ? `${display}（不填）` : '无法确认' : display || '空白'
        return { value, label: names[form][i], address: utils.encode_cell({ r: sheetRow, c }), text }
      }
      const values = fields.map(readField)
      // Hidden official simulation tabs may contain untouched, saved zero formulas.
      // Do not treat those template defaults as affirmative evidence.
      if (data.hidden && !values.some(({ value }, i) => typeof value === 'number' && value !== 0 && (form === 'A105060' || (line === 15 ? i !== 3 : i >= 2)))) return
      const range = utils.encode_range({ s: { r: sheetRow, c: rowCol }, e: { r: sheetRow, c: fields.at(-1)!.end } })
      return { source: { file, form, row: line, sheet: data.name, range, cells: values.map(({ label, address, text }) => ({ label, address, text })) },
        cells: values.map(({ value }) => value) }
    }
    if (form === 'A105000') result.hospitality = locate(15)
    result.advertising = locate(form === 'A105000' ? 16 : 12)
    return [result]
  })
}
