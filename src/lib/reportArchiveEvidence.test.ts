import { describe, expect, it } from 'vitest'
import { reportArchiveEvidenceStatement } from './reportArchiveEvidence'

describe('report archive evidence statement', () => {
  it('distinguishes registered files, stored originals, linked files, and records', () => {
    const result = reportArchiveEvidenceStatement({
      sourceFileCount: 9,
      storedSourceFileCount: 7,
      linkedSourceFileCount: 5,
      recordCount: 1729,
    })
    expect(result).toContain('已登记源文件 9 个')
    expect(result).toContain('原件已保存 7 个')
    expect(result).toContain('5 个文件形成标准记录')
    expect(result).toContain('1729 条标准记录')
    expect(result).toContain('不等于本报告期间或各风险事项的证据已逐项核验')
  })

  it('does not invent evidence when the archive is empty or unavailable', () => {
    expect(reportArchiveEvidenceStatement({ sourceFileCount: 0, storedSourceFileCount: 0, linkedSourceFileCount: 0, recordCount: 0 }))
      .toContain('已登记源文件 0 个')
    expect(reportArchiveEvidenceStatement(null)).toContain('未能核验企业归档统计')
    expect(reportArchiveEvidenceStatement({ sourceFileCount: Number.NaN, storedSourceFileCount: 0, linkedSourceFileCount: 0, recordCount: 0 }))
      .toContain('未能核验企业归档统计')
  })

  it('does not print contradictory archive counts as verified report evidence', () => {
    for (const evidence of [
      { sourceFileCount: 1, storedSourceFileCount: 2, linkedSourceFileCount: 0, recordCount: 0 },
      { sourceFileCount: 1, storedSourceFileCount: 1, linkedSourceFileCount: 2, recordCount: 2 },
      { sourceFileCount: 2, storedSourceFileCount: 1, linkedSourceFileCount: 2, recordCount: 1 },
    ]) {
      expect(reportArchiveEvidenceStatement(evidence)).toContain('未能核验企业归档统计')
    }
    expect(reportArchiveEvidenceStatement({ sourceFileCount: 2, storedSourceFileCount: 1, linkedSourceFileCount: 2, recordCount: 3 }))
      .toContain('2 个文件形成标准记录')
  })
})
