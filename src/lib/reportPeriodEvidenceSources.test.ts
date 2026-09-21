import { describe, expect, it } from 'vitest'
import {
  buildReportPeriodEvidenceSources,
  isValidReportPeriodEvidenceSources,
  reportPeriodEvidenceSourceList,
  reportPeriodEvidenceSourcePeriod,
  reportPeriodEvidenceSourceStatus,
  reportPeriodEvidenceSourceTypeLabel,
  type ReportPeriodEvidenceSource,
  type ReportPeriodEvidenceSourceInput,
} from './reportPeriodEvidenceSources'

const source: ReportPeriodEvidenceSourceInput = {
  id: ' source-1 ',
  fileName: ' 2025年12月增值税申报表.pdf ',
  documentType: ' vat_return ',
  periodStart: '2025-12-01',
  periodEnd: '2025-12-31',
  parseStatus: ' parsed ',
  stored: true,
  recordCount: 8,
}

describe('report period evidence sources', () => {
  it('freezes only source files that overlap the selected report months', () => {
    const result = buildReportPeriodEvidenceSources([
      { ...source, id: 'later', fileName: 'B.xlsx', periodStart: '2025-12-01', periodEnd: '2026-02-28' },
      { ...source, id: 'same-period', fileName: 'C.xlsx', periodStart: '2025-12-01', periodEnd: '2025-12-31' },
      { ...source, id: 'earlier', fileName: 'A.xlsx', periodStart: '2025-11-01', periodEnd: '2025-12-31' },
      { ...source, id: 'outside', periodStart: '2025-10-01', periodEnd: '2025-10-31' },
      { ...source, id: 'missing-start', periodStart: '' },
      { ...source, id: 'missing-end', periodEnd: '' },
      { ...source, id: 'reversed', periodStart: '2026-01-01', periodEnd: '2025-12-31' },
    ], ['bad-month', '2025-12', '2025-12-15'])

    expect(result.map((item) => item.sourceFileId)).toEqual(['earlier', 'later', 'same-period'])
    expect(result[0]).toEqual({
      sourceFileId: 'earlier',
      fileName: 'A.xlsx',
      documentType: 'vat_return',
      periodStart: '2025-11-01',
      periodEnd: '2025-12-31',
      parseStatus: 'parsed',
      stored: true,
      recordCount: 8,
    })
  })

  it('returns no snapshot without a valid selected month', () => {
    expect(buildReportPeriodEvidenceSources([source], [])).toEqual([])
    expect(buildReportPeriodEvidenceSources([source], ['2025-13', 'unknown'])).toEqual([])
  })

  it('sanitizes saved rows and drops invalid or duplicate evidence entries', () => {
    const valid: ReportPeriodEvidenceSource = {
      sourceFileId: ' source-1 ',
      fileName: ' file.xlsx ',
      documentType: ' ledger ',
      periodStart: '2025-01-01',
      periodEnd: '2025-01-31',
      parseStatus: ' parsed ',
      stored: false,
      recordCount: 0,
    }
    const invalidRows = [
      null,
      {},
      { ...valid, sourceFileId: ' ' },
      { ...valid, fileName: ' ' },
      { ...valid, documentType: 1 },
      { ...valid, parseStatus: 1 },
      { ...valid, stored: 1 },
      { ...valid, recordCount: -1 },
      { ...valid, recordCount: 1.5 },
      { ...valid, periodStart: 'bad' },
      { ...valid, periodEnd: 'bad' },
      { ...valid, periodStart: '2025-02-01', periodEnd: '2025-01-31' },
    ]

    expect(reportPeriodEvidenceSourceList('not-an-array')).toEqual([])
    expect(reportPeriodEvidenceSourceList([valid, { ...valid }, ...invalidRows])).toEqual([{
      sourceFileId: 'source-1',
      fileName: 'file.xlsx',
      documentType: 'ledger',
      periodStart: '2025-01-01',
      periodEnd: '2025-01-31',
      parseStatus: 'parsed',
      stored: false,
      recordCount: 0,
    }])
    expect(isValidReportPeriodEvidenceSources([valid])).toBe(true)
    expect(isValidReportPeriodEvidenceSources([valid, { ...valid }])).toBe(false)
    expect(isValidReportPeriodEvidenceSources(null)).toBe(false)
  })

  it('formats type, period, and storage status without overstating evidence', () => {
    const stored = reportPeriodEvidenceSourceList([{
      sourceFileId: 'source-1',
      fileName: 'file.xlsx',
      documentType: 'vat_return',
      periodStart: '2025-12-01',
      periodEnd: '2025-12-31',
      parseStatus: 'parsed',
      stored: true,
      recordCount: 8,
    }])[0]
    expect(reportPeriodEvidenceSourceTypeLabel(stored.documentType)).toBe('增值税申报主表')
    expect(reportPeriodEvidenceSourceTypeLabel('custom_type')).toBe('custom_type')
    expect(reportPeriodEvidenceSourceTypeLabel('')).toBe('资料类型未标注')
    expect(reportPeriodEvidenceSourcePeriod(stored)).toBe('2025-12-01 至 2025-12-31')
    expect(reportPeriodEvidenceSourcePeriod({ ...stored, periodEnd: stored.periodStart })).toBe('2025-12-01')
    expect(reportPeriodEvidenceSourceStatus(stored)).toBe('原件已保存 · 已形成 8 条标准记录')
    expect(reportPeriodEvidenceSourceStatus({ ...stored, stored: false })).toBe('仅登记索引 · 已形成 8 条标准记录')
    expect(reportPeriodEvidenceSourceStatus({ ...stored, recordCount: 0 })).toBe('原件已保存 · 未形成标准记录')
    expect(reportPeriodEvidenceSourceStatus({ ...stored, stored: false, recordCount: 0 })).toBe('仅登记索引 · 未形成标准记录')
  })
})
