import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

export async function extractPdfTextPages(
  buffer: ArrayBuffer,
  onEmptyPage?: (page: Awaited<ReturnType<pdfjs.PDFDocumentProxy['getPage']>>, pageNumber: number) => Promise<void>,
) {
  if (typeof window !== 'undefined') pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) })
  const document = await loadingTask.promise
  const pages: string[] = []
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items.map((item) => (
        'str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : ''
      )).filter(Boolean).join('').trim()
      if (!text && onEmptyPage) await onEmptyPage(page, pageNumber)
      pages.push(text)
      page.cleanup()
    }
  } finally {
    await document.destroy()
  }
  return pages
}
