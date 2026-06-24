import { describe, expect, it } from 'vitest'
import { deepReportRuleTemplates } from './reportRuleTemplates'

const highValueTemplateCodes = [
  'R001',
  'R004',
  'R005',
  'R006',
  'R007',
  'R008',
  'R009',
  'R010',
  'R011',
  'R012',
  'R013',
  'R014',
  'R015',
  'R017',
  'R021',
]

describe('deep report rule templates', () => {
  it('covers the first 15 high-value report templates', () => {
    expect(Object.keys(deepReportRuleTemplates).sort()).toEqual([...highValueTemplateCodes].sort())
  })

  it('keeps every template useful for consultant-grade reporting', () => {
    Object.entries(deepReportRuleTemplates).forEach(([code, template]) => {
      expect(code).toMatch(/^R\d{3}$/)
      expect(template.scenario.length).toBeGreaterThanOrEqual(20)
      expect(template.riskAnalysis.length).toBeGreaterThan(30)
      expect(template.measurementMethod.length).toBeGreaterThan(30)
      expect(template.legalBasis.length).toBeGreaterThan(20)
      expect(template.remediation.length).toBeGreaterThan(20)
      expect(template.materials.length).toBeGreaterThanOrEqual(4)
      template.materials.forEach((material) => expect(material.trim()).toBe(material))
    })
  })
})
