import { badRequest, json } from '../_utils.js'

const archiveCacheVersion = 'v1'
const maxArchiveSources = 48

export function archiveQuestionWithHistory(message, history = []) {
  const resets = /全部期间|所有期间|所有年份|全部年份|不限定|不限期间|不要沿用|不沿用/
  if (/20\d{2}\s*(?:年|[-/])/.test(message) || resets.test(message)) return message
  const partialPeriod = /(?<!\d)(?:1[0-2]|0?[1-9])\s*月(?:\s*(?:到|至|[-—])\s*(?:1[0-2]|0?[1-9])\s*月)?|第?[一二三四1-4]\s*季度/g
  let year = ''
  let period = ''
  for (const entry of Array.isArray(history) ? history : []) {
    if (entry?.role !== 'user' || typeof entry.content !== 'string') continue
    if (resets.test(entry.content)) { year = ''; period = '' }
    const full = [...entry.content.matchAll(/(20\d{2})(?:\s*年(?:\s*(?:(?:1[0-2]|0?[1-9])\s*月(?:\s*(?:到|至|[-—])\s*(?:1[0-2]|0?[1-9])\s*月)?|第?[一二三四1-4]\s*季度))?|[-/]\d{1,2})/g)]
    if (full.length) { year = full.at(-1)[1]; period = full.map((match) => match[0]).join('、') }
    else if (year) {
      const partial = [...entry.content.matchAll(partialPeriod)].at(-1)?.[0]
      if (partial) period = `${year}年${partial}`
    }
  }
  if (!year || !period) return message
  const partial = [...message.matchAll(partialPeriod)].at(-1)?.[0]
  return `${message}\n沿用对话期间：${partial ? `${year}年${partial}` : period}`
}

function questionPeriod(message) {
  const periods = [...String(message || '').matchAll(/(20\d{2})(?:\s*年\s*(?:(1[0-2]|0?[1-9])\s*月(?:\s*(?:到|至|[-—])\s*(1[0-2]|0?[1-9])\s*月)?|第?([1-4一二三四])\s*季度)?|[-/](1[0-2]|0?[1-9])(?!\d))/g)]
  if (!periods.length) return null
  const ranges = periods.map(([, year, month, endMonth, quarter, numericMonth]) => {
    const quarterNumber = Number(quarter) || '一二三四'.indexOf(quarter) + 1
    const first = month || numericMonth ? Number(month || numericMonth) : quarterNumber ? quarterNumber * 3 - 2 : 1
    const last = endMonth ? Math.max(first, Number(endMonth)) : month || numericMonth ? first : quarterNumber ? first + 2 : 12
    const day = new Date(Date.UTC(Number(year), last, 0)).getUTCDate()
    return [`${year}-${String(first).padStart(2, '0')}-01`, `${year}-${String(last).padStart(2, '0')}-${day}`]
  })
  return { start: ranges.map(([start]) => start).sort()[0], end: ranges.map(([, end]) => end).sort().at(-1) }
}

export async function findArchivedSources(db, ownerId, clientId, { ids, message } = {}) {
  const params = [ownerId, clientId]
  let selection = ''
  if (ids) {
    selection = `AND f.id IN (${ids.map(() => '?').join(', ')})`
    params.push(...ids)
  } else {
    const period = questionPeriod(message)
    if (period) {
      selection = `AND (COALESCE(NULLIF(f.period_end, ''), f.period_start, '') = ''
          OR COALESCE(NULLIF(f.period_end, ''), f.period_start) >= ?)
        AND (COALESCE(NULLIF(f.period_start, ''), f.period_end, '') = ''
          OR COALESCE(NULLIF(f.period_start, ''), f.period_end) <= ?)`
      params.push(period.start, period.end)
    }
  }
  const byMention = ids ? '' : 'CASE WHEN INSTR(?, f.file_name) > 0 THEN 0 ELSE 1 END,'
  if (!ids) params.push(message || '')
  const { results } = await db.prepare(
    `SELECT f.id, f.owner_user_id, f.file_name, f.content_type, f.storage_key, f.period_start, f.period_end, c.name AS client_name
     FROM tax_data_source_files f
     JOIN clients c ON c.id = f.client_id AND c.owner_user_id = f.owner_user_id
     WHERE f.owner_user_id = ? AND f.client_id = ? ${selection}
     ORDER BY ${byMention} (COALESCE(f.storage_key, '') <> '') DESC, f.period_end DESC, f.created_at DESC, f.id
     LIMIT ${maxArchiveSources + 1}`,
  ).bind(...params).all()
  return results
}

export function archivedSourceBucket(env) {
  return env.ASSISTANT_MATERIALS_BUCKET || env.MATERIALS_BUCKET || null
}

export async function archivedSourceCache(bucket, source) {
  if (!bucket || !source.storage_key?.startsWith(`${source.owner_user_id}/`)) return null
  const original = await bucket.head(source.storage_key)
  if (!original) return null
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([source.storage_key, original.etag])))
  const version = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return { version, key: `assistant-original-text/${archiveCacheVersion}/${version}` }
}

export async function prepareArchivedSources({ db, env, user, archive, message, history }) {
  let sources
  try {
    sources = await findArchivedSources(db, user.id, archive.clientId, { message: archiveQuestionWithHistory(message, history) })
  } catch (error) {
    if (!/no such table: tax_data_source_files\b/i.test(String(error))) throw error
    sources = []
  }
  const bucket = archivedSourceBucket(env)
  const files = []
  const unavailable = []
  const selected = sources.slice(0, maxArchiveSources)
  for (let offset = 0; offset < selected.length; offset += 4) {
    const batch = await Promise.all(selected.slice(offset, offset + 4).map(async (source) => {
      const cache = await archivedSourceCache(bucket, source)
      if (!cache) return { name: source.file_name }
      return {
        id: source.id,
        name: source.file_name,
        contentType: source.content_type,
        version: cache.version,
        cached: Boolean(await bucket.head(cache.key)),
      }
    }))
    for (const file of batch) {
      if (file.id) files.push(file)
      else unavailable.push(file.name)
    }
  }
  return json({ files, unavailable, limited: sources.length > maxArchiveSources }, { headers: { 'cache-control': 'private, no-store' } })
}

export async function readArchivedSources({ db, env, user, archive }, mapSource) {
  const ids = [...new Set(archive.sourceIds)]
  const sources = await findArchivedSources(db, user.id, archive.clientId, { ids })
  if (sources.length !== ids.length) return { response: badRequest('部分原件不属于当前企业或已不可用') }
  const byId = new Map(sources.map((source) => [source.id, source]))
  const bucket = archivedSourceBucket(env)
  const rows = []
  for (const id of ids) {
    const source = byId.get(id)
    const cache = await archivedSourceCache(bucket, source)
    const object = cache && await bucket.get(cache.key)
    if (!object) return { response: json({ error: `「${source.file_name}」原件已更新或暂不可读，请重新发送问题` }, { status: 409 }) }
    rows.push(mapSource({ ...source, sections_json: await object.text() }))
  }
  return { rows }
}
