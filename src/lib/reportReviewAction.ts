export type ReportReviewActionInput = {
  totalRisks: number
  highRisks: number
  mediumRisks: number
}

export function reportReviewAction({ totalRisks, highRisks, mediumRisks }: ReportReviewActionInput) {
  if (highRisks > 0) {
    return `建议税务顾问优先复核 ${highRisks} 项高风险事项，并同步核对相关合同、发票、申报表和资金流水。`
  }

  if (mediumRisks > 0) {
    return `建议税务顾问复核 ${mediumRisks} 项中风险事项，确认资料完整性和整改优先级。`
  }

  if (totalRisks > 0) {
    return '建议财税经办人员复核低风险提示，并保留本次检查底稿。'
  }

  return '建议补充原始凭证、申报表和发票明细后归档本次初筛结果。'
}
