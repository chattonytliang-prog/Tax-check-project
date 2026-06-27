import { conditionFields } from './ruleEngine'

export const genericFieldBasedBasis =
  '系统基于已录入字段进行交叉校验，提示该事项需要结合合同、发票、申报表、账务明细和资金流水进一步复核。'

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const reportFieldLabels = conditionFields
  .filter((field) => field.value && field.label && field.value !== field.label)
  .sort((left, right) => right.value.length - left.value.length)

export function localizeInternalFieldNames(text: string) {
  return reportFieldLabels.reduce((current, field) => {
    const keyPattern = escapeRegExp(field.value)
    const labelPattern = escapeRegExp(field.label)

    return current
      .replace(new RegExp(`${labelPattern}\\s+${keyPattern}\\b`, 'g'), field.label)
      .replace(new RegExp(`\\b${keyPattern}\\b`, 'g'), field.label)
  }, text)
}

export function publicRiskReason(reason: string) {
  const cleaned = reason
    .replace(/[（(]\s*执行条件\s*[:：][^）)]*[）)]/g, '')
    .replace(/^基于现有字段的自动检测规则\s*[:：]\s*/, '系统检测到')
    .replace(/\s+/g, ' ')
    .trim()

  return localizeInternalFieldNames(cleaned)
}

export function publicRiskBasis(basis: string) {
  if (/^基于现有字段的自动检测规则\s*[:：]/.test(basis)) {
    return genericFieldBasedBasis
  }
  return publicRiskReason(basis)
}
