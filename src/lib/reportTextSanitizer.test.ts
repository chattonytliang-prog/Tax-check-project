import { describe, expect, it } from 'vitest'
import {
  genericFieldBasedBasis,
  localizeInternalFieldNames,
  publicRiskBasis,
  publicRiskReason,
  sanitizePublicReportContent,
} from './reportTextSanitizer'

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

  it('localizes internal field keys in report-facing text', () => {
    const reason =
      '收款流水 collectionFlow 值为 2,400,000，与月收入 monthlyRevenue 200,000 比较时口径不一致（collectionFlow 可能是年度累计），建议确认数据口径。'

    const output = publicRiskReason(reason)

    expect(output).toBe(
      '收款流水 值为 2,400,000，与月收入 200,000 比较时口径不一致（收款流水 可能是年度累计），建议确认数据口径。',
    )
    expect(output).not.toMatch(/\b(collectionFlow|monthlyRevenue)\b/)
  })

  it('localizes internal field keys in specific review basis text', () => {
    expect(publicRiskBasis('依据 collectionFlow 与 monthlyRevenue 差异进一步复核。')).toBe(
      '依据 收款流水 与 月收入 差异进一步复核。',
    )
  })

  it('keeps already-localized labels from being duplicated', () => {
    expect(localizeInternalFieldNames('收款流水 collectionFlow 与月收入 monthlyRevenue 需要复核。')).toBe(
      '收款流水 与月收入 需要复核。',
    )
  })

  it('removes internal issue ids and simple rule expressions from report content', () => {
    const content = `
      高风险事项（Issue VAT-001）
      issueId: VAT-001
      outputTax > 100000
      建议复核。
    `

    const output = sanitizePublicReportContent(content)

    expect(output).toContain('高风险事项')
    expect(output).toContain('相关规则条件')
    expect(output).toContain('建议复核。')
    expect(output).not.toMatch(/Issue VAT-001|issueId: VAT-001|outputTax > 100000/)
  })
})
