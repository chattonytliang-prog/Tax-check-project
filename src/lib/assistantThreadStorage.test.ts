import { describe, expect, it } from 'vitest'
import { assistantThreadStorageKey } from './assistantThreadStorage'

describe('assistant thread storage', () => {
  it('isolates browser fallback conversations by user', () => {
    expect(assistantThreadStorageKey('user-a')).toBe('hy-tax-ai-assistant-threads:user-a')
    expect(assistantThreadStorageKey('user-b')).not.toBe(assistantThreadStorageKey('user-a'))
    expect(assistantThreadStorageKey('user/a')).toBe('hy-tax-ai-assistant-threads:user%2Fa')
  })

  it('never falls back to an unowned browser cache', () => {
    expect(() => assistantThreadStorageKey('')).toThrow('owner is required')
  })
})
