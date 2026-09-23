import { describe, expect, it } from 'vitest'
import {
  buildReportRemediationPlan,
  reportFindingEvidenceStatus,
  reportFindingReference,
  reportRemediationTaskView,
} from './reportRemediationPlan'

describe('report remediation plan', () => {
  it('builds stable initial tasks with evidence requirements', () => {
    const tasks = buildReportRemediationPlan([
      {
        priority: '高优先级',
        item: '复核进项发票',
        ownerHint: '财务负责人牵头',
        findingRef: ' FND-007 ',
        materials: [' 发票台账 ', '', '认证清单', '付款流水', '不会进入前三项'],
      },
    ])

    expect(tasks).toEqual([{
      priority: '高优先级',
      item: '复核进项发票',
      ownerHint: '财务负责人牵头',
      taskId: 'RMD-001',
      findingRef: 'FND-007',
      status: '待复核',
      completionEvidence: '发票台账、认证清单、付款流水',
    }])
    expect(reportRemediationTaskView(tasks[0], 8)).toEqual({
      taskId: 'RMD-001',
      findingRef: 'FND-007',
      status: '待复核',
      completionEvidence: '发票台账、认证清单、付款流水',
      assignee: '',
      progressNote: '',
      clientAcknowledged: false,
      clientAcknowledgedAt: '',
      updatedAt: '',
      updatedBy: '',
    })
  })

  it('supplies display defaults for reports created before task metadata existed', () => {
    const [taskWithoutMaterials] = buildReportRemediationPlan([{
      priority: '中优先级',
      item: '补齐资料',
      ownerHint: '经办人员负责',
      materials: [],
    }])
    expect(taskWithoutMaterials.completionEvidence).toBe('整改过程记录、顾问复核意见及客户确认凭据')
    expect(taskWithoutMaterials.findingRef).toBe('FND-001')
    expect(reportRemediationTaskView({
      priority: '中优先级',
      item: '补齐资料',
      ownerHint: '经办人员负责',
    }, 2)).toEqual({
      taskId: 'RMD-003',
      findingRef: 'FND-003',
      status: '待复核',
      completionEvidence: '整改过程记录、顾问复核意见及客户确认凭据',
      assignee: '',
      progressNote: '',
      clientAcknowledged: false,
      clientAcknowledgedAt: '',
      updatedAt: '',
      updatedBy: '',
    })
    expect(reportFindingReference(11)).toBe('FND-012')
    expect(reportFindingEvidenceStatus()).toBe('待按建议资料完成原件或明细复核')
    expect(reportFindingEvidenceStatus(' 已核对原件 ')).toBe('已核对原件')
  })

  it('exposes saved workflow state for the report and export views', () => {
    expect(reportRemediationTaskView({
      priority: '高优先级',
      item: '完成整改',
      ownerHint: '财务负责人牵头',
      status: '已完成',
      assignee: ' 王会计 ',
      progressNote: ' 已完成复核 ',
      clientAcknowledged: true,
      clientAcknowledgedAt: ' 2026-09-21T09:00:00.000Z ',
      updatedAt: ' 2026-09-21T09:00:00.000Z ',
      updatedBy: ' user ',
    }, 0)).toMatchObject({
      status: '已完成',
      assignee: '王会计',
      progressNote: '已完成复核',
      clientAcknowledged: true,
      clientAcknowledgedAt: '2026-09-21T09:00:00.000Z',
      updatedAt: '2026-09-21T09:00:00.000Z',
      updatedBy: 'user',
    })
  })
})
