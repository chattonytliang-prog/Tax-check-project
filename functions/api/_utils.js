export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers || {}),
    },
  })
}

export function badRequest(message) {
  return json({ error: message }, { status: 400 })
}

export function serverError(error) {
  return json(
    {
      error: 'Server error',
      detail: error instanceof Error ? error.message : String(error),
    },
    { status: 500 },
  )
}

export function requireDb(env) {
  if (!env.DB) {
    throw new Error('D1 binding DB is not configured')
  }
  return env.DB
}

export async function readJson(request) {
  try {
    return await request.json()
  } catch {
    throw new Error('Request body must be valid JSON')
  }
}

export function nowIso() {
  return new Date().toISOString()
}
