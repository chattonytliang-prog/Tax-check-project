export type ReportDeliveryChecklistInput = {
  hasRisks: boolean
  suggestedMaterials: string[]
}

export function reportDeliveryChecklist({ hasRisks, suggestedMaterials }: ReportDeliveryChecklistInput) {
  const checklist = [
    '本报告正式版 PDF/Word 文件',
    '企业基础信息、审阅期间和数据来源确认记录',
  ]

  if (hasRisks) {
    checklist.push('风险事项复核底稿及整改跟进记录')
  } else {
    checklist.push('未命中风险事项的资料完整性确认记录')
  }

  if (suggestedMaterials.length) {
    checklist.push(`建议补充资料清单：${suggestedMaterials.slice(0, 6).join('、')}`)
  }

  checklist.push('顾问复核意见或客户确认记录')

  return checklist
}
