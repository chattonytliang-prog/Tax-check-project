import { describe, expect, it } from 'vitest'
import { reportReviewAction } from './reportReviewAction'

describe('reportReviewAction', () => {
  it('prioritizes high-risk review actions', () => {
    expect(reportReviewAction({ totalRisks: 5, highRisks: 2, mediumRisks: 1 })).toBe(
      '建议税务顾问优先复核 2 项高风险事项，并同步核对相关合同、发票、申报表和资金流水。',
    )
  })

  it('points medium-risk reports to consultant review', () => {
    expect(reportReviewAction({ totalRisks: 3, highRisks: 0, mediumRisks: 3 })).toBe(
      '建议税务顾问复核 3 项中风险事项，确认资料完整性和整改优先级。',
    )
  })

  it('keeps low-risk reports as working paper follow-up', () => {
    expect(reportReviewAction({ totalRisks: 1, highRisks: 0, mediumRisks: 0 })).toBe(
      '建议财税经办人员复核低风险提示，并保留本次检查底稿。',
    )
  })

  it('archives no-hit reports with a data completeness reminder', () => {
    expect(reportReviewAction({ totalRisks: 0, highRisks: 0, mediumRisks: 0 })).toBe(
      '建议补充原始凭证、申报表和发票明细后归档本次初筛结果。',
    )
  })
})
