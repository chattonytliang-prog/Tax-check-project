import { describe, expect, it } from 'vitest'
import { reportDocumentId } from './reportDocumentId'

describe('reportDocumentId', () => {
  it('uses the created date and credit code when available', () => {
    expect(
      reportDocumentId({
        creditCode: 'TESTHIGH2025Y',
        clientName: '苏州异常贸易有限公司',
        createdAt: '2026-06-25T04:20:00+08:00',
      }),
    ).toBe('HY-TAX-20260625-TESTHIGH2025')
  })

  it('falls back to sanitized client name for legacy or incomplete records', () => {
    expect(
      reportDocumentId({
        clientName: '苏州/异常:贸易 有限公司',
        createdAt: '2026-06-25',
      }),
    ).toBe('HY-TAX-20260625-苏州异常贸易有限公司')
  })
})
