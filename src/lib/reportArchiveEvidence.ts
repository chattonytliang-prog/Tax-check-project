export type ReportArchiveEvidence = {
  sourceFileCount: number
  storedSourceFileCount: number
  linkedSourceFileCount: number
  recordCount: number
}

export function reportArchiveEvidenceStatement(evidence?: ReportArchiveEvidence | null) {
  if (!evidence
    || Object.values(evidence).some((value) => !Number.isSafeInteger(value) || value < 0)
    || evidence.storedSourceFileCount > evidence.sourceFileCount
    || evidence.linkedSourceFileCount > evidence.sourceFileCount
    || evidence.linkedSourceFileCount > evidence.recordCount) {
    return '生成时未能核验企业归档统计；报告仅依据已录入期间数据，来源文件与标准记录需另行核对。'
  }

  return `生成时界面已加载的企业全部期间归档：已登记源文件 ${evidence.sourceFileCount} 个，原件已保存 ${evidence.storedSourceFileCount} 个，其中 ${evidence.linkedSourceFileCount} 个文件形成标准记录，共 ${evidence.recordCount} 条标准记录。此统计不等于本报告期间或各风险事项的证据已逐项核验。`
}
