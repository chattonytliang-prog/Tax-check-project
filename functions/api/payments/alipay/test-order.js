import { alipayTestCheckout } from '../../_alipay.js'
import { createAlipayOrder } from './orders.js'

export function onRequestPost(context) {
  return createAlipayOrder(context, alipayTestCheckout)
}
