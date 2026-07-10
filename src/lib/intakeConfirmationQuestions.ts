import type { ImportMappingPreview } from './clientImportParser'
import type { IntakeClassification, IntakePeriodDetection } from './intakeClassifier'

export type IntakeConfirmationQuestion = {
  id: string
  field: string
  label: string
  question: string
  severity: 'required' | 'recommended'
  source: string
  evidence?: string
}

export type IntakeConfirmationQuestionInput = {
  fileName?: string
  classification: IntakeClassification
  period: IntakePeriodDetection
  parsedImport?: {
    mappings: ImportMappingPreview[]
    unmappedHeaders: string[]
    detectedTables: string[]
    detectedSourceType?: string
    taxDataIntake?: {
      records: unknown[]
      warnings: string[]
    }
  }
}

const documentTypeLabels: Record<string, string> = {
  business_license: '营业执照',
  financial_statement: '财务报表',
  account_balance: '科目余额表',
  ledger: '明细账',
  vat_return: '增值税申报主表',
  vat_return_schedule: '增值税申报附表',
  invoice_list: '发票清单',
  payroll: '工资表',
  iit_withholding: '个税扣缴申报',
  social_security: '社保资料',
  housing_fund: '公积金资料',
  bank_statement: '银行流水',
  contract: '合同',
  voucher: '凭证',
  other_material: '其他资料',
}

function questionId(field: string, suffix: string) {
  return `${field}:${suffix}`.replace(/[^a-z0-9:_-]/gi, '_')
}

function pushUnique(questions: IntakeConfirmationQuestion[], question: IntakeConfirmationQuestion) {
  if (questions.some((item) => item.id === question.id || item.question === question.question)) return
  questions.push(question)
}

function formatPeriod(period: IntakePeriodDetection) {
  if (!period.periodStart || !period.periodEnd) return ''
  return period.periodStart === period.periodEnd
    ? period.periodStart
    : `${period.periodStart} 至 ${period.periodEnd}`
}

export function buildIntakeConfirmationQuestions(input: IntakeConfirmationQuestionInput) {
  const questions: IntakeConfirmationQuestion[] = []
  const fileLabel = input.fileName ? `「${input.fileName}」` : '这份资料'
  const typeLabel = documentTypeLabels[input.classification.documentType] || input.classification.documentType
  const source = input.fileName || typeLabel
  const mappedCount = input.parsedImport?.mappings.length || 0
  const unmappedHeaders = input.parsedImport?.unmappedHeaders || []
  const standardRecordCount = input.parsedImport?.taxDataIntake?.records.length || 0

  if (input.classification.documentType === 'other_material' || input.classification.confidence === 'low') {
    pushUnique(questions, {
      id: questionId('documentType', 'unknown'),
      field: 'documentType',
      label: '资料类型',
      question: `${fileLabel}还不能稳定判断资料类型，请确认它属于哪一类税务资料，以及希望用于建档、申报复核还是风险检查？`,
      severity: 'required',
      source,
    })
  } else {
    pushUnique(questions, {
      id: questionId('documentType', input.classification.documentType),
      field: 'documentType',
      label: '资料类型',
      question: `${fileLabel}系统识别为${typeLabel}，请确认这个资料类型是否正确？`,
      severity: 'recommended',
      source,
      evidence: input.classification.reasons.join('；'),
    })
  }

  const periodLabel = formatPeriod(input.period)
  if (!periodLabel) {
    pushUnique(questions, {
      id: questionId('period', 'unknown'),
      field: 'period',
      label: '资料期间',
      question: `${fileLabel}没有识别到可靠期间，请确认这份资料对应的所属期或覆盖月份。`,
      severity: 'required',
      source,
    })
  } else {
    pushUnique(questions, {
      id: questionId('period', periodLabel),
      field: 'period',
      label: '资料期间',
      question: `${fileLabel}系统识别期间为${periodLabel}，请确认是否正确？`,
      severity: 'recommended',
      source,
      evidence: input.period.evidence,
    })
  }

  if (input.classification.requiresSpecializedParser && standardRecordCount === 0) {
    pushUnique(questions, {
      id: questionId('parser', input.classification.documentType),
      field: 'parserScope',
      label: '解析范围',
      question: `${fileLabel}需要专用解析器逐行收录。请确认是否按${typeLabel}口径生成标准记录和字段证据？`,
      severity: 'recommended',
      source,
    })
  }

  if (unmappedHeaders.length) {
    pushUnique(questions, {
      id: questionId('unmappedHeaders', String(unmappedHeaders.length)),
      field: 'unmappedHeaders',
      label: '未识别列',
      question: `${fileLabel}有${unmappedHeaders.length}个未识别表头：${unmappedHeaders.slice(0, 6).join('、')}。请说明这些列是否需要收录，以及分别对应什么业务含义？`,
      severity: 'recommended',
      source,
    })
  }

  if (input.parsedImport && mappedCount === 0 && standardRecordCount === 0 && input.classification.documentType !== 'other_material') {
    pushUnique(questions, {
      id: questionId('mappedFields', 'none'),
      field: 'mappedFields',
      label: '可落字段',
      question: `${fileLabel}已识别资料类型，但暂未提取到可直接落系统的字段。请确认这份资料只做原件留痕，还是需要人工指定字段映射？`,
      severity: 'recommended',
      source,
    })
  }

  if (input.classification.documentType === 'financial_statement') {
    pushUnique(questions, {
      id: questionId('financialStatement', 'periodNature'),
      field: 'periodNature',
      label: '报表口径',
      question: `${fileLabel}请确认财务报表金额是本月数、本年累计数，还是期末余额/年初余额口径，避免把累计数当月度数。`,
      severity: 'required',
      source,
    })
  }

  if (input.classification.documentType === 'account_balance') {
    pushUnique(questions, {
      id: questionId('accountBalance', 'balanceNature'),
      field: 'balanceNature',
      label: '余额表口径',
      question: `${fileLabel}请确认科目余额表是单月发生额加期末余额，还是截至期末的累计余额表？`,
      severity: 'required',
      source,
    })
  }

  if (input.classification.documentType === 'invoice_list') {
    pushUnique(questions, {
      id: questionId('invoiceList', 'direction'),
      field: 'invoiceDirection',
      label: '发票方向',
      question: `${fileLabel}请确认发票清单包含销项、进项，还是两者都有？`,
      severity: 'required',
      source,
    })
  }

  return questions.slice(0, 8)
}
