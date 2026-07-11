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
