import { badRequest, json, readJson, requireDb, serverError } from '../_utils.js'
import { requireUser } from '../auth/_auth.js'

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions'
const DEFAULT_MODEL = 'deepseek-v4-flash'

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
    outputTax: client?.outputTax,
    inputTax: client?.inputTax,
    assetsTotal: client?.assetsTotal,
    payrollTotal: client?.payrollTotal,
    periodEntriesCount: Array.isArray(client?.periodEntries) ? client.periodEntries.length : 0,
  }
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

function buildPrompt({ message, history, client, clientVerified, risks, report }) {
  return `You are an AI tax workbench assistant embedded in a Chinese tax risk checking product.

Rules:
1. Answer in Chinese.
2. You are the main conversational assistant. Treat the tax product context as your knowledge base and skill context.
3. Do not claim that a tax conclusion is final.
4. Do not add or remove rule-engine findings. Treat risk findings as system facts.
5. Do not say you have written to the database. You can only propose a draft.
6. If the user pasted financial data, extract it into structured suggestions.
7. This page has no "保存" or "提交" button. Never tell the user to click a save/submit button on this AI assistant page.
8. When suggesting that cleaned data should enter the system, tell the user to review the cleaning draft card below and click "确认导入".
9. If the current client is not verified in the database, say you can still analyze the pasted content and temporary page context, and the user can confirm the cleaning draft below when it appears.
10. Return strict JSON only, no Markdown.

JSON shape:
{
  "answer": "short user-facing answer",
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

    const { message = '', history = [], client = null, risks = [], report = null } = await readJson(request)
    const cleanMessage = String(message || '').trim()
    const cleanHistory = normalizeHistory(history)
    if (!cleanMessage) return badRequest('Message is required')
    if (!client?.id || !client?.name) return badRequest('Client id and name are required')

    const ownedClient = await db
      .prepare('SELECT id FROM clients WHERE id = ? AND owner_user_id = ?')
      .bind(client.id, auth.user.id)
      .first()
    const clientVerified = Boolean(ownedClient)

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
            content: 'You are a careful Chinese tax workbench assistant. Return strict JSON only.',
          },
          {
            role: 'user',
            content: buildPrompt({ message: cleanMessage, history: cleanHistory, client, clientVerified, risks, report }),
          },
        ],
        temperature: 0.2,
        max_tokens: 2200,
        response_format: { type: 'json_object' },
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

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content?.trim() || ''
    const parsed = parseJsonObject(content)
    if (!parsed) {
      return json({ error: 'AI assistant returned invalid JSON' }, { status: 502 })
    }

    return json({
      answer: String(parsed.answer || '').trim() || '我已完成初步分析，请查看下方建议。',
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
