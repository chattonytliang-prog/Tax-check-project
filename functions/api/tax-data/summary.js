import { badRequest, json, requireDb, serverError } from '../_utils.js'
import { requireUser } from '../auth/_auth.js'
import { ensureTaxDataIntakeTables } from '../_tax_data_schema.js'

function slotStatus(count) {
  return count > 0 ? 'collected' : 'missing'
}

function periodLabel(start, end) {
  if (!start && !end) return '未识别期间'
  if (start && end && start.slice(0, 7) === end.slice(0, 7)) return start.slice(0, 7)
  return [start, end].filter(Boolean).join(' 至 ')
}

async function all(db, sql, ...params) {
  const result = await db.prepare(sql).bind(...params).all()
  return result.results || []
}

function addSlot(slots, partial) {
  slots.push({
    id: partial.id,
    group: partial.group,
    name: partial.name,
    status: slotStatus(partial.recordCount || 0),
    periodStart: partial.periodStart || '',
    periodEnd: partial.periodEnd || '',
    periodLabel: periodLabel(partial.periodStart, partial.periodEnd),
    recordCount: partial.recordCount || 0,
    sourceFileCount: partial.sourceFileCount || 0,
    keyValues: partial.keyValues || [],
    sourceFiles: partial.sourceFiles || [],
  })
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return ''
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  return number.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function statementSlotName(value) {
  const text = String(value || '')
  if (text === 'balance_sheet') return '资产负债表'
  if (text === 'income_statement') return '利润表'
  if (text === 'cash_flow_statement') return '现金流量表'
  return text || '财务报表'
}

async function sourceFilesByIds(db, ownerUserId, ids) {
  const cleanIds = Array.from(new Set(ids.filter(Boolean))).slice(0, 50)
  if (!cleanIds.length) return new Map()
  const placeholders = cleanIds.map(() => '?').join(',')
  const rows = await all(
    db,
    `SELECT id, file_name, document_type, period_start, period_end
     FROM tax_data_source_files
     WHERE owner_user_id = ? AND id IN (${placeholders})`,
    ownerUserId,
    ...cleanIds,
  )
  return new Map(rows.map((row) => [row.id, row]))
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

    const slots = []
    const sourceFileIds = []

    const vatRows = await all(
      db,
      `SELECT
        r.return_type,
        r.period_start,
        r.period_end,
        r.source_file_id,
        COUNT(l.id) AS record_count,
        MAX(CASE WHEN l.row_no = '1' OR l.item_name LIKE '%销售额%' THEN l.current_amount END) AS sales_amount,
        MAX(CASE WHEN l.item_name LIKE '%销项税额%' THEN l.current_tax END) AS output_tax,
        MAX(CASE WHEN l.item_name LIKE '%进项税额%' THEN l.current_tax END) AS input_tax,
        MAX(CASE WHEN l.item_name LIKE '%应纳税额合计%' OR l.item_name LIKE '%本期应补%税额%' THEN l.current_tax END) AS tax_payable
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
      const isSchedule4 = /四|抵减/.test(row.return_type || '')
      addSlot(slots, {
        id: `vat:${row.return_type}:${row.period_start}:${row.period_end}`,
        group: '增值税资料',
        name: isSchedule4 ? '增值税附表四' : '增值税申报表主表',
        periodStart: row.period_start,
        periodEnd: row.period_end,
        recordCount: Number(row.record_count) || 0,
        sourceFileCount: row.source_file_id ? 1 : 0,
        keyValues: [
          ['销售额', numberValue(row.sales_amount)],
          ['销项税额', numberValue(row.output_tax)],
          ['进项税额', numberValue(row.input_tax)],
          ['应纳税额', numberValue(row.tax_payable)],
        ].filter((item) => item[1]),
        sourceFiles: row.source_file_id ? [row.source_file_id] : [],
      })
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
      addSlot(slots, {
        id: `financial:${row.statement_type}:${row.period_start}:${row.period_end}`,
        group: '财务报表',
        name: statementSlotName(row.statement_type),
        periodStart: row.period_start,
        periodEnd: row.period_end,
        recordCount: Number(row.record_count) || 0,
        sourceFileCount: row.source_file_id ? 1 : 0,
        sourceFiles: row.source_file_id ? [row.source_file_id] : [],
      })
    }

    const tableSummaries = [
      ['账簿资料', '科目余额表', 'tax_data_account_balances', 'period_start', 'period_end'],
      ['账簿资料', '明细账', 'tax_data_ledger_entries', 'entry_date', 'entry_date'],
      ['发票资料', '发票清单', 'tax_data_invoice_lines', 'invoice_date', 'invoice_date'],
      ['人员薪酬', '工资表', 'tax_data_payroll_runs', 'period_start', 'period_end'],
      ['个人所得税', '个人所得税扣缴申报表', 'tax_data_iit_returns', 'period_start', 'period_end'],
    ]

    for (const [group, name, table, startColumn, endColumn] of tableSummaries) {
      const rows = await all(
        db,
        `SELECT
          MIN(${startColumn}) AS period_start,
          MAX(${endColumn}) AS period_end,
          COUNT(*) AS record_count,
          COUNT(DISTINCT source_file_id) AS source_file_count
         FROM ${table}
         WHERE owner_user_id = ? AND client_id = ?
         GROUP BY substr(${startColumn}, 1, 7)
         ORDER BY period_start DESC`,
        auth.user.id,
        clientId,
      )
      for (const row of rows) {
        addSlot(slots, {
          id: `${table}:${row.period_start}:${row.period_end}`,
          group,
          name,
          periodStart: row.period_start,
          periodEnd: row.period_end,
          recordCount: Number(row.record_count) || 0,
          sourceFileCount: Number(row.source_file_count) || 0,
        })
      }
    }

    const sourceFileMap = await sourceFilesByIds(db, auth.user.id, sourceFileIds)
    const enrichedSlots = slots.map((slot) => ({
      ...slot,
      sourceFiles: slot.sourceFiles.map((id) => sourceFileMap.get(id)).filter(Boolean),
    }))

    const requiredSlotNames = [
      '增值税申报表主表',
      '增值税附表四',
      '发票清单',
      '工资表',
      '个人所得税扣缴申报表',
      '科目余额表',
      '明细账',
      '资产负债表',
      '利润表',
    ]
    const collectedNames = new Set(enrichedSlots.filter((slot) => slot.status === 'collected').map((slot) => slot.name))

    return json({
      clientId,
      slots: enrichedSlots,
      missingSlots: requiredSlotNames.filter((name) => !collectedNames.has(name)),
      stats: {
        collectedSlotCount: collectedNames.size,
        totalSlotCount: requiredSlotNames.length,
        recordCount: enrichedSlots.reduce((sum, slot) => sum + slot.recordCount, 0),
      },
    })
  } catch (error) {
    return serverError(error)
  }
}
