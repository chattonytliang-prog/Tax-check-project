export const genericFieldBasedBasis =
  '系统基于已录入字段进行交叉校验，提示该事项需要结合合同、发票、申报表、账务明细和资金流水进一步复核。'

export function publicRiskReason(reason: string) {
  return reason
    .replace(/[（(]\s*执行条件\s*[:：][^）)]*[）)]/g, '')
    .replace(/^基于现有字段的自动检测规则\s*[:：]\s*/, '系统检测到')
    .replace(/\s+/g, ' ')
    .trim()
}

export function publicRiskBasis(basis: string) {
  if (/^基于现有字段的自动检测规则\s*[:：]/.test(basis)) {
    return genericFieldBasedBasis
  }
  return publicRiskReason(basis)
}
