import { badRequest, json, nowIso, readJson, requireDb, serverError } from '../_utils.js'
import { requireUser } from '../auth/_auth.js'
import { ensureTaxDataIntakeTables } from '../_tax_data_schema.js'

const allowedToolNames = new Set([
  'create_cleaning_draft',
  'update_cleaning_draft',
  'save_cleaning_draft',
  'create_or_update_company',
  'save_period_data',
  'attach_source_material',
  'save_customer_memory',
  'create_import_audit_log',
  'save_standardized_tax_data',
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
  'save_standardized_tax_data',
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
  'write_tax_rule_schema',
  'update_tax_rule_schema',
])

const assistantBusinessTableStatements = [
  `CREATE TABLE IF NOT EXISTS assistant_cleaning_drafts (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    thread_id TEXT,
    client_id TEXT,
    client_name TEXT,
    source_type TEXT,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_assistant_cleaning_drafts_owner_updated
    ON assistant_cleaning_drafts(owner_user_id, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_assistant_cleaning_drafts_client
    ON assistant_cleaning_drafts(client_id)`,
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
  `CREATE TABLE IF NOT EXISTS assistant_import_audits (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    thread_id TEXT,
    client_id TEXT,
    client_name TEXT,
    action TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    source_material_ids TEXT,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_assistant_import_audits_owner_created
    ON assistant_import_audits(owner_user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_assistant_import_audits_client
    ON assistant_import_audits(client_id)`,
]

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

export function dedupeToolCalls(toolCalls) {
  const primaryClientWrite = toolCalls.find((item) => item.name === 'save_current_draft')
    || toolCalls.find((item) => item.name === 'save_period_data')
    || toolCalls.find((item) => item.name === 'create_or_update_company')
  const seen = new Set()
  return toolCalls.filter((item) => {
    if (clientWriteToolNames.has(item.name) && item !== primaryClientWrite) return false
    if (primaryClientWrite && item.name === 'create_import_audit_log') return false
    if (primaryClientWrite && cleaningDraftToolNames.has(item.name)) return false
    if (seen.has(item.name)) return false
    seen.add(item.name)
    return true
  })
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

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function normalizeArray(value, limit = 50) {
  return Array.isArray(value) ? value.slice(0, limit) : []
}

function normalizeIsoDate(value) {
  const clean = normalizeString(value, 20)
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : ''
}

function normalizeSourceFiles(args, body, client) {
  const explicit = normalizeArray(args.sourceFiles, 40)
  const rawMaterials = normalizeArray(body?.currentDraft?.rawMaterials, 40)
  const sourceFiles = explicit.length
    ? explicit
    : rawMaterials.map((material) => ({
      materialId: material.id,
      fileName: material.name,
      contentType: material.type,
      fileSize: material.size,
      storageKey: material.objectKey,
      documentType: material.sourceType || args.documentType || 'unknown',
      parseStatus: 'parsed',
    }))

  return sourceFiles.map((item) => ({
    id: normalizeString(item.id || item.sourceFileId || crypto.randomUUID(), 120),
    materialId: normalizeString(item.materialId || item.material_id, 120),
    clientId: client?.id || normalizeString(item.clientId, 120),
    fileName: normalizeString(item.fileName || item.name || 'uploaded-material', 240),
    fileHash: normalizeString(item.fileHash || item.hash, 160),
    contentType: normalizeString(item.contentType || item.type, 120),
    fileSize: Number.isFinite(Number(item.fileSize || item.size)) ? Number(item.fileSize || item.size) : 0,
    documentType: normalizeString(item.documentType || item.kind || args.documentType || 'unknown', 80),
    sourceSystem: normalizeString(item.sourceSystem || args.sourceSystem, 120),
    periodStart: normalizeIsoDate(item.periodStart || args.periodStart),
    periodEnd: normalizeIsoDate(item.periodEnd || args.periodEnd),
    parseStatus: normalizeString(item.parseStatus || 'parsed', 40),
    storageKey: normalizeString(item.storageKey || item.objectKey, 240),
    evidence: normalizeObject(item.evidence),
  }))
}

function isMissingTableError(error) {
  return /no such table|has no column|no column named/i.test(String(error))
}

async function ensureAssistantBusinessTables(db) {
  for (const statement of assistantBusinessTableStatements) {
    await db.prepare(statement).run()
  }
}

async function tryOptionalWrite(db, callback) {
  try {
    await callback()
    return true
  } catch (error) {
    if (!isMissingTableError(error)) throw error
  }

  await ensureAssistantBusinessTables(db)
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
  const saved = await tryOptionalWrite(db, async () => {
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
    const saved = await tryOptionalWrite(db, async () => {
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
  const saved = await tryOptionalWrite(db, async () => {
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

async function saveStandardizedTaxData(db, auth, toolCall, client, body) {
  const args = toolCall.arguments || {}
  const now = nowIso()
  const batchId = normalizeString(args.batchId || body?.currentDraft?.id || crypto.randomUUID(), 120)
  const threadId = normalizeString(args.threadId || body?.threadId || body?.assistantContext?.activeThread?.id, 120)
  const sourceSystem = normalizeString(args.sourceSystem || body?.assistantContext?.latestMaterialSummary?.sourceSystem, 120)
  const periodStart = normalizeIsoDate(args.periodStart || body?.currentDraft?.client?.periodStartDate)
  const periodEnd = normalizeIsoDate(args.periodEnd || body?.currentDraft?.client?.periodEndDate)
  const sourceFiles = normalizeSourceFiles(args, body, client)
  const records = normalizeArray(args.records || args.standardRecords, 200)
  const periods = normalizeArray(args.periods, 40)
  const evidenceFields = normalizeArray(args.evidenceFields || args.evidence, 300)
  const conflicts = normalizeArray(args.conflicts, 80)

  await ensureTaxDataIntakeTables(db)

  await db
    .prepare(
      `INSERT INTO tax_data_import_batches (
        id, owner_user_id, thread_id, client_id, client_name, client_credit_code, period_start, period_end,
        source_system, status, summary_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        owner_user_id = excluded.owner_user_id,
        thread_id = excluded.thread_id,
        client_id = excluded.client_id,
        client_name = excluded.client_name,
        client_credit_code = excluded.client_credit_code,
        period_start = excluded.period_start,
        period_end = excluded.period_end,
        source_system = excluded.source_system,
        status = excluded.status,
        summary_json = excluded.summary_json,
        updated_at = excluded.updated_at
      WHERE tax_data_import_batches.owner_user_id = excluded.owner_user_id`,
    )
    .bind(
      batchId,
      auth.user.id,
      threadId,
      client?.id || normalizeString(args.clientId, 120),
      client?.name || normalizeString(args.clientName, 200),
      client?.creditCode || normalizeString(args.clientCreditCode, 80),
      periodStart,
      periodEnd,
      sourceSystem,
      normalizeString(args.status || 'draft', 40),
      JSON.stringify({
        reason: toolCall.reason,
        documentTypes: sourceFiles.map((item) => item.documentType),
        recordCount: records.length,
        evidenceCount: evidenceFields.length,
        conflictCount: conflicts.length,
        summary: normalizeObject(args.summary),
      }),
      now,
      now,
    )
    .run()

  for (const sourceFile of sourceFiles) {
    await db
      .prepare(
        `INSERT INTO tax_data_source_files (
          id, owner_user_id, batch_id, material_id, client_id, file_name, file_hash, content_type,
          file_size, document_type, source_system, period_start, period_end, parse_status,
          storage_key, evidence_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          batch_id = excluded.batch_id,
          client_id = excluded.client_id,
          file_name = excluded.file_name,
          file_hash = excluded.file_hash,
          content_type = excluded.content_type,
          file_size = excluded.file_size,
          document_type = excluded.document_type,
          source_system = excluded.source_system,
          period_start = excluded.period_start,
          period_end = excluded.period_end,
          parse_status = excluded.parse_status,
          storage_key = excluded.storage_key,
          evidence_json = excluded.evidence_json
        WHERE tax_data_source_files.owner_user_id = excluded.owner_user_id`,
      )
      .bind(
        sourceFile.id,
        auth.user.id,
        batchId,
        sourceFile.materialId,
        sourceFile.clientId,
        sourceFile.fileName,
        sourceFile.fileHash,
        sourceFile.contentType,
        sourceFile.fileSize,
        sourceFile.documentType,
        sourceFile.sourceSystem,
        sourceFile.periodStart,
        sourceFile.periodEnd,
        sourceFile.parseStatus,
        sourceFile.storageKey,
        JSON.stringify(sourceFile.evidence),
      )
      .run()
  }

  for (const period of periods) {
    const start = normalizeIsoDate(period.periodStart || period.start)
    const end = normalizeIsoDate(period.periodEnd || period.end)
    const periodClientId = client?.id || normalizeString(period.clientId || args.clientId, 120)
    if (!periodClientId || !start || !end) continue
    await db
      .prepare(
        `INSERT INTO tax_data_periods (
          id, owner_user_id, client_id, batch_id, period_type, period_start, period_end,
          status, data_basis, source_file_ids, validation_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner_user_id, client_id, period_type, period_start, period_end) DO UPDATE SET
          batch_id = excluded.batch_id,
          status = excluded.status,
          data_basis = excluded.data_basis,
          source_file_ids = excluded.source_file_ids,
          validation_json = excluded.validation_json,
          updated_at = excluded.updated_at`,
      )
      .bind(
        normalizeString(period.id || crypto.randomUUID(), 120),
        auth.user.id,
        periodClientId,
        batchId,
        normalizeString(period.periodType || period.type || 'monthly', 40),
        start,
        end,
        normalizeString(period.status || 'draft', 40),
        normalizeString(period.dataBasis || args.dataBasis, 120),
        JSON.stringify(normalizeMaterialIds(period.sourceFileIds || sourceFiles.map((item) => item.id))),
        JSON.stringify(normalizeObject(period.validation)),
        now,
        now,
      )
      .run()
  }

  for (const record of records) {
    const recordType = normalizeString(record.recordType || record.type || record.category, 80)
    if (!recordType) continue
    await db
      .prepare(
        `INSERT INTO tax_data_standard_records (
          id, owner_user_id, batch_id, client_id, source_file_id, record_type, record_subtype,
          period_start, period_end, record_json, confidence, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      )
      .bind(
        normalizeString(record.id || crypto.randomUUID(), 120),
        auth.user.id,
        batchId,
        client?.id || normalizeString(record.clientId || args.clientId, 120),
        normalizeString(record.sourceFileId, 120),
        recordType,
        normalizeString(record.recordSubtype || record.subtype, 80),
        normalizeIsoDate(record.periodStart || args.periodStart),
        normalizeIsoDate(record.periodEnd || args.periodEnd),
        JSON.stringify(normalizeObject(record.payload || record.data || record)),
        normalizeString(record.confidence || 'medium', 40),
      )
      .run()
  }

  for (const evidence of evidenceFields) {
    const targetField = normalizeString(evidence.targetField || evidence.field, 120)
    if (!targetField) continue
    await db
      .prepare(
        `INSERT INTO tax_data_evidence_fields (
          id, owner_user_id, batch_id, source_file_id, target_table, target_id, target_field,
          raw_value, normalized_value, confidence, sheet_name, row_no, column_no, page_no, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      )
      .bind(
        normalizeString(evidence.id || crypto.randomUUID(), 120),
        auth.user.id,
        batchId,
        normalizeString(evidence.sourceFileId, 120),
        normalizeString(evidence.targetTable || 'tax_data_standard_records', 120),
        normalizeString(evidence.targetId, 120),
        targetField,
        normalizeString(evidence.rawValue, 1000),
        normalizeString(evidence.normalizedValue, 1000),
        normalizeString(evidence.confidence || 'medium', 40),
        normalizeString(evidence.sheetName, 120),
        Number.isFinite(Number(evidence.rowNo)) ? Number(evidence.rowNo) : null,
        Number.isFinite(Number(evidence.columnNo)) ? Number(evidence.columnNo) : null,
        Number.isFinite(Number(evidence.pageNo)) ? Number(evidence.pageNo) : null,
        normalizeString(evidence.note, 500),
      )
      .run()
  }

  for (const conflict of conflicts) {
    await db
      .prepare(
        `INSERT INTO tax_data_conflicts (
          id, owner_user_id, batch_id, client_id, conflict_type, field_name, existing_value,
          incoming_value, source_file_ids, severity, status, resolution, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        normalizeString(conflict.id || crypto.randomUUID(), 120),
        auth.user.id,
        batchId,
        client?.id || normalizeString(conflict.clientId || args.clientId, 120),
        normalizeString(conflict.conflictType || conflict.type || 'field_conflict', 80),
        normalizeString(conflict.fieldName || conflict.field, 120),
        normalizeString(conflict.existingValue, 1000),
        normalizeString(conflict.incomingValue, 1000),
        JSON.stringify(normalizeMaterialIds(conflict.sourceFileIds || sourceFiles.map((item) => item.id))),
        normalizeString(conflict.severity || 'medium', 40),
        normalizeString(conflict.status || 'open', 40),
        normalizeString(conflict.resolution, 1000),
        now,
        now,
      )
      .run()
  }

  return {
    batchId,
    sourceFileCount: sourceFiles.length,
    periodCount: periods.length,
    recordCount: records.length,
    evidenceCount: evidenceFields.length,
    conflictCount: conflicts.length,
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
    const toolCalls = dedupeToolCalls(normalizeToolCalls(body?.toolCalls))
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

      if (toolCall.name === 'save_standardized_tax_data') {
        const saved = await saveStandardizedTaxData(db, auth, toolCall, draftClient, body)
        await writeImportAudit(db, auth, toolCall, draftClient, body, 'saved_standardized_tax_data')
        await writeAssistantAuditLog(db, auth, toolCall, draftClient, 'saved_standardized_tax_data')
        results.push({
          name: toolCall.name,
          status: 'saved',
          message: `已保存标准化资料批次 ${saved.batchId}，包含 ${saved.sourceFileCount} 个原始文件、${saved.recordCount} 条标准记录、${saved.conflictCount} 条待确认冲突。`,
          intake: saved,
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
