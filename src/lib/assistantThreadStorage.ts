export function assistantThreadStorageKey(ownerUserId: string) {
  if (!ownerUserId.trim()) throw new Error('Assistant thread owner is required')
  return `hy-tax-ai-assistant-threads:${encodeURIComponent(ownerUserId)}`
}
