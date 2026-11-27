import { afterEach, describe, expect, it, vi } from 'vitest'
import { reserveAlipayCheckoutTab } from './alipayCheckout'

afterEach(() => vi.unstubAllGlobals())

describe('Alipay checkout tab', () => {
  it('reserves a new tab and detaches the original page before navigation', () => {
    const tab = { opener: {}, document: { title: '', body: { textContent: '' } }, close: vi.fn() }
    const open = vi.fn(() => tab)
    vi.stubGlobal('window', { open })

    expect(reserveAlipayCheckoutTab()).toBe(tab)
    expect(open).toHaveBeenCalledWith('about:blank', '_blank')
    expect(tab.opener).toBeNull()
    expect(tab.document.title).toBe('支付宝收银台')
    expect(tab.close).not.toHaveBeenCalled()
  })

  it('leaves the original page in place when the browser blocks new tabs', () => {
    vi.stubGlobal('window', { open: vi.fn(() => null) })
    expect(reserveAlipayCheckoutTab()).toBeNull()
  })

  it('closes a tab that cannot be detached', () => {
    const close = vi.fn()
    const tab = Object.defineProperty({ close }, 'opener', { value: {}, writable: false })
    vi.stubGlobal('window', { open: vi.fn(() => tab) })

    expect(reserveAlipayCheckoutTab()).toBeNull()
    expect(close).toHaveBeenCalledOnce()
  })
})
