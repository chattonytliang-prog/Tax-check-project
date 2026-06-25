import { describe, expect, it } from 'vitest'
import { reportFollowUpCadence } from './reportFollowUpCadence'

describe('reportFollowUpCadence', () => {
  it('uses urgent cadence for high-risk reports', () => {
    expect(reportFollowUpCadence({ highRisks: 1, mediumRisks: 2, totalRisks: 5 })).toEqual([
      '3 个工作日内完成高风险事项顾问复核',
      '7 个工作日内形成整改责任人、资料清单和处理路径',
      '整改完成前每周更新一次风险处理状态',
    ])
  })

  it('uses medium-risk cadence when no high risks exist', () => {
    expect(reportFollowUpCadence({ highRisks: 0, mediumRisks: 2, totalRisks: 2 })).toEqual([
      '5 个工作日内完成中风险事项资料复核',
      '15 个工作日内确认是否需要补充整改或专项检查',
      '下一个申报期前复查相关数据和凭证变化',
    ])
  })

  it('keeps low-risk follow-up lightweight', () => {
    expect(reportFollowUpCadence({ highRisks: 0, mediumRisks: 0, totalRisks: 1 })).toEqual([
      '本月内完成低风险提示复核和底稿归档',
      '下次数据更新后复查同类指标是否持续出现',
    ])
  })

  it('archives no-risk reports with next-period rerun guidance', () => {
    expect(reportFollowUpCadence({ highRisks: 0, mediumRisks: 0, totalRisks: 0 })).toEqual([
      '本次初筛结果可归档留存',
      '建议在下一期数据录入后重新运行规则检测',
    ])
  })
})
