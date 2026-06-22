import { json } from '../_utils.js'

const SESSION_COOKIE = 'tax_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7
const PASSWORD_ITERATIONS = 100000
const encoder = new TextEncoder()

function bytesToBase64(bytes) {
  let binary = ''
  const view = new Uint8Array(bytes)
  for (const byte of view) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function base64ToBytes(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function randomBase64(byteLength) {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return bytesToBase64(bytes)
}

function randomSessionToken() {
  return randomBase64(32).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase()
}

export function validateCredentials(username, password) {
  if (!/^[a-z0-9_-]{3,32}$/.test(username)) {
    return 'Username must be 3-32 characters and can only use letters, numbers, underscore or hyphen'
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
    return 'Password must be 6-72 characters'
  }
  return ''
}

export async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: base64ToBytes(salt),
      iterations: PASSWORD_ITERATIONS,
    },
    key,
    256,
  )
  return bytesToBase64(bits)
}

export function createSalt() {
  return randomBase64(16)
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return bytesToBase64(digest)
}

function parseCookies(request) {
  const header = request.headers.get('cookie') || ''
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=')
        if (separator === -1) return [part, '']
        return [part.slice(0, separator), part.slice(separator + 1)]
      }),
  )
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}

function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`
}

export async function createSession(db, userId) {
  const token = randomSessionToken()
  const tokenHash = await sha256(token)
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()

  await db
    .prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)')
    .bind(tokenHash, userId, expiresAt)
    .run()

  return { token, cookie: sessionCookie(token) }
}

export async function deleteCurrentSession(request, db) {
  const token = parseCookies(request)[SESSION_COOKIE]
  if (!token) return
  const tokenHash = await sha256(token)
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run()
}

export async function getCurrentUser(request, db) {
  const token = parseCookies(request)[SESSION_COOKIE]
  if (!token) return null

  const tokenHash = await sha256(token)
  const row = await db
    .prepare(
      `SELECT users.id, users.username, sessions.expires_at
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ?`,
    )
    .bind(tokenHash)
    .first()

  if (!row) return null
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run()
    return null
  }

  return { id: row.id, username: row.username }
}

export async function requireUser(request, db) {
  const user = await getCurrentUser(request, db)
  if (!user) {
    return { response: json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { user }
}
