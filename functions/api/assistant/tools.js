import { badRequest, json, nowIso, readJson, requireDb, serverError } from '../_utils.js'
import { requireUser } from '../auth/_auth.js'

const allowedToolNames = new Set([
  'create_cleaning_draft',
  'update_cleaning_draft',
  'save_cleaning_draft',
  'create_or_update_company',
  'save_period_data',
  'attach_source_material',
  'save_customer_memory',
  'create_import_audit_log',
  'save_current_draft',
  'ask_missing_fields',
  'run_basic_compliance',
  'run_risk_detection',
  'generate_report',
  'explain_current_report',
])

const backendWriteToolNames = new Set([
  'create_cleaning_draft',
  'update_cleaning_draft',
  'save_cleaning_draft',
  'create_or_update_company',
  'save_period_data',
  'attach_source_material',
  'save_customer_memory',
  'create_import_audit_log',
  'save_current_draft',
])

const clientWriteToolNames = new Set([
  'create_or_update_company',
  'save_period_data',
  'save_current_draft',
])

const cleaningDraftToolNames = new Set([
  'create_cleaning_draft',
  'update_cleaning_draft',
  'save_cleaning_draft',
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

function normalizeString(value, maxLength = 240) {
  return String(value || '').trim().slice(0, maxLength)
}

function normalizeDraftClient(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const id = normalizeString(value.id, 120)
  const name = normalizeString(value.name, 200)
  if (!id || !name) return null
  return {
    ...value,
    id,
    name,
    creditCode: normalizeString(value.creditCode, 80),
    region: normalizeString(value.region, 120),
    industry: normalizeString(value.industry, 120),
    taxpayerType: normalizeString(value.taxpayerType, 80),
    riskLevel: normalizeString(value.riskLevel, 40),
  }
}

function normalizeMaterialIds(value) {
  return Array.isArray(value)
    ? value.map((item) => normalizeString(item, 120)).filter(Boolean).slice(0, 20)
    : []
}

function isMissingTableError(error) {
  return /no such table|has no column|no column named/i.test(String(error))
}

async function tryOptionalWrite(callback) {
  try {
    await callback()
    return true
  } catch (error) {
    if (isMissingTableError(error)) return false
    throw error
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

async function saveCleaningDraft(db, auth, toolCall, client, body) {
  const now = nowIso()
  const args = toolCall.arguments || {}
  const threadId = normalizeString(args.threadId || body?.threadId || body?.assistantContext?.activeThread?.id, 120)
  const sourceType = normalizeString(args.sourceType || body?.currentDraft?.sourceType || body?.assistantContext?.latestMaterialSummary?.sourceType || 'AI 清洗', 80)
  const draftId = normalizeString(args.draftId || body?.currentDraft?.id || crypto.randomUUID(), 120)
  const status = normalizeString(args.status || 'draft', 40)
  const saved = await tryOptionalWrite(async () => {
    await db
      .prepare(
        `INSERT INTO assistant_cleaning_drafts (
          id, owner_user_id, thread_id, client_id, client_name, source_type, payload_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          owner_user_id = excluded.owner_user_id,
          thread_id = excluded.thread_id,
          client_id = excluded.client_id,
          client_name = excluded.client_name,
          source_type = excluded.source_type,
          payload_json = excluded.payload_json,
          status = excluded.status,
          updated_at = excluded.updated_at
        WHERE assistant_cleaning_drafts.owner_user_id = excluded.owner_user_id`,
      )
      .bind(
        draftId,
        auth.user.id,
        threadId,
        client?.id || '',
        client?.name || '',
        sourceType,
        JSON.stringify({
          toolName: toolCall.name,
          reason: toolCall.reason,
          draft: body?.currentDraft || null,
          client,
          arguments: args,
        }),
        status,
        now,
        now,
      )
      .run()
  })
  return saved
}

async function saveCustomerMemory(db, auth, toolCall, client) {
  const args = toolCall.arguments || {}
  const memories = Array.isArray(args.memories)
    ? args.memories
    : args.key || args.memoryKey
      ? [args]
      : []
  if (!memories.length) return 0

  let savedCount = 0
  for (const item of memories.slice(0, 12)) {
    const key = normalizeString(item.memoryKey || item.key || item.field, 120)
    const value = normalizeString(item.memoryValue || item.value || item.note, 1200)
    if (!key || !value) continue
    const source = normalizeString(item.source || toolCall.reason || 'AI 对话确认', 240)
    const confidence = normalizeString(item.confidence || 'medium', 40)
    const memoryId = `${auth.user.id}:${client?.id || 'global'}:${key}`
    const now = nowIso()
    const saved = await tryOptionalWrite(async () => {
      await db
        .prepare(
          `INSERT INTO assistant_customer_memories (
            id, owner_user_id, client_id, client_name, memory_key, memory_value, source, confidence, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(owner_user_id, client_id, memory_key) DO UPDATE SET
            client_name = excluded.client_name,
            memory_value = excluded.memory_value,
            source = excluded.source,
            confidence = excluded.confidence,
            updated_at = excluded.updated_at`,
        )
        .bind(
          memoryId,
          auth.user.id,
          client?.id || '',
          client?.name || '',
          key,
          value,
          source,
          confidence,
          now,
          now,
        )
        .run()
    })
    if (saved) savedCount += 1
  }
  return savedCount
}

async function writeImportAudit(db, auth, toolCall, client, body, status) {
  const args = toolCall.arguments || {}
  const materialIds = normalizeMaterialIds(args.materialIds || body?.currentDraft?.rawMaterials?.map((item) => item.id))
  const auditId = crypto.randomUUID()
  const saved = await tryOptionalWrite(async () => {
    await db
      .prepare(
        `INSERT INTO assistant_import_audits (
          id, owner_user_id, thread_id, client_id, client_name, action, tool_name, source_material_ids, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      )
      .bind(
        auditId,
        auth.user.id,
        normalizeString(args.threadId || body?.threadId || body?.assistantContext?.activeThread?.id, 120),
        client?.id || '',
        client?.name || '',
        normalizeString(args.action || status, 80),
        toolCall.name,
        JSON.stringify(materialIds),
        JSON.stringify({
          reason: toolCall.reason,
          status,
          arguments: args,
          draftId: body?.currentDraft?.id || null,
          clientId: client?.id || null,
          clientName: client?.name || null,
        }),
      )
      .run()
  })
  return saved
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
    if (!isMissingTableError(error)) throw error
  }
}

function requiresAuthorization(toolCall) {
  return backendWriteToolNames.has(toolCall.name) && toolCall.name !== 'create_cleaning_draft' && toolCall.name !== 'update_cleaning_draft'
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

      if (requiresAuthorization(toolCall) && !allowSave) {
        results.push({
          name: toolCall.name,
          status: 'skipped',
          message: '写入业务数据需要用户在对话中明确授权，例如“帮我导入吧”或“确认保存”。',
        })
        continue
      }

      if (clientWriteToolNames.has(toolCall.name)) {
        if (!draftClient) {
          results.push({
            name: toolCall.name,
            status: 'failed',
            message: '没有可写入的企业或期间数据草稿。',
          })
          continue
        }
        await saveClient(db, auth.user.id, draftClient)
        const draftSaved = await saveCleaningDraft(db, auth, { ...toolCall, arguments: { ...toolCall.arguments, status: 'saved' } }, draftClient, body)
        const importAuditSaved = await writeImportAudit(db, auth, toolCall, draftClient, body, 'saved_business_data')
        await writeAssistantAuditLog(db, auth, toolCall, draftClient, 'saved_business_data')
        results.push({
          name: toolCall.name,
          status: 'saved',
          message: `已保存「${draftClient.name}」的业务数据。`,
          client: draftClient,
          cleaningDraftStored: draftSaved,
          importAuditStored: importAuditSaved,
        })
        continue
      }

      if (cleaningDraftToolNames.has(toolCall.name)) {
        const draftSaved = await saveCleaningDraft(db, auth, toolCall, draftClient, body)
        await writeAssistantAuditLog(db, auth, toolCall, draftClient, draftSaved ? 'saved_cleaning_draft' : 'accepted_cleaning_draft')
        results.push({
          name: toolCall.name,
          status: draftSaved ? 'saved' : 'accepted',
          message: draftSaved ? '已保存清洗草稿。' : '清洗草稿已在当前对话中保留，数据库草稿表尚未迁移。',
        })
        continue
      }

      if (toolCall.name === 'attach_source_material') {
        const importAuditSaved = await writeImportAudit(db, auth, toolCall, draftClient, body, 'attached_source_material')
        await writeAssistantAuditLog(db, auth, toolCall, draftClient, 'attached_source_material')
        results.push({
          name: toolCall.name,
          status: importAuditSaved ? 'saved' : 'accepted',
          message: importAuditSaved ? '已记录原始资料关联。' : '原始资料已在当前对话中关联，导入审计表尚未迁移。',
        })
        continue
      }

      if (toolCall.name === 'save_customer_memory') {
        const savedCount = await saveCustomerMemory(db, auth, toolCall, draftClient)
        await writeAssistantAuditLog(db, auth, toolCall, draftClient, savedCount ? 'saved_customer_memory' : 'accepted_customer_memory')
        results.push({
          name: toolCall.name,
          status: savedCount ? 'saved' : 'accepted',
          message: savedCount ? `已保存 ${savedCount} 条客户记忆。` : '客户记忆已在当前对话中保留，记忆表尚未迁移或缺少可保存内容。',
        })
        continue
      }

      if (toolCall.name === 'create_import_audit_log') {
        const importAuditSaved = await writeImportAudit(db, auth, toolCall, draftClient, body, 'created_import_audit_log')
        await writeAssistantAuditLog(db, auth, toolCall, draftClient, 'created_import_audit_log')
        results.push({
          name: toolCall.name,
          status: importAuditSaved ? 'saved' : 'accepted',
          message: importAuditSaved ? '已记录导入审计。' : '导入审计已在当前对话中保留，审计表尚未迁移。',
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
