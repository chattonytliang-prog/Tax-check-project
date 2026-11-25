import { createWechatOrder, testCheckout } from '../../_wechat_checkout.js'

export function onRequestPost(context) {
  return createWechatOrder(context, testCheckout)
}
