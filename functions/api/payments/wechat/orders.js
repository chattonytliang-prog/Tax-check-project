import { createWechatOrder, standardCheckout } from '../../_wechat_checkout.js'

export function onRequestPost(context) {
  return createWechatOrder(context, standardCheckout)
}
