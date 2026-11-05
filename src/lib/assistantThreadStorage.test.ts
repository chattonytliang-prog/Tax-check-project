import { describe, expect, it } from 'vitest'
import { assistantThreadStorageKey, retainAssistantThreadFiles } from './assistantThreadStorage'

describe('assistant thread storage', () => {
  it('isolates browser fallback conversations by user', () => {
    expect(assistantThreadStorageKey('user-a')).toBe('hy-tax-ai-assistant-threads:user-a')
    expect(assistantThreadStorageKey('user-b')).not.toBe(assistantThreadStorageKey('user-a'))
    expect(assistantThreadStorageKey('user/a')).toBe('hy-tax-ai-assistant-threads:user%2Fa')
  })

  it('never falls back to an unowned browser cache', () => {
    expect(() => assistantThreadStorageKey('')).toThrow('owner is required')
  })

  it('retains attachment and generated-file references when messages are summarized or edited', () => {
    const file = { id: 'output-a', name: '明细.xlsx', contentType: 'test', size: 10, downloadUrl: '/api/assistant/artifacts/output-a' }
    const saved = retainAssistantThreadFiles({ messages: [{ attachmentIds: ['source-a', 'source-a'], artifacts: [file] }] })
    const summarized = retainAssistantThreadFiles({ ...saved, messages: [{ content: '摘要' }] })
    expect(summarized.attachmentIds).toEqual(['source-a'])
    expect(summarized.generatedFiles).toEqual([file])
  })
})
