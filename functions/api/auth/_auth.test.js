import { describe, expect, it } from 'vitest'
import { canAccessRuleLibrary } from './_auth.js'

describe('rule library authorization', () => {
  it('allows only the directly signed-in test1 administrator', () => {
    expect(canAccessRuleLibrary({ id: '1', username: 'test1', role: 'admin', actor: null })).toBe(true)
    expect(canAccessRuleLibrary({ id: '1', username: 'TEST1', role: 'admin', actor: null })).toBe(true)
  })

  it('rejects ordinary users, other administrators, and impersonated sessions', () => {
    expect(canAccessRuleLibrary({ id: '2', username: 'lxy', role: 'user', actor: null })).toBe(false)
    expect(canAccessRuleLibrary({ id: '3', username: 'other-admin', role: 'admin', actor: null })).toBe(false)
    expect(canAccessRuleLibrary({
      id: '2',
      username: 'lxy',
      role: 'user',
      actor: { id: '1', username: 'test1', role: 'admin' },
    })).toBe(false)
    expect(canAccessRuleLibrary({ id: '1', username: 'test1', role: 'user', actor: null })).toBe(false)
  })
})
