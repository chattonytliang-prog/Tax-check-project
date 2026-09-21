export type ReportAssessmentCoverage = {
  assessedCount: number
  totalCount: number
  unassessedCount: number
  coveragePercent: number
  listedUnassessedCount: number | null
  isConsistent: boolean
}

type ReportAssessmentCoverageInput = {
  assessedRuleCount?: unknown
  totalRuleCount?: unknown
  unassessedRules?: unknown
}

export function reportAssessmentCoverage(input: unknown): ReportAssessmentCoverage | null {
  if (!input || typeof input !== 'object') return null
  const candidate = input as ReportAssessmentCoverageInput
  const assessedCount = candidate.assessedRuleCount
  const totalCount = candidate.totalRuleCount
  if (!Number.isSafeInteger(assessedCount)
    || !Number.isSafeInteger(totalCount)
    || (assessedCount as number) < 0
    || (totalCount as number) < 0
    || (assessedCount as number) > (totalCount as number)) {
    return null
  }

  const safeAssessedCount = assessedCount as number
  const safeTotalCount = totalCount as number
  const unassessedCount = safeTotalCount - safeAssessedCount
  const listedUnassessedCount = Array.isArray(candidate.unassessedRules)
    ? candidate.unassessedRules.length
    : null

  return {
    assessedCount: safeAssessedCount,
    totalCount: safeTotalCount,
    unassessedCount,
    coveragePercent: safeTotalCount ? Math.round((safeAssessedCount / safeTotalCount) * 100) : 0,
    listedUnassessedCount,
    isConsistent: listedUnassessedCount === null || listedUnassessedCount === unassessedCount,
  }
}

export function reportAssessmentCoverageFacts(input: unknown) {
  const coverage = reportAssessmentCoverage(input)
  if (!coverage) return []
  return [
    { label: '可判断检查项', value: `${coverage.assessedCount} / ${coverage.totalCount} 项` },
    { label: '资料不足暂未判断', value: `${coverage.unassessedCount} 项` },
    { label: '检查结论覆盖', value: `${coverage.coveragePercent}%` },
  ]
}

export function reportAssessmentCoverageStatement(input: unknown) {
  const coverage = reportAssessmentCoverage(input)
  if (!coverage) return ''
  if (!coverage.totalCount) {
    return '本次未配置可判断检查项；报告结论不应作为完整风险判断。'
  }
  const consistencyWarning = coverage.isConsistent
    ? ''
    : ` 保存的暂未判断清单为 ${coverage.listedUnassessedCount} 项，与统计数量不一致，需重新核对。`
  return `本次可判断检查项 ${coverage.assessedCount} / ${coverage.totalCount} 项，因资料不足暂未判断 ${coverage.unassessedCount} 项，检查结论覆盖率 ${coverage.coveragePercent}%。风险等级仅依据可判断检查项，暂未判断不代表低风险。${consistencyWarning}`
}
