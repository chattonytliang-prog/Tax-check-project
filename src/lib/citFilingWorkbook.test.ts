import { utils, write, type WorkBook, type WorkSheet } from '@e965/xlsx'
import { describe, expect, it } from 'vitest'
import { parseCitWorkbook } from './citFilingWorkbook'
import { validateCitAdjustments } from './citAdjustmentFiling'
import { participatesInEnterpriseScoring } from './enterpriseRulePolicy'

const taxId = '91110000TEST000001'
function fixture() {
  const book = utils.book_new()
  utils.book_append_sheet(book, utils.aoa_to_sheet([
    ['前言'], ['A105000', '纳税调整项目明细表'], ['A105060', '广告费和业务宣传费等跨年度纳税调整明细表'],
  ]), '填报目录')
  const cover = utils.aoa_to_sheet([
    ['中华人民共和国企业所得税年度纳税申报表'], ['（A类）'],
    ['税款所属期间：', null, new Date(2024, 0, 1), '至', new Date(2024, 11, 31)],
    ['纳税人识别号：（统一社会信用代码）', taxId],
  ], { dateNF: 'yyyy-mm-dd' })
  utils.book_append_sheet(book, cover, '封面')
  const main = utils.aoa_to_sheet([
    [], ['A105000', '纳税调整项目明细表'], [], ['金额单位：元'],
    ['行 次', '项 目', '账载金额', '税收金额', '调增金额', '调减金额'], ['', '', 1, 2, 3, 4],
    [15, '（三）业务招待费支出', 100000, 50000, 50000, '*'],
    [16, '（四）广告费和业务宣传费支出（填写A105060）', '*', '*', null, '145,000.00'],
  ])
  const annex = utils.aoa_to_sheet([
    ['广告费和业务宣传费等跨年度纳税调整明细表'], [], ['行次', '项目', '广告费和\n业务宣传费', '保险企业手续费及佣金支出'],
    [null, null, 1, 2],
    [12, '七、本年支出纳税调整金额（3＞6，本行=2+3-6+10-11）', -145000, 987654],
  ])
  utils.book_append_sheet(book, main, '纳税调整项目明细表')
  utils.book_append_sheet(book, annex, '表20')
  return { book, cover, main, annex }
}

const serialize = (book: WorkBook, bookType: 'xlsx' | 'biff8' | 'xlsm' = 'xlsx'): Uint8Array => new Uint8Array(write(book, { type: 'array', bookType }))
const check = (book: WorkBook, bookType?: 'xlsx' | 'biff8' | 'xlsm') => validateCitAdjustments(parseCitWorkbook(serialize(book, bookType), 4))
const text = (sheet: WorkSheet, address: string, value: string) => { sheet[address] = { t: 's', v: value } }
const num = (sheet: WorkSheet, address: string, value: number) => { sheet[address] = { t: 'n', v: value } }
const statuses = (result: ReturnType<typeof check>) => result.findings.map((item) => item.status)

describe('annual CIT Excel import', () => {
  it.each(['xlsx', 'biff8', 'xlsm'] as const)('auto-identifies both schedules in a %s workbook with unrelated tabs', (format) => {
    const result = check(fixture().book, format)
    expect(result.recognized).toBe(2)
    expect(result.period).toBe('2024-01-01 至 2024-12-31')
    expect(statuses(result)).toEqual(['matched', 'matched'])
    expect(result.findings[0].actual).toBe(5_000_000)
    expect(result.findings[1].sources).toMatchObject([
      { file: 4, sheet: '纳税调整项目明细表', range: 'A8:F8', row: 16 },
      { file: 4, sheet: '表20', range: 'A5:C5', row: 12, cells: [{ address: 'C5' }] },
    ])
  })

  it('detects a one-cent discrepancy, the wrong adjustment column, and netting two directions', () => {
    const { book, main } = fixture()
    num(main, 'E7', 49999.99)
    num(main, 'E8', 145000)
    delete main.F8
    expect(statuses(check(book))).toEqual(['difference', 'difference'])
    num(main, 'E8', 1000)
    num(main, 'F8', 146000)
    expect(statuses(check(book))).toEqual(['difference', 'difference'])
  })

  it('distinguishes blank, zero, and formula errors and never reads the insurance column', () => {
    const { book, main, annex } = fixture()
    delete annex.C5
    expect(statuses(check(book))).toEqual(['matched', 'missing'])
    annex.C5 = { t: 'e', v: 15 }
    expect(statuses(check(book))).toEqual(['matched', 'missing'])
    annex.C5 = { t: 'n', f: '-145000' }
    expect(statuses(check(book))).toEqual(['matched', 'missing'])
    num(annex, 'C5', 0)
    num(main, 'F8', 0)
    expect(statuses(check(book))).toEqual(['matched', 'matched'])
    delete main.F8
    expect(statuses(check(book))).toEqual(['matched', 'missing'])
  })

  it('uses saved results without running formulas and rejects hidden blank-template zeros', () => {
    const { book, main, annex } = fixture()
    book.Workbook = { Sheets: [{}, {}, {}, { Hidden: 1 }] }
    annex.C5 = { t: 'n', v: -145000, f: '0' }
    expect(statuses(check(book))).toEqual(['matched', 'matched'])
    num(main, 'F8', 0)
    annex.C5 = { t: 'n', v: 0, f: '0' }
    expect(statuses(check(book))).toEqual(['matched', 'missing'])
  })

  it('does not pair other taxpayers, inconsistent periods or duplicate schedules', () => {
    const { book, cover, annex, main } = fixture()
    text(annex, 'A2', '税款所属期间：2023-01-01至2023-12-31')
    expect(statuses(check(book))).toEqual(['matched', 'missing'])
    text(annex, 'A2', '纳税人识别号：91110000TEST000002')
    expect(statuses(check(book))).toEqual(['matched', 'missing'])
    delete cover.B4
    delete annex.A2
    expect(statuses(check(book))).toEqual(['matched', 'missing'])
    utils.book_append_sheet(book, main, 'A105000-重复')
    expect(statuses(check(book))).toEqual(['missing', 'missing'])
  })

  it('handles a separate signed-period export without assuming that mismatched files go together', () => {
    const { annex, main } = fixture()
    text(main, 'A3', `纳税人识别号：${taxId} 税款所属期：2024-01-01至2024-12-31`)
    text(annex, 'A2', `纳税人识别号：${taxId} 税款所属期：2024-01-01至2024-12-31`)
    const one = utils.book_new(), two = utils.book_new()
    utils.book_append_sheet(one, main, 'A105000')
    utils.book_append_sheet(two, annex, 'A105060')
    const result = validateCitAdjustments([...parseCitWorkbook(serialize(one), 0), ...parseCitWorkbook(serialize(two), 1)])
    expect(statuses(result)).toEqual(['matched', 'matched'])
    expect(result.findings[1].sources.map((source) => source.file)).toEqual([0, 1])
  })

  it('does not compute from changed units, mismatched lines, or unresolved entries', () => {
    const { book, main, annex } = fixture()
    text(main, 'A4', '金额单位：万元')
    expect(statuses(check(book))).toEqual(['missing', 'missing'])
    text(main, 'A4', '金额单位：元')
    num(annex, 'A5', 13)
    expect(statuses(check(book))).toEqual(['matched', 'missing'])
    expect(['R015', 'R016', 'ON-020', 'ON-021', 'FILING-CIT'].every((code) => !participatesInEnterpriseScoring(code))).toBe(true)
  })
})
