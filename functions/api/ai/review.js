import { badRequest, json, readJson, requireDb, serverError } from '../_utils.js'
import { requireUser } from '../auth/_auth.js'

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions'
const DEFAULT_MODEL = 'deepseek-v4-flash'

function compactRisk(risk) {
  return {
    code: risk.code,
    name: risk.name,
    level: risk.level,
    taxType: risk.taxType,
    basis: risk.basis,
    suggestion: risk.suggestion,
    materials: risk.materials,
  }
}

function buildPrompt(client, risks) {
  return `请复核以下企业输入数据与规则引擎检测结果的合理性。

重要边界：
1. 规则引擎已命中的风险就是“已命中风险”，你不得新增、删除或覆盖命中结论。
2. 如果发现数据异常、字段冲突、接近阈值、需要复核，只能写入提示项，不能写成已命中风险。
3. 如果规则未触发，不要把它表述为已触发；只能说“建议复核”或“观察项”。
4. 输出必须是严格 JSON，不要 Markdown，不要解释 JSON 之外的内容。

JSON 格式：
{
  "dataQualityWarnings": ["输入数据疑点，每条一句"],
  "nearThresholdWarnings": ["接近阈值或边界状态提醒，每条一句"],
  "riskReviewNotes": ["对已命中规则的复核解释，每条一句"]
}

企业输入数据：
${JSON.stringify(client, null, 2)}

规则引擎已命中风险：
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
            content: '你是企业税务风控数据复核助手，只能复核输入数据和解释规则引擎结果，不得新增或删除风险命中结论。',
          },
          {
            role: 'user',
            content: buildPrompt(client, risks),
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

    return json({
      review: {
        dataQualityWarnings: normalizeStringArray(parsed.dataQualityWarnings),
        nearThresholdWarnings: normalizeStringArray(parsed.nearThresholdWarnings),
        riskReviewNotes: normalizeStringArray(parsed.riskReviewNotes),
      },
      model,
      usage: data.usage || null,
    })
  } catch (error) {
    return serverError(error)
  }
}
