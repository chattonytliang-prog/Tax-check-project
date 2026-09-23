const remediationStatuses = new Set(['待复核', '整改中', '待客户确认', '已完成'])

function taskId(index) {
  return `RMD-${String(index + 1).padStart(3, '0')}`
}

function cleanText(value, label, maxLength, required = false) {
  if (typeof value !== 'string') {
    return { error: `${label}格式不正确` }
  }
  const text = value.trim()
  if (required && !text) return { error: `请填写${label}` }
  if (text.length > maxLength) return { error: `${label}不能超过 ${maxLength} 个字` }
  return { value: text }
}

export function updateReportRemediation(report, input, actor, updatedAt) {
  if (!report?.structured || !Array.isArray(report.structured.actionPlan)) {
    return { status: 409, error: '该历史报告没有可更新的整改任务，请重新生成新版报告' }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { status: 400, error: '整改任务更新内容格式不正确' }
  }

  const taskIdResult = cleanText(input.taskId, '任务编号', 40, true)
  if (taskIdResult.error) return { status: 400, error: taskIdResult.error }
  const index = report.structured.actionPlan.findIndex((task, taskIndex) => (
    task && typeof task === 'object' && !Array.isArray(task)
    && ((typeof task.taskId === 'string' && task.taskId.trim()) || taskId(taskIndex)) === taskIdResult.value
  ))
  if (index < 0) return { status: 404, error: '整改任务不存在' }

  if (!remediationStatuses.has(input.status)) {
    return { status: 400, error: '请选择有效的整改状态' }
  }
  const assigneeResult = cleanText(input.assignee, '实际负责人', 80, true)
  if (assigneeResult.error) return { status: 400, error: assigneeResult.error }
  const noteResult = cleanText(input.progressNote, '处理说明', 1000, true)
  if (noteResult.error) return { status: 400, error: noteResult.error }
  if (typeof input.clientAcknowledged !== 'boolean') {
    return { status: 400, error: '客户确认状态格式不正确' }
  }
  if (input.status === '已完成' && !input.clientAcknowledged) {
    return { status: 400, error: '任务标记为已完成前，请先登记客户确认' }
  }
  if (typeof input.expectedUpdatedAt !== 'string') {
    return { status: 400, error: '请刷新报告后再更新整改任务' }
  }

  const current = report.structured.actionPlan[index]
  const currentUpdatedAt = typeof current.updatedAt === 'string' ? current.updatedAt : ''
  if (input.expectedUpdatedAt !== currentUpdatedAt) {
    return { status: 409, error: '整改任务已被其他操作更新，请刷新后重试' }
  }

  const updatedBy = actor?.username?.trim() || actor?.id?.trim() || '当前用户'
  const clientAcknowledgedAt = input.clientAcknowledged
    ? (current.clientAcknowledged && current.clientAcknowledgedAt) || updatedAt
    : undefined
  const event = {
    status: input.status,
    assignee: assigneeResult.value,
    progressNote: noteResult.value,
    clientAcknowledged: input.clientAcknowledged,
    clientAcknowledgedAt,
    updatedAt,
    updatedBy,
  }
  const history = Array.isArray(current.history) ? current.history.slice(-49) : []
  const updatedTask = {
    ...current,
    taskId: taskIdResult.value,
    ...event,
    history: [...history, event],
  }
  const actionPlan = report.structured.actionPlan.map((task, taskIndex) => taskIndex === index ? updatedTask : task)
  return {
    status: 200,
    report: { ...report, structured: { ...report.structured, actionPlan } },
    task: updatedTask,
  }
}
