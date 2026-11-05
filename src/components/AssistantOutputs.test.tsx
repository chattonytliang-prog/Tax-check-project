import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AssistantOutputs } from './AssistantOutputs'

describe('assistant downloadable outputs', () => {
  it('keeps earlier messages without outputs unchanged', () => {
    expect(renderToStaticMarkup(<AssistantOutputs />)).toBe('')
  })

  it('renders private download cards and execution results without an approval action', () => {
    const markup = renderToStaticMarkup(<AssistantOutputs artifacts={[{
      id: 'file-a', name: '明细.xlsx', contentType: 'application/octet-stream', size: 2048,
      downloadUrl: 'https://untrusted.example/file',
    }]} toolSteps={[
      { id: '1', name: 'search_sources', status: 'completed' },
      { id: '2', name: 'generate_file', status: 'failed' },
    ]} />)
    expect(markup).toContain('href="/api/assistant/artifacts/file-a"')
    expect(markup).toContain('明细.xlsx')
    expect(markup).toContain('2 KB')
    expect(markup).toContain('检索文件原文 · 完成')
    expect(markup).toContain('生成下载文件 · 未完成')
    expect(markup).not.toContain('untrusted.example')
    expect(markup).not.toContain('<button')
  })
})
