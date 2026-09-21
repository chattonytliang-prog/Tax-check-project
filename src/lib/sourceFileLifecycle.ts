export type SourceFileLifecycleInput = {
  parseStatus: string
  stored: boolean
  recordCount: number
  reviewNote?: string
}

export type SourceFileLifecycleTone = 'passed' | 'pending' | 'failed'

export type SourceFileLifecycle = {
  storageLabel: string
  storageTone: SourceFileLifecycleTone
  parseLabel: string
  parseTone: SourceFileLifecycleTone
  recordLabel: string
  recordTone: SourceFileLifecycleTone
  ready: boolean
}

function normalizedRecordCount(value: number) {
  return Number.isSafeInteger(value) && value > 0 ? value : 0
}

function parseStage(parseStatus: string): Pick<SourceFileLifecycle, 'parseLabel' | 'parseTone'> {
  const normalized = String(parseStatus || '').trim().toLowerCase()
  if (normalized === 'parsed') return { parseLabel: '解析完成', parseTone: 'passed' }
  if (normalized === 'needs_confirmation') return { parseLabel: '解析待人工确认', parseTone: 'pending' }
  if (normalized === 'failed') return { parseLabel: '解析失败', parseTone: 'failed' }
  if (normalized === 'pending') return { parseLabel: '等待解析', parseTone: 'pending' }
  return { parseLabel: normalized ? `解析状态待核对（${normalized.slice(0, 40)}）` : '解析状态未记录', parseTone: 'pending' }
}

export function sourceFileLifecycle(input: SourceFileLifecycleInput): SourceFileLifecycle {
  const parse = parseStage(input.parseStatus)
  const recordCount = normalizedRecordCount(input.recordCount)
  const hasReviewNote = Boolean(String(input.reviewNote || '').trim())
  return {
    storageLabel: input.stored ? '原件已保存' : '原件未保存',
    storageTone: input.stored ? 'passed' : 'failed',
    ...parse,
    recordLabel: recordCount ? `已入库 ${recordCount} 条` : '未形成标准记录',
    recordTone: recordCount ? 'passed' : 'pending',
    ready: input.stored && parse.parseTone === 'passed' && recordCount > 0 && !hasReviewNote,
  }
}

export function sourceFileLifecycleCounts(sources: SourceFileLifecycleInput[]) {
  const lifecycle = sources.map(sourceFileLifecycle)
  const readyCount = lifecycle.filter((item) => item.ready).length
  return {
    registeredCount: sources.length,
    storedCount: sources.filter((source) => source.stored).length,
    readyCount,
    attentionCount: sources.length - readyCount,
    withoutRecordsCount: lifecycle.filter((item) => item.recordTone !== 'passed').length,
  }
}
