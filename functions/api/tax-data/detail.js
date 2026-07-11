import { badRequest, json, requireDb, serverError } from '../_utils.js'
import { requireUser } from '../auth/_auth.js'
import { ensureTaxDataIntakeTables } from '../_tax_data_schema.js'

async function all(db, sql, ...params) {
  const result = await db.prepare(sql).bind(...params).all()
  return result.results || []
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || '') } catch { return fallback }
}

function recordFilter(slotId) {
  const types = {
    'account-balance': ['account_balance'],
    ledger: ['ledger'],
    payroll: ['payroll'],
    'iit-withholding': ['iit_withholding'],
    'invoice-output': ['invoice_list'],
    'invoice-input': ['invoice_list'],
    'financial-balance-sheet': ['financial_statement', 'balance_sheet'],
    'financial-income-statement': ['financial_statement', 'income_statement'],
    'financial-cash-flow': ['financial_statement', 'cash_flow_statement'],
    'vat-return-main': ['vat_return'],
    'vat-schedule-4': ['vat_return'],
  }
  const [type, subtype] = types[slotId] || []
  if (!type) return { sql: '', params: [] }
  if (subtype) return { sql: ' AND record_type = ? AND record_subtype = ?', params: [type, subtype] }
  return { sql: ' AND record_type = ?', params: [type] }
}

export async function onRequestGet({ request, env }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response

    const url = new URL(request.url)
    const clientId = String(url.searchParams.get('clientId') || '').trim()
    const slotId = String(url.searchParams.get('slotId') || '').trim()
    const sourceFileIds = String(url.searchParams.get('sourceFileIds') || '')
      .split(',').map((item) => item.trim()).filter(Boolean).slice(0, 50)
    if (!clientId || !sourceFileIds.length) return badRequest('clientId and sourceFileIds are required')

    await ensureTaxDataIntakeTables(db)
    const placeholders = sourceFileIds.map(() => '?').join(',')
    const sources = await all(
      db,
      `SELECT id, file_name, content_type, file_size, document_type, period_start, period_end,
              parse_status, storage_key, evidence_json, created_at
       FROM tax_data_source_files
       WHERE owner_user_id = ? AND client_id = ? AND id IN (${placeholders})
       ORDER BY created_at DESC`,
      auth.user.id, clientId, ...sourceFileIds,
    )
    const allowedIds = sources.map((source) => source.id)
    if (!allowedIds.length) return json({ sources: [], records: [], evidence: [], totalRecords: 0 })

    const allowedPlaceholders = allowedIds.map(() => '?').join(',')
    const filter = recordFilter(slotId)
    const records = await all(
      db,
      `SELECT id, source_file_id, record_type, record_subtype, period_start, period_end,
              record_json, confidence, created_at
       FROM tax_data_standard_records
       WHERE owner_user_id = ? AND client_id = ? AND source_file_id IN (${allowedPlaceholders})${filter.sql}
       ORDER BY record_type, record_subtype, id
       LIMIT 500`,
      auth.user.id, clientId, ...allowedIds, ...filter.params,
    )
    const countRows = await all(
      db,
      `SELECT COUNT(*) AS count FROM tax_data_standard_records
       WHERE owner_user_id = ? AND client_id = ? AND source_file_id IN (${allowedPlaceholders})${filter.sql}`,
      auth.user.id, clientId, ...allowedIds, ...filter.params,
    )
    const recordIds = records.map((record) => record.id)
    const evidenceTargetSql = recordIds.length ? ` AND (target_id IS NULL OR target_id IN (${recordIds.map(() => '?').join(',')}))` : ''
    const evidence = await all(
      db,
      `SELECT source_file_id, target_id, target_field, raw_value, normalized_value,
              confidence, sheet_name, row_no, column_no, page_no, note
       FROM tax_data_evidence_fields
       WHERE owner_user_id = ? AND source_file_id IN (${allowedPlaceholders})${evidenceTargetSql}
       ORDER BY source_file_id, sheet_name, page_no, row_no, column_no
       LIMIT 500`,
      auth.user.id, ...allowedIds, ...recordIds,
    )

    return json({
      sources: sources.map((source) => ({
        ...source,
        stored: Boolean(source.storage_key),
        evidence: parseJson(source.evidence_json),
        storage_key: undefined,
        evidence_json: undefined,
      })),
      records: records.map((record) => ({ ...record, data: parseJson(record.record_json), record_json: undefined })),
      evidence,
      totalRecords: Number(countRows[0]?.count) || 0,
      truncated: Number(countRows[0]?.count) > records.length,
    })
  } catch (error) {
    return serverError(error)
  }
}
