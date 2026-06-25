export type ReportClientAcknowledgementInput = {
  periodLabel: string
  dataBasis?: string
}

export function reportClientAcknowledgement({ periodLabel, dataBasis }: ReportClientAcknowledgementInput) {
  const period = periodLabel.trim() || '本次审阅期间'
  const basis = dataBasis?.trim() || '已录入数据'

  return [
    `客户确认本报告审阅范围为${period}，数据来源为${basis}。`,
    '客户确认已理解本报告为系统初筛结果，需结合原始凭证和顾问复核意见使用。',
    '客户确认后续整改、补充资料和申报调整事项应由授权人员留痕确认。',
  ]
}
