import { badRequest, json, requireDb, serverError } from '../_utils.js'
import { requireUser } from '../auth/_auth.js'
import { ensureTaxDataIntakeTables } from '../_tax_data_schema.js'

function getMaterialsBucket(env) {
  return env.ASSISTANT_MATERIALS_BUCKET || env.MATERIALS_BUCKET || null
}

export async function onRequestGet({ request, env }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response
    const sourceFileId = String(new URL(request.url).searchParams.get('sourceFileId') || '').trim()
    if (!sourceFileId) return badRequest('sourceFileId is required')
    await ensureTaxDataIntakeTables(db)
    const row = await db.prepare(
      `SELECT file_name, content_type, storage_key FROM tax_data_source_files
       WHERE id = ? AND owner_user_id = ? LIMIT 1`,
    ).bind(sourceFileId, auth.user.id).first()
    if (!row) return new Response('Source file not found', { status: 404 })
    if (!row.storage_key) return new Response('The original file was indexed but not stored', { status: 404 })
    const bucket = getMaterialsBucket(env)
    if (!bucket) return new Response('Material storage is unavailable', { status: 503 })
    const object = await bucket.get(row.storage_key)
    if (!object) return new Response('Stored source file not found', { status: 404 })
    const safeName = String(row.file_name || 'source-file').replace(/[\r\n"]/g, '_')
    return new Response(object.body, {
      headers: {
        'Content-Type': row.content_type || 'application/octet-stream',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return serverError(error)
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response
    const formData = await request.formData()
    const sourceFileId = String(formData.get('sourceFileId') || '').trim()
    const file = formData.get('file')
    if (!sourceFileId || !(file instanceof File)) return badRequest('sourceFileId and file are required')
    if (file.size > 8 * 1024 * 1024) return badRequest('File is too large')
    await ensureTaxDataIntakeTables(db)
    const row = await db.prepare(
      `SELECT id, client_id, file_name FROM tax_data_source_files
       WHERE id = ? AND owner_user_id = ? LIMIT 1`,
    ).bind(sourceFileId, auth.user.id).first()
    if (!row) return new Response('Source file not found', { status: 404 })
    if (String(file.name) !== String(row.file_name)) return badRequest('File name does not match the archived source')
    const bucket = getMaterialsBucket(env)
    if (!bucket) return new Response('Material storage is unavailable', { status: 503 })
    const safeName = String(row.file_name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 160)
    const objectKey = `${auth.user.id}/archive/${row.client_id || 'unassigned'}/${row.id}/${safeName}`
    await bucket.put(objectKey, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
      customMetadata: { ownerUserId: auth.user.id, clientId: row.client_id || '', sourceFileId: row.id },
    })
    await db.prepare(
      `UPDATE tax_data_source_files
       SET storage_key = ?, content_type = ?, file_size = ?
       WHERE id = ? AND owner_user_id = ?`,
    ).bind(objectKey, file.type || 'application/octet-stream', file.size, row.id, auth.user.id).run()
    return json({ ok: true, sourceFileId: row.id, stored: true })
  } catch (error) {
    return serverError(error)
  }
}
