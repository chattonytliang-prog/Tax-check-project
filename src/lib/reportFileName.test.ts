import { describe, expect, it } from 'vitest'
import { reportFileName } from './reportFileName'

describe('reportFileName', () => {
  it('includes client name, review period, report title, date, and extension', () => {
    expect(
      reportFileName(
        {
          clientName: '苏州异常贸易有限公司',
          createdAt: '2026-06-25T03:18:00+08:00',
          structured: {
            scope: [
              { label: '审阅期间', value: '2025年度' },
              { label: '数据来源', value: '管理报表' },
            ],
          },
        },
        'doc',
      ),
    ).toBe('苏州异常贸易有限公司-2025年度-中国税务健康检查报告-2026-06-25.doc')
  })

  it('removes characters that are invalid in Windows filenames', () => {
    expect(
      reportFileName(
        {
          clientName: 'A/B:C*D?E"F<G>H|I 公司',
          createdAt: '2026/06/25',
          structured: {
            scope: [{ label: '审阅期间', value: '2025/01:Q1' }],
          },
        },
        'pdf',
      ),
    ).toBe('ABCDEFGHI公司-202501Q1-中国税务健康检查报告-2026-06-25.pdf')
  })

  it('keeps legacy reports compatible when no structured period exists', () => {
    expect(reportFileName({ clientName: '', createdAt: '' }, 'doc', '2026-06-25')).toBe(
      '企业-中国税务健康检查报告-2026-06-25.doc',
    )
  })
})
