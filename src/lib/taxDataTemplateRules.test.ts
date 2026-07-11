import { describe, expect, it } from 'vitest'
import { parseTaxDataPdfText, parseTaxDataWorkbook } from './taxDataIntakeParser'
import { supportedTaxDataTemplates } from './taxDataTemplateRules'

describe('tax data template rules', () => {
  it('publishes every supported production template with a stable version', () => {
    expect(supportedTaxDataTemplates).toHaveLength(9)
    expect(new Set(supportedTaxDataTemplates.map((template) => template.id)).size).toBe(9)
    expect(supportedTaxDataTemplates.every((template) => template.version === 1)).toBe(true)
  })

  it('splits a multi-month payroll workbook into monthly periods under one template', () => {
    const parsed = parseTaxDataWorkbook('2024年9月-2024年10月工资表.xlsx', [{
      name: 'Sheet1',
      rows: [
        ['工资表'],
        ['单位：测试企业', '9/1/24'],
        ['姓名', '身份证件类型', '身份证件号码', '工资', '基本养老保险费', '基本医疗保险费', '失业保险费', '应纳税所得额', '税率', '应纳税额'],
        ['张三', '居民身份证', '110101199001011234', '5000', '400', '100', '20', '1000', '0.03', '30'],
        ['工资表'],
        ['单位：测试企业', '10/1/24'],
        ['姓名', '身份证件类型', '身份证件号码', '工资', '基本养老保险费', '基本医疗保险费', '失业保险费', '应纳税所得额', '税率', '应纳税额'],
        ['张三', '居民身份证', '110101199001011234', '5200', '400', '100', '20', '1200', '0.03', '36'],
      ],
    }])

    expect(parsed.records.map((record) => record.periodStart)).toEqual(['2024-09-01', '2024-10-01'])
    expect(parsed.templateMatches[0]).toMatchObject({ templateId: 'payroll_multi_month_excel_v1', autoImportEligible: true })
    expect(parsed.autoImportEligible).toBe(true)
  })

  it('blocks an account balance whose row-level balance equation fails', () => {
    const parsed = parseTaxDataWorkbook('科目余额表_2026年3月-2026年3月_测试企业_20260507.xls', [{
      name: '科目余额表',
      rows: [
        ['科目余额表'],
        ['编制单位：测试企业', '2026年3月至2026年3月', '单位：元'],
        ['科目编码', '科目名称', '期初余额', '期初余额', '本期发生额', '本期发生额', '本年累计发生额', '本年累计发生额', '期末余额', '期末余额'],
        ['', '', '借方', '贷方', '借方', '贷方', '借方', '贷方', '借方', '贷方'],
        ['1001', '库存现金', '10', '', '2', '', '2', '', '99', ''],
      ],
    }])

    expect(parsed.templateMatches[0].validations).toContainEqual(expect.objectContaining({ code: 'record_integrity', status: 'failed', blocking: true }))
    expect(parsed.autoImportEligible).toBe(false)
    expect(parsed.conflicts).toContainEqual(expect.objectContaining({ conflictType: 'template_validation_failed', severity: 'high' }))
  })

  it('captures all eight rows of VAT schedule four', () => {
    const rows = [
      '1 税控设备费及技术维护费 0.00 0.00 0.00 0.00 0.00',
      '2 分支机构预征缴纳税款 0.00 0.00 0.00 0.00 0.00',
      '3 建筑服务预征缴纳税款 0.00 0.00 0.00 0.00 0.00',
      '4 销售不动产预征缴纳税款 0.00 0.00 0.00 0.00 0.00',
      '5 出租不动产预征缴纳税款 0.00 0.00 0.00 0.00 0.00',
      '6 一般项目加计抵减额计算 0.00 0.00 0.00 0.00 0.00 0.00',
      '7 即征即退项目加计抵减额计算 0.00 0.00 0.00 0.00 0.00 0.00',
      '8 合计 0.00 0.00 0.00 0.00 0.00 0.00',
    ]
    const parsed = parseTaxDataPdfText('《增值税及附加税费申报表附列资料四（税额抵减情况表）》(2025-12-01-2025-12-31).pdf', [
      ['增值税及附加税费申报表附列资料（四）', '税额抵减情况表', '税款所属时间：2025年12月1日至2025年12月31日', '纳税人名称：测试企业', '期初余额 本期发生额 本期实际抵减税额 期末余额', ...rows].join('\n'),
    ])

    expect(parsed.records).toHaveLength(8)
    expect(parsed.templateMatches[0]).toMatchObject({ templateId: 'vat_schedule_4_tax_credit_pdf_v1', autoImportEligible: true })
  })

  it('keeps all three statements from one financial batch workbook', () => {
    const common = [['编制单位：测试企业', '2026年3月', '单位：元']]
    const parsed = parseTaxDataWorkbook('测试企业2026年3月批量导出.xls', [
      { name: '资产负债表', rows: [['资产负债表'], ['会小企01表'], ...common, ['资产', '行次', '期末余额', '年初余额', '负债和所有者权益', '行次', '期末余额', '年初余额'], ['货币资金', '1', '100', '80', '应付账款', '31', '20', '10']] },
      { name: '利润表', rows: [['利润表'], ['会小企02表'], ...common, ['项目', '行次', '本年累计金额', '本期金额'], ['营业收入', '1', '100', '30']] },
      { name: '现金流量表', rows: [['现金流量表'], ['会小企03表'], ...common, ['项目', '行次', '本年累计金额', '本期金额'], ['销售商品收到的现金', '1', '100', '30']] },
    ])

    expect(new Set(parsed.records.map((record) => record.recordSubtype))).toEqual(new Set(['balance_sheet', 'income_statement', 'cash_flow_statement']))
    expect(parsed.templateMatches.every((match) => match.templateId === 'small_enterprise_financial_batch_excel_v1' && match.autoImportEligible)).toBe(true)
  })
})
