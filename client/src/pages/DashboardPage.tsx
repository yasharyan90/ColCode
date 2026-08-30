import { useEffect, useState } from 'react'
import { api, type ProjectSummary } from '../api'
import type { AuthState } from '../auth/useAuth'
import { Wordmark, LogoMark } from '../components/Wordmark'
import { UserMenu } from '../components/UserMenu'
import { navigate, onLinkClick } from '../router'
import { colors } from '../theme/tokens'

export function DashboardPage({ auth }: { auth: AuthState }) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = () => api.get<ProjectSummary[]>('/api/projects').then(setProjects).catch((e) => setError(e.message))
  useEffect(() => { void load() }, [])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    try {
      const p = await api.post<{ id: string }>('/api/projects', { name: name.trim() })
      navigate(`/p/${p.id}`)
    } catch (err) { setError((err as Error).message) }
  }

  const owned = projects?.filter((p) => p.role === 'owner').length ?? 0
  const shared = (projects?.length ?? 0) - owned

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-hairline px-5">
        <Wordmark />
        <UserMenu auth={auth} />
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-5 py-10">
        <div className="fade-up flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="display text-[28px] text-ink">Projects</h1>
            <p className="mt-1 text-[13.5px] text-muted">
              {projects === null ? 'Loading your workspace…' : projects.length === 0 ? 'Everything you own or have been invited to will show up here.' : `${owned} owned · ${shared} shared with you`}
            </p>
          </div>
          <form onSubmit={create} className="flex w-full gap-2 sm:w-auto" data-new-project>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New project name"
              maxLength={80}
              className="h-9 min-w-0 flex-1 rounded-md border border-hairline-strong bg-editor px-3 text-[13.5px] text-ink outline-none placeholder:text-muted-soft focus:border-muted sm:w-64"
            />
            <button type="submit" disabled={!name.trim()} className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-[13.5px] font-medium text-on-primary transition-colors hover:bg-primary-active disabled:cursor-not-allowed disabled:bg-strong disabled:text-muted">
              <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="M5 1.5v7M1.5 5h7" /></svg>
              Create
            </button>
          </form>
        </div>
        {error && <p className="mt-3 text-[12.5px] text-error">{error}</p>}

        <ul className="fade-up mt-8 grid gap-3 sm:grid-cols-2" data-project-list style={{ animationDelay: '60ms' }}>
          {projects === null && [0, 1].map((i) => <li key={i} className="h-[92px] animate-pulse rounded-lg border border-hairline bg-editor/60" />)}
          {projects?.length === 0 && (
            <li className="col-span-full flex flex-col items-center gap-3 rounded-lg border border-dashed border-hairline-strong px-6 py-14 text-center">
              <LogoMark size={26} />
              <p className="text-[14px] text-ink">No projects yet</p>
              <p className="max-w-xs text-[12.5px] text-muted">Name one above and press Create — you'll land straight in the editor with a starter file.</p>
            </li>
          )}
          {projects?.map((p) => (
            <li key={p.id}>
              <a href={`/p/${p.id}`} onClick={onLinkClick} className="group flex h-full flex-col justify-between gap-4 rounded-lg border border-hairline bg-editor p-4 transition-colors hover:border-hairline-strong hover:bg-raised/40">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[12px] font-semibold" style={{ background: `${tint(p.id)}26`, color: tint(p.id) }}>{mono(p.name)}</span>
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium text-ink">{p.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted-soft">{p.id}</div>
                  </div>
                  <span className="caption-upper ml-auto shrink-0 rounded-full border border-hairline-strong px-2 py-px text-[9.5px] text-muted">{p.role}</span>
                </div>
                <div className="flex items-center justify-between text-[12px] text-muted">
                  <span className="flex items-center gap-1.5">
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><circle cx="4.5" cy="4" r="2" /><path d="M1.5 10.5a3 3 0 016 0" /><path d="M8 6.2a2 2 0 100-4M10.5 10.5a3 3 0 00-2.5-2.95" /></svg>
                    {p.memberCount} {p.memberCount === 1 ? 'member' : 'members'}
                  </span>
                  <span>Updated {timeAgo(p.updatedAt)}</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}

/** Stable presence-palette tint per project id — the pastels are in-product colors. */
function tint(id: string) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return colors.presence[h % colors.presence.length]
}

function mono(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return (words.length >= 2 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase()
}

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
