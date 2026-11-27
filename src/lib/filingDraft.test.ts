import { describe, expect, it } from 'vitest'
import { read, utils, write } from '@e965/xlsx'
import { vatDraftFromArchive, vatDraftFromPdf, vatDraftFromWorkbook, vatFormLines } from './filingDraft'
import { legacyVatTemplate, validateVatFiling } from './filingValidation'

const legacySheet = (rows: unknown[][]) => ({ name: '主表', rows: [
  ['增值税及附加税费申报表（一般纳税人适用）'],
  ['税款所属时间：', '2026-10-01至2026-10-31', '填表日期：2026-11-01', '金额单位：元'],
  ['纳税人名称', '示例有限公司', '注册地址', '示例路'],
  ['项目', '', '栏次', '一般项目', '', '即征即退项目'],
  ['', '', '', '本月数', '本年累计', '本月数', '本年累计'],
  ...rows,
] })

const sample = legacySheet([
  ['税款计算', '销项税额', 11, 100, 300, 7, 70],
  ['', '进项税额', 12, null, 60, 0, 88],
  ['', '上期留抵税额', 13, 0, '——', 3, 4],
  ['', '期末留抵税额', '20=17-18', '1,234.56', '——', -7, null],
])

describe('增值税预申报表自动填表', () => {
  it.each(['xls', 'xlsx'] as const)('imports a real %s buffer, without swapping blank and zero or using a second amount column', (bookType) => {
    const workbook = utils.book_new()
    utils.book_append_sheet(workbook, utils.aoa_to_sheet(sample.rows), '主表')
    const parsed = read(write(workbook, { type: 'array', bookType }), { type: 'array' })
    const draft = vatDraftFromWorkbook(parsed.SheetNames.map((name) => ({ name, rows: utils.sheet_to_json<unknown[]>(parsed.Sheets[name], { header: 1, defval: null, raw: true }) })))
    expect(draft.meta).toMatchObject({ taxpayer: '示例有限公司', periodStart: '2026-10-01', periodEnd: '2026-10-31', filledOn: '2026-11-01' })
    expect(draft.amounts['11']).toEqual(['100.00', '300.00', '7.00', '70.00'])
    expect(draft.amounts['12']).toEqual(['', '60.00', '0.00', '88.00'])
    expect(draft.amounts['13'][0]).toBe('0.00')
    expect(draft.amounts['20']).toEqual(['1234.56', '', '-7.00', ''])
    expect(validateVatFiling(draft.version, Object.entries(draft.amounts).map(([row, cells]) => ({ row, amount: cells[0] })))[0].missing).toContain('12')
  })

  it('uses the trial table codes rather than calendar date and preserves the official row order', () => {
    const draft = vatDraftFromWorkbook([{ name: '主表', rows: [
      ['增值税及附加税费申报表主表'], ['项目', '栏次', '一般项目本期数', '即征即退项目本期数'],
      ['全部销售额', '0A00', 2000, 0], ['其中：线上交易销售额', '0A00a', 1500, null],
      ['销项税额', '0B01', 100, 9], ['应抵扣税额合计', '0B05=0B02+0B03-0B04', 9, null],
    ] }])
    expect(draft.version).toBe('pilot')
    expect(draft.amounts['0A00a']).toEqual(['1500.00', ''])
    expect(vatFormLines.pilot.map(({ code }) => code).slice(0, 4)).toEqual(['0A00', '0A00a', '0A00b', '0B01'])
  })

  it('refuses multiple main forms, supplemental-only forms, and non-yuan units', () => {
    expect(() => vatDraftFromWorkbook([sample, sample])).toThrow(/多张/)
    expect(() => vatDraftFromWorkbook([{ ...sample, rows: [...sample.rows, ...sample.rows] }])).toThrow(/重复/)
    expect(() => vatDraftFromWorkbook([{ ...sample, rows: [['增值税及附加税费申报表附列资料（二）'], ...sample.rows.slice(1)] }])).toThrow(/未识别/)
    expect(() => vatDraftFromWorkbook([{ ...sample, rows: [sample.rows[0], ['金额单位：万元'], ...sample.rows.slice(2)] }])).toThrow(/未识别/)
  })

  it('does not infer a PDF column when a blank was omitted and refuses a multi-period PDF', () => {
    const pdf = [
      '增 值 税 及 附 加 税 费 申 报 表（一般纳税人适用）', '税款所属时间：自2026年10月1日至2026年10月31日',
      '项目 栏次 一般项目 即征即退项目', '本月数 本年累计 本月数 本年累计',
      '销项税额 11 100.00 300.00 7.00 70.00', '进项税额 12 60.00 0.00 88.00', '应抵扣税额合计 17=12+13-14-15+16 10.00 —— 2.00 ——',
    ].join('\n')
    const draft = vatDraftFromPdf([pdf])
    expect(draft.amounts['11']).toEqual(['100.00', '300.00', '7.00', '70.00'])
    expect(draft.amounts['12']).toBeUndefined()
    expect(draft.amounts['17']).toEqual(['10.00', '', '2.00', ''])
    expect(draft.notices[0]).toContain('留空')
    expect(() => vatDraftFromPdf([pdf, pdf])).toThrow(/多张/)
    expect(() => vatDraftFromPdf(['', ''])).toThrow(/扫描件/)
  })

  it('keeps verified archive rows and leaves conflicting amounts blank', () => {
    const record = (rowNo: string, currentAmount: number, templateId = legacyVatTemplate) => ({ data: { rowNo, currentAmount, templateId, cumulativeAmount: 99 } })
    const draft = vatDraftFromArchive([record('11', 100), record('11', 105), record('11', 100), record('12', 0, 'confirmed_document_vat_main'), record('14', 10, 'unrelated')])
    expect(draft.amounts['11']).toEqual(['', '99.00', '', ''])
    expect(draft.amounts['12']).toEqual(['0.00', '99.00', '', ''])
    expect(draft.amounts['14']).toBeUndefined()
    expect(draft.notices[0]).toContain('冲突')
  })
})
