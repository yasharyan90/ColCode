import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { SignJWT, jwtVerify } from 'jose'
import { randomBytes } from 'node:crypto'
import { getUser, upsertUser, type User } from './db.js'

/**
 * Auth: GitHub OAuth → our own JWT in an httpOnly cookie.
 *
 * - The session cookie is what the browser uses against /api.
 * - Sync tokens (see projects.ts) are separate short-lived JWTs scoped to one
 *   project, passed to the WebSocket server, which shares JWT_SECRET.
 * - Dev login is a password-less shortcut for local work. It is refused
 *   outright when NODE_ENV=production, regardless of env flags.
 */
const SECRET = new TextEncoder().encode(required('JWT_SECRET'))
const COOKIE = 'colcode_session'
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173'
const GITHUB_ID = process.env.GITHUB_CLIENT_ID
const GITHUB_SECRET = process.env.GITHUB_CLIENT_SECRET
const CALLBACK = process.env.OAUTH_CALLBACK_URL ?? `${APP_URL}/api/auth/github/callback`
const IS_PROD = process.env.NODE_ENV === 'production'
const DEV_LOGIN = !IS_PROD && process.env.AUTH_DEV_LOGIN === '1'
/** Secure cookies only work over TLS; key it on how the app is actually served. */
const SECURE_COOKIES = APP_URL.startsWith('https://')

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is required (see .env.example)`)
  return v
}

declare module 'fastify' {
  interface FastifyRequest { user: User | null }
}

export async function signToken(payload: Record<string, unknown>, expiresIn: string, audience: string) {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setAudience(audience).setExpirationTime(expiresIn).sign(SECRET)
}

export async function verifyToken(token: string, audience: string) {
  const { payload } = await jwtVerify(token, SECRET, { audience })
  return payload
}

export async function registerAuth(app: FastifyInstance) {
  app.decorateRequest('user', null)

  // Attach the user (if any) to every request; routes decide whether to require it.
  app.addHook('onRequest', async (request) => {
    const token = request.cookies[COOKIE]
    if (!token) return
    try {
      const payload = await verifyToken(token, 'session')
      request.user = await getUser(String(payload.sub))
    } catch {
      request.user = null
    }
  })

  const setSession = async (reply: FastifyReply, user: User) => {
    const token = await signToken({ sub: user.id }, '7d', 'session')
    reply.setCookie(COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure: SECURE_COOKIES, maxAge: 7 * 24 * 3600 })
  }

  app.get('/api/auth/providers', async () => ({ github: Boolean(GITHUB_ID && GITHUB_SECRET), dev: DEV_LOGIN }))

  app.get('/api/auth/me', async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'not signed in' })
    return publicUser(request.user)
  })

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie(COOKIE, { path: '/' })
    return { ok: true }
  })

  // ---- GitHub OAuth ----
  app.get('/api/auth/github', async (_request, reply) => {
    if (!GITHUB_ID) return reply.code(404).send({ error: 'GitHub OAuth is not configured' })
    const state = randomBytes(16).toString('hex')
    reply.setCookie('oauth_state', state, { path: '/api/auth', httpOnly: true, sameSite: 'lax', secure: SECURE_COOKIES, maxAge: 600 })
    const url = new URL('https://github.com/login/oauth/authorize')
    url.searchParams.set('client_id', GITHUB_ID)
    url.searchParams.set('redirect_uri', CALLBACK)
    url.searchParams.set('scope', 'read:user user:email')
    url.searchParams.set('state', state)
    return reply.redirect(url.toString())
  })

  app.get<{ Querystring: { code?: string; state?: string } }>('/api/auth/github/callback', async (request, reply) => {
    const { code, state } = request.query
    if (!GITHUB_ID || !GITHUB_SECRET) return reply.code(404).send({ error: 'GitHub OAuth is not configured' })
    if (!code || !state || state !== request.cookies.oauth_state) return reply.code(400).send({ error: 'invalid oauth state' })
    reply.clearCookie('oauth_state', { path: '/api/auth' })

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: GITHUB_ID, client_secret: GITHUB_SECRET, code, redirect_uri: CALLBACK }),
    })
    const tokenJson = await tokenRes.json() as { access_token?: string; error?: string }
    if (!tokenJson.access_token) return reply.code(401).send({ error: `github: ${tokenJson.error ?? 'no token'}` })

    const gh = await (await fetch('https://api.github.com/user', { headers: { authorization: `Bearer ${tokenJson.access_token}`, 'user-agent': 'colcode' } })).json() as { id: number; login: string; name: string | null; avatar_url: string; email: string | null }
    const user = await upsertUser({ provider: 'github', providerId: String(gh.id), handle: gh.login, name: gh.name || gh.login, avatarUrl: gh.avatar_url, email: gh.email })
    await setSession(reply, user)
    return reply.redirect(APP_URL)
  })

  // ---- Dev login (local only) ----
  app.post<{ Body: { name?: string } }>('/api/auth/dev', async (request, reply) => {
    if (!DEV_LOGIN) return reply.code(404).send({ error: 'dev login is disabled' })
    const name = (request.body?.name ?? '').trim().slice(0, 32)
    if (!/^[\w .-]{1,32}$/.test(name)) return reply.code(400).send({ error: 'name must be 1–32 chars: letters, digits, space, . _ -' })
    const handle = name.toLowerCase().replace(/\s+/g, '-')
    const user = await upsertUser({ provider: 'dev', providerId: handle, handle, name })
    await setSession(reply, user)
    return publicUser(user)
  })
}

export function publicUser(u: User) {
  return { id: u.id, handle: u.handle, name: u.name, avatarUrl: u.avatar_url, provider: u.provider }
}

/** preHandler for routes that need a signed-in user. */
export async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) return reply.code(401).send({ error: 'sign in required' })
}
