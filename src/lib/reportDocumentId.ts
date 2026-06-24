type ReportDocumentIdInput = {
  clientName?: string
  creditCode?: string
  createdAt?: string
}

function normalizeDocumentIdPart(value: string) {
  return value
    .replace(/[^A-Za-z0-9\u4e00-\u9fa5]/g, '')
    .slice(0, 12)
    .toUpperCase()
}

export function reportDocumentId(input: ReportDocumentIdInput) {
  const date = (input.createdAt || new Date().toISOString()).slice(0, 10).replace(/-/g, '')
  const identity = normalizeDocumentIdPart(input.creditCode || input.clientName || 'CLIENT') || 'CLIENT'
  return `HY-TAX-${date}-${identity}`
}
