import { read, utils, type WorkSheet } from '@e965/xlsx'
import { extractPdfTextPages } from './pdfTextExtractor'
import { vatDraftFromPdf, vatDraftFromWorkbook, vatMetadata, type VatDraftData } from './filingDraft'
import { annexIdentity, annexNames, classifyVatAnnex, readAnnexFields, readPdfInputAnnexFields, tidy, vatAnnexOrder, type AnnexCell, type AnnexKind, type VatAnnex } from './filingAnnexes'
import type { VatFormVersion } from './filingValidation'

const maxRows = 450
const maxCols = 56
const maxBytes = 30 * 1024 * 1024
type AnnexImport = Omit<VatAnnex, 'state' | 'fields'> & { pdfText?: string[] }
type Primary = VatDraftData & { fileName: string }
export type VatFilingPacket = { main: Primary; annexes: VatAnnex[]; notices: string[] }

export class FilingPacketError extends Error {}

// Rows/columns refer to the revision-pinned public blank workbooks, not to an arbitrary customer layout.
function blankInput(kind: AnnexKind, version: VatFormVersion, cell: AnnexCell): AnnexCell['input'] {
  const [row, col] = [cell.row + 1, cell.col + 1]
  const inRows = (start: number, end: number) => row >= start && row <= end
  const from = (first: number, last: number) => col >= first && col <= last
  if (/^[-—–－]+$/.test(tidy(cell.raw)) || cell.heading && kind !== 'relief') return
  if (kind === 'relief') {
    if ((inRows(8, 12) || inRows(version === 'legacy' ? 19 : 17, 25)) && col === 1) return 'text'
    if ((inRows(7, 12) || inRows(16, 25)) && from(4, 8)) return 'amount'
  }
  if (kind === 'sale' && inRows(8, version === 'legacy' ? 29 : 28) && from(version === 'legacy' ? 5 : 6, version === 'legacy' ? 18 : 17)) return 'amount'
  if (kind === 'sale' && version === 'pilot' && inRows(8, 15) && col === 4) return 'text'
  if (kind === 'deduction' && inRows(8, 15) && from(3, 8)) return 'amount'
  if (kind === 'credit' && (inRows(8, 12) || inRows(16, 18)) && from(3, 8)) return 'amount'
  if (kind === 'input' && version === 'legacy' && (inRows(8, 20) || inRows(23, 34) || inRows(37, 47) || inRows(50, 51)) && from(5, 7)) return 'amount'
  if (kind === 'input' && version === 'pilot' && (inRows(7, 22) || inRows(25, 43) || inRows(46, 51)) && from(3, 4)) return 'amount'
  if ((kind === 'surchargeLegacy' || kind === 'surchargePilot') && inRows(10, 13) && from(3, 18)) return [9, 13].includes(col) ? 'text' : 'amount'
  if (kind === 'extraCredit' && inRows(6, 13) && from(3, 10) && col !== 5) return 'amount'
  if (kind === 'unbilled' && inRows(8, 13) && from(4, 10)) return from(9, 10) ? 'text' : 'amount'
  if (kind === 'pilotDeduction' && inRows(24, 27)) return col === 1 ? 'text' : from(4, 12) ? 'amount' : undefined
  if (kind === 'simplified' && inRows(38, 40)) return col === 1 ? 'text' : from(4, 16) ? 'amount' : undefined
}

export async function readBlankFilingTemplate(version: VatFormVersion): Promise<VatFilingPacket> {
  const name = version === 'legacy' ? 'vat-general.xls' : 'vat-pilot.xls'
  const response = await fetch(`/filing-templates/${name}`)
  if (!response.ok) throw new FilingPacketError('暂时无法打开公开表样，请重试。')
  const packet = await readVatFilingPacket([new File([await response.arrayBuffer()], name)], version)
  if (packet.main.version !== version) throw new FilingPacketError('无法确认表样版本。')
  return packet
}

export function originalVatSheet(sheet: WorkSheet) {
  if (!sheet['!ref']) return null
  const current = utils.decode_range(sheet['!ref'])
  const full = utils.decode_range(sheet['!fullref'] || sheet['!ref'])
  const bounds = { s: current.s, e: { r: Math.min(current.e.r, current.s.r + maxRows - 1), c: Math.min(current.e.c, current.s.c + maxCols - 1) } }
  const merges = new Map<string, { r: number; c: number } | null>()
  for (const { s, e } of sheet['!merges'] || []) {
    const top = Math.max(s.r, bounds.s.r), bottom = Math.min(e.r, bounds.e.r)
    const left = Math.max(s.c, bounds.s.c), right = Math.min(e.c, bounds.e.c)
    if (bottom < top || right < left) continue
    for (let r = top; r <= bottom; r++) for (let c = left; c <= right; c++) {
      const cell = sheet[utils.encode_cell({ r, c })]
      // Do not hide a value even if the file contains an inconsistent merged range.
      if (r !== top || c !== left) merges.set(`${r}:${c}`, cell?.v != null && tidy(cell.v) ? { r: 1, c: 1 } : null)
    }
    const hasCoveredValue = Array.from({ length: bottom - top + 1 }, (_, r) => Array.from({ length: right - left + 1 }, (_, c) => [top + r, left + c]))
      .some((row) => row.some(([r, c]) => (r !== top || c !== left) && merges.get(`${r}:${c}`) !== null))
    if (!hasCoveredValue) merges.set(`${top}:${left}`, { r: bottom - top + 1, c: right - left + 1 })
    else for (let r = top; r <= bottom; r++) for (let c = left; c <= right; c++) merges.delete(`${r}:${c}`)
  }

  const rows: unknown[][] = []
  const textRows: string[] = []
  const grid: AnnexCell[][] = []
  let lastUsedRow = 0
  for (let r = bounds.s.r; r <= bounds.e.r; r++) {
    const cells: AnnexCell[] = []
    const rawRow: unknown[] = []
    const rendered: string[] = []
    for (let c = bounds.s.c; c <= bounds.e.c; c++) {
      const source = sheet[utils.encode_cell({ r, c })]
      const raw = source?.t === 'e' ? null : source?.v ?? null
      const text = (source?.w ?? (raw == null ? '' : String(raw))).trim()
      rawRow.push(raw)
      rendered.push(text)
      const span = merges.get(`${r}:${c}`)
      if (span === null) continue
      if (text) lastUsedRow = Math.max(lastUsedRow, r - bounds.s.r + (span?.r ?? 1) - 1)
      cells.push({ row: r - bounds.s.r, col: c - bounds.s.c, raw, text, colSpan: span?.c, rowSpan: span?.r, number: typeof raw === 'number' })
    }
    rows.push(rawRow)
    textRows.push(rendered.filter(Boolean).join(' '))
    grid.push(cells)
  }
  const head = textRows.slice(0, 12).join(' ')
  return { rows, textRows, grid: grid.slice(0, lastUsedRow + 1), width: bounds.e.c - bounds.s.c + 1, head,
    clipped: full.e.r > bounds.e.r || full.e.c > bounds.e.c,
    incompatibleUnit: /金额单位[:：]?(?:万元|千元|美元|港元|欧元)/.test(tidy(head)) }
}

function tryMain(reader: () => VatDraftData) {
  try { return reader() } catch (error) {
    if (error instanceof Error && error.message.startsWith('未识别到')) return null
    throw new FilingPacketError(error instanceof Error ? error.message : '无法读取原表。')
  }
}

export async function readVatFilingPacket(files: readonly File[], blankVersion?: VatFormVersion): Promise<VatFilingPacket> {
  if (!files.length || files.length > 15 || files.reduce((size, file) => size + file.size, 0) > maxBytes) throw new FilingPacketError('请选择同一期的一套资料，最多 15 份，总计不超过 30 MB。')
  if (files.some((file) => !/\.(xlsx?|pdf)$/i.test(file.name))) throw new FilingPacketError('请选择税局导出的 Excel（.xls / .xlsx）或可复制文字的 PDF。')
  const mains: Primary[] = []
  const supplements: AnnexImport[] = []
  const notices: string[] = []
  let skipped = 0

  for (const [fileIndex, file] of files.entries()) {
    const buffer = await file.arrayBuffer()
    if (/\.pdf$/i.test(file.name)) {
      const pages = await extractPdfTextPages(buffer, undefined, 100)
      const main = tryMain(() => vatDraftFromPdf(pages, true))
      if (main) mains.push({ ...main, fileName: file.name })
      const firstForKind = new Map<string, AnnexImport>()
      pages.forEach((pageText, pageNo) => {
        const head = pageText.split(/\r?\n/).filter((line) => line.trim()).slice(0, 6).join('\n')
        const kind = classifyVatAnnex(head)
        if (!kind) { if (!/栏次.*一般项目.*即征即退项目/.test(tidy(pageText))) skipped++; return }
        const meta = vatMetadata(head.split('\n'))
        const identity = JSON.stringify([kind, meta.taxId, meta.taxpayer, meta.periodStart, meta.periodEnd])
        const previous = firstForKind.get(identity)
        if (previous) { previous.pdf?.pages.push(pageNo + 1); previous.pdfText?.push(pageText); return }
        const annex = { id: `p${fileIndex}-${pageNo}`, kind, title: annexNames[kind], source: file.name, meta, pdf: { file, pages: [pageNo + 1] }, pdfText: [pageText] }
        firstForKind.set(identity, annex)
        supplements.push(annex)
      })
      continue
    }
    const book = read(buffer, { type: 'array', sheetRows: maxRows, bookVBA: false })
    for (const [sheetIndex, sheetName] of book.SheetNames.entries()) {
      if (book.Workbook?.Sheets?.[sheetIndex]?.Hidden || /不启用/.test(sheetName)) continue
      const sheet = originalVatSheet(book.Sheets[sheetName])
      if (!sheet) continue
      const kind = classifyVatAnnex(sheet.textRows.slice(0, 3).join(' '))
      const meta = vatMetadata(sheet.textRows.slice(0, 12))
      if (kind) {
        if (sheet.clipped || sheet.incompatibleUnit) {
          notices.push(`${sheetName}：${sheet.clipped ? '超出可读取范围，请另存完整原表。' : '金额单位不是元，不参与表间核对。'}`)
          if (sheet.clipped) continue
        }
        const split = kind === 'unbilled' ? sheet.textRows.flatMap((line, row) => {
          if (!/^附列资料\(一\)附[123]/.test(tidy(line))) return []
          const child = classifyVatAnnex(line)
          return child ? [{ kind: child, row }] : []
        }) : []
        const sections = split.length > 1 ? split : [{ kind, row: 0 }]
        sections.forEach((section, n) => {
          const next = sections[n + 1]?.row ?? sheet.grid.length
          const sectionMeta = n ? vatMetadata(sheet.textRows.slice(section.row, section.row + 4)) : meta
          const grid = sheet.grid.slice(section.row, next).map((line, index) => {
            const heading = index < 4 || line.some((cell) => /^(项目(?:及栏次)?|栏次|税额|销项\(应纳\)税额|序号|基本业务信息)$/.test(tidy(cell.raw)))
            return line.map((cell) => ({ ...cell, heading,
              input: blankVersion ? blankInput(section.kind, blankVersion, { ...cell, heading }) : undefined }))
          })
          supplements.push({ id: `s${fileIndex}-${sheetIndex}-${n}`, kind: section.kind, title: annexNames[section.kind], source: blankVersion ? '税务局公开表样' : `${file.name} / ${sheetName}`, meta: sectionMeta,
            grid, width: sheet.width })
        })
        continue
      }
      const main = tryMain(() => vatDraftFromWorkbook([{ name: sheetName, rows: sheet.rows }]))
      if (main && !sheet.clipped) mains.push({ ...main, meta: { ...main.meta, ...Object.fromEntries(Object.entries(meta).filter(([, value]) => value)) }, fileName: file.name })
      else { if (main) notices.push(`${sheetName}：原表超出可读取范围。`); if (!/小规模纳税人适用/.test(sheetName)) skipped++ }
    }
  }

  if (mains.length !== 1) throw new FilingPacketError(mains.length > 1 ? '这批资料含有多张增值税主表。请只选择一家企业、同一所属期的一套预申报资料。' : '没读到一般纳税人增值税主表。请把主表和附表一起选中；扫描版 PDF 建议换成 Excel 原表。')
  const main = mains[0]
  const order = vatAnnexOrder(main.version).map(([kind]) => kind)
  const annexes = supplements.filter((annex) => order.includes(annex.kind)).map(({ pdfText, ...annex }): VatAnnex => {
    const identity = blankVersion ? 'verified' : annexIdentity(main.meta, annex.meta)
    const ambiguous = supplements.filter((item) => item.kind === annex.kind).length > 1
    const nonYuan = /金额单位[:：]?(?:万元|千元|美元|港元|欧元)/
    const wrongBasis = annex.grid?.slice(0, 10).some((row) => nonYuan.test(tidy(row.map((cell) => cell.text).join(''))))
      || pdfText?.some((page) => nonYuan.test(tidy(page.split('\n').slice(0, 8).join(''))))
    const ready = identity === 'verified' && !wrongBasis && !ambiguous
    const fields = !ready ? undefined : annex.grid ? readAnnexFields(annex.kind, main.version, annex.grid)
      : annex.kind === 'input' && pdfText ? readPdfInputAnnexFields(pdfText, main.version) : undefined
    const state = identity === 'conflict' ? 'conflict' : ambiguous ? 'duplicate' : annex.pdf && !Object.keys(fields ?? {}).length ? 'pdf' : wrongBasis ? 'unconfirmed' : identity
    const editable = new Set(Object.values(fields ?? {}).map(({ cell }) => `${cell.row}:${cell.col}`))
    return { ...annex, state, fields, grid: blankVersion ? annex.grid : annex.grid?.map((line) => line.map((cell) => editable.has(`${cell.row}:${cell.col}`) ? { ...cell, input: 'amount' } : cell)) }
  }).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
  if (supplements.length > annexes.length) notices.push('有附表不属于当前主表版本，未混入本次核对。')
  if (skipped) notices.push(`${skipped} 张工作表或 PDF 页未识别为本套表单。如含所需资料，请换成税局原表。`)
  return { main, annexes, notices }
}
