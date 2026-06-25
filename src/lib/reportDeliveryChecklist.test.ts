import { describe, expect, it } from 'vitest'
import { reportDeliveryChecklist } from './reportDeliveryChecklist'

describe('reportDeliveryChecklist', () => {
  it('includes risk working papers when risks are present', () => {
    expect(
      reportDeliveryChecklist({
        hasRisks: true,
        suggestedMaterials: ['销项发票明细', '合同台账'],
      }),
    ).toEqual([
      '本报告正式版 PDF/Word 文件',
      '企业基础信息、审阅期间和数据来源确认记录',
      '风险事项复核底稿及整改跟进记录',
      '建议补充资料清单：销项发票明细、合同台账',
      '顾问复核意见或客户确认记录',
    ])
  })

  it('uses a completeness confirmation item when no risks are present', () => {
    expect(reportDeliveryChecklist({ hasRisks: false, suggestedMaterials: [] })).toEqual([
      '本报告正式版 PDF/Word 文件',
      '企业基础信息、审阅期间和数据来源确认记录',
      '未命中风险事项的资料完整性确认记录',
      '顾问复核意见或客户确认记录',
    ])
  })

  it('limits suggested materials so the delivery note stays compact', () => {
    const checklist = reportDeliveryChecklist({
      hasRisks: true,
      suggestedMaterials: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
    })

    expect(checklist).toContain('建议补充资料清单：A、B、C、D、E、F')
    expect(checklist.join('、')).not.toContain('G')
  })
})
