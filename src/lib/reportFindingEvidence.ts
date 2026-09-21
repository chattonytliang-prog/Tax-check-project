import {
  conditionFields,
  conditionRequiredFields,
  type ClientSnapshot,
  type RuleCondition,
} from './ruleEngine'

export type ReportFindingInputEvidence = {
  label: string
  value: string
  basis: string
}

type ReportFindingInputEvidenceOptions = {
  condition?: RuleCondition
  requiredFields?: string[]
  values: ClientSnapshot
  standardMetricCoverage?: string[]
  explicitFields?: Record<string, boolean>
  autoDerivedSources?: Record<string, string>
  additionalLabels?: Record<string, string>
}

function reportFindingInputValue(value: unknown) {
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
  }
  return String(value ?? '').trim()
}

export function buildReportFindingInputEvidence(options: ReportFindingInputEvidenceOptions) {
  const standardMetricCoverage = new Set(options.standardMetricCoverage || [])
  const fields = Array.from(new Set([
    ...conditionRequiredFields(options.condition),
    ...(options.requiredFields || []),
  ]))

  return fields.flatMap((field): ReportFindingInputEvidence[] => {
    const label = conditionFields.find((item) => item.value === field)?.label
      || options.additionalLabels?.[field]
    const value = reportFindingInputValue(options.values[field])
    if (!label || !value) return []

    let basis = '企业档案或已选期间数据'
    if (standardMetricCoverage.has(field)) {
      basis = '标准资料已形成指标'
    } else if (options.explicitFields?.[field]) {
      basis = '资料或用户明确值'
    } else if (options.autoDerivedSources?.[field]) {
      basis = `系统推导（${options.autoDerivedSources[field]}）`
    }

    return [{ label, value, basis }]
  })
}

export function reportFindingInputEvidenceList(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is ReportFindingInputEvidence => Boolean(
    item
    && typeof item === 'object'
    && typeof item.label === 'string'
    && item.label.trim()
    && typeof item.value === 'string'
    && item.value.trim()
    && typeof item.basis === 'string'
    && item.basis.trim(),
  ))
}
