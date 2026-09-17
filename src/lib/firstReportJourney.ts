export type DirectImportItem = {
  name: string
  status: 'saved' | 'duplicate' | 'failed'
  records: number
  detail: string
}

export type DirectImportBatch = {
  total: number
  processed: number
  clientId: string | null
  items: DirectImportItem[]
  error?: string
}

export function summarizeDirectImport(batch: DirectImportBatch) {
  return batch.items.reduce((summary, item) => {
    summary[item.status] += 1
    summary.records += item.records
    return summary
  }, { saved: 0, duplicate: 0, failed: 0, records: 0 })
}

function normalizedName(value: string) {
  return value.replace(/[\s\u3000（）()·_.-]/g, '')
    .replace(/^(?:纳税人)?公章|公章$/g, '')
    .toLowerCase()
}

export function assertSameImportClient(
  current: { name: string; creditCode: string },
  imported: { name?: string; creditCode?: string },
) {
  const currentCode = current.creditCode.trim().toUpperCase()
  const importedCode = imported.creditCode?.trim().toUpperCase()
  if (currentCode && importedCode && currentCode !== importedCode) {
    throw new Error(`文件税号 ${importedCode} 与当前企业 ${current.name} 不一致，请切换企业或选择“上传新企业资料”`)
  }
  if (imported.name && normalizedName(current.name) !== normalizedName(imported.name)) {
    throw new Error(`文件企业 ${imported.name} 与当前企业 ${current.name} 不一致，请切换企业或选择“上传新企业资料”`)
  }
}

export function findExistingImportClient<T extends { name: string; creditCode: string }>(
  clients: T[],
  imported: { name: string; creditCode?: string },
): T | undefined {
  const code = imported.creditCode?.trim().toUpperCase()
  const match = clients.find((client) => code && client.creditCode.trim().toUpperCase() === code)
    || clients.find((client) => normalizedName(client.name) === normalizedName(imported.name))
  if (match) assertSameImportClient(match, imported)
  return match
}
