import { describe, expect, it } from 'vitest'
import { buildIntakeConfirmationQuestions } from './intakeConfirmationQuestions'
import type { IntakeClassification, IntakePeriodDetection } from './intakeClassifier'

const baseClassification: IntakeClassification = {
  documentType: 'account_balance',
  confidence: 'high',
  sourceSystem: 'Excel',
  reasons: ['file name matched'],
  requiresSpecializedParser: true,
}

const monthlyPeriod: IntakePeriodDetection = {
  periodType: 'monthly',
  periodStart: '2026-03-01',
  periodEnd: '2026-03-31',
  evidence: '2026.3-2026.3',
}

describe('buildIntakeConfirmationQuestions', () => {
  it('asks users to confirm detected type, period, and parser scope', () => {
    const questions = buildIntakeConfirmationQuestions({
      fileName: '科目余额表_2026年3月.xls',
      classification: baseClassification,
      period: monthlyPeriod,
    })

    expect(questions.map((item) => item.field)).toEqual(expect.arrayContaining([
      'documentType',
      'period',
      'parserScope',
      'balanceNature',
    ]))
    expect(questions.some((item) => item.question.includes('2026-03-01 至 2026-03-31'))).toBe(true)
  })

  it('turns unknown period and unmapped headers into customer questions', () => {
    const questions = buildIntakeConfirmationQuestions({
      fileName: '202512.xlsx',
      classification: {
        ...baseClassification,
        documentType: 'invoice_list',
        reasons: ['invoice fields matched'],
      },
      period: {
        periodType: 'unknown',
        periodStart: '',
        periodEnd: '',
        evidence: '',
      },
      parsedImport: {
        mappings: [],
        unmappedHeaders: ['购买方名称', '价税合计'],
        detectedTables: ['发票'],
      },
    })

    expect(questions.map((item) => item.field)).toEqual(expect.arrayContaining([
      'period',
      'unmappedHeaders',
      'mappedFields',
      'invoiceDirection',
    ]))
    expect(questions.find((item) => item.field === 'period')?.severity).toBe('required')
  })

  it('asks for report amount nature on financial statements', () => {
    const questions = buildIntakeConfirmationQuestions({
      fileName: '批量导出.xls',
      classification: {
        ...baseClassification,
        documentType: 'financial_statement',
      },
      period: monthlyPeriod,
    })

    expect(questions.some((item) => item.field === 'periodNature')).toBe(true)
  })

  it('does not ask the customer to reconfirm facts already proven by a deterministic template', () => {
    const questions = buildIntakeConfirmationQuestions({
      fileName: '科目余额表_2026年3月-2026年3月_测试企业.xls',
      classification: baseClassification,
      period: monthlyPeriod,
      parsedImport: {
        mappings: [],
        unmappedHeaders: ['非标准展示列'],
        detectedTables: ['科目余额表'],
        taxDataIntake: { records: [{}], warnings: [], autoImportEligible: true },
      },
    })

    expect(questions).toEqual([])
  })
})
