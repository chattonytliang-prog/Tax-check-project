import { readAiRequest, reserveAiCall } from '../_ai_budget.js'
import { badRequest, json, requireDb, serverError } from '../_utils.js'
import { requireUser } from '../auth/_auth.js'
import { analyzeImages, assistantBusinessTools } from './assistant.js'
import { archivedSourceBucket, archivedSourceCache, findArchivedSources, prepareArchivedSources, readArchivedSources } from './_archived_sources.js'
import { AssistantResponseError, assistantRuntimeError, runAssistant } from '../_assistant_runtime.js'
import { normalizeConversation } from '../_assistant_context.js'

const maxDocumentChars = 280_000
const maxArchivedDocumentChars = 4_000_000
const maxContextChars = 60_000
const maxFilesPerQuestion = 48
const maxImagesPerFile = 12
const validId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value)
const imageDataUrl = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/

function questionTerms(text) {
  const words = text.toLowerCase().match(/[a-z0-9]+(?:[.,][0-9]+)*|[\p{Script=Han}]+/gu) || []
  return new Set(words.flatMap((word) => (
    /^[a-z0-9]/.test(word) ? [word] : Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2))
  )))
}

function sourceForPrompt(row, question, budget) {
  const sections = JSON.parse(row.sections_json)
  const totalLength = sections.reduce((length, section) => length + section.text.length + section.label.length + 12, 0)
  if (totalLength <= budget) return { fileName: row.file_name, sections }

  const terms = questionTerms(question)
  const excerptLength = Math.min(1600, Math.floor(budget / 3))
  const chunks = sections.flatMap(({ label, text }) => {
    const step = excerptLength - 150
    return Array.from({ length: Math.max(1, Math.ceil((text.length - 150) / step)) }, (_, index) => ({
      label, text: text.slice(index * step, index * step + excerptLength),
    }))
  })
  const searchableTerms = [...terms].slice(0, 120)
  const ranked = chunks.map((chunk, index) => {
    const text = chunk.text.toLowerCase().replace(/(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu, '')
    const score = searchableTerms.reduce((sum, term) => sum + Number(text.includes(term)), 0)
    return { index, score }
  }).sort((left, right) => right.score - left.score)
  const slots = Math.max(1, Math.floor(budget / (excerptLength + 100)))
  const indices = new Set()
  for (const { index, score } of ranked) {
    if (score <= 0 || indices.size >= Math.max(1, slots - 2)) break
    indices.add(index)
  }
  for (let index = 0; index < slots && indices.size < slots; index += 1) {
    indices.add(Math.round(index * (chunks.length - 1) / Math.max(1, slots - 1)))
  }
  const sectionsForPrompt = [...indices].sort((a, b) => a - b).map((index) => chunks[index])
  return { fileName: row.file_name, excerpted: true, sections: sectionsForPrompt }
}

async function saveAttachment({ db, env, user, threadId, attachment, archive }) {
  const { fileName, sections } = attachment
  if ((!archive && (typeof fileName !== 'string' || !fileName.trim())) || !Array.isArray(sections) || !sections.length || sections.length > 2000) {
    return badRequest('附件名称或正文无效')
  }
  if (sections.some((section) => !section || typeof section.label !== 'string'
    || typeof section.text !== 'string' || (section.image !== undefined && (typeof section.image !== 'string'
      || section.image.length > 2_000_000 || !imageDataUrl.test(section.image))))) {
    return badRequest('附件正文或图片格式无效')
  }
  const maxChars = archive ? maxArchivedDocumentChars : maxDocumentChars
  if (sections.reduce((length, section) => length + section.text.length, 0) > maxChars) {
    return badRequest('附件正文过长，请拆成较小的文件后上传')
  }
  if (sections.filter((section) => section.image).length > maxImagesPerFile) {
    return badRequest('单份附件最多识别 12 张图片或扫描页，请拆分后上传')
  }
  let bucket
  let source
  let cache
  if (archive) {
    if (!validId(archive.sourceId) || !/^[a-f0-9]{64}$/.test(archive.version || '')) return badRequest('归档原件无效')
    bucket = archivedSourceBucket(env)
    const sources = await findArchivedSources(db, user.id, archive.clientId, { ids: [archive.sourceId] })
    source = sources[0]
    if (!source) return badRequest('归档原件不属于当前企业')
    cache = await archivedSourceCache(bucket, source)
    if (cache?.version !== archive.version) return json({ error: '归档原件已更新，请重新发送问题' }, { status: 409 })
    if (await bucket.head(cache.key)) return json({ id: source.id })
  } else {
    const thread = await db.prepare('SELECT id FROM assistant_threads WHERE id = ? AND owner_user_id = ?').bind(threadId, user.id).first()
    if (!thread) return badRequest('当前对话不可用，请重新打开后上传')
  }

  const extracted = []
  for (const section of sections) {
    let content = section.text.trim()
    if (section.image) {
      const quota = await reserveAiCall(db, user, env)
      if (quota) return quota
      const vision = await analyzeImages(env, [section.image], '', true)
      content = [content, vision.content].filter(Boolean).join('\n')
    }
    if (content) extracted.push({ label: section.label.slice(0, archive ? 240 : 80), text: content })
  }
  if (!extracted.length) return badRequest('附件中没有可读取的正文')
  if (extracted.reduce((length, section) => length + section.text.length, 0) > maxChars) {
    return badRequest('识别后的正文过长，请拆分后上传')
  }

  const sectionsJson = JSON.stringify(extracted)
  if (cache) {
    await bucket.put(cache.key, sectionsJson, { httpMetadata: { contentType: 'application/json' } })
    return json({ id: source.id })
  }
  const id = crypto.randomUUID()
  const result = await db.prepare(
    `INSERT INTO assistant_attachments (id, owner_user_id, thread_id, file_name, sections_json)
     SELECT ?, owner_user_id, id, ?, ? FROM assistant_threads WHERE id = ? AND owner_user_id = ?`,
  ).bind(id, fileName.trim().slice(0, 240), sectionsJson, threadId, user.id).run()
  if ((result.meta?.changes ?? result.changes) === 0) return badRequest('当前对话已删除，附件未保存')
  return json({ id })
}

async function answerQuestion({ db, env, user, threadId, requestId, message, history, attachmentIds = [], recentAttachmentCount, archive, signal }) {
  if (typeof message !== 'string' || !message.trim() || message.length > 4000) return badRequest('请输入 1-4000 字的问题')
  const sourceIds = archive ? archive.sourceIds : []
  if (!Array.isArray(attachmentIds) || !Array.isArray(sourceIds) || !(attachmentIds.length + sourceIds.length)
    || attachmentIds.length + sourceIds.length > maxFilesPerQuestion || ![...attachmentIds, ...sourceIds].every(validId)) {
    return badRequest('请选择有效附件，每个对话最多 48 份')
  }
  const ids = [...new Set(attachmentIds)]
  const { results } = ids.length ? await db.prepare(
    `SELECT id, file_name, sections_json FROM assistant_attachments
     WHERE owner_user_id = ? AND thread_id = ? AND id IN (${ids.map(() => '?').join(', ')})`,
  ).bind(user.id, threadId, ...ids).all() : { results: [] }
  if (results.length !== ids.length) return badRequest('部分附件在当前对话中不可用，请重新上传后再问')
  if (!env.DEEPSEEK_API_KEY) return json({ error: 'AI 模型尚未配置' }, { status: 503 })
  const previous = normalizeConversation(history)
  const question = `${message}\n${previous.filter((entry) => entry.role === 'user').slice(-2).map((entry) => entry.content).join('\n')}`.slice(0, 5000)
  const rows = new Map(results.map((row) => [row.id, row]))
  const budget = Math.floor(maxContextChars / (ids.length + new Set(sourceIds).size))
  const sources = ids.map((id) => sourceForPrompt(rows.get(id), question, budget))
  if (Number.isInteger(recentAttachmentCount) && recentAttachmentCount > 0 && recentAttachmentCount <= sources.length) {
    for (const source of sources.slice(-recentAttachmentCount)) source.uploadedThisTurn = true
  }
  if (sourceIds.length) {
    const archived = await readArchivedSources({ db, env, user, archive }, (row) => ({
      ...sourceForPrompt(row, question, budget),
      company: row.client_name,
      periodStart: row.period_start,
      periodEnd: row.period_end,
    }))
    if (archived.response) return archived.response
    sources.push(...archived.rows)
  }
  const loadArchived = async (selectedIds, transform) => {
    const result = await readArchivedSources({ db, env, user, archive: { ...archive, sourceIds: selectedIds } }, transform)
    if (result.response) throw new AssistantResponseError(result.response)
    return result.rows
  }
  const result = await runAssistant({
    db, env, user, threadId, clientId: archive?.clientId, requestId, message, history: previous, signal,
    businessTools: archive?.clientId ? assistantBusinessTools(db, { user }, archive.clientId) : {},
    instructions: '核对提问期间，不得将其他期间数字作为答案。生成的文件要写明资料范围和原文出处。对比多份资料时逐份核对。',
    sources: [...ids, ...new Set(sourceIds)].map((id, index) => ({
      id, fileName: sources[index].fileName,
      ...(sources[index].uploadedThisTurn ? { uploadedThisTurn: true } : {}),
    })),
    searchSources: async (query) => {
      const found = ids.map((id) => ({ id, ...sourceForPrompt(rows.get(id), query, budget) }))
      if (sourceIds.length) found.push(...await loadArchived(sourceIds, (row) => ({
        id: row.id, ...sourceForPrompt(row, query, budget), company: row.client_name,
        periodStart: row.period_start, periodEnd: row.period_end,
      })))
      return found
    },
    readSource: async ({ sourceId, location, offset, limit }) => {
      let row = rows.get(sourceId)
      if (!row && sourceIds.includes(sourceId)) [row] = await loadArchived([sourceId], (value) => value)
      if (!row) throw new Error('该文件不在当前对话或企业资料范围内')
      const sections = JSON.parse(row.sections_json).filter((section) => !location || section.label.includes(location))
        .flatMap(({ label, text }) => Array.from({ length: Math.max(1, Math.ceil(text.length / 2000)) }, (_, index) => ({
          label, text: text.slice(index * 2000, (index + 1) * 2000),
        })))
      const selected = sections.slice(offset, offset + limit)
      return {
        id: sourceId, fileName: row.file_name, sections: selected, offset,
        totalSections: sections.length, nextOffset: offset + selected.length < sections.length ? offset + selected.length : null,
      }
    },
  })
  return json(result)
}

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response
    const parsed = await readAiRequest(request, 16_777_216)
    if (parsed.response) return parsed.response
    const { threadId, requestId, attachment, message, history, attachmentIds, recentAttachmentCount, archive } = parsed.data
    if (!validId(threadId)) return badRequest('当前对话无效')
    if (requestId !== undefined && !validId(requestId)) return badRequest('请求标识无效')
    if (archive !== undefined && (!archive || !validId(archive.clientId))) return badRequest('当前企业无效')
    const context = { db, env, user: auth.user, threadId }
    if (archive?.action === 'prepare') {
      if (typeof message !== 'string' || !message.trim() || message.length > 4000) return badRequest('请输入 1-4000 字的问题')
      return await prepareArchivedSources({ ...context, archive, message, history })
    }
    return attachment && typeof attachment === 'object'
      ? await saveAttachment({ ...context, attachment, archive })
      : await answerQuestion({ ...context, requestId: requestId || crypto.randomUUID(), message, history, attachmentIds, recentAttachmentCount, archive, signal: request.signal })
  } catch (error) {
    return assistantRuntimeError(error) || serverError(error)
  }
}
