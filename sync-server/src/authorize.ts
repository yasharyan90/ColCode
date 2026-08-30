import { jwtVerify } from 'jose'

/**
 * Room authorization — runs server-side on every WebSocket upgrade, BEFORE the
 * socket joins a Yjs room. A client-supplied project ID is never trusted alone.
 *
 * The API server issues a project-scoped token (aud "sync", 1h) only after
 * checking membership in Postgres. We verify the signature and that the token's
 * project matches the room being joined. No DB round-trip on connect.
 */
export interface Identity {
  userId: string
  name: string
  handle: string
  role: 'owner' | 'editor' | 'viewer'
}

const SECRET = process.env.JWT_SECRET ? new TextEncoder().encode(process.env.JWT_SECRET) : null
const AUTH_OFF = process.env.SYNC_AUTH === 'off' && process.env.NODE_ENV !== 'production'

export async function authorize(projectId: string, token: string | null): Promise<Identity | null> {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(projectId)) return null

  if (AUTH_OFF) return { userId: token ?? 'anonymous', name: token ?? 'anonymous', handle: 'anonymous', role: 'editor' }
  if (!SECRET) throw new Error('JWT_SECRET is required unless SYNC_AUTH=off')
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, SECRET, { audience: 'sync' })
    if (payload.project !== projectId) return null
    return { userId: String(payload.sub), name: String(payload.name ?? ''), handle: String(payload.handle ?? ''), role: payload.role as Identity['role'] }
  } catch {
    return null
  }
}
