import { AlertTriangle, CheckCircle2, FileText, RefreshCcw, Upload } from 'lucide-react'
import { summarizeDirectImport, type DirectImportBatch } from '../lib/firstReportJourney'

type JourneyClient = { id: string; name: string; creditCode: string }
type JourneyMonth = { id: string; label: string }

type Props = {
  clients: JourneyClient[]
  selectedClientId: string
  sourceFileCount: number
  recordCount: number
  months: JourneyMonth[]
  selectedMonthId: string
  summaryLoading: boolean
  summaryError: string
  batch: DirectImportBatch | null
  importing: boolean
  reportPrice: string
  onSelectClient: (id: string) => void
  onUploadCurrent: () => void
  onUploadNew: () => void
  onInspect: () => void
  onSelectMonth: (id: string) => void
  onStartDetection: () => void
  onRetrySummary: () => void
}

export function DirectImportReceipt({ batch }: { batch: DirectImportBatch }) {
  const counts = summarizeDirectImport(batch)
  return (
    <div className="journey-import-receipt" aria-live="polite">
      <strong>本次上传：已处理 {batch.processed}/{batch.total} 份</strong>
      <p>入库 {counts.saved} · 重复跳过 {counts.duplicate} · 未入库 {counts.failed} · 标准记录 {counts.records} 条</p>
      {batch.error && <p className="journey-warning" role="alert">{batch.error}</p>}
      <ul>
        {batch.items.map((item, index) => (
          <li key={`${item.name}-${index}`} className={item.status}>
            {item.status === 'saved' ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
            <span><strong>{item.name}</strong><small>{item.status === 'saved' ? `入库 ${item.records} 条` : item.detail}</small></span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function FirstReportJourney({
  clients, selectedClientId, sourceFileCount, recordCount, months, selectedMonthId,
  summaryLoading, summaryError, batch, importing, reportPrice,
  onSelectClient, onUploadCurrent, onUploadNew, onInspect, onSelectMonth,
  onStartDetection, onRetrySummary,
}: Props) {
  const client = clients.find((item) => item.id === selectedClientId)
  const hasFiles = sourceFileCount > 0 || months.length > 0
  const visibleBatch = batch && (!batch.clientId || batch.clientId === selectedClientId) ? batch : null
  const counts = visibleBatch ? summarizeDirectImport(visibleBatch) : null
  const currentStep = !hasFiles ? 1 : !selectedMonthId ? 2 : 3

  return (
    <section className="first-report-journey page" aria-labelledby="journey-title">
      <header className="page-header journey-header">
        <div>
          <p className="eyebrow">首次使用</p>
          <h2 id="journey-title">完成第一份风险报告</h2>
          <p>按当前企业的资料进度继续，已入库资料会保留。</p>
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

      <ol className="journey-steps">
        <li className={currentStep === 1 ? 'current' : 'complete'}>
          <span className="journey-step-number" aria-hidden="true">1</span>
          <div className="journey-step-body">
            <div className="journey-step-heading">
              <div>
                <h3>上传资料</h3>
                <p>选择这家企业的 Excel 或 PDF，可一次上传多份。</p>
              </div>
              <span className="journey-step-status">{summaryLoading ? '读取中' : counts?.failed ? hasFiles ? `${counts.failed}份未入库` : '上传失败' : hasFiles ? '已入库' : '待开始'}</span>
            </div>
            {client && <p className="journey-client-name">当前企业：<strong>{client.name}</strong></p>}
            {hasFiles && !summaryLoading && <p className="journey-facts">已入库 {sourceFileCount} 份源文件 · {recordCount} 条标准记录</p>}
            <div className="journey-actions">
              <button type="button" className="primary-button" onClick={client ? onUploadCurrent : onUploadNew} disabled={importing}>
                <Upload /> {importing ? '正在解析...' : client ? '补充当前企业资料' : '上传资料'}
              </button>
              {client && <button type="button" className="secondary-button" onClick={onUploadNew} disabled={importing}>上传新企业资料</button>}
            </div>
            {visibleBatch && <DirectImportReceipt batch={visibleBatch} />}
          </div>
        </li>

        <li className={currentStep === 2 ? 'current' : currentStep > 2 ? 'complete' : 'upcoming'}>
          <span className="journey-step-number" aria-hidden="true">2</span>
          <div className="journey-step-body">
            <div className="journey-step-heading">
              <div>
                <h3>核对企业和月份</h3>
                <p>确认资料归属，再选择有原始资料的分析月份。</p>
              </div>
              <span className="journey-step-status">{selectedMonthId ? '已选择' : hasFiles ? '待核对' : '等待资料'}</span>
            </div>
            {client && <p className="journey-facts">{client.name}{client.creditCode ? ` · ${client.creditCode}` : ' · 未识别到统一社会信用代码'}</p>}
            {summaryError && <p className="journey-warning" role="alert">{summaryError} <button type="button" onClick={onRetrySummary}><RefreshCcw /> 重试</button></p>}
            {hasFiles && !summaryLoading && (
              <div className="journey-period-choice">
                <label htmlFor="journey-month">分析月份</label>
                <select id="journey-month" value={selectedMonthId} onChange={(event) => onSelectMonth(event.target.value)}>
                  <option value="">请选择有资料的月份</option>
                  {months.map((month) => <option key={month.id} value={month.id}>{month.label}</option>)}
                </select>
                <button type="button" className="secondary-button" onClick={onInspect}>查看资料归档</button>
              </div>
            )}
            {hasFiles && !months.length && !summaryLoading && <p className="journey-warning">尚无可分析的月份，请查看未入库文件并补充资料。</p>}
          </div>
        </li>

        <li className={currentStep === 3 ? 'current' : 'upcoming'}>
          <span className="journey-step-number" aria-hidden="true">3</span>
          <div className="journey-step-body">
            <div className="journey-step-heading">
              <div>
                <h3>检测并生成报告</h3>
                <p>先看风险与资料缺口，再决定是否保存报告。</p>
              </div>
              <span className="journey-step-status">{selectedMonthId ? '可以检测' : '等待月份'}</span>
            </div>
            <p className="journey-facts">{reportPrice}。检测不扣积分，保存新报告前会再次确认。</p>
            <button type="button" className="primary-button" onClick={onStartDetection} disabled={!client || !selectedMonthId}>
              <FileText /> 开始风险检测
            </button>
          </div>
        </li>
      </ol>
    </section>
  )
}
