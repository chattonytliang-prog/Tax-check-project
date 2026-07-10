import { describe, expect, it } from 'vitest'
import { dedupeToolCalls } from './tools.js'

const call = (name) => ({ name, arguments: {}, reason: 'test', requiresConfirmation: false })

describe('assistant business tool execution', () => {
  it('writes a client only once for one natural-language authorization', () => {
    const result = dedupeToolCalls([
      call('create_or_update_company'),
      call('save_period_data'),
      call('create_import_audit_log'),
      call('save_current_draft'),
    ])

    expect(result.map((item) => item.name)).toEqual(['save_current_draft'])
  })

  it('preserves non-client tools while removing duplicate names', () => {
    const result = dedupeToolCalls([
      call('attach_source_material'),
      call('attach_source_material'),
      call('save_standardized_tax_data'),
      call('save_standardized_tax_data'),
      call('save_customer_memory'),
    ])

    expect(result.map((item) => item.name)).toEqual([
      'attach_source_material',
      'save_standardized_tax_data',
      'save_customer_memory',
    ])
  })
})
