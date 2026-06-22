import { json, requireDb, serverError } from '../_utils.js'
import { clearSessionCookie, deleteCurrentSession } from './_auth.js'

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env)
    await deleteCurrentSession(request, db)
    return json({ ok: true }, { headers: { 'set-cookie': clearSessionCookie() } })
  } catch (error) {
    return serverError(error)
  }
}
