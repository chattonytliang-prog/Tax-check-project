export type ReportRemediationTask = {
  priority: string
  item: string
  ownerHint: string
  taskId?: string
  status?: '待复核'
  completionEvidence?: string
}

type ReportRemediationPlanInput = {
  priority: string
  item: string
  ownerHint: string
  materials: string[]
}

export type ReportRemediationTaskView = {
  taskId: string
  status: '待复核'
  completionEvidence: string
}

const fallbackCompletionEvidence = '整改过程记录、顾问复核意见及客户确认凭据'

function taskId(index: number) {
  return `RMD-${String(index + 1).padStart(3, '0')}`
}

export function buildReportRemediationPlan(items: ReportRemediationPlanInput[]): ReportRemediationTask[] {
  return items.map((item, index) => ({
    priority: item.priority,
    item: item.item,
    ownerHint: item.ownerHint,
    taskId: taskId(index),
    status: '待复核',
    completionEvidence: item.materials.map((material) => material.trim()).filter(Boolean).slice(0, 3).join('、')
      || fallbackCompletionEvidence,
  }))
}

export function reportRemediationTaskView(item: ReportRemediationTask, index: number): ReportRemediationTaskView {
  return {
    taskId: item.taskId?.trim() || taskId(index),
    status: item.status || '待复核',
    completionEvidence: item.completionEvidence?.trim() || fallbackCompletionEvidence,
  }
}
