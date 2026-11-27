import { useRef, useState } from 'react'
import { ArrowDown, ArrowRight, FileSpreadsheet, Upload } from 'lucide-react'
import { apiGet } from '../lib/apiClient'
import { filingSources, validateVatFiling } from '../lib/filingValidation'
import { vatAmount, vatColumns, vatDraftFromArchive, vatDraftFromPdf, vatDraftFromWorkbook, vatFormGroups, vatFormLines, type VatAmounts, type VatDraftData } from '../lib/filingDraft'
import { extractPdfTextPages } from '../lib/pdfTextExtractor'
import './FilingValidationPage.css'

type ArchiveSource = { id: string; fileName: string; documentType: string; periodStart: string; periodEnd: string; parseStatus: string; recordCount: number }
type ReportData = { sources: { id: string; parse_status: string }[]; records: { source_file_id: string; period_start: string; period_end: string; confidence?: string; data: Record<string, unknown> }[]; truncated?: boolean }
type Draft = VatDraftData & { fileName: string; origin: 'archive' | 'file'; originalAmounts: VatAmounts }
const formatAmount = (fen: number | undefined) => fen === undefined ? '—' : (fen / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const statusLabels = { matched: '一致', missing: '缺项未校验', difference: '有差异' } as const
const renderPeriod = (start?: string, end?: string) => start && end ? `${start} 至 ${end}` : '原表所属期未识别，请对照文件确认'

export function FilingValidationPage({ clients, selectedClientId, onSelectClient, sources, loading, sourceError }: {
  clients: { id: string; name: string }[]; selectedClientId: string; onSelectClient: (id: string) => void;
  sources: ArchiveSource[]; loading: boolean; sourceError?: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [sourceId, setSourceId] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState<'archive' | 'file' | null>(null)
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)
  const available = sources.filter((item) => item.documentType === 'vat_return' && item.parseStatus === 'parsed' && item.recordCount > 0 && item.periodStart && item.periodEnd)
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || b.periodStart.localeCompare(a.periodStart))
  const latest = available[0]
  const hasMultipleLatest = latest && available.slice(1).some((item) => item.periodEnd === latest.periodEnd)
  const active = available.find((item) => item.id === sourceId) || (hasMultipleLatest ? undefined : latest)
  const activeClient = clients.find((client) => client.id === selectedClientId)
  const lines = draft ? vatFormLines[draft.version] : []
  const amountColumns = draft ? vatColumns[draft.version] : []
  const cellCount = draft ? Object.values(draft.amounts).reduce((count, row) => count + row.filter((value) => vatAmount(value)).length, 0) : 0
  const findings = draft ? validateVatFiling(draft.version, lines.map((row) => ({ row: row.code, amount: vatAmount(draft.amounts[row.code]?.[0]) }))) : []
  const discrepancies = findings.filter((item) => item.status === 'difference').length
  const missing = findings.filter((item) => item.status === 'missing').length
  const compared = findings.length - missing
  const issueCount = discrepancies + missing
  const sortedFindings = [...findings].sort((a, b) => (a.status === 'difference' ? 0 : a.status === 'missing' ? 1 : 2) - (b.status === 'difference' ? 0 : b.status === 'missing' ? 1 : 2))
  const editedCell = (row: string, col: number) => {
    const current = draft?.amounts[row]?.[col] || ''
    const original = draft?.originalAmounts[row]?.[col] || ''
    return (vatAmount(current) || current.trim()) !== original
  }
  const editedCount = draft ? Object.entries(draft.amounts).reduce((total, [row, amounts]) => total + amounts.filter((_, col) => editedCell(row, col)).length, 0) : 0

  function installDraft(prepared: VatDraftData, origin: Draft['origin'], fileName: string) {
    setDraft({ ...prepared, origin, fileName, originalAmounts: prepared.amounts })
    setShowAll(false)
  }

  async function runArchive() {
    if (!active || !selectedClientId || busy) return
    const query = new URLSearchParams({ clientId: selectedClientId, slotId: 'vat-return-main', sourceFileIds: active.id, periodStart: active.periodStart, periodEnd: active.periodEnd })
    setBusy('archive')
    setError('')
    try {
      const detail = await apiGet<ReportData>(`/api/tax-data/detail?${query}`)
      if (detail.truncated || !detail.sources.some((source) => source.id === active.id && source.parse_status === 'parsed')) {
        setError('归档原表不完整，请直接上传预申报表。')
        return
      }
      const prepared = vatDraftFromArchive(detail.records.filter((record) => record.source_file_id === active.id && record.period_start === active.periodStart && record.period_end === active.periodEnd))
      if (!Object.values(prepared.amounts).some((row) => row.some(Boolean))) {
        setError('这份归档没有可读入的主表金额，请直接上传预申报表。')
        return
      }
      installDraft({ ...prepared, meta: { taxpayer: activeClient?.name, periodStart: active.periodStart, periodEnd: active.periodEnd } }, 'archive', active.fileName)
    } catch {
      setError('暂时无法读取归档主表，可以直接上传预申报表。')
    } finally {
      setBusy(null)
    }
  }

  async function loadFile(file?: File) {
    if (!file || busy) return
    setError('')
    if (!/\.(xlsx?|pdf)$/i.test(file.name)) { setError('请选择 Excel（.xls / .xlsx）或可复制文字的 PDF。'); return }
    if (file.size > 15 * 1024 * 1024) { setError('文件超过 15 MB，请另存主表后重新上传。'); return }
    setBusy('file')
    try {
      const buffer = await file.arrayBuffer()
      let prepared: VatDraftData
      if (/\.pdf$/i.test(file.name)) {
        prepared = vatDraftFromPdf(await extractPdfTextPages(buffer))
      } else {
        const { read, utils } = await import('@e965/xlsx')
        const workbook = read(buffer, { type: 'array', sheetRows: 160 })
        prepared = vatDraftFromWorkbook(workbook.SheetNames.map((name) => ({ name, rows: utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: null, raw: true, blankrows: true }) })))
      }
      installDraft(prepared, 'file', file.name)
    } catch (problem) {
      const message = problem instanceof Error ? problem.message : ''
      setError(/^(?:文件里|未识别到|PDF 中|这份 PDF)/.test(message) ? message : '文件无法读取。请确认文件未加密、未损坏，或换一份税局原表。')
    } finally {
      setBusy(null)
    }
  }

  function editAmount(code: string, col: number, value: string) {
    setDraft((current) => {
      if (!current) return current
      const row = [...(current.amounts[code] ?? vatColumns[current.version].map(() => ''))]
      row[col] = value
      return { ...current, amounts: { ...current.amounts, [code]: row } }
    })
  }

  function jumpToAmount(row: string) {
    const input = document.getElementById(`filing-cell-${row}-0`)
    input?.focus({ preventScroll: true })
    input?.scrollIntoView({ block: 'center', inline: 'nearest' })
  }

  return <section className="page filing-page">
    <header className="page-header filing-page-heading"><div>
      <p className="filing-kicker">增值税 · 一般纳税人</p><h2>申报前校验</h2>
      <p className="workspace-page-description">一键带入同一期主表，确认预填金额，再核对差异。</p>
    </div><a className="filing-link" href={filingSources[draft?.version || 'legacy']} target="_blank" rel="noreferrer">税务局公开表样 ↗</a></header>

    <nav className="filing-steps" aria-label="预申报核对流程"><ol>
      <li aria-current={!draft ? 'step' : undefined}><span>01</span><a href="#filing-load">读取申报资料</a></li>
      <li aria-current={draft ? 'step' : undefined}><span>02</span>{draft ? <a href="#filing-checks">核对差异与缺项</a> : '核对差异与缺项'}</li>
      <li><span>03</span>{draft ? <a href="#filing-main">查阅申报主表</a> : '查阅申报主表'}</li>
    </ol></nav>

    <section className="filing-load" id="filing-load" aria-label="读取申报资料">
      {clients.length > 0 && <form className="filing-controls" onSubmit={(event) => { event.preventDefault(); void runArchive() }}>
        <label><span>企业档案</span><select value={selectedClientId} disabled={!!busy} onChange={(event) => onSelectClient(event.target.value)}>
          {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select></label>
        {latest && <><label><span>税款所属期 / 原表</span><select required value={active?.id || ''} disabled={!!busy} onChange={(event) => { setSourceId(event.target.value); setError('') }}>
          {!active && <option value="" disabled>近期有多份原表，请选择要核对的一份</option>}
          {available.map((source) => <option key={source.id} value={source.id}>{renderPeriod(source.periodStart, source.periodEnd)} · {source.fileName}</option>)}
        </select></label>
        <button type="submit" className="primary-button filing-action" disabled={!!busy || !active}><FileSpreadsheet size={17} aria-hidden="true" />{busy === 'archive' ? '正在读取…' : '自动填表并校验'}</button></>}
      </form>}
      <div className="filing-file-source">
        <div><h3>{latest ? '或者，上传预申报表' : '直接上传预申报表'}</h3>
          <p>{latest ? '用手头的原表核对，不替换企业档案。' : (sourceError || (loading ? '正在读取企业档案，也可以直接上传。' : '没有可读取的归档主表？直接上传，自动带入并校验。'))}</p>
          <small>Excel（.xls / .xlsx）或可复制文字的 PDF · 最大 15 MB</small>
        </div>
        <input hidden ref={fileInput} type="file" accept=".xlsx,.xls,.pdf" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void loadFile(file) }} />
        <button type="button" className={latest ? 'secondary-button filing-action' : 'primary-button filing-action'} disabled={!!busy} onClick={() => fileInput.current?.click()}><Upload size={17} aria-hidden="true" />{busy === 'file' ? '正在读取…' : '上传预申报表'}</button>
      </div>
      {error && <p role="alert" className="filing-error">{error}{draft && ' 下方仍为上一次成功读取的表。'}</p>}
    </section>

    {draft && <>
      <section id="filing-checks" className="filing-results" aria-labelledby="filing-result-title">
        <div className="filing-review">
          <div><p className="filing-kicker">{draft.origin === 'archive' ? '归档原表' : '本次上传'} · {draft.version === 'legacy' ? '现行常规表' : '试点新表'}</p><p className="filing-filename">{draft.fileName}</p></div>
          <a className="filing-link" href="#filing-main">查阅完整主表 <ArrowDown size={14} aria-hidden="true" /></a>
        </div>
        <dl className="filing-meta filing-result-meta">
          <div><dt>纳税人</dt><dd>{draft.meta.taxpayer || '原表名称未识别'}</dd></div>
          <div><dt>所属期</dt><dd>{renderPeriod(draft.meta.periodStart, draft.meta.periodEnd)}</dd></div>
        </dl>
        {draft.notices.map((notice) => <p className="filing-notes filing-notice" key={notice}>{notice}</p>)}
        <div className="filing-result-heading">
          <h3 id="filing-result-title">校验结果</h3><p role="status">一致 {compared - discrepancies} 项 · 有差异 {discrepancies} 项 · 缺项未校验 {missing} 项</p>
        </div>
        <p className="filing-notes filing-coverage">已核对 {compared} / {findings.length} 项支持的主表公式（一般项目本期金额）。不校验附表，不计入企业风险评分。</p>
        {(issueCount > 0 || showAll) && <ul className="filing-issues">
          {sortedFindings.filter((item) => showAll || item.status !== 'matched').map((item) => <li key={item.id} className="filing-issue" data-status={item.status}>
            <div className="filing-issue-name"><span className="filing-issue-state">{statusLabels[item.status]}</span><button type="button" className="filing-text-action filing-issue-title" onClick={() => jumpToAmount(item.target)}>{item.target} · {item.name} <ArrowRight size={14} aria-hidden="true" /></button></div>
            <div className="filing-issue-content">
              <div className="filing-math"><span>表内 <strong>{formatAmount(item.actualFen)}</strong></span><span>复算 <strong>{formatAmount(item.expectedFen)}</strong></span>
                {item.status === 'difference' && <span>相差 <strong>{formatAmount(item.actualFen! - item.expectedFen!)}</strong> 元</span>}
              </div>
              {item.missing.length > 0 && <div className="filing-missing">{item.expectedFen !== undefined ? '可复算，待核对原表金额：' : '待确认的栏次：'}{item.missing.map((row) => <button key={row} type="button" className="filing-text-action" aria-label={`定位缺项 ${row}`} onClick={() => jumpToAmount(row)}>{row}</button>)}</div>}
              <details className="filing-evidence"><summary>计算依据</summary><p>{item.formula}</p><ul>{item.inputs.map(({ row, amountFen }) => {
                const sourceValue = draft.originalAmounts[row]?.[0]
                return <li key={row}><button type="button" className="filing-text-action" onClick={() => jumpToAmount(row)}>{row} · {lines.find((line) => line.code === row)?.label}</button><span>{amountFen === undefined ? '无可用金额' : `${formatAmount(amountFen)} 元`}{editedCell(row, 0) && `（原表：${sourceValue || '空白'}）`}</span></li>
              })}</ul></details>
            </div>
          </li>)}
        </ul>}
        {compared > discrepancies && <button type="button" className="filing-text-action filing-show-all" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? '收起一致项' : `查看 ${compared - discrepancies} 项一致结果`}</button>}
      </section>
      <section id="filing-main" className="filing-form" aria-labelledby="filing-main-title">
        <div className="filing-form-title"><h3 id="filing-main-title">{draft.version === 'legacy' ? '增值税及附加税费申报表' : '增值税及附加税费申报表主表'}</h3>{draft.version === 'legacy' && <p>（一般纳税人适用）</p>}</div>
        <dl className="filing-meta">
          <div><dt>税款所属{draft.version === 'legacy' ? '时间' : '期间'}</dt><dd>{renderPeriod(draft.meta.periodStart, draft.meta.periodEnd)}</dd></div>
          <div><dt>纳税人名称</dt><dd>{draft.meta.taxpayer || '原表名称未识别'}</dd></div>
          {draft.meta.taxId && <div><dt>纳税人识别号</dt><dd>{draft.meta.taxId}</dd></div>}
          {draft.meta.filledOn && <div><dt>填表日期</dt><dd>{draft.meta.filledOn}</dd></div>}
          <div><dt>金额单位</dt><dd>元（列至角分）</dd></div>
        </dl>
        <div className="filing-edit-tools">
          <p className="filing-notes"><strong>已填 {cellCount} 格</strong> · 可直接补录；空白不按 0 处理。修改仅用于本次核对。</p>
          {editedCount > 0 && <button type="button" className="filing-text-action" onClick={() => setDraft((current) => current ? { ...current, amounts: current.originalAmounts } : current)}>恢复原值（已改 {editedCount} 格）</button>}
        </div>
        <div className="filing-table-frame" tabIndex={0} role="region" aria-label="增值税主表，可横向滚动">
          <table className="filing-return" aria-labelledby="filing-main-title">
            <thead><tr><th colSpan={2} rowSpan={draft.version === 'legacy' ? 2 : 1}>项目</th><th scope="col" rowSpan={draft.version === 'legacy' ? 2 : 1}>栏次</th>
              {draft.version === 'legacy' ? <><th scope="colgroup" colSpan={2}>一般项目</th><th scope="colgroup" colSpan={2}>即征即退项目</th></> : amountColumns.map((label) => <th key={label} scope="col">{label}</th>)}</tr>
              {draft.version === 'legacy' && <tr><th scope="col">本月数</th><th scope="col">本年累计</th><th scope="col">本月数</th><th scope="col">本年累计</th></tr>}</thead>
            {vatFormGroups.map((group, index) => {
              const rows = lines.filter((row) => row.group === index)
              return <tbody key={group}>{rows.map((row, rowIndex) => {
                const finding = findings.find((item) => item.target === row.code)
                return <tr key={row.code} id={`vat-row-${row.code}`} data-difference={finding?.status === 'difference' || undefined}>
                  {rowIndex === 0 && <th className="filing-row-group" rowSpan={rows.length} scope="rowgroup">{group}</th>}
                  <th scope="row" className="filing-row-label">{row.label}</th><td className="filing-reference">{row.reference}</td>
                  {amountColumns.map((label, column) => {
                    const value = draft.amounts[row.code]?.[column] || ''
                    return row.blocked.includes(column) ? <td key={label} className="filing-blocked">——</td>
                      : <td key={label} className="filing-value" data-edited={editedCell(row.code, column) || undefined}><input id={`filing-cell-${row.code}-${column}`} aria-label={`${row.code} ${row.label} · ${label}`} aria-invalid={!!value && !vatAmount(value) || undefined} inputMode="decimal" maxLength={18} value={value}
                        onChange={(event) => editAmount(row.code, column, event.target.value)} onBlur={() => { const normalized = vatAmount(value); if (normalized && normalized !== value) editAmount(row.code, column, normalized) }} />
                        {editedCell(row.code, column) && <small>原：{draft.originalAmounts[row.code]?.[column] || '空白'}</small>}</td>
                  })}
                </tr>
              })}</tbody>
            })}
          </table>
        </div>
      </section>
    </>}
    <p className="filing-disclaimer">合耀科技 · 预申报核对。不连接电子税务局，不提交申报。</p>
  </section>
}
