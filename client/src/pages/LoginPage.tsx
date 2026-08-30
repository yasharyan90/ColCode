import { useState } from 'react'
import type { AuthState } from '../auth/useAuth'
import { Wordmark } from '../components/Wordmark'
import { navigate } from '../router'

export function LoginPage({ auth }: { auth: AuthState }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submitDev = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await auth.devLogin(name); navigate('/') } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="flex h-full items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm rounded-lg border border-hairline bg-editor p-8">
        <Wordmark size={18} />
        <h1 className="display mt-6 text-[26px] leading-tight text-ink">Code together, live.</h1>
        <p className="mt-2 text-[14px] text-muted">Shared editor, shared cursors, shared output. Sign in to open your projects.</p>

        <div className="mt-8 flex flex-col gap-3">
          {auth.providers.github ? (
            <a href="/api/auth/github" className="flex h-10 items-center justify-center gap-2 rounded-md bg-primary text-[14px] font-medium text-on-primary transition-colors hover:bg-primary-active">
              <GitHubIcon /> Continue with GitHub
            </a>
          ) : (
            <div className="rounded-md border border-hairline px-3 py-2 text-[12.5px] text-muted">
              GitHub sign-in is off — set <code className="font-mono text-body">GITHUB_CLIENT_ID</code> / <code className="font-mono text-body">GITHUB_CLIENT_SECRET</code> in <code className="font-mono text-body">.env</code>.
            </div>
          )}

          {auth.providers.dev && (
            <form onSubmit={submitDev} className="mt-2 flex flex-col gap-2" data-dev-login>
              <label className="caption-upper text-muted">Dev login (local only)</label>
              <div className="flex gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  maxLength={32}
                  autoFocus
                  className="h-10 min-w-0 flex-1 rounded-md border border-hairline-strong bg-canvas px-3 text-[14px] text-ink outline-none placeholder:text-muted-soft focus:border-muted"
                />
                <button type="submit" disabled={busy || !name.trim()} className="h-10 rounded-md border border-hairline-strong bg-raised px-4 text-[14px] font-medium text-ink transition-colors hover:bg-strong disabled:opacity-50">
                  Sign in
                </button>
              </div>
              {error && <p className="text-[12.5px] text-error">{error}</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}
