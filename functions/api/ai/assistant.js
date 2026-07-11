import { badRequest, json, readJson, requireDb, serverError } from '../_utils.js'
import { requireUser } from '../auth/_auth.js'

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions'
const DEFAULT_MODEL = 'deepseek-v4-pro'

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

    const { message = '', history = [], client = null, risks = [], report = null, assistantContext = null } = await readJson(request)
    const cleanMessage = String(message || '').trim()
    const cleanHistory = normalizeHistory(history)
    const cleanAssistantContext = normalizeAssistantContext(assistantContext)
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
        ],
        temperature: 0.2,
        max_tokens: 3200,
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
