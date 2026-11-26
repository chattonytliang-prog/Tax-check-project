import { useEffect, useRef, useState } from 'react'
import { RefreshCcw } from 'lucide-react'
import { apiGet, apiSend } from '../lib/apiClient'
import { alipayOrderIdPattern } from '../lib/alipayCheckout'
import { WalletAmountPicker, WalletPaymentTier, WalletRechargeButton, WalletRechargePanel } from './PointsWallet'

const endpoint = '/api/payments/alipay'

type Order = { id: string; status: 'pending' | 'expired' | 'paid'; amountFen: number; points: number; expiresAt: string }
type Tier = Pick<Order, 'amountFen' | 'points'>
type Config = Tier & { enabled: boolean; test?: Tier }

export function AlipayRecharge({ userId, returnOrderId, onPaid }: {
  userId: string; returnOrderId: string | null; onPaid: () => void
}) {
  const storageKey = `alipay-checkout-${userId}`
  const [config, setConfig] = useState<Config | null>(null)
  const [configFailed, setConfigFailed] = useState(false)
  const [orderId, setOrderId] = useState(() => returnOrderId || sessionStorage.getItem(storageKey))
  const [order, setOrder] = useState<Order | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requestIds = useRef({ orders: { id: '', yuan: 0 }, 'test-order': { id: '', yuan: 0 } })
  const reportedPaid = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    apiGet<Config>(`${endpoint}/config`).then((value) => { if (active) setConfig(value) })
      .catch(() => { if (active) setConfigFailed(true) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!orderId || !alipayOrderIdPattern.test(orderId)) return
    let active = true
    let timeout: ReturnType<typeof setTimeout>
    const deadline = Date.now() + 90_000
    const check = async () => {
      if (!active) return
      if (document.visibilityState !== 'hidden') {
        try {
          const result = await apiGet<{ order: Order }>(`${endpoint}/orders/${orderId}`)
          if (!active) return
          setOrder(result.order)
          setError('')
          if (result.order.status !== 'pending') return
        } catch (cause) {
          if (!active) return
          if (cause instanceof Error && cause.message === '订单不存在') {
            if (sessionStorage.getItem(storageKey) === orderId) sessionStorage.removeItem(storageKey)
            setOrderId(null)
            setError('当前账户没有这笔支付宝订单。')
            return
          }
          setError('暂未查询到到账状态。如已付款，请勿重复支付。')
        }
      }
      if (active && Date.now() < deadline) timeout = setTimeout(() => void check(), 6000)
    }
    void check()
    return () => { active = false; clearTimeout(timeout) }
  }, [orderId, storageKey])

  useEffect(() => {
    if (order?.status === 'paid' && reportedPaid.current !== order.id) {
      reportedPaid.current = order.id
      if (sessionStorage.getItem(storageKey) === order.id) sessionStorage.removeItem(storageKey)
      onPaid()
    }
  }, [order, storageKey, onPaid])

  async function openCheckout(route: 'orders' | 'test-order', yuan: number) {
    const allowed = route === 'test-order' ? config?.test?.points === yuan : config?.enabled
    if (!allowed || busy) return
    const attempt = requestIds.current[route]
    if (!attempt.id || attempt.yuan !== yuan || (order?.amountFen === yuan * 100 && order.status !== 'pending')) {
      requestIds.current[route] = { id: crypto.randomUUID(), yuan }
    }
    setBusy(true)
    setError('')
    try {
      const result = await apiSend<{ order: Order; checkoutUrl: string | null }>(`${endpoint}/${route}`, 'POST', {
        requestId: requestIds.current[route].id, ...(route === 'orders' && { rechargeYuan: yuan }),
      })
      if (result.order.amountFen !== yuan * 100 || result.order.points !== yuan) {
        throw new Error('支付宝订单档位不匹配，未打开收银台。')
      }
      setOrder(result.order)
      setOrderId(result.order.id)
      if (result.order.status !== 'pending') {
        requestIds.current[route] = { id: '', yuan: 0 }
        return
      }
      if (!result.checkoutUrl) throw new Error('未能打开支付宝收银台。')
      const target = new URL(result.checkoutUrl)
      if (target.origin !== 'https://openapi.alipay.com' || target.pathname !== '/gateway.do' || target.username || target.password) {
        throw new Error('支付宝收银台地址无效。')
      }
      sessionStorage.setItem(storageKey, result.order.id)
      window.location.assign(target.href)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '未能打开支付宝收银台。') }
    finally { setBusy(false) }
  }

  async function checkOrder() {
    if (!orderId || busy || !alipayOrderIdPattern.test(orderId)) return
    setBusy(true)
    try {
      const result = await apiGet<{ order: Order }>(`${endpoint}/orders/${orderId}`)
      setOrder(result.order)
      setError('')
    } catch { setError('暂未查询到到账状态。如已付款，请勿重复支付。') }
    finally { setBusy(false) }
  }

  const disabled = busy || Boolean(orderId && !order)
  const pendingStandard = order?.status === 'pending' && order.points >= 200 ? order : null
  const testTier = config?.test
  return <WalletRechargePanel provider="alipay" defaultOpen={Boolean(orderId)}>
    {config?.enabled && (pendingStandard ?
      <WalletPaymentTier amountFen={pendingStandard.amountFen} points={pendingStandard.points}>
        <WalletRechargeButton provider="alipay" disabled={disabled} pending onClick={() => void openCheckout('orders', pendingStandard.points)} />
      </WalletPaymentTier> : <WalletAmountPicker label="打开支付宝收银台" busy={busy} disabled={disabled}
        onConfirm={yuan => void openCheckout('orders', yuan)} />)}
    {testTier && <WalletPaymentTier amountFen={testTier.amountFen} points={testTier.points} test>
      <WalletRechargeButton provider="alipay" test disabled={disabled}
        pending={order?.status === 'pending' && order.amountFen === testTier.amountFen}
        onClick={() => void openCheckout('test-order', testTier.points)} />
    </WalletPaymentTier>}
    {!config && !orderId && <p className="wallet-channel-state" role={configFailed ? 'alert' : 'status'}>
      {configFailed ? '暂时无法查询支付宝，请刷新页面重试。' : '正在查询支付状态…'}
    </p>}
    {config && !config.enabled && !config.test && !orderId && <p className="wallet-channel-state">当前账号暂未开放支付宝充值。</p>}
    {order?.status === 'paid' && <p className="wallet-notice wallet-notice--success" role="status">付款成功，{order.points} 积分已到账。</p>}
    {orderId && order?.status !== 'paid' && <div className="wallet-order">
      <p className="wallet-order-title" role="status">{order?.status === 'expired' ? '付款链接已到期' : '等待支付宝付款确认'}</p>
      <p>如已付款，请先查询到账，不要重复付款。</p>
      <p className="wallet-order-code">{order && <span>¥{order.amountFen / 100} · {order.points} 积分</span>}订单号 <code>{orderId}</code></p>
      <button className="wallet-pay-button wallet-pay-button--secondary" type="button" onClick={() => void checkOrder()} disabled={busy}><RefreshCcw aria-hidden="true" />查询到账</button>
    </div>}
    {error && <p role="alert" className="wallet-notice wallet-notice--error">{error}</p>}
  </WalletRechargePanel>
}
