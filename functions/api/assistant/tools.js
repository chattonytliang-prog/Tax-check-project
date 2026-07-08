import { badRequest, json, nowIso, readJson, requireDb, serverError } from '../_utils.js'
import { requireUser } from '../auth/_auth.js'

const allowedToolNames = new Set([
  'create_cleaning_draft',
  'update_cleaning_draft',
  'save_current_draft',
  'ask_missing_fields',
])

function normalizeToolCalls(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => ({
      name: String(item?.name || '').trim(),
      arguments: item?.arguments && typeof item.arguments === 'object' && !Array.isArray(item.arguments)
        ? item.arguments
        : {},
      reason: String(item?.reason || '').slice(0, 200),
      requiresConfirmation: item?.requiresConfirmation !== false,
    }))
    .filter((item) => allowedToolNames.has(item.name))
    .slice(0, 8)
}

function normalizeDraftClient(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const id = String(value.id || '').trim()
  const name = String(value.name || '').trim()
  if (!id || !name) return null
  return {
    ...value,
    id,
    name,
    creditCode: String(value.creditCode || ''),
    region: String(value.region || ''),
    industry: String(value.industry || ''),
    taxpayerType: String(value.taxpayerType || ''),
    riskLevel: String(value.riskLevel || ''),
  }
}

async function saveClient(db, ownerUserId, client) {
  const now = nowIso()
  await db
    .prepare(
      `INSERT INTO clients (
        id, owner_user_id, name, credit_code, region, industry, taxpayer_type, risk_level, payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        owner_user_id = excluded.owner_user_id,
        name = excluded.name,
        credit_code = excluded.credit_code,
        region = excluded.region,
        industry = excluded.industry,
        taxpayer_type = excluded.taxpayer_type,
        risk_level = excluded.risk_level,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at
      WHERE clients.owner_user_id = excluded.owner_user_id`,
    )
    .bind(
      client.id,
      ownerUserId,
      client.name,
      client.creditCode || '',
      client.region || '',
      client.industry || '',
      client.taxpayerType || '',
      client.riskLevel || '',
      JSON.stringify(client),
      now,
      now,
    )
    .run()
}

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response

    const body = await readJson(request)
    const toolCalls = normalizeToolCalls(body?.toolCalls)
    if (!toolCalls.length) return badRequest('Tool calls are required')

    const allowSave = body?.allowSave === true
    const draftClient = normalizeDraftClient(body?.currentDraft?.client || body?.draftClient)
    const results = []

    for (const toolCall of toolCalls) {
      if (toolCall.name === 'save_current_draft') {
        if (!allowSave) {
          results.push({
            name: toolCall.name,
            status: 'skipped',
            message: '保存需要用户明确确认。',
          })
          continue
        }
        if (!draftClient) {
          results.push({
            name: toolCall.name,
            status: 'failed',
            message: '没有可保存的清洗草稿。',
          })
          continue
        }
        await saveClient(db, auth.user.id, draftClient)
        results.push({
          name: toolCall.name,
          status: 'saved',
          message: `已保存「${draftClient.name}」。`,
          client: draftClient,
        })
      } else {
        results.push({
          name: toolCall.name,
          status: 'accepted',
          message: '工具请求已由前端清洗草稿处理。',
        })
      }
    }

    return json({ results })
  } catch (error) {
    return serverError(error)
  }
}
