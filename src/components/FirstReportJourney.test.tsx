import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FirstReportJourney } from './FirstReportJourney'

const props = {
  clients: [{ id: 'client-a', name: '甲公司', creditCode: '' }],
  selectedClientId: 'client-a',
  sourceFileCount: 0,
  storedSourceFileCount: 0,
  recordCount: 0,
  months: [],
  selectedMonthId: '',
  summaryLoading: false,
  summaryError: '',
  batch: null,
  importing: false,
  reportPrice: '本账号首份报告免费',
  onSelectClient: () => {},
  onUploadCurrent: () => {},
  onUploadNew: () => {},
  onInspect: () => {},
  onSelectMonth: () => {},
  onStartDetection: () => {},
  onRetrySummary: () => {},
}

describe('first report source evidence', () => {
  it('does not call manual period data an uploaded original', () => {
    const markup = renderToStaticMarkup(<FirstReportJourney {...props} months={[{ id: 'month-a', label: '2026-03' }]} />)
    expect(markup).toContain('待补原件')
    expect(markup).toContain('尚未保存原始文件')
    expect(markup).not.toContain('原件已保存</span>')
  })

  it('shows registered originals separately from durable originals', () => {
    const markup = renderToStaticMarkup(<FirstReportJourney {...props} sourceFileCount={9} storedSourceFileCount={7} recordCount={1729} />)
    expect(markup).toContain('已登记 9 份源文件 · 原件已保存 7 份 · 1729 条标准记录')
    expect(markup).toContain('2 份文件仅有登记信息')
  })
})
