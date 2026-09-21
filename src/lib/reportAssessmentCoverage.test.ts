import { describe, expect, it } from 'vitest'
import {
  reportAssessmentCoverage,
  reportAssessmentCoverageFacts,
  reportAssessmentCoverageStatement,
} from './reportAssessmentCoverage'

describe('report assessment coverage', () => {
  it('calculates a customer-facing coverage snapshot', () => {
    const input = {
      assessedRuleCount: 12,
      totalRuleCount: 15,
      unassessedRules: [{}, {}, {}],
    }

    expect(reportAssessmentCoverage(input)).toEqual({
      assessedCount: 12,
      totalCount: 15,
      unassessedCount: 3,
      coveragePercent: 80,
      listedUnassessedCount: 3,
      isConsistent: true,
    })
    expect(reportAssessmentCoverageFacts(input)).toEqual([
      { label: '可判断检查项', value: '12 / 15 项' },
      { label: '资料不足暂未判断', value: '3 项' },
      { label: '检查结论覆盖', value: '80%' },
    ])
    expect(reportAssessmentCoverageStatement(input)).toContain('暂未判断不代表低风险')
  })

  it('flags a saved checklist count that contradicts the coverage totals', () => {
    const statement = reportAssessmentCoverageStatement({
      assessedRuleCount: 12,
      totalRuleCount: 15,
      unassessedRules: [{}],
    })

    expect(statement).toContain('暂未判断清单为 1 项')
    expect(statement).toContain('与统计数量不一致')
  })

  it('supports historical totals that did not save the detailed checklist', () => {
    expect(reportAssessmentCoverage({ assessedRuleCount: 1, totalRuleCount: 2 })).toMatchObject({
      listedUnassessedCount: null,
      isConsistent: true,
    })
  })

  it('handles an explicitly empty assessment without claiming coverage', () => {
    expect(reportAssessmentCoverageStatement({ assessedRuleCount: 0, totalRuleCount: 0, unassessedRules: [] }))
      .toBe('本次未配置可判断检查项；报告结论不应作为完整风险判断。')
  })

  it('ignores missing, malformed, negative, and contradictory totals', () => {
    for (const input of [
      null,
      'invalid',
      {},
      { assessedRuleCount: Number.NaN, totalRuleCount: 1 },
      { assessedRuleCount: 0, totalRuleCount: -1 },
      { assessedRuleCount: -1, totalRuleCount: 1 },
      { assessedRuleCount: 2, totalRuleCount: 1 },
    ]) {
      expect(reportAssessmentCoverage(input)).toBeNull()
    }
    expect(reportAssessmentCoverageFacts({})).toEqual([])
    expect(reportAssessmentCoverageStatement({})).toBe('')
  })
})
