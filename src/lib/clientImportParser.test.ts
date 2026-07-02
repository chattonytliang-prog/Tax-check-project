import { describe, expect, it } from 'vitest'
import {
  decodeClientImportText,
  parseClientImportRows,
  parseClientImportText,
  parseClientImportWorkbook,
} from './clientImportParser'

describe('clientImportParser', () => {
  it('parses template-style CSV headers into client fields', () => {
    const parsed = parseClientImportText([
      '企业名称,统一社会信用代码,月收入,月成本费用,销项税额',
      '上海模板测试有限公司,91310000TEMPLATE,100000,60000,13000',
    ].join('\n'))

    expect(parsed.patch).toMatchObject({
      name: '上海模板测试有限公司',
      creditCode: '91310000TEMPLATE',
      monthlyRevenue: '100000',
      monthlyCost: '60000',
      outputTax: '13000',
    })
    expect(parsed.mappings.map((item) => item.field)).toEqual(expect.arrayContaining(['name', 'monthlyRevenue', 'outputTax']))
  })

  it('keeps quoted CSV amounts with thousands separators in one cell', () => {
    const parsed = parseClientImportText([
      '企业名称,月收入,月成本费用',
      '上海模板测试有限公司,"1,200,000","820,000"',
    ].join('\n'))

    expect(parsed.patch).toMatchObject({
      name: '上海模板测试有限公司',
      monthlyRevenue: '1,200,000',
      monthlyCost: '820,000',
    })
  })

  it('parses JSON object imports with Chinese field aliases', () => {
    const parsed = parseClientImportText(JSON.stringify({
      企业名称: '上海 JSON 导入测试有限公司',
      统一社会信用代码: '91310000JSONTEST',
      月收入: 230000,
      数据来源: '管理报表',
    }))

    expect(parsed.patch).toMatchObject({
      name: '上海 JSON 导入测试有限公司',
      creditCode: '91310000JSONTEST',
      monthlyRevenue: 230000,
      dataBasis: '管理报表',
    })
  })

  it('decodes GB18030 accounting CSV text before parsing', () => {
    const gb18030Csv = new Uint8Array([
      0xc6, 0xf3, 0xd2, 0xb5, 0xc3, 0xfb, 0xb3, 0xc6, 0x2c, 0xd4, 0xc2, 0xca, 0xd5, 0xc8, 0xeb, 0x0a,
      0xc9, 0xcf, 0xba, 0xa3, 0x2c, 0x31, 0x30, 0x30, 0x30,
    ])
    const parsed = parseClientImportText(decodeClientImportText(gb18030Csv.buffer))

    expect(parsed.patch).toMatchObject({
      name: '上海',
      monthlyRevenue: '1000',
    })
  })

  it('recognizes Kingdee profit statement row exports', () => {
    const parsed = parseClientImportRows([
      ['项目', '本期金额'],
      ['金蝶云星空 利润表', ''],
      ['企业名称', '上海导入测试有限公司'],
      ['统一社会信用代码', '91310000TESTIMPORT'],
      ['营业收入', '1,200,000'],
      ['营业成本', '820000'],
      ['利润总额', '180000'],
      ['资产总计', '3600000'],
      ['销项税额', '156000'],
      ['进项税额', '98000'],
      ['工资薪金', '300000'],
    ])

    expect(parsed.detectedSourceType).toBe('金蝶导出表')
    expect(parsed.detectedTables).toEqual(expect.arrayContaining(['利润表', '增值税数据']))
    expect(parsed.patch).toMatchObject({
      name: '上海导入测试有限公司',
      creditCode: '91310000TESTIMPORT',
      mainBusinessRevenue: 1200000,
      mainBusinessCost: 820000,
      ytdProfit: 180000,
      assetsTotal: 3600000,
      outputTax: '156000',
      inputTax: '98000',
      payrollTotal: 300000,
    })
  })

  it('parses accounting exports with bracketed negative amounts', () => {
    const parsed = parseClientImportRows([
      ['项目', '本期金额'],
      ['利润表', ''],
      ['营业收入', '1,200,000'],
      ['营业成本', '(820,000)'],
      ['利润总额', '380,000'],
    ])

    expect(parsed.patch).toMatchObject({
      mainBusinessRevenue: 1200000,
      mainBusinessCost: -820000,
      ytdProfit: 380000,
    })
  })

  it('recognizes Yonyou account balance exports', () => {
    const parsed = parseClientImportRows([
      ['科目编码', '科目名称', '期末余额'],
      ['1002', '银行存款', '2,500,000'],
      ['22210101', '应交增值税销项税额', '52000'],
      ['22210102', '应交增值税进项税额', '31000'],
      ['660201', '业务招待费', '18000'],
      ['660202', '广告宣传费', '45000'],
      ['2211', '应付职工薪酬', '280000'],
      ['用友 U8 科目余额表', '', ''],
    ])

    expect(parsed.detectedSourceType).toBe('用友导出表')
    expect(parsed.detectedTables).toContain('科目余额表')
    expect(parsed.patch).toMatchObject({
      collectionFlow: 2500000,
      outputTax: 52000,
      inputTax: 31000,
      entertainmentExpense: 18000,
      adExpense: 45000,
      payrollTotal: 280000,
    })
  })

  it('merges recognizable rows across workbook sheets', async () => {
    const XLSX = await import('@e965/xlsx')
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['导出说明'],
      ['本文件由财务软件导出'],
    ]), '说明')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['项目', '本期金额'],
      ['金蝶云星空 利润表', ''],
      ['营业收入', '1,200,000'],
      ['营业成本', '820000'],
    ]), '利润表')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['科目编码', '科目名称', '期末余额'],
      ['1002', '银行存款', '2,500,000'],
      ['22210101', '应交增值税销项税额', '52000'],
    ]), '科目余额表')
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

    const parsed = await parseClientImportWorkbook(buffer)

    expect(parsed.detectedSourceType).toBe('金蝶导出表')
    expect(parsed.detectedTables).toEqual(expect.arrayContaining(['利润表', '科目余额表', '增值税数据']))
    expect(parsed.patch).toMatchObject({
      mainBusinessRevenue: 1200000,
      mainBusinessCost: 820000,
      collectionFlow: 2500000,
      outputTax: 52000,
    })
  })
})
