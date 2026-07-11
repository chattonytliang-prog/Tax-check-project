import { describe, expect, it } from 'vitest'
import { hasDirectIntakeAuthorization } from './assistantIntakeIntent'

describe('hasDirectIntakeAuthorization', () => {
  it.each([
    '帮我把数据录入并建档',
    '这9个文件全部导入建档',
    '都收录进去，收完再告诉我',
    '确认导入',
    '按这个保存',
  ])('recognizes natural-language write authorization: %s', (message) => {
    expect(hasDirectIntakeAuthorization(message)).toBe(true)
  })

  it.each([
    '先别导入，我还没传完',
    '不要收录，只帮我看看',
    '这些文件是什么资料',
    '怎么导入？',
  ])('does not infer authorization from questions or negation: %s', (message) => {
    expect(hasDirectIntakeAuthorization(message)).toBe(false)
  })
})
