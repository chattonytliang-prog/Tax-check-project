import { describe, expect, it } from 'vitest'
import { parseTaxDataPdfText, parseTaxDataWorkbook, parseVatScheduleFourRecords } from './taxDataIntakeParser'

describe('tax data intake parser', () => {
  it('parses account balances and ledger rows with periods', () => {
    const parsed = parseTaxDataWorkbook('账簿_202501-202512.xls', [
      {
        name: '科目余额表',
        rows: [
          ['科目余额表'],
          ['期间：2025年01月-2025年12月'],
          ['科目编码', '科目名称', '期初余额', '期初余额', '本期发生额', '本期发生额', '本年累计发生额', '本年累计发生额', '期末余额', '期末余额'],
          ['', '', '借方', '贷方', '借方', '贷方', '借方', '贷方', '借方', '贷方'],
          ['1001', '库存现金', '10', '', '2', '1', '2', '1', '11', ''],
        ],
      },
      {
        name: '1001 库存现金',
        rows: [
          ['2025年1月至2025年12月'],
          ['日期', '凭证字号', '科目编码', '科目名称', '摘要', '借方', '贷方', '方向', '余额'],
          ['2025-01-31', '记-1', '1001', '库存现金', '报销', '2', '', '借', '12'],
          ['2025-01-31', '', '1001', '库存现金', '本期合计', '2', '', '借', '12'],
        ],
      },
      {
        name: '2001 empty ledger',
        rows: [
          ['2025年1月至2025年12月'],
          ['日期', '凭证字号', '科目编码', '科目名称', '摘要', '借方', '贷方', '方向', '余额'],
          ['no transaction'],
          ['summary only'],
        ],
      },
    ])

    expect(parsed.recordCounts).toMatchObject({ account_balance: 1, ledger: 1 })
    expect(parsed.records.find((record) => record.recordType === 'account_balance')?.payload).toMatchObject({ endingDebit: 11 })
    expect(parsed.records.find((record) => record.recordType === 'ledger')?.periodStart).toBe('2025-01-01')
  })

  it('parses statements, payroll, IIT and invoices with standardized identity fields', () => {
    const parsed = parseTaxDataWorkbook('资料_202512.xlsx', [
      { name: '利润表', rows: [['利润表'], ['2025年12月'], ['项目', '行次', '本年累计金额', '本期金额'], ['营业收入', '1', '100', '20']] },
      { name: '工资表', rows: [['工资表'], ['姓名', '身份证件类型', '身份证件号码', '工资', '基本养老保险费', '基本医疗保险费', '失业保险费', '应纳税所得额', '税率', '应纳税额'], ['张三', '身份证', '110101199001011234', '5000', '400', '100', '20', '1000', '0.03', '30']] },
      { name: '个人所得税扣缴申报表', rows: [['个人所得税扣缴申报表'], ['姓名', '身份证件类型', '身份证件号码', '所得项目', '累计收入额', '累计减除费用', '应纳税所得额', '税率', '应纳税额'], ['李四', '身份证', '110101199002021234', '工资薪金', '60000', '60000', '0', '0.03', '0']] },
      { name: '发票', rows: [['发票清单'], ['数电发票号码', '开票日期', '销售方纳税人识别号', '销售方纳税人名称', '金额', '税额', '有效抵扣税额'], ['123', '2025-12-01', '9133', '供应商', '100', '13', '13']] },
    ])

    expect(parsed.recordCounts).toMatchObject({ financial_statement: 1, payroll: 1, iit_withholding: 1, invoice_list: 1 })
    const payroll = parsed.records.find((record) => record.recordType === 'payroll')
    expect(payroll?.payload).toMatchObject({ idNumber: '110101199001011234', idNumberMasked: '1101**********1234' })
    const evidenceSerialized = JSON.stringify(parsed.evidenceFields)
    expect(evidenceSerialized).not.toContain('110101199001011234')
    expect(evidenceSerialized).not.toContain('110101199002021234')
    expect(evidenceSerialized).toContain('1101**********1234')
  })

  it('keeps ledger parent account separate from auxiliary customer or vendor names', () => {
    const parsed = parseTaxDataWorkbook('\u660e\u7ec6\u8d26_202501-202512.xls', [{
      name: '1122 \u5e94\u6536\u8d26\u6b3e',
      rows: [
        ['\u660e\u7ec6\u8d26'],
        ['\u65e5\u671f', '\u51ed\u8bc1\u5b57\u53f7', '\u79d1\u76ee\u7f16\u7801', '\u79d1\u76ee\u540d\u79f0', '\u6458\u8981', '\u501f\u65b9', '\u8d37\u65b9', '\u65b9\u5411', '\u4f59\u989d'],
        ['2025-01-31', '\u8bb0-10', '1122078', '\u5e94\u6536\u8d26\u6b3e-\u5317\u4eacA\u516c\u53f8', '\u672c\u6708\u6536\u5165/\u5317\u4eacA\u516c\u53f8', '100', '', '\u501f', '100'],
      ],
    }])

    expect(parsed.recordCounts).toMatchObject({ ledger: 1 })
    expect(parsed.records[0].payload).toMatchObject({
      accountCode: '1122078',
      accountName: '\u5e94\u6536\u8d26\u6b3e-\u5317\u4eacA\u516c\u53f8',
      parentAccountCode: '1122',
      parentAccountName: '\u5e94\u6536\u8d26\u6b3e',
      auxiliaryName: '\u5317\u4eacA\u516c\u53f8',
      sourceSheetName: '1122 \u5e94\u6536\u8d26\u6b3e',
    })
    expect(parsed.records[0]).toMatchObject({ periodStart: '2025-01-01', periodEnd: '2025-01-31' })
  })

  it('assigns every ledger entry to its own calendar month', () => {
    const parsed = parseTaxDataWorkbook('\u660e\u7ec6\u8d26_202501-202512.xls', [{
      name: '5001 \u4e3b\u8425\u4e1a\u52a1\u6536\u5165',
      rows: [
        ['\u65e5\u671f', '\u51ed\u8bc1\u5b57\u53f7', '\u79d1\u76ee\u7f16\u7801', '\u79d1\u76ee\u540d\u79f0', '\u6458\u8981', '\u501f\u65b9', '\u8d37\u65b9', '\u65b9\u5411', '\u4f59\u989d'],
        ['2025-01-31', '\u8bb0-1', '5001', '\u4e3b\u8425\u4e1a\u52a1\u6536\u5165', '\u9500\u552e\u6536\u5165', '', '100', '\u8d37', '100'],
        ['2025-12-31', '\u8bb0-2', '5001', '\u4e3b\u8425\u4e1a\u52a1\u6536\u5165', '\u9500\u552e\u6536\u5165', '', '200', '\u8d37', '300'],
      ],
    }])

    expect(parsed.records.map((record) => [record.periodStart, record.periodEnd])).toEqual([
      ['2025-01-01', '2025-01-31'],
      ['2025-12-01', '2025-12-31'],
    ])
  })

  it('extracts client profile facts from tax source headers', () => {
    const parsed = parseTaxDataWorkbook('\u5317\u4eac\u6b63\u6cf0\u6d66\u7535\u6c14\u79d1\u6280\u6709\u9650\u516c\u53f8_\u7efc\u5408\u6240\u5f97\u7533\u62a5_202512.xls', [{
      name: '\u4e2a\u4eba\u6240\u5f97\u7a0e\u6263\u7f34\u7533\u62a5\u8868',
      rows: [
        ['\u6263\u7f34\u4e49\u52a1\u4eba\u540d\u79f0\uff1a\u5317\u4eac\u6b63\u6cf0\u6d66\u7535\u6c14\u79d1\u6280\u6709\u9650\u516c\u53f8'],
        ['\u6263\u7f34\u4e49\u52a1\u4eba\u7eb3\u7a0e\u4eba\u8bc6\u522b\u53f7\uff08\u7edf\u4e00\u793e\u4f1a\u4fe1\u7528\u4ee3\u7801\uff09\uff1a91110112553089252B'],
        ['\u5e8f\u53f7', '\u59d3\u540d', '\u8eab\u4efd\u8bc1\u4ef6\u7c7b\u578b', '\u8eab\u4efd\u8bc1\u4ef6\u53f7\u7801', '\u6240\u5f97\u9879\u76ee', '\u7d2f\u8ba1\u6536\u5165\u989d', '\u7d2f\u8ba1\u51cf\u9664\u8d39\u7528', '\u5e94\u7eb3\u7a0e\u6240\u5f97\u989d', '\u7a0e\u7387', '\u5e94\u7eb3\u7a0e\u989d'],
        ['1', '\u5f20\u4e09', '\u5c45\u6c11\u8eab\u4efd\u8bc1', '110101199001011234', '\u5de5\u8d44\u85aa\u91d1', '60000', '60000', '0', '0.03', '0'],
      ],
    }])

    expect(parsed.profilePatch).toMatchObject({
      name: '\u5317\u4eac\u6b63\u6cf0\u6d66\u7535\u6c14\u79d1\u6280\u6709\u9650\u516c\u53f8',
      creditCode: '91110112553089252B',
    })
  })

  it('parses VAT PDF text into evidence-backed lines', () => {
    const parsed = parseTaxDataPdfText('增值税申报表(2025-12-01-2025-12-31).pdf', [
      '增值税及附加税费申报表\n税款所属时间：自2025年12月1日至2025年12月31日\n销项税额 11 1,358,850.00 3,830,338.25\n进项税额 12 1,255,663.11 3,550,395.92',
    ])

    expect(parsed.documentTypes).toEqual(['vat_return'])
    expect(parsed.records).toHaveLength(2)
    expect(parsed.records[0].periodStart).toBe('2025-12-01')
    expect(parsed.evidenceFields.length).toBeGreaterThan(0)
  })

  it('returns a warning when PDF text has no specialized tax parser', () => {
    const parsed = parseTaxDataPdfText('contract.pdf', ['plain contract text'])

    expect(parsed.records).toEqual([])
    expect(parsed.warnings).toHaveLength(1)
  })

  it('skips ledger-like sheets that have headers but no transaction rows', () => {
    const parsed = parseTaxDataWorkbook('\u660e\u7ec6\u8d26_\u5168\u90e8\u79d1\u76ee.xls', [{
      name: '1001',
      rows: [
        ['\u660e\u7ec6\u8d26'],
        ['\u65e5\u671f', '\u51ed\u8bc1\u5b57\u53f7', '\u79d1\u76ee\u7f16\u7801', '\u79d1\u76ee\u540d\u79f0', '\u6458\u8981', '\u501f\u65b9', '\u8d37\u65b9', '\u65b9\u5411', '\u4f59\u989d'],
        [''],
        [''],
      ],
    }])

    expect(parsed.records).toEqual([])
    expect(parsed.documentTypes).toEqual([])
    expect(parsed.warnings).toEqual([])
  })

  it('marks deterministic payroll workbook imports eligible when validations pass', () => {
    const parsed = parseTaxDataWorkbook('2024\u5e749\u6708-2024\u5e7410\u6708\u5de5\u8d44\u8868.xlsx', [{
      name: 'Sheet1',
      rows: [
        ['\u5de5\u8d44\u8868'],
        ['\u5355\u4f4d\uff1a\u6d4b\u8bd5\u4f01\u4e1a', '9/1/24'],
        ['\u59d3\u540d', '\u8eab\u4efd\u8bc1\u4ef6\u7c7b\u578b', '\u8eab\u4efd\u8bc1\u4ef6\u53f7\u7801', '\u5de5\u8d44', '\u57fa\u672c\u517b\u8001\u4fdd\u9669\u8d39', '\u57fa\u672c\u533b\u7597\u4fdd\u9669\u8d39', '\u5931\u4e1a\u4fdd\u9669\u8d39', '\u5e94\u7eb3\u7a0e\u6240\u5f97\u989d', '\u7a0e\u7387', '\u5e94\u7eb3\u7a0e\u989d'],
        ['Alice', '\u5c45\u6c11\u8eab\u4efd\u8bc1', '110101199001011234', '5000', '400', '100', '20', '1000', '0.03', '30'],
      ],
    }])

    expect(parsed.records).toHaveLength(1)
    expect(parsed.autoImportEligible).toBe(true)
  })

  it('parses wrapped VAT schedule four item names directly', () => {
    const records = parseVatScheduleFourRecords([
      '1 tax device fee',
      'maintenance 0.00 1.00 2.00 3.00 4.00',
      '9 ignored row 0.00',
      '6 super deduction 0.00 1.00 2.00 3.00 4.00 5.00',
    ].join('\n'), { periodStart: '2025-12-01', periodEnd: '2025-12-31' })

    expect(records).toHaveLength(2)
    expect(records[0].payload).toMatchObject({
      rowNo: '1',
      itemName: 'tax device feemaintenance',
      currentDeductibleAmount: 2,
      actualDeductionAmount: 3,
      endingAmount: 4,
    })
    expect(records[1].payload).toMatchObject({
      rowNo: '6',
      currentDecreaseAmount: 2,
      currentDeductibleAmount: 3,
      actualDeductionAmount: 4,
      endingAmount: 5,
    })
  })

  it('separates a multi-page VAT package into main and schedule records', () => {
    const parsed = parseTaxDataPdfText('增值税申报资料_2026-05-01-2026-05-31.pdf', [
      [
        '增值税及附加税费申报表（一般纳税人适用）',
        '税款所属时间：2026年5月1日至2026年5月31日',
        '销售额 1 1000.00 1000.00',
        '销项税额 11 130.00 130.00',
        '进项税额 12 80.00 80.00',
        '应纳税额 19 50.00 50.00',
      ].join('\n'),
      [
        '增值税及附加税费申报表附列资料（一）',
        '税款所属时间：2026年5月1日至2026年5月31日',
        '开具增值税专用发票 1 1000.00 130.00',
      ].join('\n'),
      [
        '增值税及附加税费申报表附列资料（四） 税额抵减情况表',
        '税款所属时间：2026年5月1日至2026年5月31日',
        '1 税控设备费及技术维护费 0.00 0.00 0.00 0.00 0.00',
      ].join('\n'),
    ])

    expect(new Set(parsed.documentTypes)).toEqual(new Set(['vat_return', 'vat_return_schedule']))
    expect(parsed.records.some((record) => record.payload.sourcePageNo === 1)).toBe(true)
    expect(parsed.records.some((record) => record.payload.sourcePageNo === 2)).toBe(true)
    expect(parsed.records.some((record) => record.payload.sourcePageNo === 3)).toBe(true)
    expect(parsed.autoImportEligible).toBe(true)
  })

  it('parses quarterly and annual corporate-income-tax forms', () => {
    const quarterly = parseTaxDataPdfText('企业所得税季度申报表_26年1季度.pdf', [[
      '中华人民共和国企业所得税月（季）度预缴纳税申报表（A类）',
      '营业收入 1 120000.00',
      '营业成本 2 80000.00',
      '利润总额 3 20000.00',
      '应纳税所得额 10 18000.00',
    ].join('\n')])
    const annual = parseTaxDataPdfText('企业所得税年报_2025年年度.pdf', [[
      '中华人民共和国企业所得税年度纳税申报表（A类）',
      '营业收入 1 900000.00',
      '营业成本 2 600000.00',
      '利润总额 3 120000.00',
      '应纳税所得额 10 100000.00',
    ].join('\n')])

    expect(quarterly.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ recordType: 'cit_return', recordSubtype: 'quarterly_prepayment', periodStart: '2026-01-01', periodEnd: '2026-03-31' }),
    ]))
    expect(annual.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ recordType: 'cit_return', recordSubtype: 'annual_return', periodStart: '2025-01-01', periodEnd: '2025-12-31' }),
    ]))
    expect(quarterly.autoImportEligible).toBe(true)
    expect(annual.autoImportEligible).toBe(true)
  })

  it('parses small-enterprise financial PDF pages with page evidence', () => {
    const parsed = parseTaxDataPdfText('小企业会计准则财务报表_2026年1季度.pdf', [
      [
        '资产负债表 小企会01表',
        '2026年3月31日',
        '资产 行次 期末余额 年初余额',
        '货币资金 1 80000.00 60000.00',
        '资产合计 31 180000.00 150000.00',
      ].join('\n'),
      [
        '利 润 表 会小企02表',
        '2026年1月1日至2026年3月31日',
        '项目 行次 本年累计金额 本期金额',
        '营业收入 1 120000.00 50000.00',
        '营业成本 2 80000.00 30000.00',
        '利润总额 30 20000.00 9000.00',
      ].join('\n'),
    ])

    expect(new Set(parsed.records.map((record) => record.recordSubtype))).toEqual(new Set(['balance_sheet', 'income_statement']))
    expect(parsed.evidenceFields.some((evidence) => evidence.pageNo === 1)).toBe(true)
    expect(parsed.evidenceFields.some((evidence) => evidence.pageNo === 2)).toBe(true)
    expect(parsed.autoImportEligible).toBe(true)
  })
})
