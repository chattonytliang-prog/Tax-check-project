export type ReportRemediationTask = {
  priority: string
  item: string
  ownerHint: string
  taskId?: string
  findingRef?: string
  status?: '待复核'
  completionEvidence?: string
}

type ReportRemediationPlanInput = {
  priority: string
  item: string
  ownerHint: string
  findingRef?: string
  materials: string[]
}

export type ReportRemediationTaskView = {
  taskId: string
  findingRef: string
  status: '待复核'
  completionEvidence: string
}

const fallbackCompletionEvidence = '整改过程记录、顾问复核意见及客户确认凭据'
const fallbackEvidenceStatus = '待按建议资料完成原件或明细复核'

function taskId(index: number) {
  return `RMD-${String(index + 1).padStart(3, '0')}`
}

export function reportFindingReference(index: number, reference?: string) {
  return reference?.trim() || `FND-${String(index + 1).padStart(3, '0')}`
}

export function reportFindingEvidenceStatus(status?: string) {
  return status?.trim() || fallbackEvidenceStatus
}

export function buildReportRemediationPlan(items: ReportRemediationPlanInput[]): ReportRemediationTask[] {
  return items.map((item, index) => ({
    priority: item.priority,
    item: item.item,
    ownerHint: item.ownerHint,
    taskId: taskId(index),
    findingRef: reportFindingReference(index, item.findingRef),
    status: '待复核',
    completionEvidence: item.materials.map((material) => material.trim()).filter(Boolean).slice(0, 3).join('、')
      || fallbackCompletionEvidence,
  }))
}

export function reportRemediationTaskView(item: ReportRemediationTask, index: number): ReportRemediationTaskView {
  return {
    taskId: item.taskId?.trim() || taskId(index),
    findingRef: reportFindingReference(index, item.findingRef),
    status: item.status || '待复核',
    completionEvidence: item.completionEvidence?.trim() || fallbackCompletionEvidence,
  }
}
