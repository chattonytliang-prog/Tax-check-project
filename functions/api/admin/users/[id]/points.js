import { badRequest, json, readJson, requireDb, serverError } from '../../../_utils.js'
import { pointErrorResponse } from '../../../_points.js'
import { requireAdmin } from '../../../auth/_auth.js'

export async function onRequestPost({ request, env, params }) {
  try {
    const db = requireDb(env)
    const auth = await requireAdmin(request, db)
    if (auth.response) return auth.response
    if (request.headers.get('x-requested-with') !== 'tax-workspace') {
      return json({ error: 'Forbidden' }, { status: 403 })
    }

    const { delta, note, requestId } = await readJson(request)
    if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 100000) {
      return badRequest('积分调整必须是 -100000 到 100000 之间的非零整数')
    }
    if (typeof note !== 'string' || !note.trim() || note.trim().length > 200) {
      return badRequest('请填写 1 到 200 字的调整原因')
    }
    if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId)) {
      return badRequest('请提供有效的积分调整请求编号')
    }

    const target = await db.prepare('SELECT id, role FROM users WHERE id = ?').bind(params.id).first()
    if (!target) return json({ error: '用户不存在' }, { status: 404 })
    if (target.role === 'admin') return badRequest('管理员生成报告免费，无需充值积分')

    const normalizedNote = note.trim()
    const findPrevious = () => db.prepare(
      'SELECT user_id, delta, source, actor_user_id, note FROM point_transactions WHERE id = ?',
    ).bind(requestId).first()
    let previous = await findPrevious()
    if (!previous) {
      try {
        await db.prepare(
          `INSERT INTO point_transactions (id, user_id, delta, source, actor_user_id, note)
           VALUES (?, ?, ?, 'admin_adjustment', ?, ?)`,
        ).bind(requestId, target.id, delta, auth.admin.id, normalizedNote).run()
      } catch (error) {
        if (!String(error).includes('UNIQUE constraint failed: point_transactions.id')) throw error
        previous = await findPrevious()
        if (!previous) throw error
      }
    }
    if (previous && (previous.user_id !== target.id || previous.delta !== delta
      || previous.source !== 'admin_adjustment' || previous.actor_user_id !== auth.admin.id
      || previous.note !== normalizedNote)) {
      return json({ error: '请求编号已用于另一笔积分调整' }, { status: 409 })
    }
    const wallet = await db.prepare('SELECT balance FROM point_wallets WHERE user_id = ?').bind(target.id).first()
    return json({ ok: true, balance: wallet.balance, transactionId: requestId, replayed: Boolean(previous) })
  } catch (error) {
    return pointErrorResponse(error) || serverError(error)
  }
}
