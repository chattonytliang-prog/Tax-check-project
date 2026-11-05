import type { AssistantGeneratedFile } from './assistantArtifacts'

export function assistantThreadStorageKey(ownerUserId: string) {
  if (!ownerUserId.trim()) throw new Error('Assistant thread owner is required')
  return `hy-tax-ai-assistant-threads:${encodeURIComponent(ownerUserId)}`
}

type ThreadFileMessage = { content?: string; attachmentIds?: string[]; artifacts?: AssistantGeneratedFile[] }

export function retainAssistantThreadFiles<T extends { attachmentIds?: string[]; generatedFiles?: AssistantGeneratedFile[]; messages: ThreadFileMessage[] }>(thread: T) {
  const attachmentIds = [...new Set([
    ...(thread.attachmentIds || []), ...thread.messages.flatMap((message) => message.attachmentIds || []),
  ])]
  const files = new Map([
    ...(thread.generatedFiles || []), ...thread.messages.flatMap((message) => message.artifacts || []),
  ].map((file) => [file.id, file]))
  return { ...thread, attachmentIds, generatedFiles: [...files.values()] }
}
