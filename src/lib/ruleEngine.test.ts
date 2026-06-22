import { describe, expect, it } from 'vitest'
import {
  builtInRuleConditions,
  conditionFields,
  conditionSummary,
  detectExecutableRuleCodes,
  emptyRuleCondition,
  evaluateCondition,
  isExecutableCondition,
  isSimpleCondition,
  parseComparableValue,
  type ClientSnapshot,
  type RuleCondition,
} from './ruleEngine'

const baseClient: ClientSnapshot = {
  taxpayerType: '一般纳税人',
  consecutive12MonthSales: 1000000,
  relatedEntitiesNearThreshold: false,
  nearVatExemption: false,
  monthlyRevenue: 100000,
  monthlyInvoice: 100000,
  collectionFlow: 100000,
  annualRevenue: 1200000,
  entertainmentExpense: 0,
  adExpense: 0,
  payrollTotal: 1000000,
  welfareExpense: 0,
  unionExpense: 0,
  educationExpense: 0,
  taxableIncome: 1000000,
  employeeAnnualAvg: 20,
  assetsTotal: 3000000,
  employees: 20,
  socialSecurityCount: 20,
  salaryDeclaredCount: 20,
  platformRevenue: 0,
  privateAccountCollection: false,
  unbilledIncome: false,
  longTermZeroDeclaration: false,
  prepaidLongTerm: false,
  largeExpenseNoInvoice: false,
  serviceFeeInvoices: false,
  supplierNoInput: false,
  invoiceNameMismatch: false,
  purchaseSalesMismatch: false,
  fundsReturn: false,
  abnormalInvoice: false,
  nonFinancialInterestAbnormal: false,
  intercompanyManagementFee: false,
  relatedPricingAbnormal: false,
  salarySplit: false,
  noIitWithholding: false,
  individualVendorRelated: false,
  smallProfitEnjoyed: false,
  taxBenefitDataMissing: false,
  rdDeductionEnjoyed: false,
  inventoryAbnormal: false,
  rdDocsInsufficient: false,
  agencyComplianceRisk: false,
}

function cloneClient() {
  return { ...baseClient }
}

function rulesFor(ruleCodes: string[], disabled = new Set<string>()) {
  return ruleCodes.map((code) => ({
    code,
    enabled: !disabled.has(code),
    conditionJson: builtInRuleConditions[code],
  }))
}

function applyCondition(client: ClientSnapshot, condition: RuleCondition) {
  if ('all' in condition) {
    condition.all.forEach((item) => applyCondition(client, item))
    return
  }

  if ('any' in condition) {
    applyCondition(client, condition.any[0])
    return
  }

  const conditionValue = condition.value
  const field = condition.field
  if (!field) return

  if (condition.transform === 'absDiff' && condition.compareField) {
    client[condition.compareField] = 10
    client[field] = 13
    return
  }

  if (condition.compareField) {
    const base = typeof client[condition.compareField] === 'number'
      ? Number(client[condition.compareField])
      : 100
    client[condition.compareField] = base
    const threshold = base * (condition.multiplier ?? 1)
    client[field] = condition.operator === '<' || condition.operator === '<='
      ? threshold - 1
      : threshold + 1
    return
  }

  if (typeof conditionValue === 'boolean') {
    client[field] = condition.operator === '!=' ? !conditionValue : conditionValue
    return
  }

  if (typeof conditionValue === 'number') {
    switch (condition.operator) {
      case '>':
        client[field] = conditionValue + 1
        return
      case '>=':
        client[field] = conditionValue
        return
      case '<':
        client[field] = conditionValue - 1
        return
      case '<=':
        client[field] = conditionValue
        return
      case '!=':
        client[field] = conditionValue + 1
        return
      case '=':
      default:
        client[field] = conditionValue
    }
    return
  }

  client[field] = condition.operator === '!='
    ? client[field] === conditionValue
      ? `${conditionValue}_other`
      : client[field]
    : conditionValue
}

function makeTriggeringClient(ruleCodes: string[]) {
  const client = cloneClient()
  ruleCodes.forEach((code) => applyCondition(client, builtInRuleConditions[code]))
  return client
}

function combinations<T>(items: T[], size: number) {
  const result: T[][] = []
  const selected: T[] = []

  function visit(start: number) {
    if (selected.length === size) {
      result.push([...selected])
      return
    }

    for (let index = start; index < items.length; index += 1) {
      selected.push(items[index])
      visit(index + 1)
      selected.pop()
    }
  }

  visit(0)
  return result
}

describe('ruleEngine', () => {
  it('exports the full editable field map and 30 built-in executable rules', () => {
    expect(conditionFields.length).toBeGreaterThan(30)
    expect(Object.keys(builtInRuleConditions)).toHaveLength(30)
    expect(Object.values(builtInRuleConditions).every(isExecutableCondition)).toBe(true)
  })

  it('evaluates primitive operators and empty conditions', () => {
    const client = { amount: 10, name: 'A', enabled: true }

    expect(parseComparableValue(undefined, 1)).toBe(0)
    expect(parseComparableValue(5, 'sample')).toBe('5')
    expect(parseComparableValue('false', true)).toBe(false)
    expect(evaluateCondition(client)).toBe(false)
    expect(evaluateCondition(client, emptyRuleCondition)).toBe(false)
    expect(evaluateCondition(client, { field: 'amount', operator: '>', value: 9 })).toBe(true)
    expect(evaluateCondition(client, { field: 'amount', operator: '>=', value: 10 })).toBe(true)
    expect(evaluateCondition(client, { field: 'amount', operator: '<', value: 11 })).toBe(true)
    expect(evaluateCondition(client, { field: 'amount', operator: '<=', value: 10 })).toBe(true)
    expect(evaluateCondition(client, { field: 'name', operator: '=', value: 'A' })).toBe(true)
    expect(evaluateCondition(client, { field: 'name', operator: '!=', value: 'B' })).toBe(true)
    expect(evaluateCondition(client, { field: 'enabled', operator: '=', value: 'true' })).toBe(true)
    expect(evaluateCondition({ enabled: true }, { field: 'enabled', operator: '=', value: true })).toBe(true)
  })

  it('evaluates all, any, compare-field, multiplier, and absolute difference conditions', () => {
    expect(evaluateCondition(
      { a: 5, b: 10, enabled: true },
      { all: [{ field: 'a', operator: '>', value: 3 }, { field: 'enabled', operator: '=', value: true }] },
    )).toBe(true)
    expect(evaluateCondition(
      { a: 1, enabled: true },
      { all: [{ field: 'a', operator: '>', value: 3 }, { field: 'enabled', operator: '=', value: true }] },
    )).toBe(false)
    expect(evaluateCondition(
      { a: 1, b: 10 },
      { any: [{ field: 'a', operator: '>', value: 3 }, { field: 'b', operator: '=', value: 10 }] },
    )).toBe(true)
    expect(evaluateCondition(
      { a: 1, b: 9 },
      { any: [{ field: 'a', operator: '>', value: 3 }, { field: 'b', operator: '=', value: 10 }] },
    )).toBe(false)
    expect(evaluateCondition(
      { collectionFlow: 121, monthlyInvoice: 100 },
      { field: 'collectionFlow', operator: '>', value: 0, compareField: 'monthlyInvoice', multiplier: 1.2 },
    )).toBe(true)
    expect(evaluateCondition(
      { collectionFlow: 101, monthlyInvoice: 100 },
      { field: 'collectionFlow', operator: '>', value: 0, compareField: 'monthlyInvoice' },
    )).toBe(true)
    expect(evaluateCondition(
      { salaryDeclaredCount: 13, socialSecurityCount: 10 },
      { field: 'salaryDeclaredCount', operator: '>=', value: 3, compareField: 'socialSecurityCount', transform: 'absDiff' },
    )).toBe(true)
    expect(evaluateCondition(
      { salaryDeclaredCount: 3 },
      { field: 'salaryDeclaredCount', operator: '>=', value: 3, transform: 'absDiff' },
    )).toBe(true)
  })

  it('summarizes condition shapes for the UI', () => {
    expect(conditionSummary()).toBe('未设置执行条件')
    expect(conditionSummary(emptyRuleCondition)).toBe('不参与自动检测')
    expect(conditionSummary({ field: 'amount', operator: '>', value: 10 })).toBe('amount > 10')
    expect(conditionSummary({ field: 'amount', operator: '>', value: 0, compareField: 'revenue', multiplier: 0.1 })).toBe('amount > revenue × 0.1')
    expect(conditionSummary({ field: 'amount', operator: '>', value: 0, compareField: 'revenue' })).toBe('amount > revenue')
    expect(conditionSummary({ field: 'a', operator: '>=', value: 3, compareField: 'b', transform: 'absDiff' })).toBe('|a - b| >= b')
    expect(conditionSummary({ field: 'a', operator: '>=', value: 3, transform: 'absDiff' })).toBe('|a - | >= 3')
    expect(conditionSummary({ all: [{ field: 'a', operator: '=', value: 1 }] })).toContain('全部满足')
    expect(conditionSummary({ any: [{ field: 'a', operator: '=', value: 1 }] })).toContain('任一满足')
  })

  it('narrows simple conditions and ignores disabled or empty rules', () => {
    expect(isSimpleCondition({ field: 'a', operator: '=', value: 1 })).toBe(true)
    expect(isSimpleCondition({ all: [] })).toBe(false)
    expect(isExecutableCondition(emptyRuleCondition)).toBe(false)
    expect(detectExecutableRuleCodes({ flag: true }, [
      { code: 'ON', enabled: true, conditionJson: { field: 'flag', operator: '=', value: true } },
      { code: 'OFF', enabled: false, conditionJson: { field: 'flag', operator: '=', value: true } },
      { code: 'EMPTY', enabled: true, conditionJson: emptyRuleCondition },
    ])).toEqual(['ON'])
  })

  it('detects every built-in rule individually from frontend-entered data', () => {
    const ruleCodes = Object.keys(builtInRuleConditions)

    ruleCodes.forEach((code) => {
      const client = makeTriggeringClient([code])
      expect(detectExecutableRuleCodes(client, rulesFor([code]))).toEqual([code])
    })
  })

  it('detects every pair and triple of built-in rules without conflicts', () => {
    const ruleCodes = Object.keys(builtInRuleConditions)
    const cases = [
      ...combinations(ruleCodes, 2),
      ...combinations(ruleCodes, 3),
    ]

    cases.forEach((codes) => {
      const client = makeTriggeringClient(codes)
      expect(detectExecutableRuleCodes(client, rulesFor(codes))).toEqual(codes)
    })
  })

  it('detects all built-in rules together', () => {
    const ruleCodes = Object.keys(builtInRuleConditions)
    const client = makeTriggeringClient(ruleCodes)

    expect(detectExecutableRuleCodes(client, rulesFor(ruleCodes))).toEqual(ruleCodes)
  })
})
