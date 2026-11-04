import { CFB } from '@e965/xlsx'
import { expect, it } from 'vitest'
import { readLegacyPowerPoint, readLegacyWord } from './legacyOfficeText'

function compound(streams: Record<string, Buffer>): ArrayBuffer {
  const file = CFB.utils.cfb_new()
  for (const [name, content] of Object.entries(streams)) CFB.utils.cfb_add(file, name, content)
  return Uint8Array.from(CFB.write(file, { type: 'buffer' })).buffer
}

it('reads Unicode Word 97–2003 body text from the referenced pieces', async () => {
  const body = '合规复核金额 42,500 元\r第二段'
  const word = Buffer.alloc(1024)
  word.writeUInt16LE(0xa5ec)
  word.writeUInt16LE(0x00c1, 2)
  word.writeUInt16LE(14, 32)
  word.writeUInt16LE(22, 62)
  word.writeUInt32LE(body.length, 76)
  word.writeUInt32LE(21, 154 + 33 * 8 + 4)
  word.write(body, 512, 'utf16le')
  const table = Buffer.alloc(21)
  table[0] = 2
  table.writeUInt32LE(16, 1)
  table.writeUInt32LE(body.length, 9)
  table.writeUInt32LE(512, 15)

  await expect(readLegacyWord(compound({ WordDocument: word, '0Table': table })))
    .resolves.toBe('合规复核金额 42,500 元\n第二段')
})

function pptRecord(type: number, body: Buffer, header = 0) {
  const record = Buffer.alloc(8 + body.length)
  record.writeUInt16LE(header)
  record.writeUInt16LE(type, 2)
  record.writeUInt32LE(body.length, 4)
  body.copy(record, 8)
  return record
}

it('follows PowerPoint 97–2003 slide order and extracts only current slides', async () => {
  const firstSlide = pptRecord(0x03ee, pptRecord(0x0fa0, Buffer.from('第一张 2026 年', 'utf16le')), 0xf)
  const removedSlide = pptRecord(0x03ee, pptRecord(0x0fa0, Buffer.from('被删除的金额', 'utf16le')), 0xf)
  const slideRef = Buffer.alloc(20)
  slideRef.writeUInt32LE(2)
  const outline = pptRecord(0x0fa8, Buffer.from('Revenue 1500', 'ascii'))
  const slideList = pptRecord(0x0ff0, Buffer.concat([pptRecord(0x03f3, slideRef), outline]), 0xf)
  const document = pptRecord(0x03e8, slideList, 0xf)
  const directory = Buffer.alloc(16)
  directory.writeUInt32LE((3 << 20) | 1)
  directory.writeUInt32LE(document.length, 8)
  directory.writeUInt32LE(document.length + firstSlide.length, 12)
  const directoryRecord = pptRecord(0x1772, directory)
  const directoryOffset = document.length + firstSlide.length + removedSlide.length
  const edit = Buffer.alloc(28)
  edit.writeUInt32LE(directoryOffset, 12)
  edit.writeUInt32LE(1, 16)
  const currentUser = Buffer.alloc(24)
  currentUser.writeUInt32LE(directoryOffset + directoryRecord.length, 16)

  await expect(readLegacyPowerPoint(compound({
    'Current User': currentUser,
    'PowerPoint Document': Buffer.concat([document, firstSlide, removedSlide, directoryRecord, pptRecord(0x0ff5, edit)]),
  }))).resolves.toEqual([{ label: '第 1 张幻灯片', text: '第一张 2026 年\nRevenue 1500' }])
})
