import { describe, expect, it } from 'vitest'
import { explicitDerivedMetadata } from './explicitDerivedFields'

describe('explicit derived field metadata', () => {
  it('protects cumulative values supplied by source evidence', () => {
    const result = explicitDerivedMetadata(
      { ytdProfit: 921700.69, monthlyProfit: undefined },
      ['monthlyProfit', 'ytdProfit'],
      {},
      {},
      '原始资料导入值',
    )

    expect(result.fields).toEqual({ ytdProfit: true })
    expect(result.reasons).toEqual({ ytdProfit: '原始资料导入值' })
  })

  it('preserves existing overrides and accepts an explicit zero', () => {
    const result = explicitDerivedMetadata(
      { monthlyProfit: 0 },
      ['monthlyProfit', 'ytdProfit'],
      { ytdProfit: true },
      { ytdProfit: '已确认累计值' },
      '用户对话明确值',
    )

    expect(result.fields).toEqual({ ytdProfit: true, monthlyProfit: true })
    expect(result.reasons.monthlyProfit).toBe('用户对话明确值')
  })
})
