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
      '企业名称,统一社会信用代码,月收入,月成本费用,销项税额,银行收款流水,本月开票金额,未开票收入,连续零申报,预收账款长期挂账,大额无票费用,咨询服务费发票,关联交易,供应商无进项,发票品名异常,进销不匹配,资金回流,异常发票,民间借贷利息异常,集团管理费,关联定价异常,工资拆分,未代扣个税,关联个人独资,享受小型微利优惠,长期亏损,优惠资料不足,研发加计扣除,库存异常,研发资料不足,代理记账合规风险,近12个月销售额,电商平台收入,私户收款,红字发票金额,职工人数,外包人数,参保人数,个税申报人数,应付职工薪酬,个人劳务费',
      '上海模板测试有限公司,91310000TEMPLATE,100000,60000,13000,280000,96000,是,否,是,是,是,否,是,否,是,否,否,否,是,否,是,否,是,是,否,是,是,否,否,是,1180000,420000,是,18000,36,8,32,35,310000,42000',
    ].join('\n'))

    expect(parsed.patch).toMatchObject({
      name: '上海模板测试有限公司',
      creditCode: '91310000TEMPLATE',
      monthlyRevenue: '100000',
      monthlyCost: '60000',
      outputTax: '13000',
      collectionFlow: '280000',
      monthlyInvoice: '96000',
      unbilledIncome: '是',
      longTermZeroDeclaration: '否',
      prepaidLongTerm: '是',
      largeExpenseNoInvoice: '是',
      serviceFeeInvoices: '是',
      relatedTransactions: '否',
      supplierNoInput: '是',
      invoiceNameMismatch: '否',
      purchaseSalesMismatch: '是',
      fundsReturn: '否',
      abnormalInvoice: '否',
      nonFinancialInterestAbnormal: '否',
      intercompanyManagementFee: '是',
      relatedPricingAbnormal: '否',
      salarySplit: '是',
      noIitWithholding: '否',
      individualVendorRelated: '是',
      smallProfitEnjoyed: '是',
      longTermLoss: '否',
      taxBenefitDataMissing: '是',
      rdDeductionEnjoyed: '是',
      inventoryAbnormal: '否',
      rdDocsInsufficient: '否',
      agencyComplianceRisk: '是',
      consecutive12MonthSales: '1180000',
      platformRevenue: '420000',
      privateAccountCollection: '是',
      redVatSpecialInvoiceAmount: '18000',
      employees: '36',
      laborCount: '8',
      socialSecurityCount: '32',
      salaryDeclaredCount: '35',
      payrollTotal: '310000',
      nonPayrollPersonalPayment: '42000',
    })
    expect(parsed.mappings.map((item) => item.field)).toEqual(expect.arrayContaining([
      'name',
      'monthlyRevenue',
      'outputTax',
      'collectionFlow',
      'monthlyInvoice',
      'unbilledIncome',
      'longTermZeroDeclaration',
      'prepaidLongTerm',
      'largeExpenseNoInvoice',
      'serviceFeeInvoices',
      'relatedTransactions',
      'supplierNoInput',
      'invoiceNameMismatch',
      'purchaseSalesMismatch',
      'fundsReturn',
      'abnormalInvoice',
      'nonFinancialInterestAbnormal',
      'intercompanyManagementFee',
      'relatedPricingAbnormal',
      'salarySplit',
      'noIitWithholding',
      'individualVendorRelated',
      'smallProfitEnjoyed',
      'longTermLoss',
      'taxBenefitDataMissing',
      'rdDeductionEnjoyed',
      'inventoryAbnormal',
      'rdDocsInsufficient',
      'agencyComplianceRisk',
      'consecutive12MonthSales',
      'platformRevenue',
      'privateAccountCollection',
      'redVatSpecialInvoiceAmount',
      'employees',
      'laborCount',
      'socialSecurityCount',
      'salaryDeclaredCount',
      'payrollTotal',
      'nonPayrollPersonalPayment',
    ]))
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

  it('matches headers with punctuation spaces and unit suffixes', () => {
    const parsed = parseClientImportText([
      '企业名称：,统一社会信用代码（必填）,月收入 / 元,销项税额_元,业务招待费（本年累计）',
      '上海表头格式测试有限公司,91310000HEADER,260000,33800,12000',
    ].join('\n'))

    expect(parsed.patch).toMatchObject({
      name: '上海表头格式测试有限公司',
      creditCode: '91310000HEADER',
      monthlyRevenue: '260000',
      outputTax: '33800',
      entertainmentExpense: '12000',
    })
    expect(parsed.mappings.map((item) => item.field)).toEqual(expect.arrayContaining([
      'name',
      'creditCode',
      'monthlyRevenue',
      'outputTax',
      'entertainmentExpense',
    ]))
  })

  it('parses grouped two-line tabular headers', () => {
    const parsed = parseClientImportRows([
      ['基础信息', '基础信息', '经营数据', '经营数据', '风险事项'],
      ['企业名称', '统一社会信用代码', '月收入', '月成本费用', '库存异常'],
      ['上海两行表头测试有限公司', '91310000TWOLINE', '260000', '180000', '否'],
    ])

    expect(parsed.patch).toMatchObject({
      name: '上海两行表头测试有限公司',
      creditCode: '91310000TWOLINE',
      monthlyRevenue: '260000',
      monthlyCost: '180000',
      inventoryAbnormal: '否',
    })
    expect(parsed.mappings.map((item) => item.source)).toEqual(expect.arrayContaining([
      '企业名称',
      '统一社会信用代码',
      '月收入',
      '月成本费用',
      '库存异常',
    ]))
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

  it('parses escaped quotes inside quoted CSV cells', () => {
    const parsed = parseClientImportText([
      '企业名称,统一社会信用代码,数据来源',
      '"上海""引号""测试有限公司",91310000QUOTE,客户导出CSV',
    ].join('\n'))

    expect(parsed.patch).toMatchObject({
      name: '上海"引号"测试有限公司',
      creditCode: '91310000QUOTE',
      dataBasis: '客户导出CSV',
    })
  })

  it('parses CSV text with carriage-return-only line endings', () => {
    const parsed = parseClientImportText('企业名称,月收入\r上海 CR 换行测试有限公司,180000')

    expect(parsed.patch).toMatchObject({
      name: '上海 CR 换行测试有限公司',
      monthlyRevenue: '180000',
    })
  })

  it('parses tab-delimited client exports', () => {
    const parsed = parseClientImportText([
      '企业名称\t统一社会信用代码\t月收入\t月成本费用',
      '上海 TSV 导入测试有限公司\t91310000TSV\t360000\t240000',
    ].join('\n'))

    expect(parsed.patch).toMatchObject({
      name: '上海 TSV 导入测试有限公司',
      creditCode: '91310000TSV',
      monthlyRevenue: '360000',
      monthlyCost: '240000',
    })
  })

  it('parses semicolon-delimited client exports', () => {
    const parsed = parseClientImportText([
      'monthlyRevenue;monthlyCost;outputTax',
      '810000;520000;105300',
    ].join('\n'))

    expect(parsed.patch).toMatchObject({
      monthlyRevenue: '810000',
      monthlyCost: '520000',
      outputTax: '105300',
    })
  })

  it('ignores Excel separator declaration before semicolon exports', () => {
    const parsed = parseClientImportText([
      'sep=;',
      'monthlyRevenue;monthlyCost;outputTax',
      '820000;530000;106600',
    ].join('\n'))

    expect(parsed.patch).toMatchObject({
      monthlyRevenue: '820000',
      monthlyCost: '530000',
      outputTax: '106600',
    })
  })

  it('parses pipe-delimited client exports', () => {
    const parsed = parseClientImportText([
      'monthlyRevenue|monthlyCost|outputTax',
      '910000|580000|118300',
    ].join('\n'))

    expect(parsed.patch).toMatchObject({
      monthlyRevenue: '910000',
      monthlyCost: '580000',
      outputTax: '118300',
    })
  })

  it('keeps semicolon and pipe delimiters inside quoted cells', () => {
    const semicolonParsed = parseClientImportText([
      'monthlyRevenue;monthlyCost;outputTax',
      '810000;"client;system export";105300',
    ].join('\n'))
    const pipeParsed = parseClientImportText([
      'monthlyRevenue|monthlyCost|outputTax',
      '910000|"client|system export"|118300',
    ].join('\n'))

    expect(semicolonParsed.patch).toMatchObject({
      monthlyRevenue: '810000',
      monthlyCost: 'client;system export',
      outputTax: '105300',
    })
    expect(pipeParsed.patch).toMatchObject({
      monthlyRevenue: '910000',
      monthlyCost: 'client|system export',
      outputTax: '118300',
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

  it('merges JSON array object imports', () => {
    const parsed = parseClientImportText(JSON.stringify([
      {
        monthlyRevenue: 310000,
      },
      {
        monthlyCost: 190000,
        outputTax: 40300,
      },
    ]))

    expect(parsed.patch).toMatchObject({
      monthlyRevenue: 310000,
      monthlyCost: 190000,
      outputTax: 40300,
    })
    expect(parsed.mappings.map((item) => item.field)).toEqual(expect.arrayContaining([
      'monthlyRevenue',
      'monthlyCost',
      'outputTax',
    ]))
  })

  it('parses JSON two-dimensional table imports', () => {
    const parsed = parseClientImportText(JSON.stringify([
      ['monthlyRevenue', 'monthlyCost', 'outputTax'],
      [420000, 260000, 54600],
    ]))

    expect(parsed.patch).toMatchObject({
      monthlyRevenue: '420000',
      monthlyCost: '260000',
      outputTax: '54600',
    })
    expect(parsed.mappings.map((item) => item.field)).toEqual(expect.arrayContaining([
      'monthlyRevenue',
      'monthlyCost',
      'outputTax',
    ]))
  })

  it('parses JSON wrapper object data arrays', () => {
    const parsed = parseClientImportText(JSON.stringify({
      data: [
        { monthlyRevenue: 510000 },
        { monthlyCost: 330000, outputTax: 66300 },
      ],
    }))

    expect(parsed.patch).toMatchObject({
      monthlyRevenue: 510000,
      monthlyCost: 330000,
      outputTax: 66300,
    })
  })

  it('parses JSON wrapper object items arrays', () => {
    const parsed = parseClientImportText(JSON.stringify({
      items: [
        { monthlyRevenue: 520000 },
        { monthlyCost: 340000, outputTax: 67600 },
      ],
    }))

    expect(parsed.patch).toMatchObject({
      monthlyRevenue: 520000,
      monthlyCost: 340000,
      outputTax: 67600,
    })
  })

  it('parses JSON wrapper object records arrays', () => {
    const parsed = parseClientImportText(JSON.stringify({
      records: [
        { monthlyRevenue: 530000 },
        { monthlyCost: 350000, outputTax: 68900 },
      ],
    }))

    expect(parsed.patch).toMatchObject({
      monthlyRevenue: 530000,
      monthlyCost: 350000,
      outputTax: 68900,
    })
  })

  it('parses JSON wrapper object list arrays', () => {
    const parsed = parseClientImportText(JSON.stringify({
      list: [
        { monthlyRevenue: 540000 },
        { monthlyCost: 360000, outputTax: 70200 },
      ],
    }))

    expect(parsed.patch).toMatchObject({
      monthlyRevenue: 540000,
      monthlyCost: 360000,
      outputTax: 70200,
    })
  })

  it('parses JSON wrapper object results arrays', () => {
    const parsed = parseClientImportText(JSON.stringify({
      results: [
        { monthlyRevenue: 550000 },
        { monthlyCost: 370000, outputTax: 71500 },
      ],
    }))

    expect(parsed.patch).toMatchObject({
      monthlyRevenue: 550000,
      monthlyCost: 370000,
      outputTax: 71500,
    })
  })

  it('parses JSON wrapper object row arrays', () => {
    const parsed = parseClientImportText(JSON.stringify({
      rows: [
        ['monthlyRevenue', 'monthlyCost', 'outputTax'],
        [610000, 390000, 79300],
      ],
    }))

    expect(parsed.patch).toMatchObject({
      monthlyRevenue: '610000',
      monthlyCost: '390000',
      outputTax: '79300',
    })
  })

  it('parses JSON wrapper object headers and rows', () => {
    const parsed = parseClientImportText(JSON.stringify({
      headers: ['monthlyRevenue', 'monthlyCost', 'outputTax'],
      rows: [
        [710000, 450000, 92300],
      ],
    }))

    expect(parsed.patch).toMatchObject({
      monthlyRevenue: '710000',
      monthlyCost: '450000',
      outputTax: '92300',
    })
  })

  it('parses JSON wrapper object columns and data', () => {
    const parsed = parseClientImportText(JSON.stringify({
      columns: ['monthlyRevenue', 'monthlyCost', 'outputTax'],
      data: [
        [720000, 460000, 93600],
      ],
    }))

    expect(parsed.patch).toMatchObject({
      monthlyRevenue: '720000',
      monthlyCost: '460000',
      outputTax: '93600',
    })
  })

  it('parses agency client list name and tax id aliases', () => {
    const parsed = parseClientImportText(JSON.stringify({
      客户名称: '上海代理客户测试有限公司',
      纳税人识别号: '91310000AGENCY',
      税号: '91310000AGENCY-ALT',
      注册地址: '上海市浦东新区',
      所属行业: '信息技术服务',
      纳税人资格: '一般纳税人',
      成立日期: '2023-05-18',
    }))

    expect(parsed.patch).toMatchObject({
      name: '上海代理客户测试有限公司',
      creditCode: '91310000AGENCY-ALT',
      region: '上海市浦东新区',
      industry: '信息技术服务',
      taxpayerType: '一般纳税人',
      establishedAt: '2023-05-18',
    })
    expect(parsed.mappings.map((item) => item.source)).toEqual(expect.arrayContaining([
      '客户名称',
      '纳税人识别号',
      '税号',
      '注册地址',
      '所属行业',
      '纳税人资格',
      '成立日期',
    ]))
  })

  it('parses agency client profile aliases from account exports', () => {
    const parsed = parseClientImportText(JSON.stringify({
      企业全称: '上海客户清单测试有限公司',
      纳税主体名称: '上海客户清单测试二有限公司',
      统一信用代码: '91310000PROFILE',
      客户税号: '91310000PROFILE-ALT',
      生产经营地址: '上海市徐汇区',
      登记注册地址: '上海市长宁区',
      行业名称: '商务服务业',
      主营行业: '现代服务业',
      登记注册类型: '有限责任公司',
      纳税人状态: '正常',
      开业日期: '2021-03-15',
      登记日期: '2021-03-20',
    }))

    expect(parsed.patch).toMatchObject({
      name: '上海客户清单测试二有限公司',
      creditCode: '91310000PROFILE-ALT',
      region: '上海市长宁区',
      industry: '现代服务业',
      taxpayerType: '正常',
      establishedAt: '2021-03-20',
    })
    expect(parsed.mappings.map((item) => item.source)).toEqual(expect.arrayContaining([
      '企业全称',
      '纳税主体名称',
      '统一信用代码',
      '客户税号',
      '生产经营地址',
      '登记注册地址',
      '行业名称',
      '主营行业',
      '登记注册类型',
      '纳税人状态',
      '开业日期',
      '登记日期',
    ]))
  })

  it('parses period and data-basis aliases from object imports', () => {
    const parsed = parseClientImportText(JSON.stringify({
      分析口径: '月度',
      会计年度: 2026,
      报表季度: 'Q2',
      报表月份: '2026-06',
      起始日期: '2026-04-01',
      截止日期: '2026-06-30',
      取数口径: '客户财务系统导出',
    }))

    expect(parsed.patch).toMatchObject({
      analysisPeriodType: '月度',
      analysisYear: 2026,
      analysisQuarter: 'Q2',
      analysisMonth: '2026-06',
      periodStartDate: '2026-04-01',
      periodEndDate: '2026-06-30',
      dataBasis: '客户财务系统导出',
    })
    expect(parsed.mappings.map((item) => item.field)).toEqual(expect.arrayContaining([
      'analysisPeriodType',
      'analysisYear',
      'analysisQuarter',
      'analysisMonth',
      'periodStartDate',
      'periodEndDate',
      'dataBasis',
    ]))
  })

  it('parses tax period and source aliases from agency exports', () => {
    const parsed = parseClientImportText(JSON.stringify({
      检查期间类型: '季度',
      申报期间类型: '月度',
      申报年度: 2026,
      税款所属季度: 'Q3',
      所属期间: '2026-09',
      账期: '2026-10',
      所属期起: '2026-10-01',
      税款所属期止: '2026-10-31',
      申报口径: '纳税申报表',
      账套来源: '代理记账系统',
    }))

    expect(parsed.patch).toMatchObject({
      analysisPeriodType: '月度',
      analysisYear: 2026,
      analysisQuarter: 'Q3',
      analysisMonth: '2026-10',
      periodStartDate: '2026-10-01',
      periodEndDate: '2026-10-31',
      dataBasis: '代理记账系统',
    })
    expect(parsed.mappings.map((item) => item.source)).toEqual(expect.arrayContaining([
      '检查期间类型',
      '申报期间类型',
      '申报年度',
      '税款所属季度',
      '所属期间',
      '账期',
      '所属期起',
      '税款所属期止',
      '申报口径',
      '账套来源',
    ]))
  })

  it('parses operating performance aliases from object imports', () => {
    const parsed = parseClientImportText(JSON.stringify({
      营业收入本月: 260000,
      成本费用本月: 180000,
      本月利润总额: 80000,
      年收入总额: 3120000,
      营业收入本年累计: 1560000,
      成本费用本年累计: 1080000,
      净利润: 320000,
      销售收入: 1580000,
      成本费用合计: 980000,
    }))

    expect(parsed.patch).toMatchObject({
      monthlyRevenue: 260000,
      monthlyCost: 180000,
      monthlyProfit: 80000,
      annualRevenue: 3120000,
      ytdRevenue: 1560000,
      ytdCostExpense: 1080000,
      ytdProfit: 320000,
      mainBusinessRevenue: 1580000,
      mainBusinessCost: 980000,
    })
    expect(parsed.mappings.map((item) => item.field)).toEqual(expect.arrayContaining([
      'monthlyRevenue',
      'monthlyCost',
      'monthlyProfit',
      'annualRevenue',
      'ytdRevenue',
      'ytdCostExpense',
      'ytdProfit',
      'mainBusinessRevenue',
      'mainBusinessCost',
    ]))
  })

  it('parses cash collection and invoice amount aliases', () => {
    const parsed = parseClientImportText(JSON.stringify({
      银行收款金额: 280000,
      对公收款金额: 310000,
      本期开票金额: 260000,
      含税开票金额: 286000,
    }))

    expect(parsed.patch).toMatchObject({
      collectionFlow: 310000,
      monthlyInvoice: 286000,
    })
    expect(parsed.mappings.map((item) => item.source)).toEqual(expect.arrayContaining([
      '银行收款金额',
      '对公收款金额',
      '本期开票金额',
      '含税开票金额',
    ]))
  })

  it('parses employee social security and payroll count aliases', () => {
    const parsed = parseClientImportText(JSON.stringify({
      在职人数: 42,
      外包人员数: 7,
      参保员工数: 38,
      申报工资人数: 40,
    }))

    expect(parsed.patch).toMatchObject({
      employees: 42,
      laborCount: 7,
      socialSecurityCount: 38,
      salaryDeclaredCount: 40,
    })
    expect(parsed.mappings.map((item) => item.source)).toEqual(expect.arrayContaining([
      '在职人数',
      '外包人员数',
      '参保员工数',
      '申报工资人数',
    ]))
  })

  it('parses common expense amount aliases', () => {
    const parsed = parseClientImportText(JSON.stringify({
      招待费支出: 18000,
      广告及业务宣传费: 45000,
      福利费: 26000,
      工会经费发生额: 8000,
      培训费: 12000,
    }))

    expect(parsed.patch).toMatchObject({
      entertainmentExpense: 18000,
      adExpense: 45000,
      welfareExpense: 26000,
      unionExpense: 8000,
      educationExpense: 12000,
    })
    expect(parsed.mappings.map((item) => item.field)).toEqual(expect.arrayContaining([
      'entertainmentExpense',
      'adExpense',
      'welfareExpense',
      'unionExpense',
      'educationExpense',
    ]))
  })

  it('parses accumulated expense and non-operating aliases', () => {
    const parsed = parseClientImportText(JSON.stringify({
      业务招待费本年累计: 21000,
      业务招待费累计发生额: 23000,
      广告宣传费发生额: 46000,
      广宣费: 48000,
      职工福利费发生额: 27000,
      福利费发生额: 29000,
      工会经费计提额: 8200,
      工会经费本年累计: 8600,
      教育培训经费: 12500,
      职工教育经费本年累计: 13800,
      营业外支出本年累计: 9000,
      非经营支出: 11000,
      营业外收入本年累计: 6000,
      非经营收入: 7000,
    }))

    expect(parsed.patch).toMatchObject({
      entertainmentExpense: 23000,
      adExpense: 48000,
      welfareExpense: 29000,
      unionExpense: 8600,
      educationExpense: 13800,
      nonOperatingExpense: 11000,
      nonOperatingIncome: 7000,
    })
    expect(parsed.mappings.map((item) => item.source)).toEqual(expect.arrayContaining([
      '业务招待费本年累计',
      '业务招待费累计发生额',
      '广告宣传费发生额',
      '广宣费',
      '职工福利费发生额',
      '福利费发生额',
      '工会经费计提额',
      '工会经费本年累计',
      '教育培训经费',
      '职工教育经费本年累计',
      '营业外支出本年累计',
      '非经营支出',
      '营业外收入本年累计',
      '非经营收入',
    ]))
  })

  it('parses small-profit qualification amount aliases', () => {
    const parsed = parseClientImportText(JSON.stringify({
      纳税调整后所得: 1180000,
      平均资产总额: 36000000,
      从业人员年平均数: 86,
    }))

    expect(parsed.patch).toMatchObject({
      taxableIncome: 1180000,
      assetsTotal: 36000000,
      employeeAnnualAvg: 86,
    })
    expect(parsed.mappings.map((item) => item.field)).toEqual(expect.arrayContaining([
      'taxableIncome',
      'assetsTotal',
      'employeeAnnualAvg',
    ]))
  })

  it('parses non-operating and agency receivable aliases', () => {
    const parsed = parseClientImportText(JSON.stringify({
      非经营性支出: 12000,
      非经营性收入: 5000,
      代收代付余额: 68000,
      代垫款余额: 72000,
    }))

    expect(parsed.patch).toMatchObject({
      nonOperatingExpense: 12000,
      nonOperatingIncome: 5000,
      otherReceivableAgencyBalance: 72000,
    })
    expect(parsed.mappings.map((item) => item.source)).toEqual(expect.arrayContaining([
      '非经营性支出',
      '非经营性收入',
      '代收代付余额',
      '代垫款余额',
    ]))
  })

  it('parses payroll and personal service payment aliases', () => {
    const parsed = parseClientImportText(JSON.stringify({
      工资薪金发生额: 320000,
      应发工资总额: 340000,
      劳务报酬支出: 26000,
      临时工劳务费: 18000,
    }))

    expect(parsed.patch).toMatchObject({
      payrollTotal: 340000,
      nonPayrollPersonalPayment: 18000,
    })
    expect(parsed.mappings.map((item) => item.source)).toEqual(expect.arrayContaining([
      '工资薪金发生额',
      '应发工资总额',
      '劳务报酬支出',
      '临时工劳务费',
    ]))
  })

  it('parses agency receivable payroll and flexible labor aliases', () => {
    const parsed = parseClientImportText(JSON.stringify({
      老板代收款: 56000,
      员工借款余额: 64000,
      应付工资: 280000,
      职工薪酬发生额: 295000,
      灵活用工劳务费: 42000,
      非员工劳务报酬: 48000,
    }))

    expect(parsed.patch).toMatchObject({
      otherReceivableAgencyBalance: 64000,
      payrollTotal: 295000,
      nonPayrollPersonalPayment: 48000,
    })
    expect(parsed.mappings.map((item) => item.source)).toEqual(expect.arrayContaining([
      '老板代收款',
      '员工借款余额',
      '应付工资',
      '职工薪酬发生额',
      '灵活用工劳务费',
      '非员工劳务报酬',
    ]))
  })

  it('parses platform private-account and red invoice aliases', () => {
    const parsed = parseClientImportText(JSON.stringify({
      第三方平台收入: 420000,
      平台结算额: 460000,
      个人账户收款金额: '是',
      私户收款金额: '否',
      红冲金额: 12000,
      负数发票金额: 18000,
    }))

    expect(parsed.patch).toMatchObject({
      platformRevenue: 460000,
      privateAccountCollection: '否',
      redVatSpecialInvoiceAmount: 18000,
    })
    expect(parsed.mappings.map((item) => item.source)).toEqual(expect.arrayContaining([
      '第三方平台收入',
      '平台结算额',
      '个人账户收款金额',
      '私户收款金额',
      '红冲金额',
      '负数发票金额',
    ]))
  })

  it('parses online platform private account and red invoice aliases', () => {
    const parsed = parseClientImportText(JSON.stringify({
      抖店收入: 210000,
      美团平台收入: 230000,
      微信收款: 250000,
      老板账户收款: '是',
      个人微信收款: '否',
      红字普票金额: 9000,
      销售折让红票金额: 12000,
    }))

    expect(parsed.patch).toMatchObject({
      platformRevenue: 250000,
      privateAccountCollection: '否',
      redVatSpecialInvoiceAmount: 12000,
    })
    expect(parsed.mappings.map((item) => item.source)).toEqual(expect.arrayContaining([
      '抖店收入',
      '美团平台收入',
      '微信收款',
      '老板账户收款',
      '个人微信收款',
      '红字普票金额',
      '销售折让红票金额',
    ]))
  })

  it('parses unbilled zero-declaration and prepaid balance aliases', () => {
    const parsed = parseClientImportText(JSON.stringify({
      未开票销售额: '是',
      无票销售额: '否',
      连续多月零申报: '是',
      预收账款挂账余额: '否',
      合同负债挂账余额: '是',
    }))

    expect(parsed.patch).toMatchObject({
      unbilledIncome: '否',
      longTermZeroDeclaration: '是',
      prepaidLongTerm: '是',
    })
    expect(parsed.mappings.map((item) => item.source)).toEqual(expect.arrayContaining([
      '未开票销售额',
      '无票销售额',
      '连续多月零申报',
      '预收账款挂账余额',
      '合同负债挂账余额',
    ]))
  })

  it('parses no-invoice service-fee and supplier input aliases', () => {
    const parsed = parseClientImportText(JSON.stringify({
      无票报销: '是',
      大额费用未取得发票: '否',
      服务类发票: '是',
      咨询费发票: '否',
      供应商进项票缺失: '是',
      采购未取得进项发票: '否',
    }))

    expect(parsed.patch).toMatchObject({
      largeExpenseNoInvoice: '否',
      serviceFeeInvoices: '否',
      supplierNoInput: '否',
    })
    expect(parsed.mappings.map((item) => item.source)).toEqual(expect.arrayContaining([
      '无票报销',
      '大额费用未取得发票',
      '服务类发票',
      '咨询费发票',
      '供应商进项票缺失',
      '采购未取得进项发票',
    ]))
  })

  it('parses invoice content mismatch flow-back and abnormal invoice aliases', () => {
    const parsed = parseClientImportText(JSON.stringify({
      发票货物名称不一致: '是',
      商品服务名称不符: '否',
      进项销项不符: '是',
      购销品类不符: '否',
      资金回流闭环: '是',
      付款后回流: '否',
      异常凭证: '是',
      涉嫌虚开: '否',
    }))

    expect(parsed.patch).toMatchObject({
      invoiceNameMismatch: '否',
      purchaseSalesMismatch: '否',
      fundsReturn: '否',
      abnormalInvoice: '否',
    })
    expect(parsed.mappings.map((item) => item.source)).toEqual(expect.arrayContaining([
      '发票货物名称不一致',
      '商品服务名称不符',
      '进项销项不符',
      '购销品类不符',
      '资金回流闭环',
      '付款后回流',
      '异常凭证',
      '涉嫌虚开',
    ]))
  })

  it('parses related loss inventory R&D and agency compliance aliases', () => {
    const parsed = parseClientImportText(JSON.stringify({
      关联采购: '是',
      关联往来交易: '否',
      连续多年亏损: '是',
      连续年度亏损: '否',
      存货账实异常: '是',
      存货盘点差异: '否',
      研发备查资料缺失: '是',
      研发辅助账资料不足: '否',
      代理记账风险: '是',
      涉税代理合规风险: '否',
    }))

    expect(parsed.patch).toMatchObject({
      relatedTransactions: '否',
      longTermLoss: '否',
      inventoryAbnormal: '否',
      rdDocsInsufficient: '否',
      agencyComplianceRisk: '否',
    })
    expect(parsed.mappings.map((item) => item.source)).toEqual(expect.arrayContaining([
      '关联采购',
      '关联往来交易',
      '连续多年亏损',
      '连续年度亏损',
      '存货账实异常',
      '存货盘点差异',
      '研发备查资料缺失',
      '研发辅助账资料不足',
      '代理记账风险',
      '涉税代理合规风险',
    ]))
  })

  it('parses payroll tax benefit and individual vendor aliases', () => {
    const parsed = parseClientImportText(JSON.stringify({
      拆分工资: '是',
      多人拆分发薪: '否',
      个税未代扣代缴: '是',
      未申报工资薪金个税: '否',
      关联自然人商户: '是',
      关联个人供应商: '否',
      小型微利减免: '是',
      享受小型微利企业所得税优惠: '否',
      优惠备查资料缺失: '是',
      税收优惠留存资料不足: '否',
      享受研发费用加计扣除: '是',
      研发加计扣除优惠: '否',
    }))

    expect(parsed.patch).toMatchObject({
      salarySplit: '否',
      noIitWithholding: '否',
      individualVendorRelated: '否',
      smallProfitEnjoyed: '否',
      taxBenefitDataMissing: '否',
      rdDeductionEnjoyed: '否',
    })
    expect(parsed.mappings.map((item) => item.source)).toEqual(expect.arrayContaining([
      '拆分工资',
      '多人拆分发薪',
      '个税未代扣代缴',
      '未申报工资薪金个税',
      '关联自然人商户',
      '关联个人供应商',
      '小型微利减免',
      '享受小型微利企业所得税优惠',
      '优惠备查资料缺失',
      '税收优惠留存资料不足',
      '享受研发费用加计扣除',
      '研发加计扣除优惠',
    ]))
  })

  it('parses VAT declaration aliases from object imports', () => {
    const parsed = parseClientImportText(JSON.stringify({
      销售额合计: 2800000,
      货物及劳务销售额: 1800000,
      应纳税额合计: 146000,
      上期销售额: 2400000,
      上期应纳税额: 120000,
    }))

    expect(parsed.patch).toMatchObject({
      taxableSales: 1800000,
      vatTaxPayable: 146000,
      priorTaxableSales: 2400000,
      priorVatTaxPayable: 120000,
    })
    expect(parsed.mappings.map((item) => item.field)).toEqual(expect.arrayContaining([
      'taxableSales',
      'vatTaxPayable',
      'priorTaxableSales',
      'priorVatTaxPayable',
    ]))
  })

  it('parses current-period VAT declaration aliases from object imports', () => {
    const parsed = parseClientImportText(JSON.stringify({
      本期销项税额: 156000,
      当期销项税额: 158000,
      本期进项税额: 98000,
      应交增值税进项税额: 96000,
      本期应税销售额: 1200000,
      一般项目销售额: 1180000,
      本期应纳税额: 60000,
      本期增值税入库税额: 62000,
      增值税留抵税额: 32000,
      留抵税额期末余额: 28000,
    }))

    expect(parsed.patch).toMatchObject({
      outputTax: 158000,
      inputTax: 96000,
      taxableSales: 1180000,
      vatTaxPayable: 62000,
      endingVatCredit: 28000,
    })
    expect(parsed.mappings.map((item) => item.source)).toEqual(expect.arrayContaining([
      '本期销项税额',
      '当期销项税额',
      '本期进项税额',
      '应交增值税进项税额',
      '本期应税销售额',
      '一般项目销售额',
      '本期应纳税额',
      '本期增值税入库税额',
      '增值税留抵税额',
      '留抵税额期末余额',
    ]))
  })

  it('parses asset total balance aliases from object imports', () => {
    const parsed = parseClientImportText(JSON.stringify({
      资产总额期末余额: 4800000,
      资产合计期末余额: 3600000,
      年平均从业人数: 28,
      年度应纳税所得额: 860000,
    }))

    expect(parsed.patch).toMatchObject({
      assetsTotal: 3600000,
      employeeAnnualAvg: 28,
      taxableIncome: 860000,
    })
    expect(parsed.mappings.map((item) => item.field)).toEqual(expect.arrayContaining([
      'assetsTotal',
      'employeeAnnualAvg',
      'taxableIncome',
    ]))
  })

  it('parses small-profit qualification aliases from tax worksheets', () => {
    const parsed = parseClientImportText(JSON.stringify({
      纳税调整后所得额: 780000,
      本年累计应纳税所得额: 820000,
      季末资产总计: 32000000,
      年度平均资产总额: 34000000,
      从业人员平均人数: 72,
      年度从业人员平均数: 68,
    }))

    expect(parsed.patch).toMatchObject({
      taxableIncome: 820000,
      assetsTotal: 34000000,
      employeeAnnualAvg: 68,
    })
    expect(parsed.mappings.map((item) => item.source)).toEqual(expect.arrayContaining([
      '纳税调整后所得额',
      '本年累计应纳税所得额',
      '季末资产总计',
      '年度平均资产总额',
      '从业人员平均人数',
      '年度从业人员平均数',
    ]))
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

  it('parses accounting export amounts with currency symbols units and full-width commas', () => {
    const parsed = parseClientImportRows([
      ['项目', '本期金额'],
      ['利润表', ''],
      ['营业收入', '￥1，200，000 元'],
      ['营业成本', ' 820，000元 '],
      ['利润总额', '¥380,000元'],
    ])

    expect(parsed.patch).toMatchObject({
      mainBusinessRevenue: 1200000,
      mainBusinessCost: 820000,
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

  it('prefers sales columns for taxable sales rows', () => {
    const parsed = parseClientImportRows([
      ['项目', '税额', '销售额'],
      ['应税销售额', '364000', '2,800,000'],
      ['应纳税额合计', '146000', '2,800,000'],
    ])

    expect(parsed.detectedTables).toContain('增值税数据')
    expect(parsed.patch).toMatchObject({
      taxableSales: 2800000,
      vatTaxPayable: 146000,
    })
  })

  it('recognizes prior VAT declaration rows before current-period aliases', () => {
    const parsed = parseClientImportRows([
      ['项目', '税额', '销售额'],
      ['上期应税销售额', '312000', '2,400,000'],
      ['上期应纳税额', '120000', '2,400,000'],
    ])

    expect(parsed.detectedTables).toContain('增值税数据')
    expect(parsed.patch).toMatchObject({
      priorTaxableSales: 2400000,
      priorVatTaxPayable: 120000,
    })
    expect(parsed.patch).not.toHaveProperty('taxableSales')
    expect(parsed.patch).not.toHaveProperty('vatTaxPayable')
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
