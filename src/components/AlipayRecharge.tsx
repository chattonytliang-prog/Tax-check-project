import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, RefreshCcw } from 'lucide-react'
import { apiGet, apiSend } from '../lib/apiClient'
import { alipayOrderIdPattern } from '../lib/alipayCheckout'

const endpoint = '/api/payments/alipay'

type Order = { id: string; status: 'pending' | 'expired' | 'paid'; amountFen: number; points: number; expiresAt: string }
type Tier = Pick<Order, 'amountFen' | 'points'>
type Config = Tier & { enabled: boolean; test?: Tier }

export function AlipayRecharge({ userId, returnOrderId, onPaid }: {
  userId: string; returnOrderId: string | null; onPaid: () => void
}) {
  const storageKey = `alipay-checkout-${userId}`
  const [config, setConfig] = useState<Config | null>(null)
  const [orderId, setOrderId] = useState(() => returnOrderId || sessionStorage.getItem(storageKey))
  const [order, setOrder] = useState<Order | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requestIds = useRef({ orders: '', 'test-order': '' })
  const reportedPaid = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    apiGet<Config>(`${endpoint}/config`).then((value) => { if (active) setConfig(value) })
      .catch(() => { if (active) setConfig({ enabled: false, amountFen: 20000, points: 200 }) })
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

  async function openCheckout(route: 'orders' | 'test-order') {
    const tier = route === 'test-order' ? config?.test : config?.enabled ? config : undefined
    if (!tier || busy) return
    if (!requestIds.current[route] || (order?.amountFen === tier.amountFen && order.status !== 'pending')) {
      requestIds.current[route] = crypto.randomUUID()
    }
    setBusy(true)
    setError('')
    try {
      const result = await apiSend<{ order: Order; checkoutUrl: string | null }>(`${endpoint}/${route}`, 'POST', { requestId: requestIds.current[route] })
      if (result.order.amountFen !== tier.amountFen || result.order.points !== tier.points) {
        throw new Error('支付宝订单档位不匹配，未打开收银台。')
      }
      setOrder(result.order)
      setOrderId(result.order.id)
      if (result.order.status !== 'pending') {
        requestIds.current[route] = ''
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

  if (!config?.enabled && !config?.test && !orderId && !error) return null
  const amount = (config?.amountFen ?? 20000) / 100
  const disabled = busy || Boolean(orderId && !order)
  return <section className="payment-code-panel" aria-label="支付宝充值">
    <h3>支付宝充值</h3>
    <p>在电脑浏览器打开支付宝收银台，付款确认后自动加积分。</p>
    {order?.status === 'paid' && <p role="status">付款成功，{order.points} 积分已到账。</p>}
    {orderId && order?.status !== 'paid' && <>
      <p className="payment-order-number">订单：{orderId}{order && ` · ${order.amountFen / 100} 元 / ${order.points} 积分`}</p>
      <p role="status">{order?.status === 'expired' ? '付款链接已到期。如已付款，请先查询到账。' : '正在等待支付宝确认。如已付款，请勿重复支付。'}</p>
      <button className="secondary-button" type="button" onClick={() => void checkOrder()} disabled={busy}><RefreshCcw />查询到账</button>
    </>}
    {error && <p role="alert">{error}</p>}
    {config?.enabled && <button className="primary-button" type="button" onClick={() => void openCheckout('orders')} disabled={disabled}>
      <ArrowUpRight />{order?.status === 'pending' && order.amountFen === config.amountFen ? `继续支付 ${amount} 元` : `支付宝支付 ${amount} 元`}
    </button>}
    {config?.test && <button className="secondary-button" type="button" onClick={() => void openCheckout('test-order')} disabled={disabled}>
      <ArrowUpRight />{order?.status === 'pending' && order.amountFen === config.test.amountFen ? '继续支付 1 元测试订单' : '支付宝测试支付 1 元（+1 积分）'}
    </button>}
  </section>
}
