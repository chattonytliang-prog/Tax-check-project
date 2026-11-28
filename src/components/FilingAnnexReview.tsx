import { useEffect, useRef, useState } from 'react'
import { annexCellId, checkVatAnnexInternal, type VatAnnex } from '../lib/filingAnnexes'
import { renderOriginalPdfPage } from '../lib/pdfTextExtractor'

const stateLabels: Record<VatAnnex['state'], string> = { verified: '已带入', unconfirmed: '待确认来源', duplicate: '同类多份', conflict: '主体或期间不符', pdf: 'PDF 原页' }
const showFen = (amount?: number) => amount === undefined ? '—' : (amount / 100).toFixed(2)

export function OriginalPdf({ file, pages }: { file: File; pages: number[] }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [index, setIndex] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  useEffect(() => {
    const controller = new AbortController(), target = canvas.current
    if (!target) return
    void renderOriginalPdfPage(file, pages[index], target, controller.signal).then(() => {
      if (!controller.signal.aborted) setStatus('ready')
    }).catch(() => { if (!controller.signal.aborted) setStatus('error') })
    return () => controller.abort()
  }, [file, pages, index])
  return <>
    <div className="filing-pdf-bar"><span>原文件第 {pages[index]} 页</span>{pages.length > 1 && <div>
      <button className="filing-text-action" type="button" disabled={index === 0} onClick={() => { setStatus('loading'); setIndex(index - 1) }}>上一页</button>
      <button className="filing-text-action" type="button" disabled={index === pages.length - 1} onClick={() => { setStatus('loading'); setIndex(index + 1) }}>下一页</button>
    </div>}</div>
    {status !== 'ready' && <p className="filing-notes" role="status">{status === 'error' ? '无法显示该 PDF 页，请用原文件核对或改传 Excel。' : '正在显示原表…'}</p>}
    <div className="filing-table-frame" tabIndex={0} role="region" aria-label="附表 PDF 原页，可横向滚动"><canvas ref={canvas} hidden={status !== 'ready'} className="filing-pdf-page" aria-label={`附表 PDF 原文件第 ${pages[index]} 页`} /></div>
  </>
}

export function FilingAnnexReview({ active, spotlight, onEdit }: { active: VatAnnex; spotlight: string; onEdit: (row: number, col: number, value: string) => void }) {
  const within = checkVatAnnexInternal(active)
  useEffect(() => {
    if (!spotlight) return
    document.getElementById(spotlight)?.focus()
  }, [active.id, spotlight])
  return <section className="filing-annex-sheet" id="filing-open-annex" aria-labelledby="filing-open-annex-title">
      <h3 id="filing-open-annex-title">{active.title}</h3><p className="filing-notes">来源：{active.source}</p>
      {active.meta.taxpayer && <p className="filing-notes">{active.meta.taxpayer}{active.meta.periodStart && ` · ${active.meta.periodStart} 至 ${active.meta.periodEnd || '结束日未识别'}`}</p>}
      {active.state !== 'verified' && <p className="filing-notes filing-notice">{active.state === 'pdf' ? '保留原表布局与金额，PDF 附表只作人工核对。' : `${stateLabels[active.state]}：可查看原表，不用于表间自动比对。`}</p>}
      {active.pdf && active.state === 'verified' && <p className="filing-notes">PDF 保留原表。仅已定位且确认列位的金额参与表间核对。</p>}
      {within && <div className="filing-annex-formula" data-status={within.status}>
        <strong>附表内校验：12 = 1 + 4 + 11</strong><span>原表 {showFen(within.result)} · 复算 {showFen(within.subtotal)} 元 · {within.status === 'matched' ? '一致' : within.status === 'difference' ? '有差异' : '缺项未校验'}</span>
      </div>}
      {active.pdf && <OriginalPdf key={active.id} file={active.pdf.file} pages={active.pdf.pages} />}
      {active.grid && <div className="filing-table-frame" tabIndex={0} role="region" aria-label={`${active.title}原表，可横向滚动`}><table className="filing-annex-grid" aria-label={active.title}><tbody>
        {active.grid.map((line, row) => <tr key={row}>{line.map((cell) => {
          const Tag = cell.heading ? 'th' : 'td'
          const id = annexCellId(active, { cell })
          return <Tag key={cell.col} id={id} colSpan={cell.colSpan} rowSpan={cell.rowSpan} data-numeric={cell.number || undefined} data-spotlight={id === spotlight || undefined} tabIndex={id === spotlight ? -1 : undefined} className={cell.input ? 'filing-annex-entry' : undefined}>
            {cell.input ? <input type="text" inputMode={cell.input === 'amount' ? 'decimal' : 'text'} aria-label={`${active.title} 第 ${cell.row + 1} 行第 ${cell.col + 1} 列`} maxLength={cell.input === 'amount' ? 18 : 80} value={cell.text} onChange={(event) => onEdit(cell.row, cell.col, event.target.value)} /> : cell.text}
          </Tag>
        })}</tr>)}
      </tbody></table></div>}
  </section>
}
