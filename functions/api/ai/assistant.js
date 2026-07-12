import { badRequest, json, readJson, requireDb, serverError } from '../_utils.js'
import { requireUser } from '../auth/_auth.js'

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions'
const DEFAULT_MODEL = 'deepseek-v4-pro'

const readOnlyAgentTools = [
  {
    type: 'function',
    function: {
      name: 'get_business_metric',
      description: '查询当前企业指定期间的销售额、营业收入、利润、税额或余额等标准业务指标。连续追问期间时应继承上一轮指标。',
      parameters: {
        type: 'object',
        properties: {
          clientId: { type: 'string' },
          metric: { type: 'string', description: '例如：销售额、营业收入、利润、税额、余额' },
          period: { type: 'string', description: '例如：2026年3月' },
        },
        required: ['clientId', 'metric', 'period'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_account_balance_accounts',
      description: '查询当前企业指定期间的科目余额表明细，包括科目编码、科目名称、余额和按会计科目编码划分的类别。用户询问有哪些科目、多少类、科目余额或要求表格时必须调用。',
      parameters: {
        type: 'object',
        properties: {
          clientId: { type: 'string' },
          periodStart: { type: 'string', description: 'YYYY-MM-DD' },
          periodEnd: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['clientId', 'periodStart', 'periodEnd'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_tax_archive',
      description: '查询当前企业指定期间已入库的标准税务资料类别、记录数和来源文件。回答资料是否存在或缺失前必须调用。',
      parameters: {
        type: 'object',
        properties: {
          clientId: { type: 'string' },
          periodStart: { type: 'string', description: 'YYYY-MM-DD，可选' },
          periodEnd: { type: 'string', description: 'YYYY-MM-DD，可选' },
        },
        required: ['clientId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_source_files',
      description: '查询当前企业已上传并归档的来源文件、识别类型、期间和解析状态。',
      parameters: {
        type: 'object',
        properties: { clientId: { type: 'string' } },
        required: ['clientId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_customer_memory',
      description: '检索当前企业已经确认的长期记忆，例如会计软件、固定文件格式、字段映射和客户口径。',
      parameters: {
        type: 'object',
        properties: { clientId: { type: 'string' }, query: { type: 'string' } },
        required: ['clientId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_agent_knowledge',
      description: '检索税务资料 Agent 的工作规则、资料判断优先级和权限边界。',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
]

const agentKnowledge = [
  { title: '资料事实优先级', content: '标准资料库记录 > 已归档来源文件 > 企业画像字段 > 对话推断。标准资料库已存在的资料不得报告为缺失。' },
  { title: '期间隔离', content: '资料完整性必须按所选期间判断。其他月份存在同类资料，不代表当前月份齐全；总览只能表示历史上曾收录。' },
  { title: '批量文件', content: '整批上传必须保留全部来源文件上下文，不得只依据最后一个文件。一个批量导出工作簿可以同时包含资产负债表、利润表和现金流量表。' },
  { title: '权限边界', content: '企业业务资料可在用户明确授权后通过白名单工具写入。规则库、公式、认证权限、数据库结构、核心报告与风险逻辑只读。' },
]

function cleanToolArguments(value) {
  if (!value) return {}
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return {} }
}

function standardRecordCategoryName(recordType, recordSubtype) {
  if (recordType === 'financial_statement' && recordSubtype === 'balance_sheet') return '资产负债表'
  if (recordType === 'financial_statement' && recordSubtype === 'income_statement') return '利润表'
  if (recordType === 'financial_statement' && recordSubtype === 'cash_flow_statement') return '现金流量表'
  const names = {
    account_balance: '科目余额表',
    ledger: '明细账',
    vat_return: '增值税申报表',
    invoice_list: '发票清单',
    payroll: '工资表',
    iit_withholding: '个人所得税扣缴申报表',
  }
  return names[recordType] || recordSubtype || recordType
}

async function executeReadOnlyAgentTool(db, auth, toolCall, fallbackClientId) {
  const name = String(toolCall?.function?.name || '')
  const args = cleanToolArguments(toolCall?.function?.arguments)
  const clientId = String(args.clientId || fallbackClientId || '').trim()
  if (name === 'search_agent_knowledge') {
    const terms = String(args.query || '').toLowerCase().split(/\s+/).filter(Boolean)
    const matches = agentKnowledge.filter((item) => !terms.length || terms.some((term) => `${item.title}${item.content}`.toLowerCase().includes(term)))
    return { entries: (matches.length ? matches : agentKnowledge).slice(0, 6) }
  }
  if (!clientId) return { error: 'clientId is required' }
  const owned = await db.prepare('SELECT id, name FROM clients WHERE id = ? AND owner_user_id = ?').bind(clientId, auth.user.id).first()
  if (!owned) return { error: 'client not found or not authorized' }
  if (name === 'get_business_metric') {
    const metric = String(args.metric || '').trim()
    const period = String(args.period || '').trim()
    const answer = await deterministicBusinessAnswer(db, auth, owned, `${period}的${metric}是多少`)
    return { client: owned, metric, period, answer: answer || '当前标准档案暂不支持该指标的确定性查询。' }
  }
  if (name === 'get_source_files') {
    const result = await db.prepare(
      `SELECT id, file_name, document_type, period_start, period_end, parse_status, evidence_json, created_at
       FROM tax_data_source_files
       WHERE owner_user_id = ? AND client_id = ?
       ORDER BY created_at DESC LIMIT 100`,
    ).bind(auth.user.id, clientId).all()
    return {
      client: owned,
      files: (result.results || []).map((row) => {
        let evidence = {}
        try { evidence = JSON.parse(row.evidence_json || '{}') } catch { evidence = {} }
        return {
          id: row.id,
          fileName: row.file_name,
          documentType: row.document_type,
          periodStart: row.period_start,
          periodEnd: row.period_end,
          parseStatus: row.parse_status,
          recordCounts: evidence.recordCounts || {},
          templates: Array.isArray(evidence.templateMatches)
            ? evidence.templateMatches.map((item) => ({ templateId: item.templateId, templateName: item.templateName, matched: item.matched, autoImportEligible: item.autoImportEligible }))
            : [],
        }
      }),
    }
  }
  if (name === 'get_account_balance_accounts') {
    const start = String(args.periodStart || '').slice(0, 10)
    const end = String(args.periodEnd || '').slice(0, 10)
    if (!start || !end) return { error: 'periodStart and periodEnd are required' }
    const result = await db.prepare(
      `SELECT account_code, account_name, opening_debit, opening_credit, current_debit, current_credit,
              ytd_debit, ytd_credit, ending_debit, ending_credit
       FROM tax_data_account_balances
       WHERE owner_user_id = ? AND client_id = ? AND period_end >= ? AND period_start <= ?
       ORDER BY account_code, account_name LIMIT 500`,
    ).bind(auth.user.id, clientId, start, end).all()
    const categoryName = (code) => ({
      1: '资产类', 2: '负债类', 3: '共同类', 4: '所有者权益类', 5: '成本类', 6: '损益类',
    }[String(code || '').trim().charAt(0)] || '其他类')
    const accounts = (result.results || []).map((row) => ({ ...row, category: categoryName(row.account_code) }))
    const categoryCounts = accounts.reduce((summary, row) => {
      summary[row.category] = (summary[row.category] || 0) + 1
      return summary
    }, {})
    return {
      client: owned,
      periodStart: start,
      periodEnd: end,
      accountCount: accounts.length,
      categoryCount: Object.keys(categoryCounts).length,
      categoryCounts,
      accounts,
    }
  }
  if (name === 'search_customer_memory') {
    const query = String(args.query || '').trim()
    try {
      const result = await db.prepare(
        `SELECT memory_key, memory_value, source, confidence, updated_at
         FROM assistant_customer_memories
         WHERE owner_user_id = ? AND client_id = ?
           AND (? = '' OR memory_key LIKE ? OR memory_value LIKE ?)
         ORDER BY updated_at DESC LIMIT 50`,
      ).bind(auth.user.id, clientId, query, `%${query}%`, `%${query}%`).all()
      return { client: owned, memories: result.results || [] }
    } catch {
      return { client: owned, memories: [] }
    }
  }
  if (name === 'get_tax_archive') {
    const start = String(args.periodStart || '').slice(0, 10)
    const end = String(args.periodEnd || '').slice(0, 10)
    const result = await db.prepare(
      `SELECT r.record_type, r.record_subtype, r.period_start, r.period_end,
              COUNT(*) AS record_count, GROUP_CONCAT(DISTINCT f.file_name) AS source_files
       FROM tax_data_standard_records r
       LEFT JOIN tax_data_source_files f ON f.id = r.source_file_id AND f.owner_user_id = r.owner_user_id
       WHERE r.owner_user_id = ? AND r.client_id = ?
         AND (? = '' OR COALESCE(r.period_end, r.period_start, '') >= ?)
         AND (? = '' OR COALESCE(r.period_start, r.period_end, '') <= ?)
       GROUP BY r.record_type, r.record_subtype, r.period_start, r.period_end
       ORDER BY r.period_start DESC, r.record_type LIMIT 200`,
    ).bind(auth.user.id, clientId, start, start, end, end).all()
    return {
      client: owned,
      periodStart: start,
      periodEnd: end,
      records: (result.results || []).map((row) => ({
        categoryName: standardRecordCategoryName(row.record_type, row.record_subtype),
        recordType: row.record_type,
        recordSubtype: row.record_subtype,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        recordCount: row.record_count,
        sourceFiles: row.source_files,
      })),
    }
  }
  return { error: 'read-only tool is not allowed' }
}

function compactClient(client) {
  return {
    id: client?.id,
    name: client?.name,
    creditCode: client?.creditCode,
    taxpayerType: client?.taxpayerType,
    industry: client?.industry,
    region: client?.region,
    analysisPeriodType: client?.analysisPeriodType,
    analysisYear: client?.analysisYear,
    analysisMonth: client?.analysisMonth,
    monthlyRevenue: client?.monthlyRevenue,
    monthlyCost: client?.monthlyCost,
    monthlyProfit: client?.monthlyProfit,
    mainBusinessRevenue: client?.mainBusinessRevenue,
    mainBusinessCost: client?.mainBusinessCost,
    ytdRevenue: client?.ytdRevenue,
    ytdCostExpense: client?.ytdCostExpense,
    ytdProfit: client?.ytdProfit,
    outputTax: client?.outputTax,
    inputTax: client?.inputTax,
    assetsTotal: client?.assetsTotal,
    payrollTotal: client?.payrollTotal,
    entertainmentExpense: client?.entertainmentExpense,
    otherReceivableAgencyBalance: client?.otherReceivableAgencyBalance,
    periodEntriesCount: Array.isArray(client?.periodEntries) ? client.periodEntries.length : 0,
  }
}

function deterministicQuestionPeriod(message) {
  const match = String(message || '').match(/(20\d{2})\s*年\s*(1[0-2]|0?[1-9])\s*月/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    label: `${year}年${month}月`,
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`,
  }
}

function recordValue(data, ...keys) {
  for (const key of keys) {
    if (data?.[key] !== undefined && data?.[key] !== null && data?.[key] !== '') return data[key]
  }
  return null
}

function metricAmount(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(number) ? number : null
}

async function deterministicBusinessAnswer(db, auth, client, message) {
  const text = String(message || '').replace(/\s+/g, '')
  if (/(我们公司|我公司|本公司).{0,8}(叫什么|名称|名字)/.test(text)) {
    return `当前会话绑定企业为「${client.name}」。`
  }
  const period = deterministicQuestionPeriod(text)
  if (!period) return ''
  const metricMatch = text.match(/20\d{2}年(?:1[0-2]|0?[1-9])月(?:份)?(?:的)?(.+?)(?:是多少|有多少|多少|是什么|呢|[？?]|$)/)
  const requestedMetric = String(metricMatch?.[1] || '').replace(/^(?:公司|我公司|我们公司|本公司)/, '').trim()
  const isArchiveOverviewQuestion = /^(?:有什么|有哪些|都有什么|都有哪些|收录了什么|收录了哪些|已收录什么|已收录哪些|缺什么|缺少什么)(?:数据|资料|报表|文件)?$/.test(requestedMetric)
  if (isArchiveOverviewQuestion) return ''
  if (requestedMetric && requestedMetric !== '销售额') {
    const financialLine = await db.prepare(
      `SELECT s.statement_type, l.line_code, l.line_name, l.current_amount, l.cumulative_amount,
              l.beginning_amount, l.ending_amount, f.file_name
       FROM tax_data_financial_statements s
       JOIN tax_data_financial_statement_lines l ON l.statement_id = s.id
       LEFT JOIN tax_data_source_files f ON f.id = s.source_file_id AND f.owner_user_id = s.owner_user_id
       WHERE s.owner_user_id = ? AND s.client_id = ?
         AND COALESCE(s.period_end, s.period_start, '') >= ?
         AND COALESCE(s.period_start, s.period_end, '') <= ?
         AND (TRIM(l.line_name) = ? OR l.line_name LIKE ?)
       ORDER BY CASE WHEN TRIM(l.line_name) = ? THEN 0 ELSE 1 END, l.id LIMIT 1`,
    ).bind(auth.user.id, client.id, period.start, period.end, requestedMetric, `%${requestedMetric}%`, requestedMetric).first()
    if (financialLine) {
      const source = financialLine.file_name || (financialLine.statement_type === 'balance_sheet' ? '资产负债表' : financialLine.statement_type === 'income_statement' ? '利润表' : '现金流量表')
      if (financialLine.statement_type === 'balance_sheet') {
        const ending = metricAmount(financialLine.ending_amount)
        const beginning = metricAmount(financialLine.beginning_amount)
        return `${client.name}${period.label}${financialLine.line_name}：期末余额${ending === null ? '为空' : `为 ${ending.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元`}${beginning === null ? '' : `，年初余额为 ${beginning.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元`}。来源：${source}${financialLine.line_code ? `第${financialLine.line_code}行` : ''}。`
      }
      const current = metricAmount(financialLine.current_amount)
      const cumulative = metricAmount(financialLine.cumulative_amount)
      return `${client.name}${period.label}${financialLine.line_name}：本期金额${current === null ? '为空' : `为 ${current.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元`}${cumulative === null ? '' : `，本年累计金额为 ${cumulative.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元`}。来源：${source}${financialLine.line_code ? `第${financialLine.line_code}行` : ''}。`
    }
    const account = await db.prepare(
      `SELECT account_code, account_name, ending_debit, ending_credit, f.file_name
       FROM tax_data_account_balances a
       LEFT JOIN tax_data_source_files f ON f.id = a.source_file_id AND f.owner_user_id = a.owner_user_id
       WHERE a.owner_user_id = ? AND a.client_id = ? AND a.period_end >= ? AND a.period_start <= ?
         AND (TRIM(a.account_name) = ? OR a.account_name LIKE ?)
       ORDER BY CASE WHEN TRIM(a.account_name) = ? THEN 0 ELSE 1 END, a.account_code LIMIT 1`,
    ).bind(auth.user.id, client.id, period.start, period.end, requestedMetric, `%${requestedMetric}%`, requestedMetric).first()
    if (account) {
      const debit = metricAmount(account.ending_debit)
      const credit = metricAmount(account.ending_credit)
      return `${client.name}${period.label}科目“${account.account_name}”期末余额：借方${debit === null ? '为空' : `${debit.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元`}，贷方${credit === null ? '为空' : `${credit.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元`}。来源：${account.file_name || '科目余额表'}${account.account_code ? `，科目编码 ${account.account_code}` : ''}。`
    }
    return `目前在${client.name}${period.label}的标准档案中没有找到项目“${requestedMetric}”。请确认项目名称，或检查该期间对应报表是否已收录。`
  }
  if (!/销售额/.test(text)) return ''
  const result = await db.prepare(
    `SELECT r.record_type, r.record_subtype, r.record_json, f.file_name
     FROM tax_data_standard_records r
     LEFT JOIN tax_data_source_files f ON f.id = r.source_file_id AND f.owner_user_id = r.owner_user_id
     WHERE r.owner_user_id = ? AND r.client_id = ?
       AND COALESCE(r.period_end, r.period_start, '') >= ?
       AND COALESCE(r.period_start, r.period_end, '') <= ?
     LIMIT 1000`,
  ).bind(auth.user.id, client.id, period.start, period.end).all()
  const records = (result.results || []).map((row) => ({ ...row, data: cleanToolArguments(row.record_json) }))
  const vat = records.find((row) => row.record_type === 'vat_return' && String(recordValue(row.data, 'rowNo', 'row_no')).match(/^1(?:\D|$)/))
  const vatAmount = metricAmount(recordValue(vat?.data, 'currentAmount', 'current_amount'))
  if (vat && vatAmount !== null) {
    return `${client.name}${period.label}增值税申报表口径销售额为 ${vatAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元。来源：${vat.file_name || '增值税申报表主表'}。`
  }
  const income = records.find((row) => row.record_type === 'financial_statement' && row.record_subtype === 'income_statement' && /营业收入/.test(String(recordValue(row.data, 'lineName', 'line_name'))))
  const incomeAmount = metricAmount(recordValue(income?.data, 'currentAmount', 'current_amount'))
  if (income && incomeAmount !== null) {
    return `${client.name}${period.label}利润表本期营业收入为 ${incomeAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元。来源：${income.file_name || '利润表'}。`
  }
  const statement = await db.prepare(
    `SELECT s.id, f.file_name
     FROM tax_data_financial_statements s
     LEFT JOIN tax_data_source_files f ON f.id = s.source_file_id AND f.owner_user_id = s.owner_user_id
     WHERE s.owner_user_id = ? AND s.client_id = ? AND s.statement_type = 'income_statement'
       AND COALESCE(s.period_end, s.period_start, '') >= ?
       AND COALESCE(s.period_start, s.period_end, '') <= ?
     LIMIT 1`,
  ).bind(auth.user.id, client.id, period.start, period.end).first()
  if (statement) {
    const line = await db.prepare(
      `SELECT current_amount, cumulative_amount FROM tax_data_financial_statement_lines
       WHERE statement_id = ? AND line_name LIKE '%营业收入%' LIMIT 1`,
    ).bind(statement.id).first()
    const current = metricAmount(line?.current_amount)
    const cumulative = metricAmount(line?.cumulative_amount)
    if (current !== null) return `${client.name}${period.label}利润表本期营业收入为 ${current.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元。来源：${statement.file_name || '利润表'}。`
    return `${client.name}${period.label}的利润表已经收录，但“本期营业收入”为空${cumulative !== null ? `，表内“本年累计营业收入”为 ${cumulative.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元` : ''}。因此目前不能确认3月单月销售额；累计数不能直接当作当月数。`
  }
  return `目前无法从标准档案确认${client.name}${period.label}的销售额。该期间未收录可提供当月销售额的增值税申报表主表或利润表本期营业收入；我不会用累计数或其他月份数据代替。`
}

function isBusinessWriteRequest(message) {
  return /(录入|导入|入库|保存|创建|新建|修改|更正|更新|删除|替换|调整).{0,16}(数据|资料|档案|企业|期间|记录|报告)?/.test(String(message || '').replace(/\s+/g, ''))
}

function conversationalSystemPrompt(client, assistantContext) {
  return `你是嵌入税务合规软件的中文 AI 助手。请像正常专业助手一样自然、直接地对话。
当前会话只对应一家企业：${client.name}（clientId: ${client.id}）。“我公司/我们公司”均指该企业。
企业业务事实必须通过只读工具查询，不得猜测。连续追问要继承历史中的指标和语境，例如上一句问销售额，下一句“2026年3月呢”仍指销售额。
你可以调用软件提供的只读查询工具，但不能修改代码、规则、公式、数据库结构、认证或权限。
只有用户明确要求业务写入时才进入业务动作流程；普通对话不要输出 JSON，不要描述内部约束，不要回复无关的“初步分析”。
线程/企业上下文：${JSON.stringify(assistantContext || {})}`
}

function normalizeImageInputs(images) {
  return (Array.isArray(images) ? images : []).filter((item) => (
    typeof item === 'string' && /^data:image\/(?:png|jpeg|webp);base64,/i.test(item) && item.length <= 8_000_000
  )).slice(0, 4)
}

async function analyzeImages(env, images, prompt) {
  const apiKey = env.QWEN_API_KEY || env.DASHSCOPE_API_KEY || env.VISION_API_KEY
  const apiUrl = env.VISION_API_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
  const model = env.VISION_MODEL || 'qwen-vl-max-latest'
  if (!apiKey) throw new Error('截图粘贴已启用，但视觉模型尚未配置。请配置 QWEN_API_KEY（或 DASHSCOPE_API_KEY）后使用截图对话。')
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: [
          ...images.map((image) => ({ type: 'image_url', image_url: { url: image } })),
          { type: 'text', text: `请准确识别截图中的界面、文字、数字和异常，不要推测看不清的内容。用户问题：${prompt || '请说明截图内容。'}` },
        ],
      }],
      temperature: 0.1,
      max_tokens: 1800,
    }),
  })
  if (!response.ok) throw new Error(`视觉模型请求失败：${(await response.text()).slice(0, 300)}`)
  const data = await response.json()
  const content = String(data?.choices?.[0]?.message?.content || '').trim()
  if (!content) throw new Error('视觉模型没有返回可用的截图识别结果。')
  return { content, model }
}

async function runConversationalAssistant({ env, db, auth, model, client, message, history, assistantContext, reasoning, images = [] }) {
  const vision = images.length ? await analyzeImages(env, images, message) : null
  const userContent = vision
    ? `${message || '请查看这些截图并结合当前企业上下文回答。'}\n\n[视觉模型 ${vision.model} 的截图识别结果]\n${vision.content}`
    : message
  const messages = [
    { role: 'system', content: `${conversationalSystemPrompt(client, assistantContext)}\nWhen the user asks what accounts exist in an account balance table, how many account categories there are, or requests those accounts in a table, call get_account_balance_accounts for the period inherited from the conversation. Present returned facts directly. Do not replace this request with a tax-archive completeness summary.` },
    ...history.slice(-30).map((item) => ({ role: item.role, content: item.content })),
    { role: 'user', content: userContent },
  ]
  let response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, tools: readOnlyAgentTools, tool_choice: 'auto', temperature: 0.35, max_tokens: 1800, ...reasoning }),
  })
  if (!response.ok) throw new Error(`Conversational AI request failed: ${(await response.text()).slice(0, 300)}`)
  let data = await response.json()
  const assistantMessage = data?.choices?.[0]?.message || {}
  if (Array.isArray(assistantMessage.tool_calls) && assistantMessage.tool_calls.length) {
    messages.push({ role: 'assistant', content: assistantMessage.content || '', tool_calls: assistantMessage.tool_calls })
    for (const toolCall of assistantMessage.tool_calls.slice(0, 6)) {
      const result = await executeReadOnlyAgentTool(db, auth, toolCall, client.id)
      messages.push({ role: 'tool', tool_call_id: toolCall.id, name: toolCall.function?.name, content: JSON.stringify(result) })
    }
    response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, tools: readOnlyAgentTools, tool_choice: 'none', temperature: 0.25, max_tokens: 1800, ...reasoning }),
    })
    if (!response.ok) throw new Error(`Conversational AI follow-up failed: ${(await response.text()).slice(0, 300)}`)
    data = await response.json()
  }
  const answer = String(data?.choices?.[0]?.message?.content || '').trim()
  if (!answer) throw new Error('Conversational AI returned an empty answer')
  return { answer, usage: data.usage || null }
}

function compactRisk(risk) {
  return {
    name: risk?.name,
    level: risk?.level,
    taxType: risk?.taxType,
    reason: typeof risk?.reason === 'string' ? risk.reason : '',
    suggestion: risk?.suggestion,
    materials: risk?.materials,
  }
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

function normalizeSuggestions(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 20).map((item) => ({
    target: String(item?.target || 'periodEntry').slice(0, 40),
    field: String(item?.field || '').slice(0, 80),
    label: String(item?.label || item?.field || '').slice(0, 80),
    value: item?.value ?? '',
    confidence: String(item?.confidence || 'medium').slice(0, 20),
    source: String(item?.source || '').slice(0, 160),
    note: String(item?.note || '').slice(0, 240),
  })).filter((item) => item.field)
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 10)
    : []
}

const allowedDraftPatchFields = new Set([
  'name',
  'creditCode',
  'region',
  'industry',
  'taxpayerType',
  'establishedAt',
  'analysisPeriodType',
  'analysisYear',
  'analysisQuarter',
  'analysisMonth',
  'periodStartDate',
  'periodEndDate',
  'dataBasis',
  'monthlyRevenue',
  'monthlyCost',
  'monthlyProfit',
  'mainBusinessRevenue',
  'mainBusinessCost',
  'ytdRevenue',
  'ytdCostExpense',
  'ytdProfit',
  'outputTax',
  'inputTax',
  'assetsTotal',
  'payrollTotal',
  'employees',
  'socialSecurityCount',
  'salaryDeclaredCount',
  'entertainmentExpense',
  'otherReceivableAgencyBalance',
])

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

function normalizeDraftPatch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([field]) => allowedDraftPatchFields.has(field)))
}

function normalizeMissingFields(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 12).map((item) => ({
    field: String(item?.field || '').slice(0, 80),
    label: String(item?.label || item?.field || '').slice(0, 80),
    question: String(item?.question || '').slice(0, 200),
  })).filter((item) => item.field || item.label || item.question)
}

function normalizeToolCalls(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 8).map((item) => ({
    name: String(item?.name || '').slice(0, 80),
    arguments: item?.arguments && typeof item.arguments === 'object' && !Array.isArray(item.arguments)
      ? item.arguments
      : {},
    reason: String(item?.reason || '').slice(0, 200),
    requiresConfirmation: item?.requiresConfirmation !== false,
  })).filter((item) => allowedToolNames.has(item.name))
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: String(item?.content || '').trim().slice(0, 2000),
    }))
    .filter((item) => item.content)
    .slice(-10)
}

function normalizeAssistantContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return {
    activeThread: value.activeThread || null,
    currentDraft: value.currentDraft || null,
    latestMaterialSummary: value.latestMaterialSummary || null,
    filingChecklist: value.filingChecklist || null,
    taxDataArchive: value.taxDataArchive || null,
    workflowState: value.workflowState || null,
  }
}

function reasoningConfig(message) {
  const needsDeepReasoning = /(分析|风险|原因|测算|计算|报告|方案|建议|判断|解释|整改|筹划)/.test(message)
  return needsDeepReasoning
    ? { thinking: { type: 'enabled' }, reasoning_effort: 'high' }
    : { thinking: { type: 'disabled' }, reasoning_effort: 'low' }
}

function buildPrompt({ message, history, client, clientVerified, risks, report, assistantContext }) {
  return `You are an AI tax workbench assistant embedded in a Chinese tax risk checking product.

Software capabilities you may use as skills:
- create_cleaning_draft: create a cleaning draft from user-provided client/material data.
- update_cleaning_draft: update the current cleaning draft with confirmed facts from the user.
- save_cleaning_draft: persist the cleaned draft and field mapping as business working data.
- create_or_update_company: create or update the business client profile after clear user authorization.
- save_period_data: save identified period data after clear user authorization.
- attach_source_material: attach uploaded source material metadata to the import workflow.
- save_customer_memory: save stable customer memory such as accounting software, recurring file format, confirmed field mapping, default taxpayer facts, or recurring missing materials.
- create_import_audit_log: record what the assistant imported, from which materials, and why.
- save_standardized_tax_data: save cleaned material data into the standard intake layer for source files, periods, financial statements, account balances, ledgers, VAT returns, invoice data, payroll, IIT, evidence fields, and unresolved conflicts.
- save_current_draft: compatibility tool that saves the current cleaning draft into the tax product. This is allowed after the user clearly asks to save/import/confirm in natural language, for example "帮我导入吧", "确认保存", "可以入库", or "就按这个保存".
- ask_missing_fields: ask the user for missing fields needed for better tax checking.
- run_basic_compliance: ask the host app to run deterministic basic compliance checks from filing-style data, financial statements, invoice/payroll inputs, and saved client facts.
- run_risk_detection: ask the host app to run deterministic professional risk detection. The host rule engine is the source of truth.
- generate_report: ask the host app to generate a report from saved period data and selected continuous periods. Use only when the user clearly asks to generate a report.
- explain_current_report: explain the current report, risk findings, basis, materials needed, and next steps. Do not invent missing report facts.

Software data model:
- client profile fields: name, creditCode, region, industry, taxpayerType, establishedAt.
- period fields: analysisPeriodType, analysisYear, analysisQuarter, analysisMonth, periodStartDate, periodEndDate, dataBasis.
- financial fields: monthlyRevenue, monthlyCost, monthlyProfit, mainBusinessRevenue, mainBusinessCost, ytdRevenue, ytdCostExpense, ytdProfit, outputTax, inputTax, assetsTotal, payrollTotal, employees, socialSecurityCount, salaryDeclaredCount, entertainmentExpense, otherReceivableAgencyBalance.
- filing checklist groups: business license/basic profile, VAT filing, CIT filing, financial statements, invoice summary, payroll/social security/IIT, and supplementary ledgers.
- standard intake categories: business_license, financial_statement, account_balance, ledger, vat_return, vat_return_schedule, invoice_list, payroll, iit_withholding, social_security, housing_fund, bank_statement, contract, voucher, other_material.

Permission boundaries:
- You have read-only tools for the standard tax archive, source files, and Agent knowledge. Use them instead of guessing from a compressed summary.
- You may write business data only through allowed host tools: client profiles, source-material records, cleaned drafts, standardized tax data, period data, report drafts, customer memory, and import logs.
- You must treat the rule library as read-only. You cannot create, update, delete, enable, disable, or rewrite tax rules, risk rules, rule formulas, report-template logic, users, auth, database schema, or code.
- You cannot delete data. If data overwrite may happen, explain what will be overwritten and ask for explicit natural-language authorization.
- Do not invent UI buttons. On this AI assistant page, the user can send messages, upload files, and drag Excel into the chat.

Rules:
1. Answer in Chinese.
2. You are the main conversational assistant. Treat the tax product context as your knowledge base and skill context.
3. Do not claim that a tax conclusion is final.
4. Do not add or remove rule-engine findings. Treat risk findings as system facts.
5. Do not say data has been saved unless you return an authorized business-write tool call after clear user authorization. The host app validates, writes business data, and audits the operation.
6. If the user pasted financial data, extract it into structured suggestions.
6a. Uploaded Excel values in latestMaterialSummary and currentDraft have already been structurally parsed by the host. Treat mapped amounts as evidence-backed candidates, preserve blank cells as missing, and never substitute row numbers, account codes, opening balances, or unrelated balance-sheet values for missing amounts.
6b. Do not equate bank-account balances with collection flow, or employee-compensation liabilities/cash payments with payroll expense. Ask for the corresponding bank transaction summary, payroll ledger, IIT filing, or explicit user confirmation when those fields are missing.
6c. Preserve period semantics exactly. "本年累计利润" is ytdProfit and must never be written to monthlyProfit; cumulative revenue/cost must never be written to monthlyRevenue/monthlyCost. If the source does not state a monthly amount, leave the monthly field missing.
6d. When currentDraft belongs to a different company from the previously selected client, use currentDraft as the only business-data context. Never copy figures, risks, or report facts across companies.
6e. currentDraft.confirmationQuestions contains deterministic questions raised by the host parser. Ask the unresolved questions directly, accept concise customer answers such as "是 3-6 月" or "这是进项发票", and never invent an answer. Confirmed answers may update the cleaning draft; unresolved items must remain pending_confirmation rather than being treated as final data.
6f. assistantContext.taxDataArchive is the source of truth for whether a standard tax material exists in the selected period. Never claim that a category in collectedCategories is missing. Do not use another month to fill the selected period. If taxDataArchive conflicts with the legacy filingChecklist or sparse client profile fields, follow taxDataArchive and explain the period scope.
6g. Before answering whether an uploaded file, financial statement, tax return, payroll, ledger, or invoice list exists or is missing, call get_tax_archive and/or get_source_files. A workbook may contain several statements. Never infer workbook contents from its file name alone.
6h. If the user names several materials, answer each one explicitly as 已收录, 未收录, or 待确认, with its period and source file when available. Do not collapse 资产负债表、利润表、现金流量表 into the vague phrase 财务报表.
7. This page has no "保存" or "提交" button. Never tell the user to click a save/submit button on this AI assistant page.
8. When suggesting that cleaned data should enter the system, tell the user they can reply "帮我导入吧" or "确认保存"; do not tell them to click a button.
9. If the current client is not verified in the database, say you can still analyze the pasted content and temporary page context, and can create or update business data after the user clearly authorizes it in the conversation.
10. Keep the product workflow in two layers: basic filing-compliance checks first, then professional hidden-risk analysis and report interpretation.
11. Never calculate tax exposure freely. If exposure is not provided by deterministic host rules, say it needs rule-based measurement or accountant confirmation.
12. If the user has clearly authorized saving/importing in the current message, include create_or_update_company and/or save_standardized_tax_data and/or save_period_data tool calls, plus create_import_audit_log. You may also include save_current_draft for compatibility. Set requiresConfirmation to false.
13. Return strict JSON only, no Markdown.
14. Keep the JSON concise and complete: answer <= 300 Chinese characters, missingFields <= 8, toolCalls <= 5, suggestions <= 8, and followUps <= 6. Never leave the JSON unfinished.

JSON shape:
{
  "answer": "short user-facing answer",
  "draftPatch": {
    "name": "optional cleaned company name",
    "analysisYear": "optional year",
    "analysisMonth": "optional month",
    "monthlyRevenue": "optional monthly amount",
    "ytdProfit": "optional year-to-date profit",
    "entertainmentExpense": "optional entertainment expense"
  },
  "missingFields": [
    {
      "field": "system field name",
      "label": "Chinese label",
      "question": "question to ask the user"
    }
  ],
  "toolCalls": [
    {
      "name": "create_cleaning_draft | update_cleaning_draft | save_cleaning_draft | create_or_update_company | save_period_data | attach_source_material | save_customer_memory | create_import_audit_log | save_standardized_tax_data | save_current_draft | ask_missing_fields | run_basic_compliance | run_risk_detection | generate_report | explain_current_report",
      "arguments": {},
      "reason": "why this tool should run",
      "requiresConfirmation": true
    }
  ],
  "suggestions": [
    {
      "target": "clientProfile | periodEntry | reportDraft | followUp",
      "field": "system field name when possible",
      "label": "Chinese field label",
      "value": "draft value",
      "confidence": "high | medium | low",
      "source": "where the value came from",
      "note": "what user should verify"
    }
  ],
  "followUps": ["questions or materials to ask from the client"]
}

Conversation history:
${JSON.stringify(history, null, 2)}

Current client:
${JSON.stringify({ verifiedInDatabase: clientVerified, ...compactClient(client) }, null, 2)}

Assistant workspace context:
${JSON.stringify(assistantContext, null, 2)}

Risk findings:
${JSON.stringify((risks || []).slice(0, 20).map(compactRisk), null, 2)}

Current report summary:
${JSON.stringify({
    riskLevel: report?.riskLevel,
    aiGenerated: report?.aiGenerated,
    hasAiReview: Boolean(report?.aiReview),
  }, null, 2)}

User message:
${message}`
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DEEPSEEK_API_KEY) {
      return json({ error: 'AI model is not configured' }, { status: 503 })
    }

    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response

    const { message = '', history = [], client = null, risks = [], report = null, assistantContext = null, images = [] } = await readJson(request)
    const cleanMessage = String(message || '').trim()
    const cleanHistory = normalizeHistory(history)
    const cleanAssistantContext = normalizeAssistantContext(assistantContext)
    const cleanImages = normalizeImageInputs(images)
    if (!cleanMessage) return badRequest('Message is required')
    if (!client?.id || !client?.name) return badRequest('Client id and name are required')

    const ownedClient = await db
      .prepare('SELECT id, name FROM clients WHERE id = ? AND owner_user_id = ?')
      .bind(client.id, auth.user.id)
      .first()
    const clientVerified = Boolean(ownedClient)

    if (ownedClient && !cleanImages.length) {
      const deterministicAnswer = await deterministicBusinessAnswer(db, auth, ownedClient, cleanMessage)
      if (deterministicAnswer) {
        return json({
          answer: deterministicAnswer,
          draftPatch: {},
          missingFields: [],
          toolCalls: [],
          suggestions: [],
          followUps: [],
          clientVerified: true,
          model: 'deterministic-archive-query',
          usage: null,
        })
      }
    }

    const model = env.DEEPSEEK_MODEL || DEFAULT_MODEL
    const reasoning = reasoningConfig(cleanMessage)
    if (ownedClient && !isBusinessWriteRequest(cleanMessage)) {
      const conversational = await runConversationalAssistant({
        env, db, auth, model, client: ownedClient, message: cleanMessage,
        history: cleanHistory, assistantContext: cleanAssistantContext, reasoning, images: cleanImages,
      })
      return json({
        answer: conversational.answer,
        draftPatch: {}, missingFields: [], toolCalls: [], suggestions: [], followUps: [],
        clientVerified: true, model, usage: conversational.usage,
      })
    }
    const messages = [
      {
        role: 'system',
        content: 'You are a careful Chinese tax workbench Agent. Use read-only tools for business facts. Return strict JSON only after tool results are available.',
      },
      {
        role: 'user',
        content: buildPrompt({
          message: cleanMessage,
          history: cleanHistory,
          client,
          clientVerified,
          risks,
          report,
          assistantContext: cleanAssistantContext,
        }),
      },
    ]
    let response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        tools: readOnlyAgentTools,
        tool_choice: 'auto',
        temperature: 0.2,
        max_tokens: 3200,
        response_format: { type: 'json_object' },
        ...reasoning,
      }),
    })

    if (!response.ok) {
      const detail = await response.text()
      return json(
        {
          error: 'AI assistant request failed',
          detail: detail.slice(0, 500),
        },
        { status: 502 },
      )
    }

    let data = await response.json()
    const firstMessage = data?.choices?.[0]?.message || {}
    if (Array.isArray(firstMessage.tool_calls) && firstMessage.tool_calls.length) {
      messages.push({
        role: 'assistant',
        content: firstMessage.content || '',
        tool_calls: firstMessage.tool_calls,
      })
      for (const toolCall of firstMessage.tool_calls.slice(0, 6)) {
        const result = await executeReadOnlyAgentTool(db, auth, toolCall, client.id)
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolCall.function?.name,
          content: JSON.stringify(result),
        })
      }
      response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          tools: readOnlyAgentTools,
          tool_choice: 'none',
          temperature: 0.2,
          max_tokens: 3200,
          response_format: { type: 'json_object' },
          ...reasoning,
        }),
      })
      if (!response.ok) {
        const detail = await response.text()
        return json({ error: 'AI assistant tool follow-up failed', detail: detail.slice(0, 500) }, { status: 502 })
      }
      data = await response.json()
    }
    const content = data?.choices?.[0]?.message?.content?.trim() || ''
    let parsed = parseJsonObject(content)
    if (!parsed && content) {
      const repairResponse = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'Repair the supplied output into one complete strict JSON object. Preserve facts and field semantics. Return JSON only, without Markdown.',
            },
            {
              role: 'user',
              content: `The previous assistant output was incomplete or invalid. Rebuild it using the required keys answer, draftPatch, missingFields, toolCalls, suggestions, and followUps. Keep answer under 300 Chinese characters and each array under 8 items.\n\nPrevious output:\n${content.slice(0, 12000)}`,
            },
          ],
          temperature: 0,
          max_tokens: 2400,
          response_format: { type: 'json_object' },
        }),
      })
      if (repairResponse.ok) {
        const repairData = await repairResponse.json()
        parsed = parseJsonObject(repairData?.choices?.[0]?.message?.content?.trim() || '')
      }
    }
    if (!parsed) {
      return json({ error: 'AI assistant returned invalid JSON' }, { status: 502 })
    }

    return json({
      answer: String(parsed.answer || '').trim() || '我已完成初步分析，请查看下方建议。',
      draftPatch: normalizeDraftPatch(parsed.draftPatch),
      missingFields: normalizeMissingFields(parsed.missingFields),
      toolCalls: normalizeToolCalls(parsed.toolCalls),
      suggestions: normalizeSuggestions(parsed.suggestions),
      followUps: normalizeStringArray(parsed.followUps),
      clientVerified,
      model,
      usage: data.usage || null,
    })
  } catch (error) {
    return serverError(error)
  }
}
