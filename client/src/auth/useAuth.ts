import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type User } from '../api'

export interface AuthState {
  user: User | null
  loading: boolean
  providers: { github: boolean; dev: boolean }
  devLogin: (name: string) => Promise<void>
  logout: () => Promise<void>
}

/** Session state from /api/auth/me, loaded once at boot. */
export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [providers, setProviders] = useState({ github: false, dev: false })

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.get<User>('/api/auth/me').catch((e) => { if (e instanceof ApiError && e.status === 401) return null; throw e }),
      api.get<{ github: boolean; dev: boolean }>('/api/auth/providers').catch(() => ({ github: false, dev: false })),
    ]).then(([u, p]) => { if (!cancelled) { setUser(u); setProviders(p) } })
      .catch(() => { if (!cancelled) setUser(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const devLogin = useCallback(async (name: string) => { setUser(await api.post<User>('/api/auth/dev', { name })) }, [])
  const logout = useCallback(async () => { await api.post('/api/auth/logout'); setUser(null) }, [])

  return { user, loading, providers, devLogin, logout }
}
