import { badRequest, json, nowIso, readJson, requireDb, serverError } from '../_utils.js'
import { requireUser } from '../auth/_auth.js'

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions'
const DEFAULT_MODEL = 'deepseek-v4-pro'

const memoryTableStatements = [
  `CREATE TABLE IF NOT EXISTS assistant_customer_memories (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    client_id TEXT,
    client_name TEXT,
    memory_key TEXT NOT NULL,
    memory_value TEXT NOT NULL,
    source TEXT,
    confidence TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_customer_memories_unique
    ON assistant_customer_memories(owner_user_id, client_id, memory_key)`,
  `CREATE INDEX IF NOT EXISTS idx_assistant_customer_memories_owner_updated
    ON assistant_customer_memories(owner_user_id, updated_at)`,
]

function cleanText(value, maxLength = 1200) {
  return String(value || '').trim().slice(0, maxLength)
}

function normalizeMessages(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: cleanText(item?.content, 2000),
    }))
    .filter((item) => item.content)
    .slice(-80)
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text)
  } catch {
    const match = String(text || '').match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

function fallbackCompression(messages, client) {
  const facts = messages
    .map((item) => `${item.role === 'assistant' ? 'AI' : '用户'}：${item.content}`)
    .join('\n')
    .slice(-5000)
  return {
    summary: `${client.name}当前对话已压缩。保留最近稳定上下文：\n${facts}`,
    memories: [{
      key: `thread_summary_${new Date().toISOString().slice(0, 10)}`,
      value: facts,
      confidence: 'medium',
    }],
  }
}

async function ensureMemoryTables(db) {
  for (const statement of memoryTableStatements) await db.prepare(statement).run()
}

async function summarizeWithModel(env, client, messages) {
  if (!env.DEEPSEEK_API_KEY) return fallbackCompression(messages, client)
  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL || DEFAULT_MODEL,
      temperature: 0.2,
      max_tokens: 1800,
      messages: [
        {
          role: 'system',
          content: `你是税务合规产品的企业记忆压缩器。只提取稳定、可复用、对后续服务有价值的企业上下文，不写税务规则，不写代码，不编造事实。
返回严格 JSON：
{
  "summary": "给用户看的当前线程压缩摘要，400-900字",
  "memories": [
    {"key":"稳定记忆键，中文或 snake_case，最长80字", "value":"稳定事实/口径/文件格式/字段映射/待补资料/常见问题，最长600字", "confidence":"high|medium|low"}
  ]
}
最多 12 条 memories。不要保存临时寒暄、明显错误、一次性问题。`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            client: { id: client.id, name: client.name },
            messages,
          }),
        },
      ],
    }),
  })
  if (!response.ok) return fallbackCompression(messages, client)
  const data = await response.json()
  const parsed = parseJsonObject(data?.choices?.[0]?.message?.content || '')
  if (!parsed?.summary || !Array.isArray(parsed.memories)) return fallbackCompression(messages, client)
  return parsed
}

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response

    const body = await readJson(request)
    const clientId = cleanText(body?.client?.id, 120)
    const clientName = cleanText(body?.client?.name, 200)
    const threadTitle = cleanText(body?.threadTitle || 'AI 对话', 120)
    const messages = normalizeMessages(body?.messages)
    if (!clientId || !clientName) return badRequest('Client id and name are required')
    if (messages.length < 2) return badRequest('Not enough messages to compress')

    const ownedClient = await db
      .prepare('SELECT id, name FROM clients WHERE id = ? AND owner_user_id = ?')
      .bind(clientId, auth.user.id)
      .first()
    if (!ownedClient) return badRequest('Client not found')

    await ensureMemoryTables(db)
    const compressed = await summarizeWithModel(env, ownedClient, messages)
    const memories = (Array.isArray(compressed.memories) ? compressed.memories : [])
      .map((item) => ({
        key: cleanText(item.key || item.memoryKey, 80),
        value: cleanText(item.value || item.memoryValue, 600),
        confidence: /^(high|medium|low)$/.test(String(item.confidence || '')) ? String(item.confidence) : 'medium',
      }))
      .filter((item) => item.key && item.value)
      .slice(0, 12)

    const now = nowIso()
    const statements = memories.map((item) => db.prepare(
      `INSERT INTO assistant_customer_memories (
        id, owner_user_id, client_id, client_name, memory_key, memory_value, source, confidence, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_user_id, client_id, memory_key) DO UPDATE SET
        client_name = excluded.client_name,
        memory_value = excluded.memory_value,
        source = excluded.source,
        confidence = excluded.confidence,
        updated_at = excluded.updated_at`,
    ).bind(
      `${auth.user.id}:${ownedClient.id}:${item.key}`,
      auth.user.id,
      ownedClient.id,
      ownedClient.name,
      item.key,
      item.value,
      `线程压缩：${threadTitle}`,
      item.confidence,
      now,
      now,
    ))
    if (statements.length) await db.batch(statements)

    return json({
      ok: true,
      summary: cleanText(compressed.summary, 1600),
      memories,
      savedCount: memories.length,
    })
  } catch (error) {
    return serverError(error)
  }
}
