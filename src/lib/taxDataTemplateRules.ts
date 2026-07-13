import type { IntakeDocumentType } from './intakeClassifier'
import type { IntakeSheet } from './taxDataIntakeParser'

export type TemplateValidation = {
  code: string
  label: string
  status: 'passed' | 'failed' | 'warning'
  blocking: boolean
  detail: string
}

export type TemplateMatch = {
  templateId: string
  templateName: string
  version: number
  documentType: IntakeDocumentType
  slotId: string
  confidence: 'high' | 'medium' | 'low'
  matched: boolean
  autoImportEligible: boolean
  validations: TemplateValidation[]
}

type WorkbookTemplateRule = {
  id: string
  name: string
  version: number
  documentType: IntakeDocumentType
  slotId: string
  fileName?: RegExp
  sheetName?: RegExp
  requiredSignatures: RegExp[]
  minimumSignatureMatches: number
}

type PdfTemplateRule = Omit<WorkbookTemplateRule, 'sheetName'>

const workbookRules: WorkbookTemplateRule[] = [
  {
    id: 'payroll_multi_month_excel_v1', name: '多期间工资表', version: 1, documentType: 'payroll', slotId: 'payroll',
    fileName: /工资表/, sheetName: /Sheet1|工资/, minimumSignatureMatches: 5,
    requiredSignatures: [/工资表/, /姓名/, /身份证件号码/, /工资/, /基本养老保险费/, /基本医疗保险费/, /失业保险费/, /应纳税所得额/],
  },
  {
    id: 'input_invoice_deduction_list_excel_v1', name: '增值税进项勾选发票清单', version: 1, documentType: 'invoice_list', slotId: 'invoice-input',
    fileName: /\d{6}\.xlsx$/i, sheetName: /发票|海关缴款书|代扣代缴|农产品|异常发票/, minimumSignatureMatches: 5,
    requiredSignatures: [/发票清单/, /税款所属期/, /纳税人名称/, /勾选状态/, /开票日期|填发日期/, /有效抵扣税额/],
  },
  {
    id: 'small_enterprise_financial_batch_excel_v1', name: '小企业会计准则财务三表批量导出', version: 1, documentType: 'financial_statement', slotId: 'financial-statements',
    fileName: /批量导出/, sheetName: /资产负债表|利润表|现金流量表/, minimumSignatureMatches: 4,
    requiredSignatures: [/会小企0[123]表/, /编制单位/, /单位：元/, /行次/, /期末余额|本年累计金额/],
  },
  {
    id: 'account_balance_amount_style_excel_v1', name: '科目余额表（本币金额式）', version: 1, documentType: 'account_balance', slotId: 'account-balance',
    fileName: /余额表（.*-.*）/, sheetName: /本币金额/, minimumSignatureMatches: 6,
    requiredSignatures: [/科目余额表（本币金额式）/, /期间：/, /核算单位/, /科目编码/, /科目名称/, /期初余额/, /本期发生额/, /期末余额/],
  },
  {
    id: 'iit_withholding_return_excel_v1', name: '个人所得税扣缴申报表', version: 1, documentType: 'iit_withholding', slotId: 'iit-withholding',
    fileName: /综合所得申报/, sheetName: /个人所得税扣缴申报表/, minimumSignatureMatches: 6,
    requiredSignatures: [/个人所得税扣缴申报表/, /税款所属期/, /扣缴义务人名称/, /身份证件号码/, /所得项目/, /累计收入额/, /应纳税所得额/, /税率\/预扣率/],
  },
  {
    id: 'ledger_multi_sheet_excel_v1', name: '全部科目多工作表明细账', version: 1, documentType: 'ledger', slotId: 'ledger',
    fileName: /明细账_全部科目/, sheetName: /^(?!目录|封面|横向封面).+/, minimumSignatureMatches: 6,
    requiredSignatures: [/编制单位/, /科目：/, /日期/, /凭证字号/, /科目编码/, /科目名称/, /摘要/, /借方/, /贷方/, /余额/],
  },
  {
    id: 'account_balance_ytd_excel_v1', name: '科目余额表（含本年累计）', version: 1, documentType: 'account_balance', slotId: 'account-balance',
    fileName: /科目余额表_/, sheetName: /^科目余额表$/, minimumSignatureMatches: 7,
    requiredSignatures: [/科目余额表/, /编制单位/, /科目编码/, /科目名称/, /期初余额/, /本期发生额/, /本年累计发生额/, /期末余额/],
  },
]

const pdfRules: PdfTemplateRule[] = [
  {
    id: 'vat_general_return_main_pdf_v1', name: '增值税及附加税费申报表（一般纳税人适用）', version: 1,
    documentType: 'vat_return', slotId: 'vat-return-main', minimumSignatureMatches: 6,
    fileName: /增值税及附加税费申报表（一般纳税人适用）/,
    requiredSignatures: [/一般纳税人适用/, /税款所属时间/, /纳税人名称/, /销售额/, /销项税额/, /进项税额/, /应纳税额/],
  },
  {
    id: 'vat_schedule_4_tax_credit_pdf_v1', name: '增值税附列资料（四）税额抵减情况表', version: 1,
    documentType: 'vat_return_schedule', slotId: 'vat-schedule-4', minimumSignatureMatches: 6,
    fileName: /附列资料四|附列资料（四）|税额抵减情况表/,
    requiredSignatures: [/附列资料.?四|税额抵减情况表/, /税款所属时间/, /纳税人名称/, /期初余额/, /本期发生额/, /本期实际抵减税额/, /期末余额/],
  },
]

function normalizeText(value: string) {
  return value.replace(/\s+/g, '')
}

function resultFor(rule: WorkbookTemplateRule | PdfTemplateRule, signatureText: string, fileNameMatched: boolean, sheetNameMatched: boolean, hasPeriod: boolean, recordCount: number): TemplateMatch {
  const signatureMatches = rule.requiredSignatures.filter((pattern) => pattern.test(signatureText)).length
  const validations: TemplateValidation[] = [
    { code: 'file_name', label: '文件命名', status: fileNameMatched ? 'passed' : 'warning', blocking: false, detail: fileNameMatched ? '文件名符合模板约定' : '文件名不同，但允许继续按结构核验' },
    { code: 'sheet_name', label: '工作表名称', status: sheetNameMatched ? 'passed' : 'failed', blocking: true, detail: sheetNameMatched ? '工作表名称符合模板' : '工作表名称不符合模板' },
    { code: 'structure', label: '固定结构', status: signatureMatches >= rule.minimumSignatureMatches ? 'passed' : 'failed', blocking: true, detail: `命中 ${signatureMatches}/${rule.requiredSignatures.length} 个结构特征，最低要求 ${rule.minimumSignatureMatches} 个` },
    { code: 'period', label: '数据期间', status: hasPeriod ? 'passed' : 'failed', blocking: true, detail: hasPeriod ? '已取得完整起止期间' : '未取得完整起止期间' },
    { code: 'records', label: '标准记录', status: recordCount > 0 ? 'passed' : 'failed', blocking: true, detail: recordCount > 0 ? `已生成 ${recordCount} 条标准记录` : '未生成可入库记录' },
  ]
  const matched = sheetNameMatched && signatureMatches >= rule.minimumSignatureMatches
  const autoImportEligible = matched && validations.every((item) => !item.blocking || item.status === 'passed')
  return {
    templateId: rule.id, templateName: rule.name, version: rule.version, documentType: rule.documentType, slotId: rule.slotId,
    confidence: autoImportEligible ? 'high' : matched ? 'medium' : 'low', matched, autoImportEligible, validations,
  }
}

function rankTemplateMatches(matches: TemplateMatch[]) {
  if (matches.length < 2) return matches
  return matches.sort((a, b) => Number(b.matched) - Number(a.matched) || b.validations.filter((item) => item.status === 'passed').length - a.validations.filter((item) => item.status === 'passed').length)
}

export function matchWorkbookTemplate(fileName: string, sheet: IntakeSheet, documentType: IntakeDocumentType, hasPeriod: boolean, recordCount: number) {
  const text = normalizeText(`${fileName}\n${sheet.name}\n${sheet.rows.slice(0, 12).flat().join('\n')}`)
  const candidates = workbookRules.filter((rule) => rule.documentType === documentType)
  const ranked = rankTemplateMatches(candidates.map((rule) => {
    const fileNameMatched = !rule.fileName || rule.fileName.test(fileName)
    const sheetNameMatched = !rule.sheetName || rule.sheetName.test(sheet.name)
    return resultFor(rule, text, fileNameMatched, sheetNameMatched, hasPeriod, recordCount)
  }))
  return ranked[0]
}

export function matchPdfTemplate(fileName: string, text: string, documentType: IntakeDocumentType, hasPeriod: boolean, recordCount: number) {
  const sample = normalizeText(`${fileName}\n${text}`)
  const candidates = pdfRules.filter((rule) => rule.documentType === documentType)
  const ranked = rankTemplateMatches(candidates.map((rule) => resultFor(rule, sample, !rule.fileName || rule.fileName.test(fileName), true, hasPeriod, recordCount)))
  return ranked[0]
}

export const supportedTaxDataTemplates = [...workbookRules, ...pdfRules].map((rule) => ({
  id: rule.id, name: rule.name, version: rule.version, documentType: rule.documentType, slotId: rule.slotId,
}))
