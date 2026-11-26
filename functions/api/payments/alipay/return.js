import { alipayOrderId, noStore } from '../../_alipay.js'

export function onRequestGet({ request }) {
  const id = new URL(request.url).searchParams.get('out_trade_no')
  // Browser returns only navigate. They never change an order or wallet, even if signed.
  const location = alipayOrderId.test(id || '') ? `/?alipay_order=${id}` : '/'
  return new Response(null, { status: 303, headers: { ...noStore, location, 'referrer-policy': 'no-referrer' } })
}
