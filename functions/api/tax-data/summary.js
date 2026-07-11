import { badRequest, json, requireDb, serverError } from '../_utils.js'
import { requireUser } from '../auth/_auth.js'
import { ensureTaxDataIntakeTables } from '../_tax_data_schema.js'

const SLOT_CATALOG = [
  {
    id: 'vat-return-main',
    group: '增值税资料',
    name: '增值税申报表主表',
    periodType: 'month',
    parserType: 'fixed_template',
    standardTemplate: 'vat_general_return_main_v1',
    description: '官方固定格式。按行次和栏次收录销售额、销项税额、进项税额、应纳税额、留抵和已缴税额。',
  },
  {
    id: 'vat-schedule-4',
    group: '增值税资料',
    name: '增值税附表四_税额抵减情况表',
    periodType: 'month',
    parserType: 'fixed_template',
    standardTemplate: 'vat_schedule_4_tax_credit_v1',
    description: '官方固定格式。按抵减项目收录期初余额、本期发生额、本期抵减税额、实际抵减税额和期末余额。',
  },
  { id: 'vat-other-schedules', group: '增值税资料', name: '增值税其他附表', periodType: 'month', parserType: 'fixed_template' },
  { id: 'invoice-output', group: '发票资料', name: '销项发票清单', periodType: 'month', parserType: 'mapped_table' },
  { id: 'invoice-input', group: '发票资料', name: '进项发票清单', periodType: 'month', parserType: 'mapped_table' },
  { id: 'financial-balance-sheet', group: '财务报表', name: '资产负债表', periodType: 'month', parserType: 'fixed_or_mapped_table' },
  { id: 'financial-income-statement', group: '财务报表', name: '利润表', periodType: 'month', parserType: 'fixed_or_mapped_table' },
  { id: 'financial-cash-flow', group: '财务报表', name: '现金流量表', periodType: 'month', parserType: 'fixed_or_mapped_table' },
  { id: 'account-balance', group: '账簿资料', name: '科目余额表', periodType: 'month', parserType: 'mapped_table' },
  { id: 'ledger', group: '账簿资料', name: '明细账', periodType: 'range', parserType: 'mapped_table' },
  { id: 'payroll', group: '个人所得税与薪酬', name: '工资表', periodType: 'month', parserType: 'mapped_table' },
  { id: 'iit-withholding', group: '个人所得税与薪酬', name: '个人所得税扣缴申报表', periodType: 'month', parserType: 'fixed_or_mapped_table' },
  { id: 'cit-quarterly-prepayment', group: '企业所得税资料', name: '企业所得税季度预缴申报表', periodType: 'quarter', parserType: 'fixed_template' },
  { id: 'cit-annual-return', group: '企业所得税资料', name: '企业所得税年度申报表', periodType: 'year', parserType: 'fixed_template' },
  { id: 'cit-adjustment', group: '企业所得税资料', name: '纳税调整明细', periodType: 'year', parserType: 'fixed_or_mapped_table' },
  { id: 'support-contracts', group: '其他支撑资料', name: '合同', periodType: 'range', parserType: 'source_evidence' },
  { id: 'support-explanations', group: '其他支撑资料', name: '说明文件', periodType: 'range', parserType: 'source_evidence' },
  { id: 'support-attachments', group: '其他支撑资料', name: '其他附件', periodType: 'range', parserType: 'source_evidence' },
]

const VAT_MAIN_KEY_ROWS = [
  ['salesAmount', '销售额', ['1']],
  ['outputTax', '销项税额', ['11']],
  ['inputTax', '进项税额', ['12']],
  ['taxPayable', '应纳税额', ['19']],
  ['retainedTaxCredit', '期末留抵税额', ['20']],
  ['taxPaid', '本期已缴税额', ['28', '31', '37']],
  ['taxDue', '本期应补退税额', ['34']],
]

function slotStatus(count) {
  return count > 0 ? 'collected' : 'missing'
}

function periodLabel(start, end, periodType = 'month') {
  if (!start && !end) return '待收录'
  if (periodType === 'year' && start) return `${start.slice(0, 4)} 年`
  if (periodType === 'quarter' && start) {
    const month = Number(start.slice(5, 7))
    if (month >= 1 && month <= 12) return `${start.slice(0, 4)} Q${Math.ceil(month / 3)}`
  }
  if (start && end && start.slice(0, 7) === end.slice(0, 7)) return start.slice(0, 7)
  return [start, end].filter(Boolean).join(' 至 ')
}

async function all(db, sql, ...params) {
  const result = await db.prepare(sql).bind(...params).all()
  return result.results || []
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return ''
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  return number.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function statementSlotId(value) {
  if (value === 'balance_sheet') return 'financial-balance-sheet'
  if (value === 'cash_flow_statement') return 'financial-cash-flow'
  return 'financial-income-statement'
}

function makeSlot(catalog, partial = {}) {
  const recordCount = Number(partial.recordCount) || 0
  const sourceFiles = partial.sourceFiles || []
  return {
    id: partial.id || catalog.id,
    slotId: catalog.id,
    group: catalog.group,
    name: catalog.name,
    status: slotStatus(recordCount),
    periodType: catalog.periodType,
    parserType: catalog.parserType,
    standardTemplate: catalog.standardTemplate || '',
    description: catalog.description || '',
    periodStart: partial.periodStart || '',
    periodEnd: partial.periodEnd || '',
    periodLabel: periodLabel(partial.periodStart, partial.periodEnd, catalog.periodType),
    recordCount,
    sourceFileCount: Number(partial.sourceFileCount) || sourceFiles.length,
    keyValues: partial.keyValues || [],
    validationMessages: partial.validationMessages || [],
    sourceFiles,
  }
}

function mergeCollected(collected, slot) {
  const key = `${slot.slotId}:${slot.periodStart}:${slot.periodEnd}`
  collected.set(key, slot)
}

function parseSourceFileIds(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean)
}

async function sourceFilesByIds(db, ownerUserId, ids) {
  const cleanIds = Array.from(new Set(ids.filter(Boolean))).slice(0, 100)
  if (!cleanIds.length) return new Map()
  const placeholders = cleanIds.map(() => '?').join(',')
  const rows = await all(
    db,
    `SELECT id, file_name, document_type, period_start, period_end, parse_status
     FROM tax_data_source_files
     WHERE owner_user_id = ? AND id IN (${placeholders})`,
    ownerUserId,
    ...cleanIds,
  )
  return new Map(rows.map((row) => [row.id, row]))
}

function vatKeyValues(row) {
  return [
    ['销售额', numberValue(row.sales_amount)],
    ['销项税额', numberValue(row.output_tax)],
    ['进项税额', numberValue(row.input_tax)],
    ['应纳税额', numberValue(row.tax_payable)],
    ['期末留抵', numberValue(row.retained_tax_credit)],
    ['本期已缴', numberValue(row.tax_paid)],
  ].filter((item) => item[1])
}

function vatValidationMessages(row) {
  const messages = []
  const outputTax = Number(row.output_tax)
  const inputTax = Number(row.input_tax)
  const taxPayable = Number(row.tax_payable)
  if (Number.isFinite(outputTax) && Number.isFinite(inputTax) && Number.isFinite(taxPayable)) {
    const expected = outputTax - inputTax
    if (Math.abs(expected - taxPayable) > 1) {
      messages.push('销项税额 - 进项税额 与应纳税额不一致，需复核留抵、简易计税或其他调整项。')
    }
  }
  return messages
}

function classifyVatSlot(returnType) {
  return /附列资料（四）|附表四|税额抵减/.test(returnType || '') ? 'vat-schedule-4' : 'vat-return-main'
}

function emptyCatalogSlots(collected) {
  const collectedSlotIds = new Set(Array.from(collected.values()).map((slot) => slot.slotId))
  return SLOT_CATALOG
    .filter((catalog) => !collectedSlotIds.has(catalog.id))
    .map((catalog) => makeSlot(catalog))
}

async function openIssueCount(db, ownerUserId, clientId) {
  const rows = await all(
    db,
    `SELECT COUNT(*) AS count
     FROM tax_data_conflicts
     WHERE owner_user_id = ? AND client_id = ? AND status = 'open'`,
    ownerUserId,
    clientId,
  )
  return Number(rows[0]?.count) || 0
}

export async function onRequestGet({ request, env }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response

    const url = new URL(request.url)
    const clientId = String(url.searchParams.get('clientId') || '').trim()
    if (!clientId) return badRequest('clientId is required')

    await ensureTaxDataIntakeTables(db)

    const collected = new Map()
    const sourceFileIds = []

    const vatRows = await all(
      db,
      `SELECT
        r.return_type,
        r.period_start,
        r.period_end,
        r.source_file_id,
        COUNT(l.id) AS record_count,
        MAX(CASE WHEN l.row_no IN ('1') THEN COALESCE(l.current_amount, l.current_tax) END) AS sales_amount,
        MAX(CASE WHEN l.row_no IN ('11') THEN COALESCE(l.current_tax, l.current_amount) END) AS output_tax,
        MAX(CASE WHEN l.row_no IN ('12') THEN COALESCE(l.current_tax, l.current_amount) END) AS input_tax,
        MAX(CASE WHEN l.row_no IN ('19') THEN COALESCE(l.current_tax, l.current_amount) END) AS tax_payable,
        MAX(CASE WHEN l.row_no IN ('20') THEN COALESCE(l.current_tax, l.current_amount) END) AS retained_tax_credit,
        MAX(CASE WHEN l.row_no IN ('28','31','37') THEN COALESCE(l.current_tax, l.current_amount) END) AS tax_paid
       FROM tax_data_vat_returns r
       LEFT JOIN tax_data_vat_return_lines l ON l.vat_return_id = r.id
       WHERE r.owner_user_id = ? AND r.client_id = ?
       GROUP BY r.return_type, r.period_start, r.period_end, r.source_file_id
       ORDER BY r.period_start DESC, r.return_type`,
      auth.user.id,
      clientId,
    )
    for (const row of vatRows) {
      sourceFileIds.push(row.source_file_id)
      const catalog = SLOT_CATALOG.find((item) => item.id === classifyVatSlot(row.return_type))
      mergeCollected(collected, makeSlot(catalog, {
        id: `vat:${catalog.id}:${row.period_start}:${row.period_end}`,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        recordCount: Number(row.record_count) || 0,
        sourceFileCount: row.source_file_id ? 1 : 0,
        keyValues: vatKeyValues(row),
        validationMessages: vatValidationMessages(row),
        sourceFiles: row.source_file_id ? [row.source_file_id] : [],
      }))
    }

    const financialRows = await all(
      db,
      `SELECT statement_type, period_start, period_end, source_file_id, COUNT(*) AS record_count
       FROM tax_data_financial_statements
       WHERE owner_user_id = ? AND client_id = ?
       GROUP BY statement_type, period_start, period_end, source_file_id
       ORDER BY period_start DESC, statement_type`,
      auth.user.id,
      clientId,
    )
    for (const row of financialRows) {
      sourceFileIds.push(row.source_file_id)
      const catalog = SLOT_CATALOG.find((item) => item.id === statementSlotId(row.statement_type))
      mergeCollected(collected, makeSlot(catalog, {
        id: `financial:${row.statement_type}:${row.period_start}:${row.period_end}`,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        recordCount: Number(row.record_count) || 0,
        sourceFileCount: row.source_file_id ? 1 : 0,
        sourceFiles: row.source_file_id ? [row.source_file_id] : [],
      }))
    }

    const tableSummaries = [
      ['account-balance', 'tax_data_account_balances', 'period_start', 'period_end'],
      ['ledger', 'tax_data_ledger_entries', 'entry_date', 'entry_date'],
      ['payroll', 'tax_data_payroll_runs', 'period_start', 'period_end'],
      ['iit-withholding', 'tax_data_iit_returns', 'period_start', 'period_end'],
    ]

    for (const [slotId, table, startColumn, endColumn] of tableSummaries) {
      const catalog = SLOT_CATALOG.find((item) => item.id === slotId)
      const periodBucket = catalog.periodType === 'range' ? 'source_file_id' : `substr(${startColumn}, 1, 7)`
      const rows = await all(
        db,
        `SELECT
          MIN(${startColumn}) AS period_start,
          MAX(${endColumn}) AS period_end,
          COUNT(*) AS record_count,
          COUNT(DISTINCT source_file_id) AS source_file_count,
          GROUP_CONCAT(DISTINCT source_file_id) AS source_file_ids
         FROM ${table}
         WHERE owner_user_id = ? AND client_id = ?
         GROUP BY ${periodBucket}
         ORDER BY period_start DESC`,
        auth.user.id,
        clientId,
      )
      for (const row of rows) {
        const ids = parseSourceFileIds(row.source_file_ids)
        sourceFileIds.push(...ids)
        mergeCollected(collected, makeSlot(catalog, {
          id: `${slotId}:${row.period_start}:${row.period_end}`,
          periodStart: row.period_start,
          periodEnd: row.period_end,
          recordCount: Number(row.record_count) || 0,
          sourceFileCount: Number(row.source_file_count) || 0,
          sourceFiles: ids,
        }))
      }
    }

    const invoiceRows = await all(
      db,
      `SELECT
        invoice_direction,
        MIN(invoice_date) AS period_start,
        MAX(invoice_date) AS period_end,
        COUNT(*) AS record_count,
        COUNT(DISTINCT source_file_id) AS source_file_count,
        GROUP_CONCAT(DISTINCT source_file_id) AS source_file_ids,
        SUM(amount) AS amount_total,
        SUM(tax_amount) AS tax_total
       FROM tax_data_invoice_lines
       WHERE owner_user_id = ? AND client_id = ?
       GROUP BY invoice_direction, substr(invoice_date, 1, 7)
       ORDER BY period_start DESC`,
      auth.user.id,
      clientId,
    )
    for (const row of invoiceRows) {
      const slotId = row.invoice_direction === 'output' ? 'invoice-output' : 'invoice-input'
      const catalog = SLOT_CATALOG.find((item) => item.id === slotId)
      const ids = parseSourceFileIds(row.source_file_ids)
      sourceFileIds.push(...ids)
      mergeCollected(collected, makeSlot(catalog, {
        id: `${slotId}:${row.period_start}:${row.period_end}`,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        recordCount: Number(row.record_count) || 0,
        sourceFileCount: Number(row.source_file_count) || 0,
        keyValues: [
          ['金额', numberValue(row.amount_total)],
          ['税额', numberValue(row.tax_total)],
        ].filter((item) => item[1]),
        sourceFiles: ids,
      }))
    }

    const sourceFileMap = await sourceFilesByIds(db, auth.user.id, sourceFileIds)
    const slots = [...collected.values(), ...emptyCatalogSlots(collected)]
      .map((slot) => ({
        ...slot,
        sourceFiles: slot.sourceFiles.map((id) => sourceFileMap.get(id)).filter(Boolean),
      }))
      .sort((a, b) => {
        const groupDiff = SLOT_CATALOG.findIndex((item) => item.id === a.slotId) - SLOT_CATALOG.findIndex((item) => item.id === b.slotId)
        if (groupDiff !== 0) return groupDiff
        return String(b.periodStart).localeCompare(String(a.periodStart))
      })

    const missingSlots = slots.filter((slot) => slot.status === 'missing').map((slot) => slot.name)
    const collectedSlotIds = new Set(slots.filter((slot) => slot.status === 'collected').map((slot) => slot.slotId))
    const pendingConfirmationCount = await openIssueCount(db, auth.user.id, clientId)

    return json({
      clientId,
      slots,
      slotCatalog: SLOT_CATALOG,
      missingSlots,
      pendingConfirmationCount,
      stats: {
        collectedSlotCount: collectedSlotIds.size,
        totalSlotCount: SLOT_CATALOG.length,
        recordCount: slots.reduce((sum, slot) => sum + slot.recordCount, 0),
      },
      standardTemplates: {
        vat_general_return_main_v1: VAT_MAIN_KEY_ROWS.map(([field, label, rows]) => ({ field, label, rows })),
      },
    })
  } catch (error) {
    return serverError(error)
  }
}
