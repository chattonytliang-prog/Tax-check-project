import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, FileText, Upload } from 'lucide-react'
import type { CitFinding } from '../lib/citAdjustmentFiling'
import { extractPdfTextRuns } from '../lib/pdfTextExtractor'
import { OriginalPdf } from './FilingAnnexReview'
import { FilingReviewSummary, type ReviewItem } from './FilingReviewSummary'

export function CitFilingReview({ onBack }: { onBack: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const locked = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ files: File[]; findings: CitFinding[]; period?: string; notices: string[] } | null>(null)
  const [source, setSource] = useState<CitFinding['sources'][number]>()

  useEffect(() => {
    if (source) document.getElementById('cit-original-heading')?.focus()
    else if (result) document.getElementById('filing-result')?.focus()
  }, [result, source])

  async function check(files: File[]) {
    if (!files.length || locked.current) return
    setResult(null); setSource(undefined); setError('')
    if (files.length > 5 || files.some((file) => !/\.pdf$/i.test(file.name)) ||
      files.reduce((sum, file) => sum + file.size, 0) > 35 * 1024 * 1024) {
      setError('请选 1 至 5 个 PDF 文件，总大小不超过 35 MB。')
      return
    }
    locked.current = true
    setBusy(true)
    try {
      const { parseCitPdf, validateCitAdjustments } = await import('../lib/citAdjustmentFiling')
      const packets = []
      const notices = []
      for (const file of files) {
        try { packets.push(await extractPdfTextRuns(await file.arrayBuffer(), 120)) } catch {
          notices.push(`${file.name} 未能读取。请使用未加密、120 页内的税务局原版 PDF。`)
          packets.push([])
        }
      }
      const review = validateCitAdjustments(parseCitPdf(packets))
      if (!review.recognized) {
        setError('没有识别到 A105000 或 A105060。请使用电子税务局导出的文字版 PDF，扫描件暂不能核对。')
        return
      }
      setResult({ files, findings: review.findings, period: review.period, notices })
    } finally {
      locked.current = false
      setBusy(false)
    }
  }

  const items: ReviewItem[] = result?.findings.map((item) => ({ ...item, links: item.sources.map((location) => ({
    label: `查看 ${location.form} 第 ${location.row} 行 · PDF 第 ${location.page} 页`,
    open: () => setSource(location),
  })) })) || []

  return <section className="page filing-page">
    <div className="filing-layout">
      <header className="filing-page-heading"><div><p className="filing-kicker">企业所得税 · 查账征收</p><h2>年度汇算校验</h2></div>
        <a className="filing-link" href="https://12366.chinatax.gov.cn/bzds/053/053.html" target="_blank" rel="noreferrer">税局填表说明 ↗</a>
      </header>
      <div className="filing-quick-links"><button type="button" className="filing-text-action" disabled={busy} onClick={source ? () => setSource(undefined) : onBack}><ArrowLeft size={15} aria-hidden="true" />{source ? '返回校验结果' : '返回申报前校验'}</button>
        {result && !source && <button type="button" className="filing-text-action" onClick={() => input.current?.click()}>更换文件</button>}
      </div>
      <input ref={input} hidden type="file" aria-label="选择年度汇算申报表 PDF" accept=".pdf" multiple onChange={(event) => {
        const files = Array.from(event.currentTarget.files || [])
        event.currentTarget.value = ''
        void check(files).catch(() => setError('暂时无法校验，请重试。'))
      }} />
      {!result && <div className="filing-start">
        <div className="filing-start-icon"><FileText size={28} strokeWidth={1.6} aria-hidden="true" /></div>
        <h3>上传年度汇算申报表</h3>
        <p>选一套含 A105000 和 A105060 的申报表，自动核对招待费和广告费的调整金额。</p>
        <div className="filing-start-actions"><button type="button" className="primary-button filing-action" disabled={busy} onClick={() => input.current?.click()}><Upload size={17} aria-hidden="true" /> {busy ? '正在校验…' : '上传并校验'}</button></div>
        <p className="filing-notes">优先选择带申报封面的文字版 PDF。资料只在当前浏览器读取，不上传服务器。</p>
      </div>}
      {busy && <p className="filing-live" role="status">正在读取原表金额与所属期…</p>}
      {error && <p className="filing-error" role="alert">{error}</p>}
      {result && !source && <FilingReviewSummary items={items} taxpayer="企业所得税年度申报表" period={result.period || '所属期未确认'}
        source={result.files.map((file) => file.name).join('、')} notices={result.notices} />}
      {result && source && <section className="filing-annex-sheet" aria-labelledby="cit-original-heading">
        <h3 id="cit-original-heading" tabIndex={-1}>{source.form} · 核对第 {source.row} 行</h3>
        <p className="filing-notes">{result.files[source.file].name}</p>
        <OriginalPdf key={`${source.file}-${source.page}`} file={result.files[source.file]} pages={[source.page]} />
      </section>}
      <p className="filing-disclaimer">仅核对申报表已填金额，不向税务局提交，不计入企业风险评分。</p>
    </div>
  </section>
}
