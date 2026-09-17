import { badRequest, json } from './_utils.js'

const DEFAULT_DAILY_LIMIT = 80

export function aiUpstreamFailure(status) {
  const reason = status === 401 || status === 403
    ? '模型服务密钥无效，请联系管理员'
    : status === 402
      ? '模型服务账户余额不足，请联系管理员；这与您的报告积分无关'
      : status === 429
        ? '模型服务请求过于频繁，请稍后重试'
        : status === 400 || status === 422
          ? '模型服务拒绝了请求参数，请联系管理员'
          : '模型服务暂不可用，请稍后重试'
  return json({ error: reason, code: `AI_UPSTREAM_${status}` }, { status: 502 })
}

export async function readAiRequest(request, maxBytes = 262_144) {
  const declaredSize = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    return { response: json({ error: '请求内容过大，请减少资料后重试' }, { status: 413 }) }
  }
  const raw = await request.text()
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    return { response: json({ error: '请求内容过大，请减少资料后重试' }, { status: 413 }) }
  }
  try {
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { response: badRequest('请求内容必须是 JSON 对象') }
    }
    return { data }
  } catch {
    return { response: badRequest('请求内容必须是有效 JSON') }
  }
}

export async function reserveAiCall(db, user, env, now = new Date()) {
  const configured = Number(env.AI_DAILY_REQUEST_LIMIT)
  const baseLimit = Number.isInteger(configured) && configured > 0 && configured <= 1000
    ? configured : DEFAULT_DAILY_LIMIT
  const limit = user.role === 'admin' ? Math.min(baseLimit * 3, 1000) : baseLimit
  const date = now.toISOString().slice(0, 10)
  const result = await db.prepare(
    `INSERT INTO ai_daily_usage (user_id, usage_date, used) VALUES (?, ?, 1)
     ON CONFLICT(user_id, usage_date) DO UPDATE SET used = used + 1 WHERE used < ?`,
  ).bind(user.id, date, limit).run()
  if ((result.meta?.changes ?? result.changes) === 0) {
    return json({ error: '今日 AI 使用次数已达上限，请明天再试', code: 'AI_DAILY_LIMIT' }, { status: 429 })
  }
  return null
}
