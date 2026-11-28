import { ArrowRight, ChevronDown, CircleAlert, CircleCheck, FileText } from 'lucide-react'
import type { FilingStatus } from '../lib/filingValidation'

export type ReviewItem = {
  id: string; title: string; location: string; status: FilingStatus; detail: string
  actual?: number; expected?: number; expectedLabel?: string
  links: { label: string; open: () => void }[]
}

const yuan = (value?: number) => value === undefined ? '—' : `${(value / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元`

function Item({ item }: { item: ReviewItem }) {
  return <details className="filing-result-item">
    <summary><span><strong>{item.title}</strong><small>{item.location}</small></span><span className="filing-result-item-cta">{item.status === 'difference' ? '查看差异' : item.status === 'missing' ? '查看原因' : '查看'} <ChevronDown size={15} aria-hidden="true" /></span></summary>
    <div className="filing-result-item-body">
      {(item.actual !== undefined || item.expected !== undefined) && <dl className="filing-compare"><div><dt>表内金额</dt><dd>{yuan(item.actual)}</dd></div><div><dt>{item.expectedLabel || '复核金额'}</dt><dd>{yuan(item.expected)}</dd></div>{item.status === 'difference' && item.actual !== undefined && item.expected !== undefined && <div><dt>差额</dt><dd>{yuan(item.actual - item.expected)}</dd></div>}</dl>}
      <p>{item.detail}</p>
      {item.links.length > 0 && <div className="filing-item-links">{item.links.map((link) => <button key={link.label} type="button" className="filing-text-action" onClick={link.open}>{link.label} <ArrowRight size={13} aria-hidden="true" /></button>)}</div>}
    </div>
  </details>
}

export function FilingReviewSummary({ items, taxpayer, period, source, notices, onOpen }: {
  items: ReviewItem[]; taxpayer: string; period: string; source: string; notices: string[]; onOpen?: () => void;
}) {
  const differences = items.filter((item) => item.status === 'difference')
  const unchecked = items.filter((item) => item.status === 'missing')
  const matched = items.filter((item) => item.status === 'matched')
  const checked = matched.length + differences.length
  const tone = differences.length ? 'difference' : unchecked.length || !checked ? 'partial' : 'clear'
  const title = differences.length ? `发现 ${differences.length} 项差异` : checked ? '已核对项目未发现差异' : '资料不足，尚未完成核对'
  const Icon = tone === 'clear' ? CircleCheck : CircleAlert
  return <section id="filing-result" className="filing-confirmation" aria-labelledby="filing-result-title" tabIndex={-1}>
    <div className="filing-result-lead" data-tone={tone}>
      <span className="filing-result-mark"><Icon size={22} aria-hidden="true" /></span>
      <div role="status"><p className="filing-kicker">校验结果</p><h3 id="filing-result-title">{title}</h3><p id="filing-result-count">已核对 {checked} 项{unchecked.length ? `，另有 ${unchecked.length} 项未核对` : ''}。</p></div>
    </div>
    <div className="filing-result-meta-line"><div><strong>{taxpayer}</strong><p>{period}</p></div>{onOpen && <button type="button" className="filing-text-action" onClick={onOpen}><FileText size={16} aria-hidden="true" /> 查看已填表</button>}</div>
    <p className="filing-notes">仅核对本次支持的表内公式和主附表金额，不判断申报是否通过。</p>
    {differences.length > 0 && <div className="filing-result-items" aria-label="需要核对的差异">{differences.map((item) => <Item key={item.id} item={item} />)}</div>}
    {(unchecked.length > 0 || notices.length > 0) && <details className="filing-result-disclosure"><summary>{unchecked.length ? `查看 ${unchecked.length} 项未核对的原因` : '查看资料提示'} <ChevronDown size={15} aria-hidden="true" /></summary>
      {notices.length > 0 && <ul className="filing-result-notices">{notices.map((notice, index) => <li key={`${index}-${notice}`}>{notice}</li>)}</ul>}
      {unchecked.map((item) => <Item key={item.id} item={item} />)}
    </details>}
    {matched.length > 0 && <details className="filing-result-disclosure"><summary>查看 {matched.length} 项一致的核对结果 <ChevronDown size={15} aria-hidden="true" /></summary>{matched.map((item) => <Item key={item.id} item={item} />)}</details>}
    <p className="filing-notes filing-result-file">资料来源：{source}</p>
  </section>
}
