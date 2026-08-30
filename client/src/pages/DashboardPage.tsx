import { useEffect, useState } from 'react'
import { api, type ProjectSummary } from '../api'
import type { AuthState } from '../auth/useAuth'
import { Wordmark } from '../components/Wordmark'
import { UserMenu } from '../components/UserMenu'
import { navigate, onLinkClick } from '../router'

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

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-hairline px-5">
        <Wordmark />
        <UserMenu auth={auth} />
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-5 py-10">
        <h1 className="display text-[26px] text-ink">Projects</h1>
        <p className="mt-1 text-[14px] text-muted">Everything you own or have been invited to.</p>

        <form onSubmit={create} className="mt-6 flex gap-2" data-new-project>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New project name"
            maxLength={80}
            className="h-10 min-w-0 flex-1 rounded-md border border-hairline-strong bg-editor px-3 text-[14px] text-ink outline-none placeholder:text-muted-soft focus:border-muted"
          />
          <button type="submit" disabled={!name.trim()} className="h-10 rounded-md bg-primary px-4 text-[14px] font-medium text-on-primary transition-colors hover:bg-primary-active disabled:opacity-50">
            Create
          </button>
        </form>
        {error && <p className="mt-2 text-[12.5px] text-error">{error}</p>}

        <ul className="mt-8 divide-y divide-hairline rounded-lg border border-hairline bg-editor" data-project-list>
          {projects === null && <li className="px-4 py-6 text-[13px] text-muted">Loading…</li>}
          {projects?.length === 0 && <li className="px-4 py-6 text-[13px] text-muted">No projects yet — create one above.</li>}
          {projects?.map((p) => (
            <li key={p.id}>
              <a href={`/p/${p.id}`} onClick={onLinkClick} className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-raised">
                <div>
                  <div className="text-[14px] font-medium text-ink">{p.name}</div>
                  <div className="mt-0.5 font-mono text-[11.5px] text-muted">{p.id} · updated {timeAgo(p.updatedAt)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[12px] text-muted">{p.memberCount} {p.memberCount === 1 ? 'member' : 'members'}</span>
                  <span className="caption-upper rounded-full bg-strong px-2 py-0.5 text-body">{p.role}</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
