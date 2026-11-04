import { unzipSync } from 'fflate'
import { decodeClientImportText } from './clientImportParser'
import { extractPdfTextPages } from './pdfTextExtractor'

export const assistantAttachmentAccept = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.tsv,.txt,.json,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.zip'
export const maxAssistantAttachments = 48

type AttachmentSection = { label: string; text: string; image?: string }
const xmlDecoder = new TextDecoder()
const wordNamespaces = [
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main',
]
const drawingNamespaces = [
  'http://schemas.openxmlformats.org/drawingml/2006/main',
  'http://purl.oclc.org/ooxml/drawingml/main',
]

function decodeText(buffer: ArrayBuffer) {
  const bom = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 2))
  if (bom[0] === 0xff && bom[1] === 0xfe) return new TextDecoder('utf-16le').decode(buffer)
  if (bom[0] === 0xfe && bom[1] === 0xff) return new TextDecoder('utf-16be').decode(buffer)
  return decodeClientImportText(buffer)
}

function parseXml(bytes: Uint8Array) {
  const doc = new DOMParser().parseFromString(xmlDecoder.decode(bytes), 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Office 文件正文已损坏')
  return doc
}

function officeParts(bytes: Uint8Array, include: (name: string) => boolean) {
  let expandedBytes = 0
  return unzipSync(bytes, { filter: ({ name, originalSize }) => {
    if (!include(name)) return false
    expandedBytes += originalSize
    if (expandedBytes > 16 * 1024 * 1024) throw new Error('Office 文件解压后的正文过大，请拆分后上传')
    return true
  } })
}

function wordBody(node: Element): string {
  const wordElement = wordNamespaces.includes(node.namespaceURI || '')
  if (wordElement) {
    if (node.localName === 't') return node.textContent || ''
    if (node.localName === 'tab') return '\t'
    if (node.localName === 'br' || node.localName === 'cr') return '\n'
    if (node.localName === 'del' || node.localName === 'moveFrom') return ''
  }
  const text = Array.from(node.children, wordBody).join('')
  if (wordElement && node.localName === 'tc') return `${text.trimEnd()}\t`
  if (wordElement && (node.localName === 'p' || node.localName === 'tr')) return `${text.trimEnd()}\n`
  return text
}

function readDocx(bytes: Uint8Array): AttachmentSection[] {
  const parts = officeParts(bytes, (name) => /^word\/(?:document|footnotes|endnotes)\.xml$/.test(name))
  if (!parts['word/document.xml']) throw new Error('Word 文件缺少正文')
  return [
    ['word/document.xml', '正文'],
    ['word/footnotes.xml', '脚注'],
    ['word/endnotes.xml', '尾注'],
  ].flatMap(([part, label]) => parts[part] ? [{ label, text: wordBody(parseXml(parts[part]).documentElement) }] : [])
}

function readWordHtml(html: string) {
  // Word-compatible HTML exports are parsed in an inert template and never mounted.
  const template = document.createElement('template')
  template.innerHTML = html
  for (const node of template.content.querySelectorAll('script,style,head,title,template,noscript,iframe,object,embed')) node.remove()
  for (const cell of template.content.querySelectorAll('td,th')) cell.append('\t')
  for (const block of template.content.querySelectorAll('p,div,li,tr,h1,h2,h3,h4,h5,h6,br')) block.after('\n')
  return (template.content.textContent || '').replace(/\n[ \t]+\n/g, '\n\n').trim()
}

function readPptx(bytes: Uint8Array): AttachmentSection[] {
  const parts = officeParts(bytes, (name) => /^ppt\/(?:slides\/slide\d+\.xml|presentation\.xml|_rels\/presentation\.xml\.rels)$/.test(name))
  const presentation = parts['ppt/presentation.xml']
  const relationships = parts['ppt/_rels/presentation.xml.rels']
  if (!presentation || !relationships) throw new Error('PowerPoint 文件缺少幻灯片目录')
  const paths = new Map(Array.from(parseXml(relationships).getElementsByTagNameNS('*', 'Relationship'), (item) => [
    item.getAttribute('Id'), item.getAttribute('Target')?.replace(/^\/ppt\//, '').replace(/^\.\//, ''),
  ]))
  const catalog = parseXml(presentation).documentElement
  return Array.from(catalog.getElementsByTagNameNS(catalog.namespaceURI, 'sldId'), (slide, index) => {
    const id = Array.from(slide.attributes).find((attribute) => attribute.localName === 'id' && attribute.namespaceURI)?.value
    const part = parts[`ppt/${paths.get(id || '')}`]
    if (!part) throw new Error(`PowerPoint 文件缺少第 ${index + 1} 张幻灯片`)
    const doc = parseXml(part)
    const paragraphs = Array.from(doc.getElementsByTagNameNS('*', 'p')).filter((p) => drawingNamespaces.includes(p.namespaceURI || ''))
    const text = paragraphs.map((p) => Array.from(p.getElementsByTagNameNS(p.namespaceURI, 't'), (node) => node.textContent).join('')).join('\n')
    return { label: `第 ${index + 1} 张幻灯片`, text }
  })
}

async function imageForReading(file: File) {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('无法读取图片')
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.88)
  } finally {
    bitmap.close()
  }
}

export async function readAssistantAttachment(file: File): Promise<AttachmentSection[]> {
  if (file.size > 20 * 1024 * 1024) throw new Error('文件超过 20 MB，请拆分后上传')
  if (/\.(png|jpe?g|webp)$/i.test(file.name) || /^image\/(png|jpeg|webp)$/.test(file.type)) {
    return [{ label: '图片', text: '', image: await imageForReading(file) }]
  }
  const buffer = await file.arrayBuffer()
  if (/\.zip$/i.test(file.name)) {
    const parts = officeParts(new Uint8Array(buffer), (name) => (
      !name.startsWith('__MACOSX/') && !name.endsWith('/') && !/\.zip$/i.test(name)
      && assistantAttachmentAccept.split(',').includes(`.${name.split('.').at(-1)?.toLowerCase()}`)
    ))
    const entries = Object.entries(parts)
    if (!entries.length) throw new Error('压缩包中没有可读取的文件')
    if (entries.length > maxAssistantAttachments) throw new Error(`单个压缩包最多读取 ${maxAssistantAttachments} 份文件`)
    const sections: AttachmentSection[] = []
    for (const [name, bytes] of entries) {
      const entry = await readAssistantAttachment(new File([Uint8Array.from(bytes)], name))
      sections.push(...entry.map((section) => ({ ...section, label: `${name} · ${section.label}` })))
    }
    return sections
  }
  if (/\.pdf$/i.test(file.name)) {
    const scanned = new Map<number, string>()
    const pages = await extractPdfTextPages(buffer, async (page, pageNumber) => {
      if (scanned.size >= 12) throw new Error('单份 PDF 最多识别 12 个扫描页，请拆分后上传')
      const initial = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: 1800 / Math.max(initial.width, initial.height) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvas, viewport }).promise
      scanned.set(pageNumber, canvas.toDataURL('image/jpeg', 0.86))
    })
    return pages.map((text, index) => ({ label: `第 ${index + 1} 页`, text, image: scanned.get(index + 1) }))
  }
  if (/\.docx$/i.test(file.name)) return readDocx(new Uint8Array(buffer))
  if (/\.pptx$/i.test(file.name)) return readPptx(new Uint8Array(buffer))
  if (/\.xlsx?$/i.test(file.name)) {
    const { read, utils } = await import('@e965/xlsx')
    const workbook = read(buffer, { type: 'array', dense: true })
    return workbook.SheetNames.flatMap((name) => {
      const sheet = workbook.Sheets[name]
      if (!sheet['!ref']) return []
      const firstRow = utils.decode_range(sheet['!ref']).s.r + 1
      const rows = utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, blankrows: true })
      const populatedRows = rows.flatMap((cells, index) => cells.some((cell) => String(cell ?? '').trim())
        ? [{ number: firstRow + index, text: cells.join('\t') }]
        : [])
      const sections: AttachmentSection[] = []
      for (let offset = 0; offset < populatedRows.length; offset += 40) {
        const group = populatedRows.slice(offset, offset + 40)
        sections.push({
          label: `工作表 ${name} · 第 ${group[0].number}–${group.at(-1)!.number} 行`,
          text: group.map(({ number, text }) => `第 ${number} 行\t${text}`).join('\n'),
        })
      }
      return sections
    })
  }
  if (/\.(csv|tsv|txt|json)$/i.test(file.name)) {
    return [{ label: '正文', text: decodeText(buffer) }]
  }
  if (/\.doc$/i.test(file.name)) {
    const bytes = new Uint8Array(buffer)
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) return readDocx(bytes)
    if (bytes[0] !== 0xd0 || bytes[1] !== 0xcf) {
      const html = decodeText(buffer)
      if (/^\s*(?:<!doctype\s+html\b|<html[\s>])/i.test(html)) return [{ label: '正文', text: readWordHtml(html) }]
      throw new Error('无法识别此 Word 文件，请另存为 .docx 后上传')
    }
    const { readLegacyWord } = await import('./legacyOfficeText')
    return [{ label: '正文', text: await readLegacyWord(buffer) }]
  }
  if (/\.ppt$/i.test(file.name)) {
    const { readLegacyPowerPoint } = await import('./legacyOfficeText')
    return readLegacyPowerPoint(buffer)
  }
  throw new Error('暂不支持此文件格式')
}
