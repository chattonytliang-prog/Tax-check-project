import { afterEach, expect, it, vi } from 'vitest'
import { utils, write } from '@e965/xlsx'
import { zipSync } from 'fflate'
import { askArchivedSources } from './assistantArchive'
import { readAssistantAttachment } from './assistantAttachment'

afterEach(() => vi.unstubAllGlobals())

it('answers from archived originals on the first question and uses the cache on a follow-up', async () => {
  let cached = false
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/tax-data/source?sourceFileId=source-a') return new Response('银行手续费 28.50 元')
    const body = JSON.parse(String(init?.body))
    if (body.archive.action === 'prepare') {
      return Response.json({
        files: [{ id: 'source-a', name: '原件.txt', contentType: 'text/plain', version: 'test-version', cached }],
        unavailable: ['旧资料.pdf'], limited: false,
      })
    }
    if (body.attachment) {
      expect(body.attachment.sections).toEqual([{ label: '正文', text: '银行手续费 28.50 元' }])
      cached = true
      return Response.json({ id: 'source-a' })
    }
    expect(body.archive.sourceIds).toEqual(['source-a'])
    return Response.json({ answer: '原文写明银行手续费 28.50 元。', excerpted: false })
  })
  vi.stubGlobal('fetch', fetchMock)
  const options = {
    threadId: 'thread-a', clientId: 'client-a', history: [],
    signal: new AbortController().signal, onProgress: vi.fn(),
  }
  expect((await askArchivedSources({ ...options, message: '手续费多少？' }))?.answer).toContain('28.50 元')
  expect((await askArchivedSources({ ...options, message: '原文怎么写？' }))?.answer).toContain('旧资料.pdf')
  expect(fetchMock.mock.calls.filter(([path]) => path.startsWith('/api/tax-data/source'))).toHaveLength(1)
  expect(fetchMock).toHaveBeenCalledTimes(6)
})

it('preserves the file inside a ZIP and its actual worksheet row numbers', async () => {
  const book = utils.book_new()
  const sheet = utils.aoa_to_sheet([])
  utils.sheet_add_aoa(sheet, [['科目', '金额'], [], ['银行手续费', 28.5]], { origin: 'B4' })
  utils.book_append_sheet(book, sheet, '明细账')
  const workbook = new Uint8Array(write(book, { bookType: 'xlsx', type: 'array' }))
  const archive = Uint8Array.from(zipSync({ '2025/原表.xlsx': workbook }))

  const sections = await readAssistantAttachment(new File([archive], '入库原件.zip'))
  expect(sections).toEqual([{
    label: '2025/原表.xlsx · 工作表 明细账 · 第 4–6 行',
    text: '第 4 行\t\t科目\t金额\n第 6 行\t\t银行手续费\t28.5',
  }])
})
