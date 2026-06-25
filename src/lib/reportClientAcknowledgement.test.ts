import { describe, expect, it } from 'vitest'
import { reportClientAcknowledgement } from './reportClientAcknowledgement'

describe('reportClientAcknowledgement', () => {
  it('states the reviewed period and data basis for client sign-off', () => {
    expect(reportClientAcknowledgement({ periodLabel: '2025年度', dataBasis: '管理报表' })[0]).toBe(
      '客户确认本报告审阅范围为2025年度，数据来源为管理报表。',
    )
  })

  it('keeps the system screening boundary explicit', () => {
    expect(reportClientAcknowledgement({ periodLabel: '2025 Q1', dataBasis: '申报数据' })).toContain(
      '客户确认已理解本报告为系统初筛结果，需结合原始凭证和顾问复核意见使用。',
    )
  })

  it('falls back to neutral wording for incomplete legacy data', () => {
    expect(reportClientAcknowledgement({ periodLabel: '', dataBasis: '' })[0]).toBe(
      '客户确认本报告审阅范围为本次审阅期间，数据来源为已录入数据。',
    )
  })
})
