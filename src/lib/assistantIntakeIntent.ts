export function hasDirectIntakeAuthorization(message: string) {
  const text = message.replace(/\s+/g, '')
  if (/(不要|暂不|先别|不用).{0,8}(录入|收录|导入|入库|保存|建档)/.test(text)) return false
  return (
    /(都|全部|全都|直接|先|这批|这些).{0,12}(录入|收录|导入|入库|保存|建档)/.test(text)
    || /(帮我|请|麻烦).{0,12}(录入|收录|导入|入库|保存|建档)/.test(text)
    || /(录入|收录|导入|入库|保存).{0,8}(并|和|然后)?.{0,8}(建档|归档)/.test(text)
    || /(收录|导入|入库|保存).{0,8}(完|后).{0,8}(再|再来|再告诉|再问)/.test(text)
    || /确认导入|按这个保存|先收录|先入库|都收录进去/.test(text)
  )
}

export function instantAssistantReply(message: string) {
  const text = message.replace(/[\s，。！？!?、,.]/g, '').toLowerCase()
  if (/^(你好|您好|嗨|哈喽|hello|hi)$/.test(text)) return '你好，我在。你可以直接上传资料，或者告诉我需要查询哪家企业、哪个期间。'
  if (/^(在吗|在不在|有人吗)$/.test(text)) return '在。请直接告诉我需要处理什么。'
  if (/^(谢谢|感谢|多谢|thankyou|thanks)$/.test(text)) return '不客气。'
  return ''
}

export function isBinaryAssistantQuestion(text: string) {
  return /(是否|有没有|有无|可否|能否|是不是|是否已|是否可以|可不可以)/.test(text)
}

export function isArchiveChecklistQuestion(message: string) {
  const text = message.replace(/\s+/g, '')
  return (
    /(还|目前|现在|当前|本月|这个月)?.{0,5}(缺|少|欠).{0,8}(什么|哪些)?.{0,4}(资料|材料|文件|表)/.test(text)
    || /(已有|已经有|已上传|已收录|有了).{0,8}(什么|哪些)?.{0,4}(资料|材料|文件|表)/.test(text)
    || /(资料|材料|文件).{0,5}(齐不齐|齐全吗|完整吗|还缺|缺哪些)/.test(text)
  )
}

export function inferAssistantThreadRenameTitle(message: string, currentClientName = '') {
  const text = message.replace(/\s+/g, '').trim()
  if (!text) return ''
  const mentionsThreadTitle = (
    /(线程|对话|会话|聊天|聊天记录|任务).{0,10}(名字|名称|标题)/.test(text)
    || /(名字|名称|标题).{0,10}(线程|对话|会话|聊天|聊天记录|任务)/.test(text)
  )
  if (!mentionsThreadTitle) return ''
  if (!/(改|改成|改为|修改|重命名|命名|叫)/.test(text)) return ''

  const clientAliasPattern = /(我们公司|我公司|本公司|当前企业|这个企业|该企业|公司名字|公司名称|企业名字|企业名称)/
  if (clientAliasPattern.test(text)) return currentClientName.trim().slice(0, 80)

  const titleMatch = text.match(/(?:改成|改为|修改为|重命名为|命名为|叫做|叫)[「“"']?([^」”"'，。！？!?、\n]+)/)
  const title = (titleMatch?.[1] || '').replace(/(这个|当前)?(线程|对话|会话|聊天|聊天记录|任务)(的)?(名字|名称|标题)?/g, '').trim()
  if (!title || clientAliasPattern.test(title)) return currentClientName.trim().slice(0, 80)
  return title.slice(0, 80)
}

export function binaryAssistantReplyMessage(question: string, answer: '是' | '否') {
  return `针对“${question.replace(/[？?。]+$/, '')}”，我的回答是：${answer}。`
}
