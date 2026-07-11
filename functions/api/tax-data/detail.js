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

async function typedRecords(db, ownerUserId, clientId, sourceFileIds, slotId) {
  const placeholders = sourceFileIds.map(() => '?').join(',')
  const base = [ownerUserId, clientId, ...sourceFileIds]
  let sql = ''
  if (slotId === 'vat-return-main' || slotId === 'vat-schedule-4') {
    sql = `SELECT l.id, r.source_file_id, r.return_type AS record_subtype, r.period_start, r.period_end,
                  l.row_no, l.item_name, l.current_amount, l.cumulative_amount, l.current_tax, l.cumulative_tax
           FROM tax_data_vat_returns r JOIN tax_data_vat_return_lines l ON l.vat_return_id = r.id
           WHERE r.owner_user_id = ? AND r.client_id = ? AND r.source_file_id IN (${placeholders}) ORDER BY l.row_no LIMIT 500`
  } else if (slotId.startsWith('financial-')) {
    const statementType = slotId === 'financial-balance-sheet' ? 'balance_sheet' : slotId === 'financial-cash-flow' ? 'cash_flow_statement' : 'income_statement'
    sql = `SELECT l.id, s.source_file_id, s.statement_type AS record_subtype, s.period_start, s.period_end,
                  l.line_code, l.line_name, l.row_no, l.current_amount, l.cumulative_amount, l.beginning_amount, l.ending_amount
           FROM tax_data_financial_statements s JOIN tax_data_financial_statement_lines l ON l.statement_id = s.id
           WHERE s.owner_user_id = ? AND s.client_id = ? AND s.source_file_id IN (${placeholders}) AND s.statement_type = ? ORDER BY l.row_no LIMIT 500`
    base.push(statementType)
  } else if (slotId === 'account-balance') {
    sql = `SELECT id, source_file_id, period_start, period_end, account_code, account_name, opening_debit, opening_credit,
                  current_debit, current_credit, ytd_debit, ytd_credit, ending_debit, ending_credit
           FROM tax_data_account_balances WHERE owner_user_id = ? AND client_id = ? AND source_file_id IN (${placeholders}) ORDER BY account_code LIMIT 500`
  } else if (slotId === 'ledger') {
    sql = `SELECT id, source_file_id, entry_date AS period_start, entry_date AS period_end, voucher_no, account_code, account_name,
                  summary, debit_amount, credit_amount, direction, balance_amount
           FROM tax_data_ledger_entries WHERE owner_user_id = ? AND client_id = ? AND source_file_id IN (${placeholders}) ORDER BY entry_date, id LIMIT 500`
  } else if (slotId === 'invoice-output' || slotId === 'invoice-input') {
    const direction = slotId === 'invoice-output' ? 'output' : 'input'
    sql = `SELECT id, source_file_id, invoice_date AS period_start, invoice_date AS period_end, invoice_no, invoice_code,
                  counterparty_credit_code, counterparty_name, goods_name, amount, tax_amount, effective_deduction_tax, invoice_status
           FROM tax_data_invoice_lines WHERE owner_user_id = ? AND client_id = ? AND source_file_id IN (${placeholders}) AND invoice_direction = ? ORDER BY invoice_date, id LIMIT 500`
    base.push(direction)
  } else if (slotId === 'payroll') {
    sql = `SELECT l.id, r.source_file_id, r.period_start, r.period_end, l.employee_name, l.id_type, l.id_number_masked,
                  l.gross_pay, l.social_security, l.medical_insurance, l.unemployment_insurance, l.housing_fund,
                  l.taxable_income, l.tax_rate, l.tax_withheld
           FROM tax_data_payroll_runs r JOIN tax_data_payroll_lines l ON l.payroll_run_id = r.id
           WHERE r.owner_user_id = ? AND r.client_id = ? AND r.source_file_id IN (${placeholders}) ORDER BY l.id LIMIT 500`
  } else if (slotId === 'iit-withholding') {
    sql = `SELECT l.id, r.source_file_id, r.period_start, r.period_end, l.person_name, l.id_type, l.id_number_masked,
                  l.income_item, l.current_income, l.cumulative_income, l.cumulative_deduction, l.taxable_income, l.tax_rate, l.tax_withheld
           FROM tax_data_iit_returns r JOIN tax_data_iit_return_lines l ON l.iit_return_id = r.id
           WHERE r.owner_user_id = ? AND r.client_id = ? AND r.source_file_id IN (${placeholders}) ORDER BY l.id LIMIT 500`
  }
  if (!sql) return []
  const rows = await all(db, sql, ...base)
  return rows.map(({ id, source_file_id, record_subtype, period_start, period_end, ...data }) => ({
    id, source_file_id, record_type: slotId, record_subtype: record_subtype || slotId,
    period_start: period_start || '', period_end: period_end || '', confidence: 'validated', data,
  }))
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
    let records = await all(
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
    const standardRecordCount = Number(countRows[0]?.count) || 0
    records = records.map((record) => ({ ...record, data: parseJson(record.record_json), record_json: undefined }))
    if (!records.length) records = await typedRecords(db, auth.user.id, clientId, allowedIds, slotId)
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
      records,
      evidence,
      totalRecords: standardRecordCount || records.length,
      truncated: (standardRecordCount || records.length) > records.length,
    })
  } catch (error) {
    return serverError(error)
  }
}
