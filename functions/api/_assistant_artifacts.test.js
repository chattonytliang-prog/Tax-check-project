import { describe, expect, it } from 'vitest'
import * as XLSX from '@e965/xlsx'
import { renderAssistantFile } from './_assistant_artifacts.js'

describe('generated file content', () => {
  it('preserves spreadsheet text as literal values instead of formulas', async () => {
    const result = await renderAssistantFile({
      fileName: '../明细.xlsx', format: 'xlsx',
      sheets: [{ name: '资料', rows: [['=SUM(A1:A2)', -28.5, true]] }],
    })
    const book = XLSX.read(result.bytes, { type: 'array' })
    expect(book.Sheets['资料'].A1.v).toBe('=SUM(A1:A2)')
    expect(book.Sheets['资料'].A1.f).toBeUndefined()
    expect(XLSX.utils.sheet_to_json(book.Sheets['资料'], { header: 1 })).toEqual([['=SUM(A1:A2)', -28.5, true]])
    expect(result.name).not.toMatch(/[\\/]/)
  })

  it('exports Unicode CSV with quotes, numeric negatives and escaped formula strings', async () => {
    const result = await renderAssistantFile({
      fileName: '明细', format: 'csv',
      sheets: [{ name: '明细', rows: [['项目,"说明"', -28.5, '=1+1', '换\n行']] }],
    })
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(result.bytes))
      .toBe('\ufeff"项目,""说明""",-28.5,\'=1+1,"换\n行"')
  })

  it('validates JSON and rejects requests that would silently lose sheets', async () => {
    const file = await renderAssistantFile({ fileName: '结论', format: 'json', content: '{"金额":28.5}' })
    expect(JSON.parse(new TextDecoder().decode(file.bytes))).toEqual({ 金额: 28.5 })
    await expect(renderAssistantFile({ fileName: '结论', format: 'json', content: '无效 JSON' })).rejects.toThrow()
    await expect(renderAssistantFile({ fileName: '明细', format: 'csv', sheets: [
      { name: 'A', rows: [[1]] }, { name: 'B', rows: [[2]] },
    ] })).rejects.toThrow('CSV 仅支持一个工作表')
  })
})
