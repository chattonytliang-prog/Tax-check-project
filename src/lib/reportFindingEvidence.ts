import {
  conditionFields,
  conditionRequiredFields,
  type ClientSnapshot,
  type RuleCondition,
} from './ruleEngine'
import type { ReportPeriodEvidenceSource } from './reportPeriodEvidenceSources'

export type ReportMetricSource = {
  sourceFileId: string
  page: number
  formRow: string
  periodStart: string
  periodEnd: string
}

type ReportMetricReference = ReportMetricSource & { fileName: string; stored: boolean }
export type ReportMetricEvidence = Record<string, ReportMetricSource[]>

export type ReportFindingInputEvidence = {
  label: string
  value: string
  basis: string
  sources?: ReportMetricReference[]
}

type ReportFindingInputEvidenceOptions = {
  condition?: RuleCondition
  requiredFields?: string[]
  values: ClientSnapshot
  standardMetricCoverage?: string[]
  explicitFields?: Record<string, boolean>
  autoDerivedSources?: Record<string, string>
  additionalLabels?: Record<string, string>
  metricEvidence?: ReportMetricEvidence
  periodSources?: ReportPeriodEvidenceSource[]
}

const isoDay = /^\d{4}-\d{2}-\d{2}$/
function validMetricSource(input: unknown): input is ReportMetricSource {
  if (!input || typeof input !== 'object') return false
  const source = input as Partial<ReportMetricSource>
  return typeof source.sourceFileId === 'string' && /^[\w-]{1,128}$/.test(source.sourceFileId)
    && Number.isSafeInteger(source.page) && (source.page ?? 0) > 0
    && typeof source.formRow === 'string' && /^[A-Za-z0-9]{1,12}$/.test(source.formRow)
    && typeof source.periodStart === 'string' && isoDay.test(source.periodStart)
    && typeof source.periodEnd === 'string' && isoDay.test(source.periodEnd) && source.periodEnd >= source.periodStart
}

export function collectReportMetricEvidence(
  entries: readonly { metricCoverage?: readonly string[]; metricEvidence?: ReportMetricEvidence }[],
  coveredFields: readonly string[],
): ReportMetricEvidence {
  return Object.fromEntries(coveredFields.flatMap((field) => {
    const parts = entries.map((entry) => entry.metricCoverage?.includes(field) ? (entry.metricEvidence?.[field] || []).filter(validMetricSource) : [])
    return parts.length && parts.every((part) => part.length) ? [[field, parts.flat()]] : []
  }))
}

function reportMetricReferenceList(input: unknown): ReportMetricReference[] {
  return Array.isArray(input) ? input.filter((source): source is ReportMetricReference => {
    if (!validMetricSource(source)) return false
    const reference = source as Partial<ReportMetricReference>
    return typeof reference.fileName === 'string' && Boolean(reference.fileName.trim()) && typeof reference.stored === 'boolean'
  }) : []
}

export function reportOriginalReferenceText(source: ReportMetricReference) {
  return `${source.fileName} · 第 ${source.page} 页 / 第 ${source.formRow} 栏 · ${source.periodStart} 至 ${source.periodEnd}${source.stored ? '' : '（未保存原件）'}`
}

export function reportOriginalReferenceUrl(source: ReportMetricReference) {
  return `/api/tax-data/source?sourceFileId=${encodeURIComponent(source.sourceFileId)}#page=${source.page}`
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
  const files = new Map(options.periodSources?.map((source) => [source.sourceFileId, source]))

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

    const raw = (options.metricEvidence?.[field] || []).filter(validMetricSource)
    const sources = raw.flatMap((location): ReportMetricReference[] => {
      const file = files.get(location.sourceFileId)
      // A matching report-period file is not enough: only use exact source IDs
      // supplied alongside the computed value by the authenticated summary.
      return file && /\.pdf$/i.test(file.fileName)
        && file.periodStart <= location.periodStart && file.periodEnd >= location.periodEnd
        ? [{ ...location, fileName: file.fileName, stored: file.stored }] : []
    })
    if (raw.length && sources.length === raw.length) return [{ label, value, basis, sources }]
    return [{ label, value, basis }]
  })
}

export function reportFindingInputEvidenceList(value: unknown): ReportFindingInputEvidence[] {
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
  )).map(({ sources: input, ...item }) => {
    const sources = reportMetricReferenceList(input)
    return sources.length ? { ...item, sources } : item
  })
}
