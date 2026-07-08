import { badRequest, json, nowIso, requireDb, serverError } from '../_utils.js'
import { requireUser } from '../auth/_auth.js'

const maxUploadBytes = 8 * 1024 * 1024

function cleanFileName(value) {
  return String(value || 'material')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160) || 'material'
}

function getMaterialsBucket(env) {
  return env.ASSISTANT_MATERIALS_BUCKET || env.MATERIALS_BUCKET || null
}

async function storeMaterialRow(db, material) {
  await db
    .prepare(
      `INSERT INTO assistant_materials (
        id, owner_user_id, thread_id, file_name, content_type, size, object_key, storage_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      material.id,
      material.ownerUserId,
      material.threadId,
      material.fileName,
      material.contentType,
      material.size,
      material.objectKey,
      material.storageStatus,
      material.createdAt,
    )
    .run()
}

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env)
    const auth = await requireUser(request, db)
    if (auth.response) return auth.response

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) return badRequest('File is required')
    if (file.size > maxUploadBytes) return badRequest('File is too large')

    const threadId = String(formData.get('threadId') || '').trim().slice(0, 80)
    const fileName = cleanFileName(file.name)
    const contentType = String(file.type || 'application/octet-stream').slice(0, 120)
    const id = crypto.randomUUID()
    const createdAt = nowIso()
    const objectKey = `${auth.user.id}/${threadId || 'unassigned'}/${id}/${fileName}`
    const bucket = getMaterialsBucket(env)
    let storageStatus = 'metadata_only'
    let storedObjectKey = ''

    if (bucket) {
      await bucket.put(objectKey, await file.arrayBuffer(), {
        httpMetadata: {
          contentType,
        },
        customMetadata: {
          ownerUserId: auth.user.id,
          threadId,
          fileName,
        },
      })
      storageStatus = 'stored'
      storedObjectKey = objectKey
    }

    await storeMaterialRow(db, {
      id,
      ownerUserId: auth.user.id,
      threadId,
      fileName,
      contentType,
      size: file.size,
      objectKey: storedObjectKey,
      storageStatus,
      createdAt,
    })

    return json({
      material: {
        id,
        name: fileName,
        contentType,
        size: file.size,
        objectKey: storedObjectKey || undefined,
        storageStatus,
        uploadedAt: createdAt,
      },
    })
  } catch (error) {
    return serverError(error)
  }
}
