/** Thin fetch wrapper for /api. Cookies carry the session; errors carry the server message. */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string }
    throw new ApiError(res.status, err.error ?? `HTTP ${res.status}`)
  }
  return res.status === 204 ? (undefined as T) : (res.json() as Promise<T>)
}

export const api = {
  get: <T>(path: string) => call<T>('GET', path),
  post: <T>(path: string, body?: unknown) => call<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => call<T>('PATCH', path, body),
  del: <T>(path: string) => call<T>('DELETE', path),
}

export interface User { id: string; handle: string; name: string; avatarUrl: string | null; provider: string }
export type Role = 'owner' | 'editor' | 'viewer'
export interface ProjectSummary { id: string; name: string; ownerId: string; createdAt: string; updatedAt: string; role: Role; memberCount: number }
export interface Member { id: string; handle: string; name: string; avatarUrl: string | null; role: Role }
export interface ProjectDetail { id: string; name: string; ownerId: string; role: Role; members: Member[] }
