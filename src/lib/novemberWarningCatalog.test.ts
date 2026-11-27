import { describe, expect, it } from 'vitest'
import { novemberWarningCatalog, trialWarningIndicator, warningTrials } from './novemberWarningCatalog'

describe('2026-11-27 warning catalog', () => {
  it('preserves the numbered indicators and the five unnumbered indicators without carrying private links', () => {
    expect(novemberWarningCatalog.map((rule) => rule.row)).toEqual([
      ...Array.from({ length: 46 }, (_, index) => index + 3), 50, 51, 52, 56, 57, 58, 59, 60,
    ])
    expect(novemberWarningCatalog.map((rule) => rule.code)).toEqual(
      Array.from({ length: 54 }, (_, index) => `YW-261127-${String(index + 1).padStart(3, '0')}`),
    )
    expect(novemberWarningCatalog.filter((rule) => rule.disposition === '停用').map((rule) => rule.row)).toEqual([37])
    expect(JSON.stringify(novemberWarningCatalog)).not.toMatch(/https?:\/\/|bytedance|larkoffice|EBS编码/i)
    expect(Object.keys(warningTrials).every((row) => novemberWarningCatalog.some((rule) => rule.row === Number(row) && rule.disposition === '待接数据'))).toBe(true)
  })

  it('preserves strict and inclusive boundaries without conflating a blank with a zero', () => {
    expect(trialWarningIndicator(4, ['150', '100'])).toContain('未触发')
    expect(trialWarningIndicator(4, ['49.99', '100'])).toContain('需复核')
    expect(trialWarningIndicator(5, ['151', '100'])).toContain('需复核')
    expect(trialWarningIndicator(4, ['50', '0'])).toContain('不满足')
    expect(trialWarningIndicator(21, ['210000', '300000'])).toContain('未触发')
    expect(trialWarningIndicator(21, ['200000', '350000'])).toContain('未触发')
    expect(trialWarningIndicator(21, ['200001', '350000'])).toContain('需复核')
    expect(trialWarningIndicator(23, ['500000'])).toContain('未触发')
    expect(trialWarningIndicator(23, ['500000.01'])).toContain('需复核')
    expect(trialWarningIndicator(26, ['0'])).toContain('未触发')
    expect(trialWarningIndicator(26, ['-0.01'])).toContain('需复核')
    expect(trialWarningIndicator(59, ['', '100'])).toContain('请填齐')
    expect(trialWarningIndicator(59, ['0', '100'])).toContain('需复核')
    expect(trialWarningIndicator(59, ['50', '100'])).toContain('需复核')
    expect(trialWarningIndicator(59, ['50.01', '100'])).toContain('未触发')
    expect(trialWarningIndicator(37, [])).toContain('不支持试算')
  })
})
