export function reportSignOffBlock() {
  return [
    { label: '客户确认人', value: '签字/盖章：______________    日期：____年__月__日' },
    { label: '顾问复核人', value: '签字：______________    日期：____年__月__日' },
    { label: '交付状态', value: '系统初筛报告已交付，待客户确认资料和顾问复核意见。' },
  ]
}
