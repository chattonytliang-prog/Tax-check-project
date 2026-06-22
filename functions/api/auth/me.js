import { json, requireDb, serverError } from '../_utils.js'
import { getCurrentUser } from './_auth.js'

export async function onRequestGet({ request, env }) {
  try {
    const db = requireDb(env)
    const user = await getCurrentUser(request, db)

    if (!user) {
      return json({ user: null }, { status: 401 })
    }

    return json({ user })
  } catch (error) {
    return serverError(error)
  }
}
