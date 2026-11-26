export const alipayOrderIdPattern = /^ali[0-9a-f]{29}$/

export function getReturnedAlipayOrder() {
  const id = new URLSearchParams(window.location.search).get('alipay_order')
  return id && alipayOrderIdPattern.test(id) ? id : null
}
