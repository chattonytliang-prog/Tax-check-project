/// <reference types="node" />

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { advancedCandidateRuleConfigs } from './advancedCandidateRuleConfigs'
import { conditionFields, conditionRequiredFields, isExecutableCondition, type RuleCondition } from './ruleEngine'

type CandidateRuleAsset = {
  code: string
  name: string
  level: string
  conditionJson: RuleCondition
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf-8')) as T
}

function ruleNumber(code: string) {
  return Number(code.split('-')[1])
}

describe('rule library assets', () => {
  it('keeps public candidate rules complete, executable, and field-mapped', () => {
    const rules = readJson<CandidateRuleAsset[]>('public/rule-candidates/tax-warning-candidates.json')
    const fieldMap = new Set(conditionFields.map((field) => field.value))

    expect(rules).toHaveLength(120)
    expect(rules.map((rule) => rule.code)).toEqual(
      Array.from({ length: 120 }, (_, index) => `ON-${String(index + 1).padStart(3, '0')}`),
    )
    expect(new Set(rules.map((rule) => rule.name)).size).toBe(rules.length)
    expect(rules.every((rule) => ['高', '中', '低'].includes(rule.level))).toBe(true)
    expect(rules.every((rule) => isExecutableCondition(rule.conditionJson))).toBe(true)
    expect(rules.flatMap((rule) => conditionRequiredFields(rule.conditionJson)).every((field) => fieldMap.has(field))).toBe(true)
    expect(rules.some((rule) => rule.name.includes('?') || rule.level === '?')).toBe(false)
    expect(ruleNumber(rules.at(-1)?.code || '')).toBe(120)
  })

  it('keeps advanced candidate configs aligned with the final rule range', () => {
    const publicRules = readJson<CandidateRuleAsset[]>('public/rule-candidates/tax-warning-candidates.json')
    const publicRulesByCode = new Map(publicRules.map((rule) => [rule.code, rule]))

    expect(advancedCandidateRuleConfigs).toHaveLength(65)
    expect(advancedCandidateRuleConfigs[0].code).toBe('ON-056')
    expect(advancedCandidateRuleConfigs.at(-1)?.code).toBe('ON-120')
    expect(advancedCandidateRuleConfigs.every((rule) => ['高', '中', '低'].includes(rule.level))).toBe(true)
    advancedCandidateRuleConfigs.forEach((rule) => {
      expect(publicRulesByCode.get(rule.code)?.name).toBe(rule.name)
      expect(publicRulesByCode.get(rule.code)?.level).toBe(rule.level)
    })
  })

  it('keeps expert review checklist at the target size without scoring impact', () => {
    const checklist = readJson<{ items: Array<{ id: string; countsTowardRiskScore: boolean }> }>(
      'public/rule-candidates/expert-review-checklist.json',
    )

    expect(checklist.items).toHaveLength(100)
    expect(checklist.items[0].id).toBe('ER-001')
    expect(checklist.items.at(-1)?.id).toBe('ER-100')
    expect(checklist.items.every((item) => item.countsTowardRiskScore === false)).toBe(true)
  })
})
