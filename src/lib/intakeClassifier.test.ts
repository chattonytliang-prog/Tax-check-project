import { describe, expect, it } from 'vitest'
import { classifyIntakeMaterial, detectIntakePeriod } from './intakeClassifier'

describe('intakeClassifier', () => {
  it('classifies every supported source material family', () => {
    expect(classifyIntakeMaterial({ fileName: '营业执照.png', textSample: '统一社会信用代码 市场监督管理局' }).documentType).toBe('business_license')
    expect(classifyIntakeMaterial({ fileName: '综合所得申报_202512.xls', sheetNames: ['个人所得税扣缴申报表'] }).documentType).toBe('iit_withholding')
    expect(classifyIntakeMaterial({ fileName: '工资表.xlsx', textSample: '姓名 身份证件号码 累计收入额' }).documentType).toBe('payroll')
    expect(classifyIntakeMaterial({ fileName: '附列资料四.pdf', textSample: '增值税及附加税费申报表附列资料 税额抵减情况表' }).documentType).toBe('vat_return_schedule')
    expect(classifyIntakeMaterial({ fileName: '增值税申报表.pdf', textSample: '销项税额 进项税额 应纳税额合计' }).documentType).toBe('vat_return')
    expect(classifyIntakeMaterial({ fileName: '202512.xlsx', sheetNames: ['发票'], textSample: '发票清单 数电发票 销售方纳税人名称' }).documentType).toBe('invoice_list')
    expect(classifyIntakeMaterial({ fileName: '明细账.xls', textSample: '账簿目录表 凭证字号 本年累计' }).documentType).toBe('ledger')
    expect(classifyIntakeMaterial({ fileName: '科目余额表.xls', textSample: '期初余额 本期发生额 期末余额' }).documentType).toBe('account_balance')
    expect(classifyIntakeMaterial({ fileName: '批量导出.xls', sheetNames: ['资产负债表', '利润表', '现金流量表'] }).documentType).toBe('financial_statement')
    expect(classifyIntakeMaterial({ fileName: '社保清单.xlsx', textSample: '养老保险 医疗保险 失业保险' }).documentType).toBe('social_security')
    expect(classifyIntakeMaterial({ fileName: '公积金.xlsx', textSample: '住房公积金' }).documentType).toBe('housing_fund')
    expect(classifyIntakeMaterial({ fileName: '银行流水.xlsx', textSample: '交易流水 收款账号 付款账号' }).documentType).toBe('bank_statement')
    expect(classifyIntakeMaterial({ fileName: '采购合同.docx', textSample: '甲方 乙方 协议' }).documentType).toBe('contract')
    expect(classifyIntakeMaterial({ fileName: '记账凭证.pdf', textSample: '原始凭证 附件张数' }).documentType).toBe('voucher')
    expect(classifyIntakeMaterial({ fileName: '说明.txt', textSample: '普通说明' })).toMatchObject({ documentType: 'other_material', confidence: 'low' })
  })

  it('detects source systems and specialized parser needs', () => {
    expect(classifyIntakeMaterial({ fileName: '金蝶导出.xls', textSample: 'KIS 科目余额表' })).toMatchObject({
      documentType: 'account_balance',
      sourceSystem: '金蝶',
      requiresSpecializedParser: true,
    })
    expect(classifyIntakeMaterial({ fileName: '金亿财税工资表.xlsx' }).sourceSystem).toBe('金亿财税')
    expect(classifyIntakeMaterial({ fileName: '云代账银行流水.xlsx' }).sourceSystem).toBe('云代账')
    expect(classifyIntakeMaterial({ fileName: '电子税务局申报表.pdf' }).sourceSystem).toBe('电子税务局')
    expect(classifyIntakeMaterial({ textSample: '合同 甲方 乙方' })).toMatchObject({ confidence: 'medium', requiresSpecializedParser: false })
  })

  it('detects filing periods from official and accounting-export formats', () => {
    expect(detectIntakePeriod({ fileName: '申报表(2025-12-01-2025-12-31).pdf' })).toEqual({
      periodType: 'monthly',
      periodStart: '2025-12-01',
      periodEnd: '2025-12-31',
      evidence: '2025-12-01-2025-12-31',
    })
    expect(detectIntakePeriod({ textSample: '税款所属期：2025年12月01日至2025年12月31日' }).periodEnd).toBe('2025-12-31')
    expect(detectIntakePeriod({ textSample: '税款所属期：2025年11月01日至2025年12月31日' })).toMatchObject({
      periodType: 'range',
      periodStart: '2025-11-01',
      periodEnd: '2025-12-31',
    })
    expect(detectIntakePeriod({ fileName: '明细账_全部科目_202501-202512.xls' })).toMatchObject({
      periodType: 'annual',
      periodStart: '2025-01-01',
      periodEnd: '2025-12-31',
    })
    expect(detectIntakePeriod({ textSample: '2025年1月-12月' })).toMatchObject({
      periodType: 'annual',
      periodStart: '2025-01-01',
      periodEnd: '2025-12-31',
    })
    expect(detectIntakePeriod({ fileName: '202512.xlsx' })).toMatchObject({
      periodType: 'monthly',
      periodStart: '2025-12-01',
      periodEnd: '2025-12-31',
    })
    expect(detectIntakePeriod({ textSample: '报表日期：2026年3月' })).toMatchObject({
      periodType: 'monthly',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
    })
    expect(detectIntakePeriod({ fileName: '余额表（2026.3-2026.3）.xls', textSample: '期间：2026年03月-2026年03月' })).toMatchObject({
      periodType: 'monthly',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
    })
    expect(detectIntakePeriod({ textSample: '2024年9月-2025年12月工资表' })).toMatchObject({
      periodType: 'range',
      periodStart: '2024-09-01',
      periodEnd: '2025-12-31',
    })
    expect(detectIntakePeriod({ textSample: '工资月份 9/1/24 10/1/24 11/1/24 12/1/25' })).toMatchObject({
      periodType: 'range',
      periodStart: '2024-09-01',
      periodEnd: '2025-12-31',
    })
    expect(detectIntakePeriod({ textSample: '工资月份 9/1/2024 10/1/2024' })).toMatchObject({
      periodType: 'range',
      periodStart: '2024-09-01',
      periodEnd: '2024-10-31',
    })
  })

  it('returns unknown period when no reliable filing period exists', () => {
    expect(detectIntakePeriod({ fileName: '客户说明.txt', textSample: '科目编码 2202008 2202021' })).toEqual({
      periodType: 'unknown',
      periodStart: '',
      periodEnd: '',
      evidence: '',
    })
  })
})
