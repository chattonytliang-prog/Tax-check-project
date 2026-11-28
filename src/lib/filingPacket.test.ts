import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { utils, write } from '@e965/xlsx'
import { checkVatAnnexes, readPdfInputAnnexFields, updateAnnexAmount } from './filingAnnexes'
import { readVatFilingPacket } from './filingPacket'

const extractPdf = vi.hoisted(() => vi.fn())
vi.mock('./pdfTextExtractor', () => ({ extractPdfTextPages: extractPdf }))

const metadata = (company = '示例纳税企业有限公司', period = '2026-10-01至2026-10-31') => [
  [`税款所属时间：${period}`], [`纳税人名称：（公章）${company}`, '金额单位：元'],
]
const main = [
  ['增值税及附加税费申报表（一般纳税人适用）'], ...metadata(),
  ['项目', '栏次', '一般项目', null, '即征即退项目'], [null, null, '本月数', '本年累计', '本月数', '本年累计'],
  ['销项税额', 11, 100, 900, 0, 0], ['进项税额', 12, 60, 500, 5.03, 9], ['进项税额转出', 14, 0, 800, 0, 0],
  ['城市维护建设税本期应补（退）税额', 39, 2.17], ['教育费附加本期应补（退）费额', 40, 0], ['地方教育附加本期应补（退）费额', 41, 1.03],
]
const input = (company?: string, period?: string) => [
  ['增值税及附加税费申报表附列资料（二）'], ['（本期进项税额明细）'], ...metadata(company, period),
  ['项目', '栏次', '份数', '金额', '税额'], ['当期申报抵扣进项税额合计', '12=1+4+11', 10, 650, 65.03],
  ['项目', '栏次', '税额'], ['本期进项税额转出额', '13=14至23之和', 0],
]
const surcharge = [
  ['增值税及附加税费申报表（一般纳税人适用）附列资料（五）'], ['（附加税费情况表）'], ...metadata(),
  ['税（费）种', '序号', '计税（费）依据', '本期应补（退）税\n（费）额'],
  ['城市维护建设税', 1, 7000, 2.17], ['教育费附加', 2, 8900, 0], ['地方教育附加', 3, 9900, 0.99],
]

function workbook(sheets: [string, unknown[][], boolean?][], name = '预申报资料.xlsx') {
  const book = utils.book_new()
  for (const [title, matrix, hidden] of sheets) {
    const sheet = utils.aoa_to_sheet(matrix)
    sheet['!merges'] = [utils.decode_range('A1:B1')]
    utils.book_append_sheet(book, sheet, title)
    if (hidden) utils.book_set_sheet_visibility(book, title, 1)
  }
  const type = /\.xls$/.test(name) ? 'xls' : 'xlsx'
  return new File([write(book, { type: 'array', bookType: type })], name)
}

describe('同一期整套预申报表', () => {
  it.each([['legacy', 'vat-general.xls', 6], ['pilot', 'vat-pilot.xls', 10]] as const)('opens the published %s blank form set and keeps its money cells editable', async (version, name, size) => {
    const path = new URL(`../../public/filing-templates/${name}`, import.meta.url)
    const doc = new File([new Uint8Array(readFileSync(path))], name)
    const packet = await readVatFilingPacket([doc], version)
    expect(packet.main.version).toBe(version)
    expect(packet.annexes).toHaveLength(size)
    const schedule = packet.annexes.find((annex) => annex.kind === 'input')!
    const key = version === 'legacy' ? '12' : '2A00'
    const cell = schedule.fields?.[key]?.cell
    expect(cell).toBeDefined()
    const modified = updateAnnexAmount(schedule, version, cell!.row, cell!.col, '123.45')
    expect(modified.fields?.[key]?.amountFen).toBe(12345)
    expect(schedule.fields?.[key]?.amountFen).toBeUndefined()
  })
  it.each(['预申报资料.xls', '预申报资料.xlsx'])('loads original %s schedules in review order and matches by field, not position guesses', async (filename) => {
    const packet = await readVatFilingPacket([workbook([['附表五', surcharge], ['隐藏历史附件', input('历史旧公司'), true], ['主表', main], ['附表二', input()]], filename)])
    expect(packet.annexes.map(({ kind, state }) => [kind, state])).toEqual([['input', 'verified'], ['surchargeLegacy', 'verified']])
    expect(packet.annexes[0].grid?.[0][0].colSpan).toBe(2)
    expect(packet.annexes[0].fields?.['12']).toMatchObject({ amountFen: 6503, cell: { row: 5, col: 4 } })
    expect(packet.annexes[0].fields?.['13']).toMatchObject({ amountFen: 0, cell: { row: 7, col: 2 } })
    expect(checkVatAnnexes(packet.main.version, packet.main.amounts, packet.annexes).slice(2).map((item) => [item.target, item.status])).toEqual([
      ['12', 'matched'], ['14', 'matched'], ['39', 'matched'], ['40', 'matched'], ['41', 'difference'],
    ])
  })

  it('accepts separately exported main and schedules in one selection and will not use wrong-company or wrong-period values', async () => {
    const packed = (rows: unknown[][]) => [workbook([['主表', main]], '主表.xlsx'), workbook([['附表二', rows]], '附表二.xlsx')]
    expect((await readVatFilingPacket(packed(input()))).annexes[0].state).toBe('verified')
    for (const file of [input('另一家企业有限公司'), input(undefined, '2026-09-01至2026-09-30')]) {
      const pack = await readVatFilingPacket(packed(file))
      expect(pack.annexes[0].state).toBe('conflict')
      expect(checkVatAnnexes(pack.main.version, pack.main.amounts, pack.annexes).find((item) => item.target === '12')).toMatchObject({ status: 'missing', annexFen: undefined })
    }
  })

  it('rejects two primary forms and never merges competing same-kind schedules', async () => {
    const primary = workbook([['主表', main]])
    await expect(readVatFilingPacket([primary, primary])).rejects.toThrow('多张增值税主表')
    const packet = await readVatFilingPacket([primary, workbook([['原表', input()], ['重复', input()]])])
    expect(packet.annexes.map((sheet) => sheet.state)).toEqual(['duplicate', 'duplicate'])
    expect(checkVatAnnexes(packet.main.version, packet.main.amounts, packet.annexes).find((item) => item.target === '12')?.status).toBe('missing')
  })

  it('uses pilot cells only when the same tax period and correct annex type are present', async () => {
    const pilotMain = [
      ['增值税及附加税费申报表主表'], ...metadata(), ['项目', '栏次', '一般项目本期数', '即征即退项目本期数'],
      ['销项税额', '0B01', 80, 7], ['进项税额', '0B02', 20, 2], ['进项税额转出', '0B04', 0, 0],
    ]
    const pilotInput = [
      ['增值税及附加税费申报表附列资料（二）'], ['（本期进项情况明细表）'], ...metadata(), ['项目', '栏次', '份数', '金额', '税额'],
      ['本期申报抵扣进项税额合计', '2A00', 10, 230, 22], ['本期即征即退项目进项税额', '2C01', 1, 20, 2],
    ]
    const packet = await readVatFilingPacket([workbook([['主表', pilotMain], ['本期进项', pilotInput], ['常规表五', surcharge]])])
    expect(packet.main.version).toBe('pilot')
    expect(packet.annexes.map(({ kind }) => kind)).toEqual(['input'])
    expect(checkVatAnnexes(packet.main.version, packet.main.amounts, packet.annexes).slice(0, 2).map((r) => r.status)).toEqual(['matched', 'matched'])
    expect(packet.notices.some((text) => text.includes('不属于当前主表版本'))).toBe(true)
  })

  it('keeps the original PDF pages addressable without pretending their annex figures were verified', async () => {
    extractPdf.mockResolvedValueOnce([
      [...(main.slice(0, 3).flat()), '项目 栏次 一般项目 即征即退项目', '本月数 本年累计 本月数 本年累计',
        '销项税额 11 100.00 300.00 7.00 70.00', '进项税额 12 60.00 99.00 0.00 88.00', '应抵扣税额合计 17=12+13-14-15+16 10.00 —— 2.00 ——'].join('\n'),
      input().map((row) => row.join(' ')).join('\n'),
    ])
    const file = new File(['测试用模拟 PDF'], '原表.pdf')
    const packet = await readVatFilingPacket([file])
    expect(packet.annexes[0]).toMatchObject({ state: 'pdf', pdf: { file, pages: [2] } })
    expect(checkVatAnnexes(packet.main.version, packet.main.amounts, packet.annexes).find((item) => item.target === '12')?.status).toBe('missing')
  })

  it('only compares positioned PDF input rows when the complete tax column suffix can be recognized', async () => {
    const full = [...input().slice(0, 5).map((row) => row.join(' ')), '当期申报抵扣进项税额合计 12=1+4+11 10 650.00 65.03',
      '项目 栏次 税额', '本期进项税额转出额 13=14至23之和 0.00'].join('\n')
    const trimmed = full.replace('10 650.00 65.03', '10 65.03')
    expect(readPdfInputAnnexFields([full], 'legacy')['12'].amountFen).toBe(6503)
    expect(readPdfInputAnnexFields([trimmed], 'legacy')['12']).toBeUndefined()
    extractPdf.mockResolvedValueOnce([full])
    const packet = await readVatFilingPacket([workbook([['主表', main]]), new File(['模拟 PDF'], '附表二.pdf')])
    expect(packet.annexes[0].state).toBe('verified')
    expect(checkVatAnnexes(packet.main.version, packet.main.amounts, packet.annexes).find((item) => item.target === '12')?.status).toBe('matched')
  })
})
