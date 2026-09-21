export type ReportArchiveEvidence = {
  sourceFileCount: number
  storedSourceFileCount: number
  linkedSourceFileCount: number
  recordCount: number
}

export function isValidReportArchiveEvidence(evidence: unknown): evidence is ReportArchiveEvidence {
  if (!evidence || typeof evidence !== 'object') return false
  const candidate = evidence as Partial<ReportArchiveEvidence>
  const values = [
    candidate.sourceFileCount,
    candidate.storedSourceFileCount,
    candidate.linkedSourceFileCount,
    candidate.recordCount,
  ]
  return values.every((value) => Number.isSafeInteger(value) && (value ?? -1) >= 0)
    && candidate.storedSourceFileCount! <= candidate.sourceFileCount!
    && candidate.linkedSourceFileCount! <= candidate.sourceFileCount!
    && candidate.linkedSourceFileCount! <= candidate.recordCount!
}

export function reportArchiveEvidenceSnapshot(evidence: unknown): ReportArchiveEvidence | undefined {
  if (!isValidReportArchiveEvidence(evidence)) return undefined
  return {
    sourceFileCount: evidence.sourceFileCount,
    storedSourceFileCount: evidence.storedSourceFileCount,
    linkedSourceFileCount: evidence.linkedSourceFileCount,
    recordCount: evidence.recordCount,
  }
}

export function reportArchiveEvidenceFacts(evidence: unknown) {
  if (!isValidReportArchiveEvidence(evidence)) return []
  return [
    { label: '已登记源文件', value: `${evidence.sourceFileCount} 个` },
    { label: '原件已保存', value: `${evidence.storedSourceFileCount} 个` },
    { label: '形成标准记录的文件', value: `${evidence.linkedSourceFileCount} 个` },
    { label: '标准记录', value: `${evidence.recordCount} 条` },
  ]
}

export function reportArchiveEvidenceStatement(evidence?: ReportArchiveEvidence | null) {
  if (!isValidReportArchiveEvidence(evidence)) {
    return '生成时未能核验企业归档统计；报告仅依据已录入期间数据，来源文件与标准记录需另行核对。'
  }

  return `生成时界面已加载的企业全部期间归档：已登记源文件 ${evidence.sourceFileCount} 个，原件已保存 ${evidence.storedSourceFileCount} 个，其中 ${evidence.linkedSourceFileCount} 个文件形成标准记录，共 ${evidence.recordCount} 条标准记录。此统计不等于本报告期间或各风险事项的证据已逐项核验。`
}
