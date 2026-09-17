import { afterEach, describe, expect, it, vi } from 'vitest'

const cleanupMock = vi.fn()
const destroyMock = vi.fn()
const getTextContentMock = vi.fn()
const getPageMock = vi.fn()
const getDocumentMock = vi.fn()
const workerOptions: { workerSrc?: string } = {}

vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url', () => ({
  default: '/assets/pdf.worker.js',
}))

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: workerOptions,
  getDocument: getDocumentMock,
}))

describe('extractPdfTextPages', () => {
  afterEach(() => {
    cleanupMock.mockReset()
    destroyMock.mockReset()
    getTextContentMock.mockReset()
    getPageMock.mockReset()
    getDocumentMock.mockReset()
    delete workerOptions.workerSrc
    vi.unstubAllGlobals()
  })

  it('extracts text page by page and cleans up pdf resources', async () => {
    const { extractPdfTextPages } = await import('./pdfTextExtractor')
    getTextContentMock
      .mockResolvedValueOnce({ items: [{ str: 'first', hasEOL: false }, { str: 'page', hasEOL: true }, {}] })
      .mockResolvedValueOnce({ items: [{ str: 'second', hasEOL: false }] })
    getPageMock.mockResolvedValue({ getTextContent: getTextContentMock, cleanup: cleanupMock })
    getDocumentMock.mockReturnValue({ promise: Promise.resolve({ numPages: 2, getPage: getPageMock, destroy: destroyMock }) })

    await expect(extractPdfTextPages(new Uint8Array([1, 2, 3]).buffer)).resolves.toEqual(['first page', 'second'])

    expect(getDocumentMock).toHaveBeenCalledWith({ data: new Uint8Array([1, 2, 3]) })
    expect(getPageMock).toHaveBeenNthCalledWith(1, 1)
    expect(getPageMock).toHaveBeenNthCalledWith(2, 2)
    expect(cleanupMock).toHaveBeenCalledTimes(2)
    expect(destroyMock).toHaveBeenCalledTimes(1)
  })

  it('configures the pdf worker when running in a browser window', async () => {
    const { extractPdfTextPages } = await import('./pdfTextExtractor')
    vi.stubGlobal('window', {})
    getTextContentMock.mockResolvedValue({ items: [] })
    getPageMock.mockResolvedValue({ getTextContent: getTextContentMock, cleanup: cleanupMock })
    getDocumentMock.mockReturnValue({ promise: Promise.resolve({ numPages: 1, getPage: getPageMock, destroy: destroyMock }) })

    await extractPdfTextPages(new ArrayBuffer(0))

    expect(workerOptions.workerSrc).toBe('/assets/pdf.worker.js')
  })
})
