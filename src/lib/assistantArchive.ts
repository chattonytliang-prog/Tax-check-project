import { apiSend } from './apiClient'
import { readAssistantAttachment } from './assistantAttachment'
import type { AssistantFileResponse } from './assistantArtifacts'

type ArchivePreparation = {
  files: { id: string; name: string; contentType: string | null; version: string; cached: boolean }[]
  unavailable: string[]
  limited: boolean
}

export async function askArchivedSources({
  threadId, requestId, clientId, message, history, signal, onProgress,
}: {
  threadId: string
  requestId?: string
  clientId: string
  message: string
  history: { role: string; content: string }[]
  signal: AbortSignal
  onProgress: (message: string) => void
}): Promise<AssistantFileResponse | null> {
  const options = { signal }
  const prepare = await apiSend<ArchivePreparation>('/api/ai/attachments', 'POST', {
    threadId, message, archive: { action: 'prepare', clientId },
  }, options)
  const failed = prepare.unavailable.map((name) => `「${name}」缺少可读取的原件`)
  const sourceIds: string[] = []
  for (const file of prepare.files) {
    signal.throwIfAborted()
    try {
      if (!file.cached) {
        onProgress(`正在读取归档原件「${file.name}」…`)
        const response = await fetch(`/api/tax-data/source?sourceFileId=${encodeURIComponent(file.id)}`, { signal, cache: 'no-store' })
        if (!response.ok) throw new Error('原件暂时无法读取')
        const sections = await readAssistantAttachment(new File([await response.blob()], file.name, { type: file.contentType || '' }))
        signal.throwIfAborted()
        await apiSend('/api/ai/attachments', 'POST', {
          threadId,
          attachment: { sections },
          archive: { clientId, sourceId: file.id, version: file.version },
        }, options)
      }
      sourceIds.push(file.id)
    } catch (error) {
      signal.throwIfAborted()
      failed.push(`「${file.name}」${error instanceof Error ? error.message : '无法读取原件'}`)
    }
  }
  onProgress('')
  if (!sourceIds.length && !failed.length) return null
  const warning = [
    prepare.limited ? '本轮最多读取 48 份原件。可在问题中加上年份或月份以缩小范围。' : '',
    failed.length ? `部分原件未能读取：\n${failed.map((item) => `- ${item}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
  if (!sourceIds.length) return { answer: `没有读到可用于本轮回答的原文。\n\n${warning}`, excerpted: false }
  const result = await apiSend<AssistantFileResponse>('/api/ai/attachments', 'POST', {
    threadId, requestId, message, history, archive: { clientId, sourceIds },
  }, options)
  return {
    ...result,
    answer: [result.answer, warning].filter(Boolean).join('\n\n'),
  }
}
