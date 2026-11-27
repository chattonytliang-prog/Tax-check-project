export const alipayOrderIdPattern = /^ali[0-9a-f]{29}$/

export function getReturnedAlipayOrder() {
  const id = new URLSearchParams(window.location.search).get('alipay_order')
  return id && alipayOrderIdPattern.test(id) ? id : null
}

export function reserveAlipayCheckoutTab() {
  let tab: Window | null = null
  try {
    // Reserve the tab while the click still grants permission; the URL arrives later.
    tab = window.open('about:blank', '_blank')
    if (!tab) return null
    tab.opener = null
    if (tab.opener !== null) throw new Error('Could not detach checkout tab')
    tab.document.title = '支付宝收银台'
    if (tab.document.body) tab.document.body.textContent = '正在打开支付宝收银台…'
    return tab
  } catch {
    tab?.close()
    return null
  }
}
