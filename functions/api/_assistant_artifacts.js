import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'
import * as XLSX from '@e965/xlsx'

export const artifactFormats = ['xlsx', 'docx', 'csv', 'json', 'txt']
const contentTypes = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
}

export function assistantFileBucket(env) {
  return env.ASSISTANT_MATERIALS_BUCKET || env.MATERIALS_BUCKET || null
}

export function artifactMetadata(row) {
  return {
    id: row.id,
    name: row.file_name,
    contentType: row.content_type,
    size: row.size,
    downloadUrl: `/api/assistant/artifacts/${encodeURIComponent(row.id)}`,
  }
}

function spreadsheetCell(value) {
  // Export literal user data, including strings beginning with formula markers.
  return typeof value === 'string' && /^[=+@-]/.test(value.trimStart()) ? `'${value}` : value
}

function csvCell(value) {
  const text = String(spreadsheetCell(value) ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export async function renderAssistantFile(spec) {
  const { format, title, content, sheets = [] } = spec
  if (!artifactFormats.includes(format)) throw new Error('不支持此输出格式')
  const fileName = String(spec.fileName || title || '生成文件')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 120)
    .replace(/\.(xlsx|docx|csv|json|txt)$/i, '') || '生成文件'
  const name = `${fileName}.${format}`
  const text = String(content || '')
  let bytes
  if (format === 'xlsx') {
    if (!sheets.length) throw new Error('生成 Excel 需要工作表和行数据')
    const book = XLSX.utils.book_new()
    const usedNames = new Set()
    for (const [index, sheet] of sheets.entries()) {
      const baseName = String(sheet.name || `工作表${index + 1}`).replace(/[\\/?*\[\]:]/g, '_').slice(0, 25) || `工作表${index + 1}`
      let sheetName = baseName
      let suffix = 1
      while (usedNames.has(sheetName.toLowerCase())) sheetName = `${baseName}_${suffix++}`
      usedNames.add(sheetName.toLowerCase())
      const data = sheet.rows
      const worksheet = XLSX.utils.aoa_to_sheet(data)
      worksheet['!cols'] = Array.from({ length: Math.min(100, Math.max(1, ...data.map((row) => row.length))) }, () => ({ wch: 22 }))
      XLSX.utils.book_append_sheet(book, worksheet, sheetName)
    }
    bytes = new Uint8Array(XLSX.write(book, { bookType: 'xlsx', type: 'array', compression: true }))
  } else if (format === 'docx') {
    if (!text.trim() && !sheets.length) throw new Error('生成 Word 需要正文或表格')
    const children = []
    if (title) children.push(new Paragraph({ text: title, heading: HeadingLevel.TITLE }))
    children.push(...text.split(/\r?\n/).map((line) => new Paragraph({ children: [new TextRun(line)] })))
    for (const sheet of sheets) {
      if (sheet.name) children.push(new Paragraph({ text: sheet.name, heading: HeadingLevel.HEADING_1 }))
      if (sheet.rows.length) children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: sheet.rows.map((row) => new TableRow({
          children: row.map((cell) => new TableCell({ children: [new Paragraph(String(cell ?? ''))] })),
        })),
      }))
    }
    const document = new Document({
      creator: '合耀科技 AI 助手',
      title: title || fileName,
      features: { updateFields: true },
      styles: { default: { document: { run: { font: 'Microsoft YaHei', size: 22 } } } },
      sections: [{ children }],
    })
    bytes = new Uint8Array(await (await Packer.toBlob(document)).arrayBuffer())
  } else if (format === 'csv') {
    if (!sheets[0]?.rows.length) throw new Error('生成 CSV 需要行数据')
    if (sheets.length > 1) throw new Error('CSV 仅支持一个工作表，多表数据请生成 Excel')
    bytes = new TextEncoder().encode(`\ufeff${sheets[0].rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`)
  } else {
    if (!text.trim()) throw new Error('生成文件需要正文')
    const output = format === 'json' ? JSON.stringify(JSON.parse(text), null, 2) : text
    bytes = new TextEncoder().encode(output)
  }
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('生成文件超过 8 MB，请缩小内容范围')
  return { name, bytes, contentType: contentTypes[format] }
}

export async function saveAssistantArtifact({ db, env, userId, threadId, requestId, spec }) {
  const bucket = assistantFileBucket(env)
  if (!bucket) throw new Error('文件存储尚未配置，无法生成可下载文件')
  const thread = await db.prepare('SELECT id FROM assistant_threads WHERE id = ? AND owner_user_id = ?').bind(threadId, userId).first()
  if (!thread) throw new Error('当前对话尚未保存，无法生成文件')
  const payload = JSON.stringify(spec)
  if (new TextEncoder().encode(payload).length > 500_000) throw new Error('文件内容过长，请分批生成')
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([userId, threadId, requestId, payload])))
  const id = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const existing = await db.prepare('SELECT * FROM assistant_artifacts WHERE id = ? AND owner_user_id = ? AND thread_id = ?')
    .bind(id, userId, threadId).first()
  if (existing && await bucket.head(existing.object_key)) return artifactMetadata(existing)
  const file = await renderAssistantFile(spec)
  const objectKey = `${userId}/${threadId}/generated/${id}/${file.name}`
  await bucket.put(objectKey, file.bytes, { httpMetadata: { contentType: file.contentType } })
  const result = await db.prepare(
    `INSERT INTO assistant_artifacts (id, owner_user_id, thread_id, request_id, file_name, content_type, size, object_key, payload_json)
     SELECT ?, owner_user_id, id, ?, ?, ?, ?, ?, ? FROM assistant_threads WHERE id = ? AND owner_user_id = ?
     ON CONFLICT(id) DO UPDATE SET object_key = excluded.object_key`,
  ).bind(id, requestId, file.name, file.contentType, file.bytes.length, objectKey, payload, threadId, userId).run()
  if ((result.meta?.changes ?? result.changes) === 0) throw new Error('对话已删除，生成文件未保存')
  return artifactMetadata({ id, file_name: file.name, content_type: file.contentType, size: file.bytes.length })
}
