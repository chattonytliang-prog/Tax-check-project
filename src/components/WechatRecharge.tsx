import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { QrCode, RefreshCcw } from 'lucide-react'
import { apiGet, apiSend } from '../lib/apiClient'
import { WalletPaymentTier, WalletRechargeButton } from './PointsWallet'

type Order = { id: string; status: 'pending' | 'expired' | 'paid'; codeUrl: string | null; expiresAt: string; points: number; amountFen: number }
type Denomination = { amountFen: number; points: number }
type PaymentConfig = Denomination & { enabled: boolean; test?: Denomination }

export function WechatRecharge({ userId, onPaid }: { userId: string; onPaid: () => void }) {
  const [status, setStatus] = useState<{ userId: string; config?: PaymentConfig } | null>(null)
  useEffect(() => {
    let active = true
    apiGet<PaymentConfig>('/api/payments/wechat/config').then((config) => {
      if (active) setStatus({ userId, config })
    }).catch(() => { if (active) setStatus({ userId }) })
    return () => { active = false }
  }, [userId])

  const current = status?.userId === userId ? status : null
  const config = current?.config
  return <div>
    <WechatCheckout key={userId} storageKey={`wechat-checkout-${userId}`} onPaid={onPaid}
      amountFen={config?.amountFen ?? 20000} points={config?.points ?? 200} enabled={config?.enabled ?? null}
      configFailed={Boolean(current && !config)} />
    {config?.enabled && config.test && <WechatCheckout key={`${userId}-test`} storageKey={`wechat-checkout-${userId}-test`}
      onPaid={onPaid} {...config.test} enabled isTest />}
  </div>
}

function WechatCheckout({ storageKey, onPaid, amountFen, points, enabled, configFailed, isTest = false }: Denomination & {
  storageKey: string; onPaid: () => void; enabled: boolean | null; configFailed?: boolean; isTest?: boolean
}) {
  const [order, setOrder] = useState<Order | null>(null)
  const [qr, setQr] = useState<{ orderId: string; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const onPaidRef = useRef(onPaid)
  const requestId = useRef(crypto.randomUUID())
  useEffect(() => { onPaidRef.current = onPaid }, [onPaid])

  useEffect(() => {
    let active = true
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
      const endpoint = isTest ? 'test-order' : 'orders'
      const result = await apiSend<{ order: Order }>(`/api/payments/wechat/${endpoint}`, 'POST', { requestId: requestId.current })
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
  return <div className="wallet-checkout">
    {(enabled || order) ? <WalletPaymentTier amountFen={amountFen} points={points} test={isTest}>
      {(!order || order.status === 'paid') && <WalletRechargeButton provider="wechat" test={isTest}
        disabled={!enabled} busy={busy} onClick={() => {
          if (order?.status === 'paid') requestId.current = crypto.randomUUID()
          void createOrder()
        }} />}
      {order && order.status !== 'paid' && <button type="button" className="wallet-pay-button wallet-pay-button--secondary"
        disabled={busy} onClick={() => void checkOrder()}><RefreshCcw aria-hidden="true" />查询到账</button>}
    </WalletPaymentTier> : <p className="wallet-channel-state" role={configFailed ? 'alert' : 'status'}>
      {configFailed ? '暂时无法查询微信支付，请稍后刷新。' : enabled === null ? '正在查询支付状态…' : '当前账号暂未开放微信支付。'}
    </p>}
    {order?.status === 'paid' && <p className="wallet-notice wallet-notice--success" role="status">付款成功，{order.points} 积分已到账。</p>}
    {order && order.status !== 'paid' && <div className="wallet-order">
      <p className="wallet-order-title" role="status">{expired ? '二维码已到期' : '等待微信付款确认'}</p>
      <p>{expired ? '如已付款，请先查询到账，不要重复付款。' : '请使用微信扫码；如已付款，请勿重复支付。'}</p>
      {qr && qr.orderId === order.id && !expired && <img className="wallet-order-qr" src={qr.url} width={168} height={168} alt="本次充值订单的微信支付二维码" />}
      <p className="wallet-order-code">订单号 <code>{order.id}</code></p>
      {expired && <button type="button" className="wallet-pay-button wallet-pay-button--secondary" disabled={!enabled || busy} onClick={() => {
        requestId.current = crypto.randomUUID()
        void createOrder()
      }}><QrCode aria-hidden="true" />重新下单</button>}
    </div>}
    {error && <p role="alert" className="wallet-notice wallet-notice--error">{error}</p>}
  </div>
}
