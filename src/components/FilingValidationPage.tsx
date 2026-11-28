import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, FileSpreadsheet, Upload } from 'lucide-react'
import { apiGet } from '../lib/apiClient'
import { filingSources, validateVatFiling, type VatFormVersion } from '../lib/filingValidation'
import { vatAmount, vatColumns, vatDraftFromArchive, vatFormGroups, vatFormLines, type VatAmounts, type VatDraftData, type VatMetadata } from '../lib/filingDraft'
import { annexCellId, checkVatAnnexes, checkVatAnnexInternal, updateAnnexAmount, vatAnnexOrder, type AnnexField, type VatAnnex } from '../lib/filingAnnexes'
import { FilingAnnexReview } from './FilingAnnexReview'
import { FilingReviewSummary, type ReviewItem } from './FilingReviewSummary'
import './FilingValidationPage.css'

type ArchiveSource = { id: string; fileName: string; documentType: string; periodStart: string; periodEnd: string; parseStatus: string; recordCount: number }
type ReportData = { sources: { id: string; parse_status: string }[]; records: { source_file_id: string; period_start: string; period_end: string; confidence?: string; data: Record<string, unknown> }[]; truncated?: boolean }
type Draft = VatDraftData & { fileName: string; origin: 'archive' | 'file' | 'manual'; originalAmounts: VatAmounts; annexes: VatAnnex[] }
const periodText = (start?: string, end?: string) => start && end ? `${start} 至 ${end}` : '税款所属期未确认'

function MainSheet({ draft, onAmount, onMeta, onRestore, affected }: {
  draft: Draft; onAmount: (row: string, column: number, value: string) => void; onMeta: (key: keyof VatMetadata, value: string) => void; onRestore: () => void; affected: Set<string>;
}) {
  const { version, meta, amounts, originalAmounts } = draft
  const manual = draft.origin === 'manual'
  const columns = vatColumns[version]
  const edited = (row: string, col: number) => {
    const value = amounts[row]?.[col] || ''
    return (vatAmount(value) || value.trim()) !== (originalAmounts[row]?.[col] || '')
  }
  const hasEdits = Object.entries(amounts).some(([row, cells]) => cells.some((_, col) => edited(row, col)))
  return <section className="filing-form" aria-labelledby="filing-main-title">
    <div className="filing-form-title"><h3 id="filing-main-title">{version === 'legacy' ? '增值税及附加税费申报表' : '增值税及附加税费申报表主表'}</h3>{version === 'legacy' && <p>（一般纳税人适用）</p>}</div>
    {manual ? <div className="filing-draft-meta">
      <label>纳税人名称<input value={meta.taxpayer || ''} maxLength={80} onChange={(event) => onMeta('taxpayer', event.target.value)} /></label>
      {version === 'legacy' && <label>纳税人识别号<input value={meta.taxId || ''} maxLength={20} onChange={(event) => onMeta('taxId', event.target.value)} /></label>}
      <fieldset><legend>税款所属{version === 'legacy' ? '时间' : '期间'}</legend><input aria-label="税款所属期起" type="date" value={meta.periodStart || ''} onChange={(event) => onMeta('periodStart', event.target.value)} /><span>至</span><input aria-label="税款所属期止" type="date" value={meta.periodEnd || ''} min={meta.periodStart || undefined} onChange={(event) => onMeta('periodEnd', event.target.value)} /></fieldset>
    </div> : <dl className="filing-meta">
      <div><dt>税款所属期</dt><dd>{periodText(meta.periodStart, meta.periodEnd)}</dd></div><div><dt>纳税人名称</dt><dd>{meta.taxpayer || '未识别'}</dd></div>
      {meta.taxId && <div><dt>纳税人识别号</dt><dd>{meta.taxId}</dd></div>}{meta.filledOn && <div><dt>填表日期</dt><dd>{meta.filledOn}</dd></div>}
    </dl>}
    <div className="filing-edit-tools"><p className="filing-notes">金额单位：元（列至角分）</p>{hasEdits && !manual && <button type="button" className="filing-text-action" onClick={onRestore}>恢复主表原值</button>}</div>
    <div className="filing-table-frame" tabIndex={0} role="region" aria-label="增值税主表，可横向滚动">
      <table className="filing-return" aria-labelledby="filing-main-title">
        <thead><tr><th colSpan={2} rowSpan={version === 'legacy' ? 2 : 1}>项目</th><th scope="col" rowSpan={version === 'legacy' ? 2 : 1}>栏次</th>
          {version === 'legacy' ? <><th scope="colgroup" colSpan={2}>一般项目</th><th scope="colgroup" colSpan={2}>即征即退项目</th></> : columns.map((label) => <th key={label} scope="col">{label}</th>)}</tr>
          {version === 'legacy' && <tr><th scope="col">本月数</th><th scope="col">本年累计</th><th scope="col">本月数</th><th scope="col">本年累计</th></tr>}</thead>
        {vatFormGroups.map((group, index) => {
          const rows = vatFormLines[version].filter((row) => row.group === index)
          return <tbody key={group}>{rows.map((row, rowIndex) => <tr key={row.code} data-difference={affected.has(row.code) || undefined}>
            {rowIndex === 0 && <th className="filing-row-group" rowSpan={rows.length} scope="rowgroup">{group}</th>}
            <th scope="row" className="filing-row-label">{row.label}</th><td className="filing-reference">{row.reference}</td>
            {columns.map((label, col) => {
              const value = amounts[row.code]?.[col] || ''
              return row.blocked.includes(col) ? <td key={label} className="filing-blocked">——</td>
                : <td key={label} className="filing-value" data-edited={!manual && edited(row.code, col) || undefined}>
                  <input id={`filing-cell-${row.code}-${col}`} aria-label={`${row.code} ${row.label} · ${label}`} aria-invalid={!!value && !vatAmount(value) || undefined} inputMode="decimal" maxLength={18} value={value}
                    onChange={(event) => onAmount(row.code, col, event.target.value)} onBlur={() => { const normalized = vatAmount(value); if (normalized && normalized !== value) onAmount(row.code, col, normalized) }} />
                  {!manual && edited(row.code, col) && <small>原：{originalAmounts[row.code]?.[col] || '空白'}</small>}</td>
            })}
          </tr>)}</tbody>
        })}
      </table>
    </div>
  </section>
}

export function FilingValidationPage({ clients, selectedClientId, onSelectClient, sources, loading, sourceError }: {
  clients: { id: string; name: string; creditCode?: string }[]; selectedClientId: string; onSelectClient: (id: string) => void;
  sources: ArchiveSource[]; loading: boolean; sourceError?: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const flight = useRef(false)
  const [sourceId, setSourceId] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [view, setView] = useState<'start' | 'result' | 'form'>('start')
  const [busy, setBusy] = useState<'archive' | 'file' | 'manual' | null>(null)
  const [error, setError] = useState('')
  const [annexId, setAnnexId] = useState('')
  const [focusId, setFocusId] = useState('')
  const [spotlight, setSpotlight] = useState('')
  const openAnnex = draft?.annexes.find((item) => item.id === annexId) || null
  const activeClient = clients.find((client) => client.id === selectedClientId)
  const available = sources.filter((item) => item.documentType === 'vat_return' && item.parseStatus === 'parsed' && item.recordCount > 0 && item.periodStart && item.periodEnd)
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || b.periodStart.localeCompare(a.periodStart))
  const latest = available[0]
  const latestTied = latest && available.slice(1).some((source) => source.periodEnd === latest.periodEnd)
  const active = available.find((item) => item.id === sourceId) || (latestTied ? undefined : latest)

  useEffect(() => {
    if (focusId) document.getElementById(focusId)?.focus()
  }, [view, focusId, annexId])

  function installDraft(prepared: VatDraftData, origin: Draft['origin'], fileName: string, annexes: VatAnnex[] = []) {
    setDraft({ ...prepared, origin, fileName, originalAmounts: prepared.amounts, annexes })
    setAnnexId('')
    setSpotlight('')
    setFocusId(origin === 'manual' ? 'filing-source-bar' : 'filing-result')
    setView(origin === 'manual' ? 'form' : 'result')
  }

  async function processSource(mode: NonNullable<typeof busy>, work: () => Promise<void>) {
    if (flight.current) return
    flight.current = true
    setBusy(mode)
    setError('')
    try { await work() } catch (problem) {
      const message = problem instanceof Error ? problem.message : ''
      setError(/^(?:文件里|未识别到|PDF 中|PDF 超过|这份 PDF|这批资料|请选择|没读到|暂时无法打开|归档原表|这份归档)/.test(message) ? message
        : mode === 'manual' ? '暂时无法打开原表，请重试。' : mode === 'archive' ? '暂时无法读取归档主表，可直接上传原表。' : '没能读取文件。请改用未加密的税务局原表，优先选 Excel。')
    } finally { flight.current = false; setBusy(null) }
  }

  function runArchive() {
    if (!active || !selectedClientId) return
    const query = new URLSearchParams({ clientId: selectedClientId, slotId: 'vat-return-main', sourceFileIds: active.id, periodStart: active.periodStart, periodEnd: active.periodEnd })
    return processSource('archive', async () => {
      const detail = await apiGet<ReportData>(`/api/tax-data/detail?${query}`)
      if (detail.truncated || !detail.sources.some((source) => source.id === active.id && source.parse_status === 'parsed')) throw new Error('归档原表不完整，请直接上传预申报表。')
      const prepared = vatDraftFromArchive(detail.records.filter((record) => record.source_file_id === active.id && record.period_start === active.periodStart && record.period_end === active.periodEnd))
      if (!Object.values(prepared.amounts).some((row) => row.some(Boolean))) throw new Error('这份归档没有可读入的主表金额，请直接上传预申报表。')
      installDraft({ ...prepared, meta: { taxpayer: activeClient?.name, periodStart: active.periodStart, periodEnd: active.periodEnd } }, 'archive', active.fileName)
    })
  }

  function loadFiles(files: File[]) {
    if (!files.length) return
    return processSource('file', async () => {
      const { readVatFilingPacket } = await import('../lib/filingPacket')
      const { main, annexes, notices } = await readVatFilingPacket(files)
      installDraft({ ...main, notices: [...main.notices, ...notices] }, 'file', main.fileName, annexes)
    })
  }

  function startManual(version: VatFormVersion) {
    if (draft?.origin === 'manual' && draft.version === version) { showMain(); return }
    return processSource('manual', async () => {
      const { readBlankFilingTemplate } = await import('../lib/filingPacket')
      const { main, annexes } = await readBlankFilingTemplate(version)
      installDraft({ ...main, meta: { taxpayer: activeClient?.name, taxId: activeClient?.creditCode } }, 'manual', '手工填表', annexes)
    })
  }

  function editAmount(row: string, col: number, value: string) {
    setDraft((current) => {
      if (!current) return current
      const cells = [...(current.amounts[row] ?? vatColumns[current.version].map(() => ''))]
      cells[col] = value
      return { ...current, amounts: { ...current.amounts, [row]: cells } }
    })
  }

  function editAnnex(row: number, col: number, value: string) {
    setDraft((current) => current ? { ...current, annexes: current.annexes.map((annex) => annex.id === annexId ? updateAnnexAmount(annex, current.version, row, col, value) : annex) } : current)
  }

  function showMain(row?: string, col = 0) {
    setSpotlight(''); setAnnexId(''); setView('form'); setFocusId(row ? `filing-cell-${row}-${col}` : 'filing-source-bar')
  }

  function showAnnex(annex: VatAnnex, field?: AnnexField) {
    setAnnexId(annex.id); setView('form')
    setSpotlight(field && !annex.pdf ? annexCellId(annex, field) : '')
    setFocusId(!field || annex.pdf ? 'filing-source-bar' : '')
  }

  function showResult() { setView('result'); setFocusId('filing-result') }

  const mainFindings = draft ? validateVatFiling(draft.version, Object.entries(draft.amounts).map(([row, cells]) => ({ row, amount: vatAmount(cells[0]) }))) : []
  const crossFindings = draft && draft.origin !== 'archive' ? checkVatAnnexes(draft.version, draft.amounts, draft.annexes) : []
  const ownAnnex = draft?.annexes.flatMap((annex) => {
    const check = checkVatAnnexInternal(annex)
    return check ? [{ annex, check }] : []
  }) || []
  const items: ReviewItem[] = [
    ...crossFindings.map((item): ReviewItem => ({ id: item.id, title: item.name, location: `主表 ${item.target} 栏 · 附表对照`, status: item.status,
      actual: item.mainFen, expected: item.annexFen, expectedLabel: '附表金额', detail: [item.absent, item.reference].filter(Boolean).join(' '),
      links: [...item.mainCols.map((col) => ({ label: item.mainCols.length > 1 ? `主表${col === 0 ? '一般项目' : '即征即退'}` : '查看主表栏次', open: () => showMain(item.target, col) })),
        ...item.sources.flatMap(({ report, field, label }) => report ? [{ label: `查看${label}`, open: () => showAnnex(report, field) }] : [])] })),
    ...mainFindings.map((item): ReviewItem => ({ id: item.id, title: item.name, location: `主表 ${item.target} 栏`, status: item.status, actual: item.actualFen, expected: item.expectedFen,
      detail: `${item.missing.length ? `第 ${item.missing.join('、')} 栏无有效金额。` : ''}${item.formula}`,
      links: [{ label: '查看主表栏次', open: () => showMain(item.target) }, ...item.missing.filter((row) => row !== item.target).map((row) => ({ label: `定位缺项 ${row} 栏`, open: () => showMain(row) }))] })),
    ...ownAnnex.map(({ annex, check }): ReviewItem => ({ id: `internal-${annex.id}`, title: '申报抵扣进项税额合计', location: '附表二第 12 栏', status: check.status,
      detail: '附表二 12 = 1 + 4 + 11。', actual: check.result, expected: check.subtotal, links: [{ label: '查看附表栏次', open: () => showAnnex(annex, annex.fields?.['12']) }] })),
  ]
  const affected = new Set([...mainFindings, ...crossFindings].filter(({ status }) => status === 'difference').map(({ target }) => target))
  const blankDraft = draft?.origin === 'manual' && !Object.values(draft.amounts).some((row) => row.some(Boolean)) && !draft.annexes.some((annex) => annex.grid?.some((row) => row.some((cell) => cell.input && vatAmount(cell.raw))))
  const wrongDates = draft?.meta.periodStart && draft.meta.periodEnd && draft.meta.periodStart > draft.meta.periodEnd

  return <section className={`page filing-page filing-view-${view}`}>
    <div className="filing-layout">
      <header className="filing-page-heading"><div><p className="filing-kicker">增值税 · 一般纳税人</p><h2>申报前校验</h2></div>
        <a className="filing-link" href={filingSources[draft?.version || 'legacy']} target="_blank" rel="noreferrer">税局表样 ↗</a>
      </header>
      <input className="filing-file-input" hidden ref={fileInput} type="file" multiple accept=".xlsx,.xls,.pdf" onChange={(event) => { const files = Array.from(event.currentTarget.files || []); event.currentTarget.value = ''; void loadFiles(files) }} />
      {view === 'start' && <div className="filing-start">
        <div className="filing-start-icon"><FileSpreadsheet size={28} strokeWidth={1.6} aria-hidden="true" /></div>
        <h3>带入预申报表</h3>
        <p>选好同一家企业、同一期的主表和附表，自动填表并校验。</p>
        <div className="filing-start-actions">
          <button type="button" className="primary-button filing-action" disabled={!!busy} onClick={() => fileInput.current?.click()}><Upload size={17} aria-hidden="true" /> 上传自动填表</button>
          <button type="button" className="filing-text-action" disabled={!!busy} onClick={() => void startManual('legacy')}>我要填表 <ArrowRight size={15} aria-hidden="true" /></button>
        </div>
        <p className="filing-notes">可一次选择多个 Excel 文件；PDF 只核对能识别的栏次。</p>
      </div>}
      {view !== 'start' && <div className="filing-quick-links"><button type="button" className="filing-text-action" disabled={!!busy} onClick={() => { setView('start'); setError(''); setFocusId('') }}><ArrowLeft size={15} aria-hidden="true" /> {view === 'result' ? '返回入口' : '填表入口'}</button>
        {draft?.origin === 'file' && <button type="button" className="filing-text-action" disabled={!!busy} onClick={() => fileInput.current?.click()}>更换文件</button>}
      </div>}
      {busy && <p className="filing-live" role="status">{busy === 'file' ? '正在带入并核对主表和附表…' : busy === 'manual' ? '正在打开税局原表…' : '正在读取归档主表…'}</p>}
      {error && <p role="alert" className="filing-error">{error}</p>}
      {view === 'start' && <div className="filing-start-more">
        {draft && <button type="button" className="filing-text-action" onClick={draft.origin === 'manual' ? () => showMain() : showResult}>返回上一次{draft.origin === 'manual' ? '填表' : '核对'}</button>}
        <details className="filing-start-options"><summary>其他方式</summary>
          <button type="button" className="filing-text-action" disabled={!!busy} onClick={() => void startManual('pilot')}>使用试点新表（手工）</button>
          {clients.length > 0 && <details className="filing-archive"><summary>从企业档案读取主表</summary>
            <form className="filing-controls" onSubmit={(event) => { event.preventDefault(); void runArchive() }}>
              <label>企业档案<select value={selectedClientId} disabled={!!busy} onChange={(event) => onSelectClient(event.target.value)}>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
              {latest && <><label>税款所属期 / 原表<select required value={active?.id || ''} disabled={!!busy} onChange={(event) => setSourceId(event.target.value)}>
                {!active && <option value="" disabled>请选择原表</option>}{available.map((source) => <option key={source.id} value={source.id}>{periodText(source.periodStart, source.periodEnd)} · {source.fileName}</option>)}
              </select></label><button type="submit" className="secondary-button filing-action" disabled={!!busy || !active}>读取主表</button></>}
            </form>
            {!latest && <p className="filing-notes">{sourceError || (loading ? '正在读取归档…' : '暂无可用归档，可上传整套预申报表。')}</p>}
          </details>}
        </details>
      </div>}
      {draft && view === 'result' && <FilingReviewSummary items={items} taxpayer={draft.meta.taxpayer || '纳税人名称未确认'} period={periodText(draft.meta.periodStart, draft.meta.periodEnd)}
        source={draft.fileName} notices={[...(draft.origin === 'archive' ? ['归档入口仅读取主表，未核对附表。'] : []), ...draft.notices]} onOpen={() => showMain()} />}
      {draft && view === 'form' && <>
        <div className="filing-source-bar" id="filing-source-bar" tabIndex={-1}>
          <label><span>申报表</span><select value={annexId} onChange={(event) => { setSpotlight(''); setAnnexId(event.target.value); setFocusId('') }}>
            <option value="">增值税申报主表</option>
            {draft.annexes.map((annex) => <option key={annex.id} value={annex.id}>{vatAnnexOrder(draft.version).find(([kind]) => kind === annex.kind)?.[1]} · {annex.title}</option>)}
          </select></label>
          <button className="primary-button filing-action" type="button" disabled={!!wrongDates} onClick={showResult}>{draft.origin === 'manual' ? '核对已填金额' : '返回校验结果'} <ArrowRight size={15} aria-hidden="true" /></button>
        </div>
        {wrongDates && <p className="filing-error" role="alert">税款所属期的结束日期不能早于开始日期。</p>}
        {blankDraft && <p className="filing-notes">当前打开的是{draft.version === 'pilot' ? '试点新表' : '常规表'}。白色可填写金额；横线栏不填。</p>}
        {openAnnex ? <FilingAnnexReview active={openAnnex} spotlight={spotlight} onEdit={editAnnex} /> : <MainSheet draft={draft} affected={affected} onAmount={editAmount}
          onMeta={(key, value) => setDraft((current) => current ? { ...current, meta: { ...current.meta, [key]: value } } : current)}
          onRestore={() => setDraft((current) => current ? { ...current, amounts: current.originalAmounts } : current)} />}
      </>}
      <p className="filing-disclaimer">合耀科技 · 仅作申报前核对，不向税务局提交。</p>
    </div>
  </section>
}
