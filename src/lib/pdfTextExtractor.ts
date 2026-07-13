import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

export async function extractPdfTextPages(buffer: ArrayBuffer) {
  if (typeof window !== 'undefined') pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) })
  const document = await loadingTask.promise
  const pages: string[] = []
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    pages.push(content.items.map((item) => (
      'str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : ''
    )).filter(Boolean).join('').trim())
    page.cleanup()
  }
  await document.destroy()
  return pages
}
