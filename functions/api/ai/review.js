import { badRequest, json, readJson, requireDb, serverError } from '../_utils.js'
import { requireUser } from '../auth/_auth.js'

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions'
const DEFAULT_MODEL = 'deepseek-v4-pro'

function compactRisk(risk) {
  return {
    order: risk.displayOrder || 0,
    name: risk.name,
    level: risk.level,
    taxType: risk.taxType,
    reason: risk.reason || '',
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

function hasFalseShortEstablishmentClaim(text, establishmentFacts) {
  if (establishmentFacts.monthsSinceEstablished === null || establishmentFacts.monthsSinceEstablished < 12) {
    return false
  }
  return /成立[^。！？\n]*(不足|不满)\s*(12|十二|一)\s*(个?月|年)/.test(text)
    || /(不足|不满)\s*(12|十二)\s*个?月[^。！？\n]*成立/.test(text)
}

function sanitizeReview(review, establishmentFacts) {
  const clean = (item) => String(item || '')
    .replace(/[（(]\s*Issue\s+[A-Z-]*\d+\s*[)）]/gi, '')
    .replace(/\bIssue\s+[A-Z-]*\d+\b/gi, '风险事项')
    .replace(/\b(issueId|code)\s*[:：=]\s*[A-Z-]*\d+\b/gi, '')
    .replace(/\b[a-z][A-Za-z0-9_]*(?:\s*[=!<>]=?\s*(?:true|false|\d+(?:\.\d+)?|'[^']*'|"[^"]*"))/g, '相关规则条件')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  return {
    dataQualityWarnings: review.dataQualityWarnings.filter((item) => !hasFalseShortEstablishmentClaim(item, establishmentFacts)).map(clean).filter(Boolean),
    nearThresholdWarnings: review.nearThresholdWarnings.filter((item) => !hasFalseShortEstablishmentClaim(item, establishmentFacts)).map(clean).filter(Boolean),
    riskReviewNotes: review.riskReviewNotes.filter((item) => !hasFalseShortEstablishmentClaim(item, establishmentFacts)).map(clean).filter(Boolean),
  }
}

function buildPrompt(client, risks, establishmentFacts) {
  return `请复核以下企业输入数据与规则引擎检测结果的合理性。

重要边界：
1. 规则引擎已命中的风险就是“已命中风险”，你不得新增、删除或覆盖命中结论。
2. 如果发现数据异常、字段冲突、接近阈值、需要复核，只能写入提示项，不能写成已命中风险。
3. 如果规则未触发，不要把它表述为已触发；只能说“建议复核”或“观察项”。
4. 企业成立时长必须以“系统计算事实”为准，不得自行推断。
5. 只有当 isEstablishedLessThan12Months 为 true 时，才允许写“成立不足 12 个月 / 成立不足一年 / 不满 12 个月”等表述。
6. 如果 isEstablishedLessThan12Months 为 false，禁止出现任何“成立不足 12 个月”或同义表述。
7. 输出必须是严格 JSON，不要 Markdown，不要解释 JSON 之外的内容。
8. 禁止输出内部规则编号、issueId、code、内部字段名或类似“smallProfitEnjoyed=true”的条件表达式。

JSON 格式：
{
  "dataQualityWarnings": ["输入数据疑点，每条一句"],
  "nearThresholdWarnings": ["接近阈值或边界状态提醒，每条一句"],
  "riskReviewNotes": ["对已命中规则的复核解释，每条一句"]
}

系统计算事实：
${JSON.stringify(establishmentFacts, null, 2)}

企业输入数据：
${JSON.stringify(client, null, 2)}

规则引擎已命中风险事项：
${JSON.stringify(risks.map(compactRisk), null, 2)}`
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 10)
    : []
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DEEPSEEK_API_KEY) {
      return json({ error: 'DeepSeek API key is not configured' }, { status: 503 })
    }

    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response

    const { client, risks = [] } = await readJson(request)
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
            content: '你是企业税务风控数据复核助手，只能复核输入数据和解释规则引擎结果，不得新增或删除风险命中结论。涉及日期、期间、成立时长时，必须服从系统计算事实。',
          },
          {
            role: 'user',
            content: buildPrompt(client, risks, establishmentFacts),
          },
        ],
        temperature: 0.1,
        max_tokens: 1800,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      const detail = await response.text()
      return json(
        {
          error: 'DeepSeek review request failed',
          detail: detail.slice(0, 500),
        },
        { status: 502 },
      )
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content?.trim() || ''
    const parsed = parseJsonObject(content)
    if (!parsed) {
      return json({ error: 'DeepSeek returned invalid review JSON' }, { status: 502 })
    }

    const review = sanitizeReview({
      dataQualityWarnings: normalizeStringArray(parsed.dataQualityWarnings),
      nearThresholdWarnings: normalizeStringArray(parsed.nearThresholdWarnings),
      riskReviewNotes: normalizeStringArray(parsed.riskReviewNotes),
    }, establishmentFacts)

    return json({
      review,
      model,
      usage: data.usage || null,
    })
  } catch (error) {
    return serverError(error)
  }
}
