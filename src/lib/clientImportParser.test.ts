import { describe, expect, it } from 'vitest'
import {
  createClientImportTemplateCsv,
  decodeClientImportText,
  parseClientImportRows,
  parseClientImportText,
  parseClientImportWorkbook,
} from './clientImportParser'

describe('clientImportParser', () => {
  it('creates the client import CSV template with localized headers', () => {
    const csv = createClientImportTemplateCsv()
    const [header, sample] = csv.split('\r\n')

    expect(header).toContain('企业名称')
    expect(header).toContain('统一社会信用代码')
    expect(header).toContain('月收入')
    expect(sample).toContain('示例企业（请替换）')
    expect(sample).toContain('管理报表')
  })

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

  it('ignores a UTF-8 BOM before the first CSV header', () => {
    const parsed = parseClientImportText([
      '\uFEFF企业名称,月收入',
      '上海 BOM 测试有限公司,120000',
    ].join('\n'))

    expect(parsed.patch).toMatchObject({
      name: '上海 BOM 测试有限公司',
      monthlyRevenue: '120000',
    })
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

  it('parses VAT declaration aliases from object imports', () => {
    const parsed = parseClientImportText(JSON.stringify({
      销售额合计: 2800000,
      货物及劳务销售额: 1800000,
      应纳税额合计: 146000,
    }))

    expect(parsed.patch).toMatchObject({
      taxableSales: 1800000,
      vatTaxPayable: 146000,
    })
    expect(parsed.mappings.map((item) => item.field)).toEqual(expect.arrayContaining(['taxableSales', 'vatTaxPayable']))
  })

  it('parses asset total balance aliases from object imports', () => {
    const parsed = parseClientImportText(JSON.stringify({
      资产总额期末余额: 4800000,
      资产合计期末余额: 3600000,
    }))

    expect(parsed.patch).toMatchObject({
      assetsTotal: 3600000,
    })
    expect(parsed.mappings.map((item) => item.field)).toContain('assetsTotal')
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
      assetsTotal: '3600000',
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

  it('recognizes VAT declaration rows including ending credit', () => {
    const parsed = parseClientImportRows([
      ['项目', '金额'],
      ['增值税纳税申报表', ''],
      ['应税销售额', '2,800,000'],
      ['销项税额', '364000'],
      ['进项税额', '218000'],
      ['增值税应纳税额', '146000'],
      ['期末留抵税额', '72000'],
    ])

    expect(parsed.detectedTables).toContain('增值税数据')
    expect(parsed.patch).toMatchObject({
      taxableSales: 2800000,
      outputTax: '364000',
      inputTax: '218000',
      vatTaxPayable: '146000',
      endingVatCredit: '72000',
    })
  })

  it('recognizes ending VAT credit total rows as VAT data', () => {
    const parsed = parseClientImportRows([
      ['项目', '金额'],
      ['期末留抵税额合计', '58,000'],
    ])

    expect(parsed.detectedTables).toContain('增值税数据')
    expect(parsed.patch).toMatchObject({
      endingVatCredit: '58,000',
    })
  })

  it('recognizes balance sheet asset totals', () => {
    const parsed = parseClientImportRows([
      ['项目', '期末余额', '年初余额'],
      ['资产负债表', '', ''],
      ['流动资产合计', '1,800,000', '1,200,000'],
      ['资产总计', '3,600,000', '2,900,000'],
      ['负债合计', '1,100,000', '980,000'],
      ['所有者权益合计', '2,500,000', '1,920,000'],
    ])

    expect(parsed.detectedTables).toContain('资产负债表')
    expect(parsed.patch).toMatchObject({
      assetsTotal: 3600000,
    })
  })

  it('prefers ending balance columns for asset totals', () => {
    const parsed = parseClientImportRows([
      ['项目', '年初余额', '期末余额'],
      ['资产合计', '2,900,000', '3,600,000'],
    ])

    expect(parsed.detectedTables).toContain('资产负债表')
    expect(parsed.patch).toMatchObject({
      assetsTotal: 3600000,
    })
  })

  it('recognizes asset total labels without an explicit balance sheet title', () => {
    const parsed = parseClientImportRows([
      ['项目', '期末余额'],
      ['资产总额', '4,800,000'],
    ])

    expect(parsed.detectedTables).toContain('资产负债表')
    expect(parsed.patch).toMatchObject({
      assetsTotal: '4,800,000',
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

  it('uses account-balance debit and credit columns based on mapped field', () => {
    const parsed = parseClientImportRows([
      ['科目编码', '科目名称', '期末余额', '本期借方', '本期贷方'],
      ['6001', '主营业务收入', '0', '0', '1,500,000'],
      ['6401', '主营业务成本', '0', '920000', '0'],
      ['22210101', '应交增值税销项税额', '0', '0', '195000'],
      ['22210102', '应交增值税进项税额', '0', '112000', '0'],
      ['1002', '银行存款', '2800000', '3,100,000', '300000'],
    ])

    expect(parsed.patch).toMatchObject({
      mainBusinessRevenue: 1500000,
      mainBusinessCost: 920000,
      outputTax: 195000,
      inputTax: 112000,
      collectionFlow: 3100000,
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
