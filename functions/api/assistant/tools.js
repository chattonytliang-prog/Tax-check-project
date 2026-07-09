import { badRequest, json, nowIso, readJson, requireDb, serverError } from '../_utils.js'
import { requireUser } from '../auth/_auth.js'

const allowedToolNames = new Set([
  'create_cleaning_draft',
  'update_cleaning_draft',
  'save_current_draft',
  'ask_missing_fields',
  'run_basic_compliance',
  'run_risk_detection',
  'generate_report',
  'explain_current_report',
])

const blockedRuleWriteToolNames = new Set([
  'create_rule',
  'update_rule',
  'delete_rule',
  'toggle_rule',
  'create_risk_rule',
  'update_risk_rule',
  'delete_risk_rule',
  'toggle_risk_rule',
  'write_rule_library',
  'update_rule_library',
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
    .filter((item) => allowedToolNames.has(item.name) || blockedRuleWriteToolNames.has(item.name))
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
  const result = await db
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

  if (result?.meta && result.meta.changes === 0) {
    throw new Error('Client is not owned by current user')
  }
}

async function writeAssistantAuditLog(db, auth, toolCall, client, status) {
  try {
    await db
      .prepare(
        'INSERT INTO audit_logs (id, actor_user_id, target_user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
      )
      .bind(
        crypto.randomUUID(),
        auth.user.actor?.id || auth.user.id,
        auth.user.id,
        'assistant.business_write',
        JSON.stringify({
          toolName: toolCall.name,
          reason: toolCall.reason,
          status,
          clientId: client?.id || null,
          clientName: client?.name || null,
          writableScope: 'business_data',
          protectedScope: 'rule_library_readonly',
        }),
      )
      .run()
  } catch (error) {
    if (!String(error).includes('audit_logs')) throw error
  }
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
      if (blockedRuleWriteToolNames.has(toolCall.name)) {
        await writeAssistantAuditLog(db, auth, toolCall, null, 'rejected_rule_write')
        results.push({
          name: toolCall.name,
          status: 'rejected',
          message: '规则库为只读权限，AI 助手不能新增、修改、删除或启停规则。',
        })
        continue
      }

      if (toolCall.name === 'save_current_draft') {
        if (!allowSave) {
          results.push({
            name: toolCall.name,
            status: 'skipped',
            message: '保存需要用户在对话中明确授权，例如“帮我导入吧”或“确认保存”。',
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
        await writeAssistantAuditLog(db, auth, toolCall, draftClient, 'saved_business_data')
        results.push({
          name: toolCall.name,
          status: 'saved',
          message: `已保存「${draftClient.name}」。`,
          client: draftClient,
        })
        continue
      }

      results.push({
        name: toolCall.name,
        status: 'accepted',
        message: '工具请求已由前端工作流处理。',
      })
    }

    return json({ results })
  } catch (error) {
    return serverError(error)
  }
}
