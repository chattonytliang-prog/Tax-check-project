import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { QrCode, RefreshCcw } from 'lucide-react'
import { apiGet, apiSend } from '../lib/apiClient'

type Order = { id: string; status: 'pending' | 'expired' | 'paid'; codeUrl: string | null; expiresAt: string; points: number; amountFen: number }

export function WechatRecharge({ userId, onPaid }: { userId: string; onPaid: () => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [order, setOrder] = useState<Order | null>(null)
  const [qr, setQr] = useState<{ orderId: string; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const onPaidRef = useRef(onPaid)
  const requestId = useRef(crypto.randomUUID())
  const storageKey = `wechat-checkout-${userId}`
  useEffect(() => { onPaidRef.current = onPaid }, [onPaid])

  useEffect(() => {
    let active = true
    apiGet<{ enabled: boolean }>('/api/payments/wechat/config').then((config) => {
      if (active) setEnabled(config.enabled)
    }).catch(() => { if (active) setError('支付状态查询失败，请刷新页面重试。') })
    const previous = sessionStorage.getItem(storageKey)
    if (previous) apiGet<{ order: Order }>(`/api/payments/wechat/orders/${encodeURIComponent(previous)}`)
      .then((result) => { if (active) setOrder(result.order) }).catch(() => { if (active) setError('上次订单查询暂不可用，请稍后重试，勿重复付款。') })
    return () => { active = false }
  }, [storageKey])

  useEffect(() => {
    let active = true
    if (order?.codeUrl && order.status === 'pending') {
      QRCode.toDataURL(order.codeUrl, { width: 280, margin: 4, errorCorrectionLevel: 'M' })
        .then((url) => { if (active) setQr({ orderId: order.id, url }) }).catch(() => { if (active) setError('二维码生成失败，请刷新后重试。') })
    }
    return () => { active = false }
  }, [order?.codeUrl, order?.status, order?.id])

  useEffect(() => {
    if (!order || order.status !== 'pending') return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      if (!active) return
      setNow(Date.now())
      if (document.visibilityState !== 'hidden') {
        try {
          const result = await apiGet<{ order: Order }>(`/api/payments/wechat/orders/${order.id}`)
          if (!active) return
          setOrder(result.order)
          setError('')
          if (result.order.status === 'paid') return
        } catch { if (active) setError('到账查询暂不可用，请勿重复付款，稍后重试。') }
      }
      if (active && Date.now() < Date.parse(order.expiresAt) + 60000) timer = setTimeout(() => void poll(), 6000)
    }
    timer = setTimeout(() => void poll(), 6000)
    return () => { active = false; clearTimeout(timer) }
  }, [order?.id, order?.status, order?.expiresAt]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (order?.status === 'paid') {
      sessionStorage.removeItem(storageKey)
      onPaidRef.current()
    }
  }, [order?.status, storageKey])

  async function createOrder() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await apiSend<{ order: Order }>('/api/payments/wechat/orders', 'POST', { requestId: requestId.current })
      setOrder(result.order)
      setNow(Date.now())
      sessionStorage.setItem(storageKey, result.order.id)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '下单失败，请重试。') }
    finally { setBusy(false) }
  }

  async function checkOrder() {
    if (!order || busy) return
    setBusy(true)
    try {
      const result = await apiGet<{ order: Order }>(`/api/payments/wechat/orders/${order.id}`)
      setOrder(result.order)
      setNow(Date.now())
      setError('')
    } catch { setError('订单查询暂不可用，请稍后重试，勿重复付款。') }
    finally { setBusy(false) }
  }

  const expired = order && now >= Date.parse(order.expiresAt)
  return <div className="payment-code-panel">
    <h3>微信充值 200 元</h3>
    <p>到账后增加 200 积分。</p>
    {enabled === false && <p>微信支付尚未启用，暂不能付款。</p>}
    {enabled === null && !error && <p>正在查询支付状态...</p>}
    {order?.status === 'paid' ? <p role="status">付款成功，200 积分已到账。</p> : <>
      {qr && qr.orderId === order?.id && !expired && <img src={qr.url} width={280} height={280} style={{ maxWidth: '100%', height: 'auto' }} alt="本次充值订单的微信支付二维码" />}
      {order && <><p className="payment-order-number">订单：{order.id}</p><p>{expired ? '二维码已到期；如已付款，请查询到账状态。' : '请使用微信扫码付款，系统自动核实到账。'}</p></>}
    </>}
    {error && <p role="alert" className="period-warning">{error}</p>}
    {(!order || order.status === 'paid') && <button className="primary-button" disabled={!enabled || busy} onClick={() => {
      if (order?.status === 'paid') requestId.current = crypto.randomUUID()
      void createOrder()
    }}><QrCode />{busy ? '正在下单...' : '微信支付 200 元'}</button>}
    {order && order.status !== 'paid' && <button className="secondary-button" disabled={busy} onClick={() => void checkOrder()}><RefreshCcw />查询到账</button>}
    {expired && order?.status !== 'paid' && <button className="secondary-button" disabled={!enabled || busy} onClick={() => {
      requestId.current = crypto.randomUUID()
      void createOrder()
    }}><QrCode />重新下单</button>}
  </div>
}
