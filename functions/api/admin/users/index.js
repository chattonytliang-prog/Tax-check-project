import { json, requireDb, serverError } from '../../_utils.js'
import { requireAdmin } from '../../auth/_auth.js'

export async function onRequestGet({ request, env }) {
  try {
    const db = requireDb(env)
    const auth = await requireAdmin(request, db)
    if (auth.response) return auth.response

    const { results } = await db
      .prepare(
        `SELECT
          users.id,
          users.username,
          users.role,
          users.disabled_at,
          users.created_at,
          COUNT(DISTINCT clients.id) AS clients_count,
          COUNT(DISTINCT reports.id) AS reports_count
         FROM users
         LEFT JOIN clients ON clients.owner_user_id = users.id
         LEFT JOIN reports ON reports.owner_user_id = users.id
         GROUP BY users.id
         ORDER BY users.created_at DESC`,
      )
      .all()

    const users = results.map((user) => ({
      id: user.id,
      username: user.username,
      role: user.role || 'user',
      disabledAt: user.disabled_at || null,
      createdAt: user.created_at,
      clientsCount: user.clients_count || 0,
      reportsCount: user.reports_count || 0,
    }))

    return json({ users })
  } catch (error) {
    return serverError(error)
  }
}
