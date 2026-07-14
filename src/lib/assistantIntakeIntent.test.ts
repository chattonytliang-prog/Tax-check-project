import { describe, expect, it } from 'vitest'
import { binaryAssistantReplyMessage, hasDirectIntakeAuthorization, inferAssistantThreadRenameTitle, instantAssistantReply, isArchiveChecklistQuestion, isBinaryAssistantQuestion } from './assistantIntakeIntent'

describe('hasDirectIntakeAuthorization', () => {
  it.each([
    '帮我把数据录入并建档',
    '这9个文件全部导入建档',
    '都收录进去，收完再告诉我',
    '确认导入',
    '按这个保存',
    '你能帮我识别并上传这两个表吗',
    '解析后归档这几个资料',
  ])('recognizes natural-language write authorization: %s', (message) => {
    expect(hasDirectIntakeAuthorization(message)).toBe(true)
  })

  it.each([
    '先别导入，我还没传完',
    '先别上传，我还没传完',
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

describe('archive checklist questions', () => {
  it('routes deterministic archive questions without invoking the model', () => {
    expect(isArchiveChecklistQuestion('还缺什么资料目前')).toBe(true)
    expect(isArchiveChecklistQuestion('2026年3月已经有哪些资料？')).toBe(true)
    expect(isArchiveChecklistQuestion('资料齐全吗')).toBe(true)
    expect(isArchiveChecklistQuestion('帮我分析税务风险')).toBe(false)
  })
})

describe('assistant thread rename intent', () => {
  it('uses the current client name when the user asks to rename the thread to our company', () => {
    expect(inferAssistantThreadRenameTitle('改一下名字，你线程的名字，改成我们公司名字', '北京正泰浦电气科技有限公司')).toBe('北京正泰浦电气科技有限公司')
  })

  it('extracts an explicit thread title', () => {
    expect(inferAssistantThreadRenameTitle('把当前对话标题改成北京正泰浦电气科技有限公司', '')).toBe('北京正泰浦电气科技有限公司')
  })

  it('does not treat business data rename requests as thread rename permission', () => {
    expect(inferAssistantThreadRenameTitle('把客户名称改成北京正泰浦电气科技有限公司', '北京正泰浦电气科技有限公司')).toBe('')
  })
})
