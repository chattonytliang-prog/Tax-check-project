import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseClientImportWorkbook } from './clientImportParser'
import { extractPdfTextPages } from './pdfTextExtractor'
import { parseTaxDataPdfText, type ParsedTaxDataIntake } from './taxDataIntakeParser'

const goldenDir = join(process.cwd(), '客户真实案例资料', '北京正泰浦电气科技有限公司', '00_客户原始资料_汇总复制')

function arrayBufferFromFile(filePath: string) {
  const buffer = readFileSync(filePath)
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

function goldenFile(fileName: string) {
  const match = readdirSync(goldenDir)
    .filter((name) => !name.startsWith('~$'))
    .find((name) => name === fileName)
  if (!match) throw new Error(`Missing golden sample: ${fileName}`)
  return join(goldenDir, match)
}

async function parseWorkbookGolden(fileName: string) {
  const filePath = goldenFile(fileName)
  const parsed = await parseClientImportWorkbook(arrayBufferFromFile(filePath), basename(filePath))
  if (!parsed.taxDataIntake) throw new Error(`Workbook did not produce taxDataIntake: ${fileName}`)
  return parsed.taxDataIntake
}

async function parsePdfGolden(fileName: string) {
  const filePath = goldenFile(fileName)
  const pages = await extractPdfTextPages(arrayBufferFromFile(filePath))
  return parseTaxDataPdfText(basename(filePath), pages)
}

function expectAutonomousParse(parsed: ParsedTaxDataIntake, expectedType: string, minimumRecords: number) {
  expect(parsed.documentTypes).toContain(expectedType)
  expect(parsed.records.length).toBeGreaterThanOrEqual(minimumRecords)
  expect(parsed.evidenceFields.length).toBeGreaterThan(0)
  expect(parsed.conflicts.filter((item) => item.severity === 'high')).toEqual([])
}

describe.skipIf(!existsSync(goldenDir))('real customer golden tax data samples', () => {
  it('autonomously parses the 9 source files into standardized records without AI', async () => {
    const payroll = await parseWorkbookGolden('2024年9月-2025年12月工资表.xlsx')
    expectAutonomousParse(payroll, 'payroll', 100)
    expect(payroll.records[0].payload).toMatchObject({
      sourceSequenceNo: '1',
      employeeName: '朱晓军',
      idNumberMasked: '1102**********0044',
    })

    const invoice = await parseWorkbookGolden('202512.xlsx')
    expectAutonomousParse(invoice, 'invoice_list', 2)
    expect(invoice.records[0].payload).toMatchObject({
      invoiceNo: '25322000000619295743',
      counterpartyName: '无锡江南电缆有限公司',
      amount: 8311242.48,
      taxAmount: 1080461.52,
    })

    const statements = await parseWorkbookGolden('北京正泰浦电气科技有限公司2026年3月批量导出.xls')
    expectAutonomousParse(statements, 'financial_statement', 30)
    expect(new Set(statements.records.map((record) => record.recordSubtype))).toEqual(new Set(['balance_sheet', 'income_statement', 'cash_flow_statement']))
    expect(statements.records.find((record) => record.payload.lineName === '货币资金')?.payload).toMatchObject({ endingAmount: 412746.5 })

    const balanceAmountStyle = await parseWorkbookGolden('北京正泰浦电气科技有限公司_余额表（2026.3-2026.3）.xls')
    expectAutonomousParse(balanceAmountStyle, 'account_balance', 100)
    expect(balanceAmountStyle.records[0].payload).toMatchObject({ accountCode: '1001', accountName: '库存现金', endingDebit: 361852.39 })

    const iit = await parseWorkbookGolden('北京正泰浦电气科技有限公司_综合所得申报_202512.xls')
    expectAutonomousParse(iit, 'iit_withholding', 5)
    expect(iit.records[0].payload).toMatchObject({ personName: '梁小慧', idNumberMasked: '1307**********2829' })

    const ledger = await parseWorkbookGolden('明细账_全部科目_202501-202512_北京正泰浦电气科技有限公司_20260507.xls')
    expectAutonomousParse(ledger, 'ledger', 1000)
    expect(ledger.records[0].payload).toMatchObject({ entryDate: '2025-01-31', accountCode: '1001', accountName: '库存现金' })

    const balanceYtd = await parseWorkbookGolden('科目余额表_2026年3月-2026年3月_北京正泰浦电气科技有限公司_20260507.xls')
    expectAutonomousParse(balanceYtd, 'account_balance', 100)
    expect(balanceYtd.records[0].payload).toMatchObject({ accountCode: '1001', accountName: '库存现金', currentDebit: 150000 })

    const vatMain = await parsePdfGolden('《增值税及附加税费申报表（一般纳税人适用）》(2025-12-01-2025-12-31).pdf')
    expectAutonomousParse(vatMain, 'vat_return', 30)
    expect(vatMain.records.find((record) => record.payload.rowNo === '11')?.payload).toMatchObject({ currentAmount: 1358850 })

    const vatSchedule = await parsePdfGolden('《增值税及附加税费申报表附列资料四（税额抵减情况表）》(2025-12-01-2025-12-31).pdf')
    expectAutonomousParse(vatSchedule, 'vat_return_schedule', 8)
    expect(vatSchedule.records.find((record) => record.payload.rowNo === '8')?.payload).toMatchObject({ endingAmount: 0 })
  }, 30000)
})
