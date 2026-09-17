import { describe, expect, it } from 'vitest'
import { classifyVatSlot } from './summary.js'

describe('VAT archive slots', () => {
  it('keeps the general return in the main slot despite 附加税费 in its title', () => {
    expect(classifyVatSlot('增值税及附加税费申报表')).toBe('vat-return-main')
    expect(classifyVatSlot('增值税及附加税费申报表附列资料（四）')).toBe('vat-schedule-4')
    expect(classifyVatSlot('增值税及附加税费申报表附列资料（一）')).toBe('vat-other-schedules')
  })
})
