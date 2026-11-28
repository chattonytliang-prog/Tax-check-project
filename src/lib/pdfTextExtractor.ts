import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

export async function extractPdfTextPages(
  buffer: ArrayBuffer,
  onEmptyPage?: (page: Awaited<ReturnType<pdfjs.PDFDocumentProxy['getPage']>>, pageNumber: number) => Promise<void>,
  maxPages?: number,
) {
  if (typeof window !== 'undefined') pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false })
  const document = await loadingTask.promise
  const pages: string[] = []
  try {
    if (maxPages !== undefined && document.numPages > maxPages) throw new Error(`PDF 超过 ${maxPages} 页，请另存同一期的一套预申报表。`)
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

export async function renderOriginalPdfPage(file: File, pageNumber: number, canvas: HTMLCanvasElement, signal: AbortSignal) {
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const bytes = await file.arrayBuffer()
  if (signal.aborted) return
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false })
  const stop = () => { void task.destroy().catch(() => {}) }
  signal.addEventListener('abort', stop, { once: true })
  try {
    const document = await task.promise
    if (signal.aborted) return
    const page = await document.getPage(pageNumber)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: 1600 / Math.max(base.width, base.height) })
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvas, viewport }).promise
  } finally {
    signal.removeEventListener('abort', stop)
    if (!signal.aborted) await task.destroy()
  }
}
