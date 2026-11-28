import { describe, expect, it } from 'vitest'
import { parseCitPdf, validateCitAdjustments } from './citAdjustmentFiling'
import { participatesInEnterpriseScoring } from './enterpriseRulePolicy'
import type { PdfTextRun } from './pdfTextExtractor'

const t = (text: string, x: number, y: number, width = 12): PdfTextRun => ({ text, x, y, width })
const taxId = '91110000TEST000001'
const meta = (id = taxId, year = '2024') => [
  t(`税款所属期间：${year}年01月01日至${year}年12月31日`, 20, 690),
  t(`纳税人识别号（统一社会信用代码）：${id}`, 20, 673),
]
const cover = () => [t('中华人民共和国企业所得税年度纳税申报表（A类）', 20, 720), ...meta()]
const main = (up = '', down = '145,000.00', hospitality = '50,000.00', id = taxId, year = '2024') => [
  t('A105000', 22, 720), t('纳税调整项目明细表', 160, 720), ...meta(id, year),
  t('账载金额', 340, 650, 32), t('税收金额', 415, 650, 32),
  t('调增金额', 490, 650, 32), t('调减金额', 565, 650, 32),
  // 辽宁税务公开招待费案例的期末调整额。
  t('15', 24, 440), t('（三）业务招待费支出', 70, 440, 80),
  t('100,000.00', 331, 440, 48), t('50,000.00', 407, 440, 44), t(hospitality, 491, 440, 46), t('*', 578, 440),
  t('16', 24, 420), t('（四）广告费和业务宣传费支出（填写 A105060）', 70, 420, 220),
  t('*', 350, 420), t('*', 425, 420), t(up, 491, 420, 46), t(down, 566, 420, 46),
]
const annex = (value = '-145000', id = taxId, year = '2024') => [
  t('A105060 广告费和业务宣传费等跨年度纳税调整明细表', 22, 720), ...meta(id, year),
  // 广东税务公开案例表格使用两行/三行标题与居中的行次。
  t('广告费和', 338, 630, 32), t('业务宣传费', 334, 615, 40),
  t('保险企业手', 410, 634, 40), t('续费及佣金', 410, 623, 40), t('支出', 422, 612, 16),
  t('1', 350, 600), t('2', 425, 600), t('七、本年支出纳税调整金额', 70, 427, 110),
  t('12', 24, 420), t(value, 337, 420, 36), t('999,999.00', 405, 420, 48),
  t('（3＞6，本行=2+3-6+10-11；3≤6，本行=2+10-11-9）', 72, 412, 240),
]
const inspect = (...files: PdfTextRun[][][]) => validateCitAdjustments(parseCitPdf(files))

describe('annual CIT filing checks', () => {
  it('uses both public answers, including the correct direction and PDF pages', () => {
    const result = inspect([main(), annex()])
    expect(result.findings.map((item) => item.status)).toEqual(['matched', 'matched'])
    expect(result.findings[0]).toMatchObject({ actual: 5_000_000, expected: 5_000_000 })
    expect(result.findings[1].sources).toEqual([
      { form: 'A105000', file: 0, page: 1, row: 16 }, { form: 'A105060', file: 0, page: 2, row: 12 },
    ])
  })

  it('flags one-cent differences, wrong directions, and offsetting entries with the correct net', () => {
    expect(inspect([main('145000', '', '49999.99'), annex()]).findings.map((item) => item.status)).toEqual(['difference', 'difference'])
    expect(inspect([main('1000', '146000'), annex()]).findings[1].status).toBe('difference')
    expect(inspect([main('145000', ''), annex('145000')]).findings[1].status).toBe('matched')
  })

  it('does not turn absent amounts into zero or use the nearby insurance column', () => {
    expect(inspect([main('', '', ''), annex('0')]).findings.map((item) => item.status)).toEqual(['missing', 'missing'])
    expect(inspect([main('', '0'), annex('0')]).findings[1].status).toBe('matched')
    expect(inspect([main('', '145000'), annex('')]).findings[1].status).toBe('missing')
    expect(inspect([main('', '145000')]).recognized).toBe(1)
  })

  it('does not mix taxpayers, years, or duplicate returns', () => {
    expect(inspect([main()], [annex('-145000', '91110000TEST000002')]).findings[1].status).toBe('missing')
    expect(inspect([main()], [annex('-145000', taxId, '2023')]).findings[1].status).toBe('missing')
    expect(inspect([main()], [annex()], [annex()]).findings[1].status).toBe('missing')
    expect(inspect([main()], [annex()]).findings[1].status).toBe('matched')
  })

  it('inherits a single consistent cover only within the same file', () => {
    const withoutMeta = (page: PdfTextRun[]) => page.filter((run) => run.y !== 690 && run.y !== 673)
    expect(inspect([cover(), withoutMeta(main()), withoutMeta(annex())]).findings[1].status).toBe('matched')
    expect(inspect([cover(), withoutMeta(main())], [withoutMeta(annex())]).findings[1].status).toBe('missing')
    expect(inspect([cover(), main('','145000','50000','91110000TEST000002'), withoutMeta(annex())]).findings[1].status).toBe('missing')
  })

  it('fails closed on unrecognized headers and keeps unverified scoring rules out', () => {
    expect(inspect([main().filter((run) => run.text !== '调减金额'), annex()]).findings.map((item) => item.status)).toEqual(['missing', 'missing'])
    for (const key of ['FILING-CIT', 'R015', 'R016', 'ON-020', 'ON-021']) expect(participatesInEnterpriseScoring(key)).toBe(false)
  })
})
