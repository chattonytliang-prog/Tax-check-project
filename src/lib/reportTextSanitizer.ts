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
    .replace(/([。！？；，、])\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

  return customerFacingReportText(localizeInternalFieldNames(cleaned))
}

export function publicRiskBasis(basis: string) {
  if (/^基于现有字段的自动检测规则\s*[:：]/.test(basis)) {
    return genericFieldBasedBasis
  }
  return publicRiskReason(basis)
}

export function isCustomerFacingReportFact(item: { label: string; value: string }) {
  return !/(规则执行|已执行规则|未执行规则|规则引擎|规则库|确定性规则)/.test(`${item.label}${item.value}`)
}

export function customerFacingReportText(text: string) {
  return String(text || '')
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .replace(/^规则执行覆盖[：:]?[^\n]*(?:\n|$)/gm, '')
    .replace(/^规则执行情况[：:]?[^\n]*(?:\n|$)/gm, '')
    .replace(/在已提供资料和已执行规则范围内/g, '在已提供资料和本次检查范围内')
    .replace(/已执行规则的结论/g, '本次检查结论')
    .replace(/已执行规则综合等级/g, '本次检查综合等级')
    .replace(/因资料不足而未执行的规则/g, '资料不足暂未判断的事项')
    .replace(/因资料不足未执行的规则/g, '资料不足暂未判断的事项')
    .replace(/未执行规则/g, '资料不足暂未判断事项')
    .replace(/规则引擎已经命中的风险结论/g, '已识别的风险结论')
    .replace(/规则引擎/g, '系统检查')
    .replace(/系统规则库/g, '已选档案数据')
    .replace(/确定性规则/g, '检查条件')
    .replace(/系统规则命中原因为/g, '当前发现为')
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function sanitizePublicReportContent(content: string) {
  return customerFacingReportText(content
    .replace(/[（(]\s*Issue\s+[A-Z-]*\d+\s*[)）]/gi, '')
    .replace(/\bIssue\s+[A-Z-]*\d+\b/gi, '风险事项')
    .replace(/\b(issueId|code)\s*[:：=]\s*[A-Z-]*\d+\b/gi, '')
    .replace(/\b[a-z][A-Za-z0-9_]*(?:\s*[=!<>]=?\s*(?:true|false|\d+(?:\.\d+)?|'[^']*'|"[^"]*"))/g, '内部检测条件')
    .replace(/([。！？；，、])\1+/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim())
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
