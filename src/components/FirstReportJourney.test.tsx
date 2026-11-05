import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FirstReportJourney } from './FirstReportJourney'

const props = {
  clients: [{ id: 'client-a', name: '甲公司' }],
  selectedClientId: 'client-a',
  sourceFileCount: 0,
  storedSourceFileCount: 0,
  recordCount: 0,
  hasPeriods: false,
  summaryLoading: false,
  summaryError: '',
  batch: null,
  importing: false,
  uploadGuideOpen: false,
  onUploadGuideChange: () => {},
  onSelectClient: () => {},
  onUploadCurrent: () => {},
  onUploadNew: () => {},
  onInspect: () => {},
  onStartDetection: () => {},
  onRetrySummary: () => {},
}

describe('first report source evidence', () => {
  it('shows only the upload action before a company exists', () => {
    const markup = renderToStaticMarkup(<FirstReportJourney {...props} clients={[]} selectedClientId="" />)
    expect(markup).toContain('上传资料</button>')
    expect(markup.match(/<button\b/g)).toHaveLength(1)
    expect(markup).not.toContain('<select')
  })

  it('shows upload requirements in the guide for a new workspace', () => {
    const markup = renderToStaticMarkup(<FirstReportJourney {...props} clients={[]} selectedClientId="" uploadGuideOpen />)
    expect(markup).toContain('<dialog')
    expect(markup).toContain('单个文件最大 8 MB')
    expect(markup).toContain('文字可选中的 PDF')
    expect(markup).toContain('同一批只上传一家企业')
  })

  it('does not call manual period data an uploaded original', () => {
    const markup = renderToStaticMarkup(<FirstReportJourney {...props} hasPeriods />)
    expect(markup).toContain('尚未保存原始文件')
    expect(markup).not.toContain('原件已保存')
    expect(markup).toContain('开始风险检测</button>')
  })

  it('shows registered originals separately from durable originals', () => {
    const markup = renderToStaticMarkup(<FirstReportJourney {...props} sourceFileCount={9} storedSourceFileCount={7} recordCount={1729} />)
    expect(markup).toContain('已登记 9 份源文件 · 原件已保存 7 份 · 1729 条标准记录')
    expect(markup).toContain('2 份文件仅有登记信息')
  })
})
