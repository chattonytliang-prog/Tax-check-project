export type ReportFollowUpCadenceInput = {
  highRisks: number
  mediumRisks: number
  totalRisks: number
}

export function reportFollowUpCadence({ highRisks, mediumRisks, totalRisks }: ReportFollowUpCadenceInput) {
  if (highRisks > 0) {
    return [
      '3 个工作日内完成高风险事项顾问复核',
      '7 个工作日内形成整改责任人、资料清单和处理路径',
      '整改完成前每周更新一次风险处理状态',
    ]
  }

  if (mediumRisks > 0) {
    return [
      '5 个工作日内完成中风险事项资料复核',
      '15 个工作日内确认是否需要补充整改或专项检查',
      '下一个申报期前复查相关数据和凭证变化',
    ]
  }

  if (totalRisks > 0) {
    return [
      '本月内完成低风险提示复核和底稿归档',
      '下次数据更新后复查同类指标是否持续出现',
    ]
  }

  return [
    '本次初筛结果可归档留存',
    '建议在下一期数据录入后重新运行规则检测',
  ]
}
