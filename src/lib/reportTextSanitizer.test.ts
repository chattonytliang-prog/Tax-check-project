import { describe, expect, it } from 'vitest'
import { genericFieldBasedBasis, publicRiskBasis, publicRiskReason } from './reportTextSanitizer'

describe('report text sanitizer', () => {
  it('removes internal execution conditions from customer-facing reasons', () => {
    const reason = '供应商无进项且存在较大进项税额。（执行条件：全部满足：供应商无进项 = true；进项税额 > 100000）'

    expect(publicRiskReason(reason)).toBe('供应商无进项且存在较大进项税额。')
  })

  it('removes internal execution conditions written with half-width punctuation', () => {
    const reason = '开票金额高于收款流水 (执行条件: 开票金额 > 收款流水)'

    expect(publicRiskReason(reason)).toBe('开票金额高于收款流水')
  })

  it('turns generic automatic-rule prefixes into business-facing language', () => {
    expect(publicRiskReason('基于现有字段的自动检测规则：供应商无进项且存在较大进项税额。')).toBe(
      '系统检测到供应商无进项且存在较大进项税额。',
    )
  })

  it('replaces generic field-based basis with a professional review basis', () => {
    expect(publicRiskBasis('基于现有字段的自动检测规则：供应商无进项且存在较大进项税额。')).toBe(
      genericFieldBasedBasis,
    )
  })

  it('keeps specific tax policy basis while still removing leaked conditions', () => {
    const basis = '依据增值税发票管理相关要求复核。（执行条件：内部阈值 > 100000）'

    expect(publicRiskBasis(basis)).toBe('依据增值税发票管理相关要求复核。')
  })
})
