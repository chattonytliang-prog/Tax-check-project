import { json, requireDb, serverError } from '../../_utils.js'
import { requireUser } from '../../auth/_auth.js'
import { assistantFileBucket } from '../../_assistant_artifacts.js'

export async function onRequestGet({ request, env, params }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response
    const row = await db.prepare(
      `SELECT a.file_name, a.content_type, a.object_key
       FROM assistant_artifacts a JOIN assistant_threads t ON t.id = a.thread_id AND t.owner_user_id = a.owner_user_id
       WHERE a.id = ? AND a.owner_user_id = ?`,
    ).bind(params.id, auth.user.id).first()
    if (!row || !row.object_key.startsWith(`${auth.user.id}/`)) return json({ error: '文件不存在或无权访问' }, { status: 404 })
    const bucket = assistantFileBucket(env)
    if (!bucket) return json({ error: '文件存储暂不可用' }, { status: 503 })
    const object = await bucket.get(row.object_key)
    if (!object) return json({ error: '文件已不可用，请重新生成' }, { status: 404 })
    return new Response(object.body, { headers: {
      'content-type': row.content_type,
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    } })
  } catch (error) {
    return serverError(error)
  }
}
