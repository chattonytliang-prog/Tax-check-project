import { excelMappingSchemas, validateExcelColumnMapping } from './excelMappingSchema'
import { detectTaxDataPeriod, parseConfirmedExcelMapping, type IntakeSheet } from './taxDataIntakeParser'

const columnLabel = /科目|项目|行次|摘要|金额|借方|贷方|发生|累计|余额|期初|期末|收入|工资|税额|开票|凭证|号码|姓名|日期|account|description|amount|debit|credit|balance|actual|period|date|name|total|ytd/i
const unitScales = { 元: 1, 千元: 1000, 万元: 10000 }

export async function autoMapExcelSheet(
  sheet: IntakeSheet,
  fileName: string,
  suggest: (headers: string[]) => Promise<unknown>,
) {
  const headerIndex = sheet.rows.slice(0, 20).findIndex((row) => {
    const labels = row.filter(Boolean)
    return row.length <= 80 && labels.filter((label) => columnLabel.test(label)).length >= 2
      && labels.every((label) => label.length <= 100 && !/^\s*[+-]?[\d,.\s]+$|@|\d{10,}|20\d{2}[-/.年]\d{1,2}/.test(label))
  })
  if (headerIndex < 0) throw new Error('无法可靠识别表头行。')
  const prefix = sheet.rows.slice(0, headerIndex).flat().join(' ')
  const sheetPeriod = detectTaxDataPeriod(prefix)
  const filePeriod = detectTaxDataPeriod(fileName)
  const period = sheetPeriod.periodStart ? sheetPeriod : filePeriod
  if (!period.periodStart || !period.periodEnd) throw new Error('无法识别资料所属期间。')
  if (sheetPeriod.periodStart && filePeriod.periodStart
    && (sheetPeriod.periodStart !== filePeriod.periodStart || sheetPeriod.periodEnd !== filePeriod.periodEnd)) {
    throw new Error('文件名与表内的所属期间不一致。')
  }
  const headers = sheet.rows[headerIndex].map((label) => columnLabel.test(label) ? label : '')
  const mapping = validateExcelColumnMapping(await suggest(headers), headers)
  if (!mapping) throw new Error('AI 无法可靠匹配表头。')
  const schema = excelMappingSchemas[mapping.kind]
  const amountHeaders = schema.fields.filter(({ kind }) => kind === 'amount')
    .map(({ key }) => headers[mapping.columns[key]] || '')
  if (/美元|欧元|港元|日元|\b(?:USD|EUR|HKD|JPY)\b/i.test([prefix, ...amountHeaders].join(' '))) {
    throw new Error('此表的外币金额未能确认人民币口径。')
  }
  const units = new Set([
    ...Array.from(prefix.matchAll(/单位\s*[:：]?\s*(万元|千元|元)/g), (match) => match[1]),
    ...amountHeaders.flatMap((header) => header.match(/万元|千元|(?<=[（(])元(?=[）)])/g) || []),
  ])
  if (units.size > 1) throw new Error('原表存在不同的金额单位。')
  const unit = ([...units][0] || '元') as keyof typeof unitScales
  const intake = parseConfirmedExcelMapping(sheet, {
    headerRow: headerIndex + 1, lastRow: sheet.rows.length,
    periodStart: period.periodStart, periodEnd: period.periodEnd, amountScale: unitScales[unit], mapping,
  })
  return {
    intake,
    description: `${sheet.name} · ${schema.label} · ${intake.records.length} 条 · ${period.periodStart} 至 ${period.periodEnd} · 金额按${unit}${units.size ? '' : '（原表未标注）'}`,
  }
}
