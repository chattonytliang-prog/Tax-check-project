import { useState } from 'react'
import { apiGet } from '../lib/apiClient'
import { filingFormulas, filingSources, validateVatFiling, vatFilingRowsFromArchive, type FilingFinding } from '../lib/filingValidation'
import './FilingValidationPage.css'

type ArchiveSource = { id: string; fileName: string; documentType: string; periodStart: string; periodEnd: string; parseStatus: string; recordCount: number }
type ReportData = { sources: { id: string; parse_status: string }[]; records: { source_file_id: string; period_start: string; period_end: string; confidence?: string; data: Record<string, unknown> }[]; truncated?: boolean }
const pilotRows = [...new Set(filingFormulas.pilot.flatMap(({ target, operands }) => [target, ...operands]))].sort()
const formatAmount = (fen: number | undefined) => fen === undefined ? '—' : (fen / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const statusLabels = { matched: '一致', missing: '未校验', difference: '有差异' } as const

export function FilingValidationPage({ clients, selectedClientId, onSelectClient, sources, loading, sourceError }: {
  clients: { id: string; name: string }[]; selectedClientId: string; onSelectClient: (id: string) => void;
  sources: ArchiveSource[]; loading: boolean; sourceError?: string;
}) {
  const [mode, setMode] = useState<'legacy' | 'pilot'>('legacy')
  const [sourceId, setSourceId] = useState('')
  const [manual, setManual] = useState<Record<string, string>>({})
  const [findings, setFindings] = useState<FilingFinding[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const available = sources.filter((item) => item.documentType === 'vat_return' && item.parseStatus === 'parsed' && item.recordCount > 0 && item.periodStart && item.periodEnd)
  const active = available.find((item) => item.id === sourceId) || available[0]
  const checked = findings?.filter((item) => item.status !== 'missing').length || 0
  const discrepancies = findings?.filter((item) => item.status === 'difference').length || 0

  async function runArchive() {
    if (!active || !selectedClientId || busy) return
    const query = new URLSearchParams({ clientId: selectedClientId, slotId: 'vat-return-main', sourceFileIds: active.id, periodStart: active.periodStart, periodEnd: active.periodEnd })
    setBusy(true)
    setFindings(null)
    setError('')
    try {
      const detail = await apiGet<ReportData>(`/api/tax-data/detail?${query}`)
      if (detail.truncated || !detail.sources.some((source) => source.id === active.id && source.parse_status === 'parsed')) {
        setError('原表资料不完整，无法校验。')
        return
      }
      const rows = vatFilingRowsFromArchive(detail.records.filter((record) => record.source_file_id === active.id
        && record.period_start === active.periodStart && record.period_end === active.periodEnd))
      if (!rows.length) { setError('当前文件未识别为已支持的普通版增值税主表。试点新表可切换到手工核对。'); return }
      setFindings(validateVatFiling('legacy', rows))
    } catch {
      setError('暂时无法读取归档主表，请稍后重试。')
    } finally {
      setBusy(false)
    }
  }

  return <section className="page filing-page">
    <header className="page-header"><div>
      <h2>申报前校验</h2>
      <p className="workspace-page-description">按公开申报表公式核对栏次，与企业风险评分分开。不提交申报，不替代电子税务局校验。</p>
    </div></header>
    <section className="panel filing-panel" aria-labelledby="filing-scope">
      <h3 id="filing-scope">增值税主表</h3>
      <div className="filing-mode" role="group" aria-label="申报表版本">
        <button type="button" className="secondary-button" aria-pressed={mode === 'legacy'} disabled={busy} onClick={() => { setMode('legacy'); setError(''); setFindings(null) }}>普通版 · 读归档</button>
        <button type="button" className="secondary-button" aria-pressed={mode === 'pilot'} disabled={busy} onClick={() => { setMode('pilot'); setError(''); setFindings(null) }}>试点新表 · 手工核对</button>
      </div>
      {mode === 'legacy' ? <>
        {clients.length ? <div className="filing-controls">
          <label>企业<select value={selectedClientId} disabled={busy} onChange={(event) => onSelectClient(event.target.value)}>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select></label>
          {active && <label>纳税所属期 / 原表<select value={active.id} disabled={busy} onChange={(event) => { setSourceId(event.target.value); setError(''); setFindings(null) }}>
            {available.map((source) => <option key={source.id} value={source.id}>{source.periodStart} 至 {source.periodEnd} · {source.fileName}</option>)}
          </select></label>}
          <button type="button" className="primary-button" disabled={busy || !active} onClick={() => void runArchive()}>{busy ? '正在核对…' : '核对原表'}</button>
        </div> : <p>暂无企业档案。上传申报表后可在这里选择原表。</p>}
        {!!clients.length && !active && <p role="status">{sourceError || (loading ? '正在读取归档资料…' : '暂无已解析的增值税主表。缺资料不等于校验通过。')}</p>}
      </> : <form onSubmit={(event) => {
        event.preventDefault()
        setFindings(validateVatFiling('pilot', pilotRows.map((row) => ({ row, amount: manual[row] }))))
      }}>
        <p>仅用于带 0B、0C 栏次的试点主表。请填同一申报期的「一般项目本期数」（元）；表上明确为零才填 0。录入不保存。</p>
        <div className="filing-inputs">{pilotRows.map((row) => <label key={row}>{row}<input type="number" step="0.01" inputMode="decimal" value={manual[row] || ''} onChange={(event) => { setManual({ ...manual, [row]: event.target.value }); setFindings(null) }} /></label>)}</div>
        <button type="submit" className="primary-button">按公开公式核对</button>
      </form>}
      <p className="section-helper"><a href={filingSources[mode]} target="_blank" rel="noreferrer">国家税务总局公开表样与填写口径</a>{mode === 'legacy' && ' · 仅读单张主表的一般项目本期数，不混用本年累计、其他主体或其他期间。'}</p>
      {error && <p role="alert" className="period-warning">{error}</p>}
    </section>
    {findings && <section className="panel filing-panel" aria-labelledby="filing-result">
      <h3 id="filing-result">勾稽结果</h3>
      <p role="status">已校验 {checked} 项，有差异 {discrepancies} 项，未校验 {findings.length - checked} 项。结果只说明本表已核对项目。</p>
      <div className="table-panel"><table aria-label="申报表栏次校验结果">
        <thead><tr><th scope="col">栏次 / 公式</th><th scope="col">原表（元）</th><th scope="col">复算（元）</th><th scope="col">核对结果</th></tr></thead>
        <tbody>{findings.map((item) => <tr key={item.id}>
          <th scope="row"><strong>{item.target} · {item.name}</strong><small>{item.formula}</small></th>
          <td>{formatAmount(item.actualFen)}</td><td>{formatAmount(item.expectedFen)}</td>
          <td><strong>{statusLabels[item.status]}</strong>{item.missing.length > 0 ? <small>缺值、冲突或金额不明确：{item.missing.join('、')}</small> : item.status === 'difference' ? <small>核对本期原表栏次及相关附表。</small> : null}</td>
        </tr>)}</tbody>
      </table></div>
    </section>}
  </section>
}
