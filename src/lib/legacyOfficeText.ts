async function compoundStreams(buffer: ArrayBuffer) {
  const { CFB } = await import('@e965/xlsx')
  const compound = CFB.read(new Uint8Array(buffer), { type: 'array' })
  return (name: string) => {
    const content: Uint8Array | undefined = CFB.find(compound, `/${name}`)?.content
    if (!content?.length) throw new Error('旧版 Office 文件损坏或已加密，请另存为新版格式后上传')
    return content
  }
}

function view(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

const utf16 = new TextDecoder('utf-16le')
const ansi = new TextDecoder('windows-1252')

export async function readLegacyWord(buffer: ArrayBuffer) {
  const stream = await compoundStreams(buffer)
  const word = stream('WordDocument')
  const fib = view(word)
  const flags = fib.getUint16(10, true)
  if (flags & 0x8100) throw new Error('Word 文件已加密，请解密后上传')
  if (fib.getUint16(0, true) !== 0xa5ec || fib.getUint16(2, true) < 0x00c1) {
    throw new Error('此 Word 版本过旧，请另存为 .docx 后上传')
  }
  // MS-DOC FIB locates the character count and CLX piece table.
  const longFields = 34 + fib.getUint16(32, true) * 2
  const bodyLength = fib.getUint32(longFields + 2 + 12, true)
  const offsets = longFields + 2 + fib.getUint16(longFields, true) * 4 + 2
  const clxOffset = fib.getUint32(offsets + 33 * 8, true)
  const clxLength = fib.getUint32(offsets + 33 * 8 + 4, true)
  const table = stream(flags & 0x0200 ? '1Table' : '0Table')
  const clx = view(table.subarray(clxOffset, clxOffset + clxLength))
  let cursor = 0
  while (cursor < clx.byteLength && clx.getUint8(cursor) === 1) cursor += 3 + clx.getUint16(cursor + 1, true)
  if (clx.getUint8(cursor) !== 2) throw new Error('Word 文件缺少正文索引')
  const pieceLength = clx.getUint32(cursor + 1, true)
  const start = cursor + 5
  const count = (pieceLength - 4) / 12
  if (count < 0 || !Number.isInteger(count) || start + pieceLength > clx.byteLength) throw new Error('Word 正文索引损坏')
  const pieces: string[] = []
  for (let index = 0; index < count; index += 1) {
    const cp = clx.getUint32(start + index * 4, true)
    if (cp >= bodyLength) break
    const nextCp = Math.min(bodyLength, clx.getUint32(start + (index + 1) * 4, true))
    const encoded = clx.getUint32(start + (count + 1) * 4 + index * 8 + 2, true)
    const compressed = Boolean(encoded & 0x40000000)
    const offset = (encoded & 0x3fffffff) / (compressed ? 2 : 1)
    const end = offset + (nextCp - cp) * (compressed ? 1 : 2)
    if (end < offset || end > word.length) throw new Error('Word 正文索引超出文件范围')
    pieces.push((compressed ? ansi : utf16).decode(word.subarray(offset, end)))
  }
  return pieces.join('')
    // Word field instructions and table-cell markers use ASCII control characters.
    // eslint-disable-next-line no-control-regex
    .replace(/\u0013[^\u0014\u0015]*(?:\u0014|\u0015)/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\r\v\f]/g, '\n').replace(/\u0007/g, '\t')
    // Strip internal Word control characters, preserving paragraphs and cells.
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0e-\x1f]/g, '')
}

export async function readLegacyPowerPoint(buffer: ArrayBuffer) {
  const stream = await compoundStreams(buffer)
  const current = view(stream('Current User'))
  if (current.getUint32(12, true) === 0xf3d1c4df) throw new Error('PowerPoint 文件已加密，请解密后上传')
  const bytes = stream('PowerPoint Document')
  const doc = view(bytes)
  const u32 = (offset: number) => doc.getUint32(offset, true)
  const record = (offset: number, limit = bytes.length) => {
    const header = doc.getUint16(offset, true)
    const type = doc.getUint16(offset + 2, true)
    const start = offset + 8
    const end = start + u32(offset + 4)
    if (end > limit) throw new Error('PowerPoint 文件的记录已损坏')
    return { type, version: header & 0xf, instance: header >>> 4, start, end }
  }
  function* children(parent: { start: number; end: number }) {
    for (let offset = parent.start; offset < parent.end;) {
      const child = record(offset, parent.end)
      yield child
      offset = child.end
    }
  }
  const persist = new Map<number, number>()
  const edits = new Set<number>()
  let editOffset = current.getUint32(16, true)
  const documentId = u32(editOffset + 24)
  // MS-PPT persist IDs resolve from the newest edit, excluding removed slides.
  while (editOffset) {
    if (edits.has(editOffset)) throw new Error('PowerPoint 文件的修订索引已损坏')
    edits.add(editOffset)
    const edit = record(editOffset)
    if (edit.type !== 0x0ff5 || edit.end - edit.start < 28) throw new Error('PowerPoint 文件缺少修订索引')
    const directory = record(u32(edit.start + 12))
    if (directory.type !== 0x1772) throw new Error('PowerPoint 文件缺少对象目录')
    for (let offset = directory.start; offset < directory.end;) {
      const descriptor = u32(offset)
      const first = descriptor & 0xfffff
      const count = descriptor >>> 20
      offset += 4
      if (offset + count * 4 > directory.end) throw new Error('PowerPoint 文件的对象目录已损坏')
      for (let index = 0; index < count; index += 1, offset += 4) {
        if (!persist.has(first + index)) persist.set(first + index, u32(offset))
      }
    }
    editOffset = u32(edit.start + 8)
  }
  const documentOffset = persist.get(documentId)
  if (documentOffset === undefined) throw new Error('PowerPoint 文件缺少正文')
  const list = [...children(record(documentOffset))].find((entry) => entry.type === 0x0ff0 && entry.instance === 0)
  if (!list) throw new Error('PowerPoint 文件没有可读幻灯片')
  const slides: { label: string; text: string }[] = []
  const textFor = ({ type, start, end }: ReturnType<typeof record>) => {
    if (type === 0x0fa0) return utf16.decode(bytes.subarray(start, end)).replace(/\r|\v/g, '\n').trim()
    if (type === 0x0fa8) return Array.from(bytes.subarray(start, end), (code) => String.fromCharCode(code)).join('').replace(/\r|\v/g, '\n').trim()
    return ''
  }
  const slideText = (parent: ReturnType<typeof record>, depth = 0): string[] => {
    if (depth > 64) throw new Error('PowerPoint 文件的对象嵌套过深')
    return [...children(parent)].flatMap((child) => child.version === 0xf ? slideText(child, depth + 1) : [textFor(child)].filter(Boolean))
  }
  for (const entry of children(list)) {
    if (entry.type === 0x03f3) {
      const slideOffset = persist.get(u32(entry.start))
      if (slideOffset === undefined) throw new Error('PowerPoint 文件缺少幻灯片正文')
      slides.push({ label: `第 ${slides.length + 1} 张幻灯片`, text: slideText(record(slideOffset)).join('\n') })
    } else {
      const text = textFor(entry)
      const slide = slides.at(-1)
      if (slide && text) slide.text = [slide.text, text].filter(Boolean).join('\n')
    }
  }
  return slides
}
