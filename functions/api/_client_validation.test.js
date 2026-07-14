import { describe, expect, it } from 'vitest'
import { isInvalidClientName } from './_client_validation.js'

describe('client validation', () => {
  it('rejects accidental numeric or document-title client names', () => {
    expect(isInvalidClientName('2')).toBe(true)
    expect(isInvalidClientName('123456')).toBe(true)
    expect(isInvalidClientName('增值税及附加税费申报表')).toBe(true)
    expect(isInvalidClientName('企业名称')).toBe(true)
  })

  it('accepts real company names', () => {
    expect(isInvalidClientName('北京正泰浦电气科技有限公司')).toBe(false)
    expect(isInvalidClientName('上海测试科技有限公司')).toBe(false)
  })
})
