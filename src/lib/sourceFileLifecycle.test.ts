import { describe, expect, it } from 'vitest'
import { sourceFileLifecycle, sourceFileLifecycleCounts } from './sourceFileLifecycle'

describe('source file lifecycle', () => {
  it('marks a fully stored, parsed and linked source as ready', () => {
    expect(sourceFileLifecycle({ parseStatus: ' parsed ', stored: true, recordCount: 8 })).toEqual({
      storageLabel: '原件已保存',
      storageTone: 'passed',
      parseLabel: '解析完成',
      parseTone: 'passed',
      recordLabel: '已入库 8 条',
      recordTone: 'passed',
      ready: true,
    })
  })

  it('keeps review notes, missing originals and invalid record counts out of ready state', () => {
    expect(sourceFileLifecycle({ parseStatus: 'parsed', stored: true, recordCount: 8, reviewNote: '待复核' }).ready).toBe(false)
    expect(sourceFileLifecycle({ parseStatus: 'parsed', stored: false, recordCount: 8 })).toMatchObject({
      storageLabel: '原件未保存',
      storageTone: 'failed',
      ready: false,
    })
    expect(sourceFileLifecycle({ parseStatus: 'parsed', stored: true, recordCount: -1 })).toMatchObject({
      recordLabel: '未形成标准记录',
      recordTone: 'pending',
      ready: false,
    })
    expect(sourceFileLifecycle({ parseStatus: 'parsed', stored: true, recordCount: 1.5 }).recordLabel).toBe('未形成标准记录')
  })

  it('distinguishes pending, confirmation, failed, unknown and missing parse states', () => {
    expect(sourceFileLifecycle({ parseStatus: 'pending', stored: true, recordCount: 0 })).toMatchObject({ parseLabel: '等待解析', parseTone: 'pending' })
    expect(sourceFileLifecycle({ parseStatus: 'needs_confirmation', stored: true, recordCount: 2 })).toMatchObject({ parseLabel: '解析待人工确认', parseTone: 'pending' })
    expect(sourceFileLifecycle({ parseStatus: 'failed', stored: true, recordCount: 0 })).toMatchObject({ parseLabel: '解析失败', parseTone: 'failed' })
    expect(sourceFileLifecycle({ parseStatus: ' custom_status ', stored: true, recordCount: 0 })).toMatchObject({ parseLabel: '解析状态待核对（custom_status）', parseTone: 'pending' })
    expect(sourceFileLifecycle({ parseStatus: '', stored: true, recordCount: 0 })).toMatchObject({ parseLabel: '解析状态未记录', parseTone: 'pending' })
    expect(sourceFileLifecycle({ parseStatus: 'x'.repeat(50), stored: true, recordCount: 0 }).parseLabel).toBe(`解析状态待核对（${'x'.repeat(40)}）`)
  })

  it('summarizes files by durable originals, usable records and attention needs', () => {
    expect(sourceFileLifecycleCounts([
      { parseStatus: 'parsed', stored: true, recordCount: 8 },
      { parseStatus: 'parsed', stored: true, recordCount: 2, reviewNote: '待复核' },
      { parseStatus: 'needs_confirmation', stored: false, recordCount: 0 },
      { parseStatus: 'failed', stored: true, recordCount: 0 },
    ])).toEqual({
      registeredCount: 4,
      storedCount: 3,
      readyCount: 1,
      attentionCount: 3,
      withoutRecordsCount: 2,
    })
    expect(sourceFileLifecycleCounts([])).toEqual({
      registeredCount: 0,
      storedCount: 0,
      readyCount: 0,
      attentionCount: 0,
      withoutRecordsCount: 0,
    })
  })
})
