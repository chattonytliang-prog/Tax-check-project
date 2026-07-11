import { describe, expect, it } from 'vitest'
import { binaryAssistantReplyMessage, hasDirectIntakeAuthorization, instantAssistantReply, isBinaryAssistantQuestion } from './assistantIntakeIntent'

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

describe('instantAssistantReply', () => {
  it('answers conversational no-op messages without invoking the model', () => {
    expect(instantAssistantReply('你好！')).toContain('你好')
    expect(instantAssistantReply('在吗')).toContain('在')
    expect(instantAssistantReply('谢谢')).toBe('不客气。')
  })

  it('leaves business questions to the Agent', () => {
    expect(instantAssistantReply('2026年3月有没有利润表')).toBe('')
  })
})

describe('binary assistant questions', () => {
  it('recognizes closed questions and preserves question context in replies', () => {
    const question = '增值税申报表（2026年3月）是否已上传？'
    expect(isBinaryAssistantQuestion(question)).toBe(true)
    expect(binaryAssistantReplyMessage(question, '是')).toBe('针对“增值税申报表（2026年3月）是否已上传”，我的回答是：是。')
  })

  it('does not add binary controls to open questions', () => {
    expect(isBinaryAssistantQuestion('请说明这份资料对应哪个期间？')).toBe(false)
  })
})
