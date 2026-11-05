import { describe, expect, it, vi } from 'vitest'
import { utils, write } from '@e965/xlsx'
import { readExcelSheetsForMapping } from './clientImportParser'
import { parseConfirmedExcelMapping } from './taxDataIntakeParser'
import { autoMapExcelSheet } from './autoExcelMapping'

const settings = {
  headerRow: 3, lastRow: 5,
  periodStart: '2025-12-01', periodEnd: '2025-12-31', amountScale: 10000,
  mapping: { kind: 'income_statement', columns: { lineName: 1, currentAmount: 3 } },
}
const sheet = { name: '自定义报表', rows: [
  [],
  ['', '示例企业有限公司'],
  ['', '科目描述', '', '本月发生额（万元）'],
  [],
  ['', '营业收入', '', '1,234.50'],
] }

describe('confirmed Excel column mapping', () => {
  it('automatically selects the header, period and unit while sending only column labels', async () => {
    const original = { ...sheet, rows: [...sheet.rows] }
    original.rows[1] = ['示例企业有限公司', '2025年12月']
    const suggest = vi.fn(async () => settings.mapping)
    const result = await autoMapExcelSheet(original, '示例.xlsx', suggest)
    expect(suggest).toHaveBeenCalledWith(['', '科目描述', '', '本月发生额（万元）'])
    expect(result.intake.records[0]).toMatchObject({ periodStart: '2025-12-01', payload: { currentAmount: 12345000 } })
    expect(result.description).toContain('金额按万元')
  })

  it('reads the original cells, units, and worksheet coordinates', async () => {
    const book = utils.book_new()
    const workbookSheet = utils.aoa_to_sheet(sheet.rows.map((row) => row.map((value) => value || undefined)))
    utils.book_append_sheet(book, workbookSheet, sheet.name)
    const [original] = await readExcelSheetsForMapping(write(book, { type: 'array', bookType: 'xlsx' }))
    const result = parseConfirmedExcelMapping(original, settings)
    expect(result.records[0]).toMatchObject({ recordSubtype: 'income_statement', payload: { lineName: '营业收入', currentAmount: 12345000, sourceRowNo: 5 } })
    expect(result.evidenceFields).toContainEqual(expect.objectContaining({
      targetField: 'currentAmount', rawValue: '1,234.50', normalizedValue: '12345000', rowNo: 5, columnNo: 4, sheetName: sheet.name,
    }))
  })

  it('blocks duplicate mappings and ambiguous original amounts', () => {
    expect(() => parseConfirmedExcelMapping(sheet, { ...settings, mapping: { kind: 'income_statement', columns: { lineName: 1, currentAmount: 1 } } })).toThrow('同一原表列')
    const badSheet = { ...sheet, rows: [...sheet.rows.slice(0, 4), ['', '营业收入', '', '1,2']] }
    expect(() => parseConfirmedExcelMapping(badSheet, settings)).toThrow('第 5 行')
  })
})
