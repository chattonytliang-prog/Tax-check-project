import { useId, useState, type ReactNode } from 'react'
import { ArrowDownLeft, ChevronDown, Coins, FileText, History, QrCode, RefreshCcw, SlidersHorizontal } from 'lucide-react'
import './PointsWallet.css'

const sources = {
  report: { label: '报告扣分', icon: FileText, group: 'usage' },
  admin_adjustment: { label: '管理员调整', icon: SlidersHorizontal, group: 'adjustment' },
  wechat_recharge: { label: '微信充值', icon: ArrowDownLeft, group: 'recharge' },
  alipay_recharge: { label: '支付宝充值', icon: ArrowDownLeft, group: 'recharge' },
} as const

const filters = [
  ['all', '全部'], ['recharge', '充值'], ['usage', '报告扣分'], ['adjustment', '管理员调整'],
] as const
type Filter = typeof filters[number][0]

export type PointWallet = {
  balance: number
  freeReportAvailable: boolean
  adminUnlimited: boolean
  reportCost: number
  transactions: {
    id: string
    delta: number
    source: keyof typeof sources
    note: string
    createdAt: string
  }[]
}

const pointsNumber = new Intl.NumberFormat('zh-CN')
const pointTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})

function formatTime(value: string) {
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z')
  return Number.isNaN(date.getTime()) ? value : pointTime.format(date)
}

export function WalletPaymentMethod({ provider, children }: { provider: 'wechat' | 'alipay'; children: ReactNode }) {
  const wechat = provider === 'wechat'
  return <article className={`wallet-provider wallet-provider--${provider}`}>
    <header className="wallet-provider-heading">
      <span className="wallet-provider-icon" aria-hidden="true">
        {wechat ? <svg viewBox="0 0 28 28" fill="currentColor"><path d="M11.2 4.3c-5 0-8.7 3-8.7 6.8 0 2 1 3.7 2.7 5l-.7 2.5 3-1.4c.8.2 1.6.4 2.5.4a6.6 6.6 0 0 1-.1-1.1c0-4 3.5-7.2 8.4-7.2h.8c-1-3-4.1-5-7.9-5Zm-3 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm5.6 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/><path d="M18.8 10.8c-4.2 0-7.5 2.6-7.5 5.8s3.3 5.9 7.5 5.9c.8 0 1.5-.1 2.2-.3l2.7 1.3-.6-2.3c1.5-1.1 2.5-2.7 2.5-4.6 0-3.2-3-5.8-6.8-5.8Zm-2.7 5.7a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Zm4.9 0a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Z"/></svg> : '支'}
      </span>
      <div>
        <h4>{wechat ? '微信支付' : '支付宝'}</h4>
        <p>{wechat ? '使用微信扫描订单二维码' : '在支付宝收银台完成付款'}</p>
      </div>
    </header>
    {children}
  </article>
}

export function PointsWallet({ wallet, error, onRefresh, children }: {
  wallet: PointWallet | null
  error: string
  onRefresh: () => void
  children?: ReactNode
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const rows = wallet?.transactions ?? []
  const visibleRows = rows.filter(row => filter === 'all' || sources[row.source].group === filter)
  const reportCost = wallet?.reportCost ?? 200
  const free = wallet && (wallet.adminUnlimited || wallet.freeReportAvailable)
  return <section className="page points-wallet" aria-labelledby="points-title">
    <header className="points-wallet-header">
      <div>
        <p className="points-kicker">账户与用量</p>
        <h2 id="points-title">积分账户</h2>
        <p>管理报告积分，查看充值和使用记录。</p>
      </div>
      <button className="wallet-refresh" type="button" onClick={onRefresh}><RefreshCcw aria-hidden="true" />刷新余额</button>
    </header>

    <div className="wallet-summary">
      <div className="wallet-balance">
        <span className="wallet-balance-icon"><Coins aria-hidden="true" /></span>
        <div><p>可用积分</p><div className="wallet-balance-value" aria-live="polite">
          <strong>{wallet ? wallet.adminUnlimited ? '不限额度' : pointsNumber.format(wallet.balance) : '—'}</strong>
          {wallet && !wallet.adminUnlimited && <span>积分</span>}
        </div></div>
      </div>
      <dl className="wallet-summary-details">
        <div><dt>下一份报告</dt><dd>{wallet ? free ? '免费' : reportCost + ' 积分' : '—'}</dd></div>
        <div><dt>兑换比例</dt><dd>1 元 = 1 积分</dd></div>
      </dl>
    </div>
    {error && <p className="wallet-notice wallet-notice--error" role="alert">{error}</p>}

    {children && <section className="wallet-area" aria-labelledby="wallet-recharge-title">
      <div className="wallet-section-heading">
        <div><h3 id="wallet-recharge-title">充值积分</h3><p>选择支付方式，付款确认后积分自动到账。</p></div>
      </div>
      <div className="wallet-providers">{children}</div>
    </section>}

    <section className="wallet-area" aria-labelledby="wallet-activity-title">
      <div className="wallet-section-heading wallet-activity-heading">
        <div><h3 id="wallet-activity-title">积分流水</h3><p>查看已入账的充值和积分变动。</p></div>
        <div className="wallet-filters" role="group" aria-label="筛选积分流水">
          {filters.map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key}
            onClick={() => setFilter(key)}>{label}</button>)}
        </div>
      </div>
      <div className="wallet-ledger">
        {visibleRows.length ? <table aria-labelledby="wallet-activity-title">
          <thead><tr><th scope="col">变动类型</th><th scope="col">时间<span className="wallet-zone">（北京时间）</span></th><th scope="col">说明</th><th scope="col">积分变动</th></tr></thead>
          <tbody>{visibleRows.map(entry => {
            const kind = sources[entry.source]
            const Icon = kind.icon
            return <tr key={entry.id}>
              <th scope="row"><span className="wallet-entry-kind"><Icon aria-hidden="true" />{kind.label}</span></th>
              <td>{formatTime(entry.createdAt)}</td>
              <td>{entry.note || '—'}</td>
              <td className={entry.delta > 0 ? 'wallet-credit' : 'wallet-debit'}>
                {entry.delta > 0 ? '+' : ''}{pointsNumber.format(entry.delta)}<span> 积分</span>
              </td>
            </tr>
          })}</tbody>
        </table> : <div className="wallet-empty" role="status">
          <History aria-hidden="true" />
          <strong>{wallet ? '暂无' + (filter === 'all' ? '积分流水' : filters.find(([key]) => key === filter)?.[1] + '记录') : error ? '暂时无法加载流水' : '正在加载积分流水'}</strong>
          <p>{wallet ? filter === 'all' ? '充值到账或生成付费报告后，记录会显示在这里。' : '可以切换到「全部」查看其他记录。' : error ? '可点击「刷新余额」重试。' : '请稍候。'}</p>
        </div>}
      </div>
    </section>

    <details className="wallet-rules-details">
      <summary>积分与计费规则</summary>
      <ul>
        <li>普通账号的首份报告免费，之后每生成一份新报告扣 {reportCost} 积分。</li>
        <li>查看、重新导出已有报告不扣积分；删除报告不会返还积分或免费次数。</li>
        <li>管理员本人生成报告免费；代入普通用户时按该用户账户计费。</li>
      </ul>
    </details>
  </section>
}

export function WalletPaymentTier({ amountFen, points, test, children }: {
  amountFen: number; points: number; test?: boolean; children: ReactNode
}) {
  return <div className={`wallet-payment-tier${test ? ' wallet-payment-tier--test' : ''}`}>
    <div className="wallet-tier-value">
      {test && <span className="wallet-test-label">测试档</span>}
      <strong><span>¥</span>{pointsNumber.format(amountFen / 100)}</strong>
      <span className="wallet-tier-points">+{pointsNumber.format(points)} 积分</span>
    </div>
    {children}
  </div>
}

export function WalletRechargeButton({ provider, test, disabled, unavailable, pending, busy, onClick }: {
  provider: 'wechat' | 'alipay'
  test?: boolean
  disabled?: boolean
  unavailable?: boolean
  pending?: boolean
  busy?: boolean
  onClick: () => void
}) {
  const name = provider === 'wechat' ? '微信' : '支付宝'
  const label = busy ? '正在下单…' : pending ? (test ? '继续测试付款' : '继续支付') : name + (test ? '测试支付' : '扫码充值')
  return <button type="button" className={`wallet-pay-button wallet-pay-button--checkout${test ? ' wallet-pay-button--secondary' : ''}`}
    disabled={Boolean(disabled || unavailable || busy)} onClick={onClick}>
    <QrCode aria-hidden="true" />
    <span>{label}{unavailable && <small>暂未开放</small>}</span>
  </button>
}

export function WalletRechargePanel({ provider, defaultOpen, children }: {
  provider: 'wechat' | 'alipay'; defaultOpen?: boolean; children: ReactNode
}) {
  // Native details allows keyboard access and leaves issued orders mounted for status checks.
  return <details className="wallet-recharge-panel" open={defaultOpen ? true : undefined}>
    <summary><QrCode aria-hidden="true" /><span>{provider === 'wechat' ? '微信充值' : '支付宝充值'}</span><ChevronDown aria-hidden="true" /></summary>
    <div className="wallet-recharge-panel-body">{children}</div>
  </details>
}

export function WalletAmountPicker({ disabled, busy, onConfirm, label }: {
  disabled?: boolean; busy?: boolean; onConfirm: (yuan: number) => void; label: string
}) {
  const group = useId()
  const [mode, setMode] = useState<200 | 600 | 1000 | 'custom'>(200)
  const [custom, setCustom] = useState('')
  const digits = custom.trim()
  const value = mode === 'custom' ? /^\d{1,4}$/.test(digits) ? Number(digits) : 0 : mode
  const valid = Number.isInteger(value) && value >= 200 && value <= 1000
  return <form className="wallet-amount-form" onSubmit={event => {
    event.preventDefault()
    if (!disabled && !busy && valid) onConfirm(value)
  }}>
    <fieldset disabled={disabled || busy}>
      <legend>选择充值金额</legend>
      <div className="wallet-amount-options">
        {([200, 600, 1000, 'custom'] as const).map(option => <label key={option}>
          <input type="radio" name={group} checked={mode === option} onChange={() => setMode(option)} />
          <span>{option === 'custom' ? '自定义' : `¥${pointsNumber.format(option)}`}</span>
        </label>)}
      </div>
      {mode === 'custom' && <label className="wallet-custom-amount">
        <span>自定义金额（元）</span>
        <input inputMode="numeric" placeholder="200–1000" value={custom}
          aria-describedby={`${group}-hint`} onChange={event => setCustom(event.target.value)} />
        <span id={`${group}-hint`} className="wallet-amount-hint">可输入 200 至 1000 元的整数。</span>
      </label>}
    </fieldset>
    <div className="wallet-amount-total">
      <span aria-live="polite">{valid ? <>支付 <strong>¥{pointsNumber.format(value)}</strong> · 到账 <strong>{pointsNumber.format(value)} 积分</strong></> : '请输入有效金额'}</span>
      <button className="wallet-pay-button" type="submit" disabled={disabled || busy || !valid}>
        <QrCode aria-hidden="true" />{busy ? '正在下单…' : label}
      </button>
    </div>
  </form>
}
