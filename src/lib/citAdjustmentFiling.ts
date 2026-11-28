import type { FilingStatus } from './filingValidation'
import type { PdfTextRun } from './pdfTextExtractor'

type Form = 'A105000' | 'A105060'
type Identity = { taxId?: string; period?: string }
type Source = { file: number; page: number; form: Form; row: 12 | 15 | 16 }
type Row = { source: Source; cells: Cell[] }
type Cell = number | 'blank' | 'unreadable'
type Sheet = { form: Form; identity: Identity; hospitality?: Row; advertising?: Row }
export type CitFinding = {
  id: string; title: string; location: string; status: FilingStatus; detail: string
  actual?: number; expected?: number; sources: Source[]
}

const compact = (value: string) => value.normalize('NFKC').replace(/\s+/g, '')
const normalize = (value: string) => compact(value).replace(/[−﹣–]/g, '-')
const midpoint = (run: PdfTextRun) => run.x + run.width / 2
const datePattern = '(20\\d{2})[年/.-](\\d{1,2})[月/.-](\\d{1,2})日?'
const periodPattern = new RegExp(`(?:税款所属(?:期间|期|时间)|申报所属(?:期间|期)):?${datePattern}(?:至|到|~|－|—|-)${datePattern}`, 'g')

function only(values: Iterable<string>) {
  const unique = [...new Set(values)]
  return unique.length === 1 ? unique[0] : undefined
}

function findIdentity(text: string): Identity {
  const taxId = only(Array.from(text.matchAll(/(?:纳税人识别号(?:\(统一社会信用代码\))?|统一社会信用代码):?([0-9A-Z]{18}|[0-9]{15})(?![0-9A-Z])/g), (match) => match[1]))
  const validDate = (y: string, m: string, d: string) => {
    const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    const date = new Date(`${iso}T00:00:00Z`)
    return !Number.isNaN(+date) && date.toISOString().startsWith(iso) ? iso : undefined
  }
  const period = only(Array.from(text.matchAll(periodPattern), ([, y1, m1, d1, y2, m2, d2]) => {
    const start = validDate(y1, m1, d1), end = validDate(y2, m2, d2)
    return start && end && y1 === y2 && start <= end ? `${start} 至 ${end}` : ''
  }).filter(Boolean))
  return { taxId, period }
}

function linesOf(runs: readonly PdfTextRun[]) {
  const lines: PdfTextRun[][] = []
  for (const run of [...runs].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const last = lines.at(-1)
    if (last && last[0].y - run.y <= 2.4) last.push(run)
    else lines.push([run])
  }
  return lines.map((runs) => {
    runs.sort((a, b) => a.x - b.x)
    return { runs, text: compact(runs.map((run) => run.text).join('')), y: runs[0].y }
  })
}

function readCell(runs: PdfTextRun[]): Cell {
  const value = normalize(runs.map((run) => run.text).join(''))
  if (!value || /^[-—]+$/.test(value)) return 'blank'
  if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) return 'unreadable'
  const cents = Math.round(Number(value.replace(/,/g, '')) * 100)
  return Number.isSafeInteger(cents) && Math.abs(cents) < 100_000_000_000_000 ? cents : 'unreadable'
}

// Preserve physical column positions: blanks must not shift the next value left.
function placeValues(runs: PdfTextRun[], columns: number[], firstBoundary: number) {
  const groups = columns.map((): PdfTextRun[] => [])
  const bounds = columns.slice(1).map((x, i) => (columns[i] + x) / 2)
  for (const run of runs) {
    const x = midpoint(run)
    if (x <= firstBoundary) continue
    const column = bounds.findIndex((boundary) => x < boundary)
    groups[column < 0 ? columns.length - 1 : column].push(run)
  }
  return groups.map(readCell)
}

function headerCenters(runs: PdfTextRun[], labels: RegExp[]) {
  return labels.map((label) => {
    const matching = runs.filter((run) => label.test(compact(run.text))).map(midpoint)
    if (matching.length === 1) return matching[0]
    if (matching.length > 1) return undefined
    // The official advertising/insurance headings are often wrapped into 2 or 3 lines.
    const wrapped = runs.flatMap((start) => {
      const below = runs.filter((run) => start.y - run.y > 3 && start.y - run.y <= 35 && Math.abs(midpoint(start) - midpoint(run)) <= 8)
        .sort((a, b) => b.y - a.y)
      const parts = [start, ...below].map((run) => compact(run.text))
      return below.some((_, index) => label.test(parts.slice(0, index + 2).join(''))) ? [midpoint(start)] : []
    })
    return wrapped.length === 1 ? wrapped[0] : undefined
  })
}

export function parseCitPdf(files: readonly (readonly PdfTextRun[][])[]) {
  const sheets: Sheet[] = []
  for (const [file, pages] of files.entries()) {
    const pageLines = pages.map(linesOf)
    const meta = pageLines.map((lines) => findIdentity(lines.slice(0, 12).map((line) => line.text).join('')))
    const coverIndex = pageLines.findIndex((lines) => lines.slice(0, 6).some((line) => /^(?:A100000)?(?:中华人民共和国企业所得税年度纳税申报表|企业所得税年度纳税申报主表)/.test(line.text)))
    const cover = meta[coverIndex]
    const inherit = cover?.taxId && cover.period && !meta.some((item) =>
      item.taxId && item.taxId !== cover.taxId || item.period && item.period !== cover.period) ? cover : {}
    for (const [pageIndex, lines] of pageLines.entries()) {
      const title = lines.slice(0, 12).map((line) => line.text)
      const upper = title.join('')
      const adjustmentTitle = title.findIndex((line) => /^(?:A105000)?[《]?纳税调整项目明细表[》]?(?:A105000)?$/.test(line))
      const advertisingTitle = title.findIndex((line) => /^(?:A105060)?[《]?广告费和业务宣传费等?跨年度纳税调整明细表[》]?(?:A105060)?$/.test(line))
      const isAdjustment = adjustmentTitle >= 0 && upper.includes('A105000')
      const isAdvertising = advertisingTitle >= 0 && upper.includes('A105060')
      if (isAdjustment === isAdvertising) continue
      const form: Form = isAdjustment ? 'A105000' : 'A105060'
      const local = meta[pageIndex]
      const sheet: Sheet = { form, identity: { taxId: local.taxId || inherit.taxId, period: local.period || inherit.period } }
      const headers = isAdjustment ? [/^[账帐]载金额$/, /^税收金额$/, /^调增金额$/, /^调减金额$/] : [/^广告费和业务宣传费$/, /^保险企业手续费及佣金支出$/]
      const body = (row: 12 | 15 | 16, label: RegExp): Row | undefined => {
        const labelLines = lines.filter((line) => label.test(line.text))
        if (labelLines.length !== 1) return undefined
        const labelLine = labelLines[0]
        const rowId = (line: typeof labelLine) => compact(line.runs[0].text) === String(row)
        const candidates = lines.filter((line) => rowId(line) && Math.abs(line.y - labelLine.y) <= 10)
        if (candidates.length !== 1) return undefined
        const target = candidates[0]
        const head = lines.slice((isAdjustment ? adjustmentTitle : advertisingTitle) + 1)
          .filter((line) => line.y > Math.max(target.y, labelLine.y)).flatMap((line) => line.runs)
        const columns = headerCenters(head, headers)
        if (!columns.every((x) => x !== undefined)) return undefined
        if (columns.some((x, i) => i > 0 && x - columns[i - 1] < 15)) return undefined
        const firstBoundary = columns[0] - (columns[1] - columns[0]) * .5
        const valueLines = target === labelLine ? target.runs : [...target.runs, ...labelLine.runs].sort((a, b) => a.x - b.x)
        const cells = placeValues(valueLines, columns, firstBoundary)
        return { source: { form, page: pageIndex + 1, file, row }, cells }
      }
      if (isAdjustment) {
        sheet.hospitality = body(15, /业务招待费支出/)
        sheet.advertising = body(16, /广告费和业务宣传费支出/)
      } else {
        sheet.advertising = body(12, /本年(?:广告费和业务宣传费)?支出纳税调整金额/)
      }
      sheets.push(sheet)
    }
  }
  return sheets
}

export function validateCitAdjustments(sheets: readonly Sheet[]) {
  const mains = sheets.filter((sheet) => sheet.form === 'A105000')
  const annexes = sheets.filter((sheet) => sheet.form === 'A105060')
  const main = mains.length === 1 ? mains[0] : undefined
  const annex = annexes.length === 1 ? annexes[0] : undefined
  const hospitality: CitFinding = { id: 'hospitality-increase', title: '业务招待费调增', location: 'A105000 第 15 行', status: 'missing', detail: '', sources: main?.hospitality ? [main.hospitality.source] : [] }
  const hospitalityCells = main?.hospitality?.cells
  if (hospitalityCells) {
    const [book, deductible, actual, blocked] = hospitalityCells
    if (typeof book === 'number' && typeof deductible === 'number' && typeof actual === 'number' && (typeof blocked !== 'number' || blocked === 0)) {
      hospitality.actual = actual
      hospitality.expected = book - deductible
      hospitality.status = actual === hospitality.expected ? 'matched' : 'difference'
      hospitality.detail = '核对已填的账载金额减税收金额，是否等于调增金额。不复算税前扣除限额。'
    } else if (typeof blocked === 'number' && blocked !== 0) {
      hospitality.status = 'difference'
      hospitality.detail = '这行不填写调减金额，请检查原表调减栏。'
    }
  }
  if (!hospitality.detail) hospitality.detail = mains.length > 1 ? '读到多份 A105000，请只上传本次要核对的一份。' : '未读到 A105000 第 15 行的账载、税收或调增金额，不能视为 0。'

  const advertising: CitFinding = { id: 'advertising-transfer', title: '广告费及业务宣传费调增、调减', location: 'A105000 第 16 行 · A105060 第 12 行第 1 列', status: 'missing', detail: '', sources: [main?.advertising?.source, annex?.advertising?.source].flatMap((source) => source ? [source] : []) }
  const sameFiling = main && annex && main.identity.taxId && main.identity.period &&
    main.identity.taxId === annex.identity.taxId && main.identity.period === annex.identity.period
  if (mains.length > 1 || annexes.length > 1) advertising.detail = '读到重复税表，请只保留同一家企业、同一期的最终版本。'
  else if (!main || !annex) advertising.detail = '需要 A105000 和 A105060 两张表。'
  else if (!sameFiling) advertising.detail = '无法确认两张表属于同一纳税人和同一税款所属期，请上传含申报封面的整套 PDF。'
  else if (main.advertising && annex.advertising) {
    const [, , up, down] = main.advertising.cells
    const [adjustment] = annex.advertising.cells
    if (typeof adjustment === 'number' && up !== 'unreadable' && down !== 'unreadable' && (up !== 'blank' || down !== 'blank')) {
      const expectedUp = Math.max(adjustment, 0), expectedDown = Math.max(-adjustment, 0)
      const fmt = (value: typeof up) => typeof value === 'number' ? (value / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' 元' : '空白'
      advertising.status = (up === expectedUp || up === 'blank' && expectedUp === 0) &&
        (down === expectedDown || down === 'blank' && expectedDown === 0) ? 'matched' : 'difference'
      advertising.detail = `A105000 实填：调增 ${fmt(up)}，调减 ${fmt(down)}。按 A105060 应填：调增 ${fmt(expectedUp)}，调减 ${fmt(expectedDown)}。不判断扣除比例或分摊是否适用。`
    }
  }
  if (!advertising.detail) advertising.detail = '未读到附表广告费列的调整金额，或主表两栏都为空、栏位无法辨认。'
  return { findings: [hospitality, advertising], period: main?.identity.period || annex?.identity.period, recognized: sheets.length }
}
