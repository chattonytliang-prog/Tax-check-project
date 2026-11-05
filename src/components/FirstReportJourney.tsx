import { AlertTriangle, CheckCircle2, FileText, RefreshCcw, Upload, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { summarizeDirectImport, type DirectImportBatch } from '../lib/firstReportJourney'

type JourneyClient = { id: string; name: string }

type Props = {
  clients: JourneyClient[]
  selectedClientId: string
  sourceFileCount: number
  storedSourceFileCount: number
  recordCount: number
  hasPeriods: boolean
  summaryLoading: boolean
  summaryError: string
  batch: DirectImportBatch | null
  importing: boolean
  uploadGuideOpen: boolean
  onUploadGuideChange: (open: boolean) => void
  onSelectClient: (id: string) => void
  onUploadCurrent: () => void
  onUploadNew: () => void
  onInspect: () => void
  onStartDetection: () => void
  onRetrySummary: () => void
}

export function DirectImportReceipt({ batch }: { batch: DirectImportBatch }) {
  const counts = summarizeDirectImport(batch)
  return (
    <div className="journey-import-receipt" aria-live="polite">
      <strong>本次上传：已处理 {batch.processed}/{batch.total} 份</strong>
      <p>入库 {counts.saved} · 原件补存 {counts.repaired} · 重复跳过 {counts.duplicate} · 未入库 {counts.failed} · 标准记录 {counts.records} 条</p>
      {batch.error && <p className="journey-warning" role="alert">{batch.error}</p>}
      <ul>
        {batch.items.map((item, index) => (
          <li key={`${item.name}-${index}`} className={item.status}>
            {item.status === 'saved' || item.status === 'repaired' ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
            <span><strong>{item.name}</strong><small>{item.status === 'saved' ? `入库 ${item.records} 条${item.detail ? ` · ${item.detail}` : ''}` : item.detail}</small></span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function UploadGuide({ batch, importing, onUpload, onClose }: {
  batch: DirectImportBatch | null
  importing: boolean
  onUpload: () => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="confirm-modal upload-guide-modal"
      aria-labelledby="upload-guide-title"
      aria-describedby="upload-guide-intro"
      onCancel={(event) => { event.preventDefault(); onClose() }}
    >
      <header className="upload-guide-header">
        <span className="upload-guide-icon" aria-hidden="true"><Upload /></span>
        <div>
          <p className="eyebrow">首次使用</p>
          <h2 id="upload-guide-title">上传财税资料</h2>
          <p id="upload-guide-intro">系统会识别企业和最新可分析月份，有资料缺口时先提示补全，再生成风险初筛报告。首份免费。</p>
        </div>
        <button type="button" className="upload-guide-close" aria-label="关闭上传引导" onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      <dl className="upload-guide-requirements">
        <div>
          <dt>上传什么</dt>
          <dd>财务报表、科目余额表、明细账、纳税申报表等原始资料。</dd>
        </div>
        <div>
          <dt>文件格式</dt>
          <dd>Excel（.xls、.xlsx）、Word（.doc、.docx）、PDF（文字可选中的 PDF 或扫描件），或包含 PDF 的 ZIP 压缩包。</dd>
        </div>
        <div>
          <dt>文件要求</dt>
          <dd>单个文件最大 8 MB，可多选。同一批只上传一家企业的资料，至少一份能识别企业全称，并保留所属期间和原始表头。需要辅助识别时，AI 会读取 Excel 列名、PDF 或 Word 表格片段，或扫描页。</dd>
        </div>
      </dl>
      <button type="button" className="primary-button upload-guide-action" onClick={onUpload} disabled={importing}>
        <Upload aria-hidden="true" /> {importing ? '正在解析...' : '上传资料'}
      </button>
      {batch && <DirectImportReceipt batch={batch} />}
    </dialog>
  )
}

export function FirstReportJourney({
  clients, selectedClientId, sourceFileCount, storedSourceFileCount, recordCount, hasPeriods,
  summaryLoading, summaryError, batch, importing, uploadGuideOpen, onUploadGuideChange,
  onSelectClient, onUploadCurrent, onUploadNew, onInspect, onStartDetection, onRetrySummary,
}: Props) {
  const client = clients.find((item) => item.id === selectedClientId)
  const visibleBatch = batch && (!batch.clientId || batch.clientId === selectedClientId) ? batch : null

  return (
    <section className="first-report-journey page" aria-labelledby="journey-title">
      <header className="page-header journey-header">
        <div>
          <h2 id="journey-title">上传财税资料</h2>
          <p>支持 Excel、PDF、Word，可一次上传多份。需要时由 AI 辅助识别表格。</p>
        </div>
        {clients.length > 1 && (
          <label className="journey-client-switch">
            <span>当前企业</span>
            <select value={selectedClientId} onChange={(event) => onSelectClient(event.target.value)}>
              {clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        )}
      </header>

      {client && clients.length === 1 && <p className="journey-facts">当前企业 <strong>{client.name}</strong></p>}
      <div className="header-actions">
        <button type="button" className="primary-button" onClick={client ? onUploadCurrent : () => onUploadGuideChange(true)} disabled={importing}>
          <Upload aria-hidden="true" /> {importing ? '正在解析...' : client ? '补充当前企业资料' : '上传资料'}
        </button>
        {client && <button type="button" className="secondary-button" onClick={onUploadNew} disabled={importing}>上传新企业资料</button>}
        {client && hasPeriods && !importing && <button type="button" className="secondary-button" onClick={onStartDetection}><FileText aria-hidden="true" /> 开始风险检测</button>}
      </div>

      {visibleBatch && <DirectImportReceipt batch={visibleBatch} />}
      {summaryLoading && <p className="journey-facts" role="status">正在读取资料归档…</p>}
      {summaryError && <p className="journey-warning" role="alert">{summaryError} <button type="button" onClick={onRetrySummary}><RefreshCcw aria-hidden="true" /> 重试</button></p>}
      {!summaryLoading && sourceFileCount > 0 && (
        <>
          <p className="journey-facts">已登记 {sourceFileCount} 份源文件 · 原件已保存 {storedSourceFileCount} 份 · {recordCount} 条标准记录</p>
          {storedSourceFileCount < sourceFileCount && <p className="journey-warning">{sourceFileCount - storedSourceFileCount} 份文件仅有登记信息，缺少可查看的原件。</p>}
          {!hasPeriods && <p className="journey-warning">尚无可分析的月份，请查看未入库文件并补充资料。</p>}
        </>
      )}
      {!summaryLoading && !summaryError && hasPeriods && sourceFileCount === 0 && <p className="journey-warning">已有期间数据，但尚未保存原始文件。报告中的依据需要人工核对。</p>}
      {!summaryLoading && (hasPeriods || sourceFileCount > 0) && <button type="button" className="text-button" onClick={onInspect}>查看资料归档</button>}
      {uploadGuideOpen && clients.length === 0 && (
        <UploadGuide batch={visibleBatch} importing={importing} onUpload={onUploadNew} onClose={() => onUploadGuideChange(false)} />
      )}
    </section>
  )
}
