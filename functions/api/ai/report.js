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
    reason: typeof risk.reason === 'string' ? risk.reason : '',
    basis: risk.basis,
    suggestion: risk.suggestion,
    materials: risk.materials,
  }
}

function buildPrompt(client, risks, content) {
  return `请基于以下企业税务风险体检资料，重写一份专业、清晰、适合企业老板和财务负责人阅读的税务风险体检报告。

要求：
1. 只能基于输入资料分析，不要编造不存在的数据、政策或案例。
2. 保留风险提示性质，不要承诺最终税务处理结论。
3. 输出中文纯文本，不要使用 Markdown 代码块。
4. 结构包含：企业基本情况、综合风险结论、重点风险摘要、逐项风险分析、整改优先级、资料清单、免责声明。
5. 语气专业、审慎、可执行。

企业资料：
${JSON.stringify(client, null, 2)}

命中风险：
${JSON.stringify(risks.map(compactRisk), null, 2)}

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

    const { client, risks = [], content = '' } = await readJson(request)
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
            content: '你是一名严谨的中国企业税务风险管理顾问，擅长把规则命中的风险转化为可复核、可整改的报告。',
          },
          {
            role: 'user',
            content: buildPrompt(client, risks, content),
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
    const enhancedContent = data?.choices?.[0]?.message?.content?.trim()
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
