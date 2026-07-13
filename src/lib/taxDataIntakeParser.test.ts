import { describe, expect, it } from 'vitest'
import { parseTaxDataPdfText, parseTaxDataWorkbook } from './taxDataIntakeParser'

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

  it('parses VAT PDF text into evidence-backed lines', () => {
    const parsed = parseTaxDataPdfText('增值税申报表(2025-12-01-2025-12-31).pdf', [
      '增值税及附加税费申报表\n税款所属时间：自2025年12月1日至2025年12月31日\n销项税额 11 1,358,850.00 3,830,338.25\n进项税额 12 1,255,663.11 3,550,395.92',
    ])

    expect(parsed.documentTypes).toEqual(['vat_return'])
    expect(parsed.records).toHaveLength(2)
    expect(parsed.records[0].periodStart).toBe('2025-12-01')
    expect(parsed.evidenceFields.length).toBeGreaterThan(0)
  })
})
