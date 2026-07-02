import { badRequest, json, readJson, requireDb, serverError } from '../_utils.js'
import { requireUser } from '../auth/_auth.js'

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions'
const DEFAULT_MODEL = 'deepseek-v4-flash'

function compactRisk(risk) {
  return {
    order: risk.displayOrder || 0,
    name: risk.name,
    level: risk.level,
    taxType: risk.taxType,
    reason: typeof risk.reason === 'string' ? risk.reason : '',
    priority: risk.priority || '',
    basis: risk.basis,
    suggestion: risk.suggestion,
    materials: risk.materials,
  }
}

function calculateEstablishmentFacts(client, now = new Date()) {
  const establishedAt = client?.establishedAt ? new Date(`${client.establishedAt}T00:00:00Z`) : null
  if (!establishedAt || Number.isNaN(establishedAt.getTime())) {
    return {
      asOfDate: now.toISOString().slice(0, 10),
      establishedAt: client?.establishedAt || '',
      monthsSinceEstablished: null,
      isEstablishedLessThan12Months: null,
    }
  }

  let months = (now.getUTCFullYear() - establishedAt.getUTCFullYear()) * 12
    + (now.getUTCMonth() - establishedAt.getUTCMonth())
  if (now.getUTCDate() < establishedAt.getUTCDate()) {
    months -= 1
  }

  return {
    asOfDate: now.toISOString().slice(0, 10),
    establishedAt: client.establishedAt,
    monthsSinceEstablished: Math.max(months, 0),
    isEstablishedLessThan12Months: months < 12,
  }
}

function removeFalseShortEstablishmentClaims(content, establishmentFacts) {
  if (establishmentFacts.monthsSinceEstablished === null || establishmentFacts.monthsSinceEstablished < 12) {
    return content
  }

  return content
    .replace(/[^。！？\n]*(成立|成立时间)[^。！？\n]*(不足|不满)\s*(12|十二|一)\s*(个?月|年)[^。！？\n]*[。！？]?/g, '')
    .replace(/[^。！？\n]*(不足|不满)\s*(12|十二)\s*个?月[^。！？\n]*(成立|成立时间)[^。！？\n]*[。！？]?/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function removeInternalReportArtifacts(content) {
  return String(content || '')
    .replace(/[（(]\s*Issue\s+[A-Z-]*\d+\s*[)）]/gi, '')
    .replace(/\bIssue\s+[A-Z-]*\d+\b/gi, '风险事项')
    .replace(/\b(issueId|code)\s*[:：=]\s*[A-Z-]*\d+\b/gi, '')
    .replace(/\b[a-z][A-Za-z0-9_]*(?:\s*[=!<>]=?\s*(?:true|false|\d+(?:\.\d+)?|'[^']*'|"[^"]*"))/g, '相关规则条件')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function buildPrompt(client, risks, content, aiReview, establishmentFacts, structuredReport) {
  return `请基于以下企业税务风险体检资料，重写一份专业、清晰、适合企业管理层和财务负责人阅读的税务风险体检报告。

要求：
1. 只能基于输入资料分析，不要编造不存在的数据、政策或案例。
2. 已命中风险事项只能来自“风险事项”列表，不得新增未命中的风险，不得删除已命中的风险。
3. AI 数据复核中发现的疑点，只能写入“数据复核提示”或“观察项”，不能写成已命中风险。
4. 保留风险提示性质，不要承诺最终税务处理结论。
5. 输出中文纯文本，不要使用 Markdown 代码块。
6. 结构包含：企业基本情况、综合风险结论、资料完整性说明、AI 数据复核提示、分税种风险摘要、重点风险事项、风险明细与整改建议、整改优先级、建议补充资料、免责声明。
7. 语气专业、审慎、可执行。
8. 企业成立时长必须以“系统计算事实”为准，不得自行推断。
9. 只有当 isEstablishedLessThan12Months 为 true 时，才允许写“成立不足 12 个月 / 成立不足一年 / 不满 12 个月”等表述。
10. 如果 isEstablishedLessThan12Months 为 false，禁止出现任何“成立不足 12 个月”或同义表述。
11. 每个风险事项必须保留风险等级、涉及税种、触发原因、建议补充资料和整改建议。
12. 面向客户的报告中禁止输出内部规则编号、issueId、code、内部字段名或类似“smallProfitEnjoyed=true”的条件表达式。

企业资料：
${JSON.stringify(client, null, 2)}

系统计算事实：
${JSON.stringify(establishmentFacts, null, 2)}

风险事项：
${JSON.stringify(risks.map(compactRisk), null, 2)}

AI 数据复核：
${JSON.stringify(aiReview || {}, null, 2)}

Structured professional report object. Follow this structure first; polish wording only. Do not add, remove, or change findings, risk levels, recommendations, scope, or disclaimers:
${JSON.stringify(structuredReport || {}, null, 2)}

原始报告：
${content || ''}`
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DEEPSEEK_API_KEY) {
      return json({ error: 'DeepSeek API key is not configured' }, { status: 503 })
    }

    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response

    const { client, risks = [], content = '', aiReview = null, structuredReport = null } = await readJson(request)
    if (!client?.id || !client?.name) {
      return badRequest('Client id and name are required')
    }

    const ownedClient = await db
      .prepare('SELECT id FROM clients WHERE id = ? AND owner_user_id = ?')
      .bind(client.id, auth.user.id)
      .first()
    if (!ownedClient) {
      return json({ error: 'Client not found' }, { status: 404 })
    }

    const establishmentFacts = calculateEstablishmentFacts(client)
    const model = env.DEEPSEEK_MODEL || DEFAULT_MODEL
    const response = await fetch(DEEPSEEK_API_URL, {
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
            content: '你是一名严谨的中国企业税务风险管理顾问，擅长把规则命中的风险转化为可复核、可整改的报告。涉及日期、期间、成立时长时，必须服从系统计算事实。',
          },
          {
            role: 'user',
            content: buildPrompt(client, risks, content, aiReview, establishmentFacts, structuredReport),
          },
        ],
        temperature: 0.2,
        max_tokens: 5000,
      }),
    })

    if (!response.ok) {
      const detail = await response.text()
      return json(
        {
          error: 'DeepSeek request failed',
          detail: detail.slice(0, 500),
        },
        { status: 502 },
      )
    }

    const data = await response.json()
    const enhancedContent = removeInternalReportArtifacts(removeFalseShortEstablishmentClaims(
      data?.choices?.[0]?.message?.content?.trim() || '',
      establishmentFacts,
    ))
    if (!enhancedContent) {
      return json({ error: 'DeepSeek returned empty content' }, { status: 502 })
    }

    return json({
      content: enhancedContent,
      model,
      usage: data.usage || null,
    })
  } catch (error) {
    return serverError(error)
  }
}
