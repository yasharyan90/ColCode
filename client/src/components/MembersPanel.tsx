import { useState } from 'react'
import { api, type Member, type ProjectDetail, type Role } from '../api'
import { initials } from '../collab/presence'

interface Props {
  project: ProjectDetail
  meId: string
  onChange: (members: Member[]) => void
  onClose: () => void
}

/** Owner-only sharing UI: add by handle, change role, remove. */
export function MembersPanel({ project, meId, onChange, onClose }: Props) {
  const [handle, setHandle] = useState('')
  const [role, setRole] = useState<Role>('editor')
  const [error, setError] = useState<string | null>(null)
  const isOwner = project.role === 'owner'

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const m = await api.post<Member>(`/api/projects/${project.id}/members`, { handle: handle.trim(), role })
      onChange([...project.members.filter((x) => x.id !== m.id), { ...m, avatarUrl: null }])
      setHandle('')
    } catch (err) { setError((err as Error).message) }
  }
  const remove = async (id: string) => {
    try { await api.del(`/api/projects/${project.id}/members/${id}`); onChange(project.members.filter((m) => m.id !== id)) } catch (err) { setError((err as Error).message) }
  }

  return (
    <div className="absolute right-3 top-11 z-20 w-80 rounded-lg border border-hairline-strong bg-canvas p-4" data-members-panel>
      <div className="flex items-center justify-between">
        <span className="caption-upper text-ink">Members</span>
        <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">×</button>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {project.members.map((m) => (
          <li key={m.id} className="flex items-center gap-2 text-[13px]">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-strong text-[10px] font-semibold text-ink">{initials(m.name)}</span>
            <span className="flex-1 truncate text-body">{m.name} <span className="font-mono text-[11px] text-muted">@{m.handle}</span></span>
            <span className="caption-upper text-muted">{m.role}</span>
            {isOwner && m.role !== 'owner' && m.id !== meId && (
              <button type="button" onClick={() => remove(m.id)} className="text-muted hover:text-error" aria-label={`Remove ${m.name}`}>×</button>
            )}
          </li>
        ))}
      </ul>
      {isOwner ? (
        <form onSubmit={add} className="mt-4 flex gap-1.5">
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="handle" className="h-8 min-w-0 flex-1 rounded-md border border-hairline-strong bg-editor px-2 font-mono text-[12.5px] text-ink outline-none focus:border-muted" />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="h-8 rounded-md border border-hairline-strong bg-editor px-1 text-[12px] text-body">
            <option value="editor">editor</option>
            <option value="viewer">viewer</option>
          </select>
          <button type="submit" disabled={!handle.trim()} className="h-8 rounded-md bg-primary px-3 text-[12.5px] font-medium text-on-primary hover:bg-primary-active disabled:opacity-50">Add</button>
        </form>
      ) : (
        <p className="mt-3 text-[12px] text-muted">Only the owner can manage members.</p>
      )}
      {error && <p className="mt-2 text-[12px] text-error">{error}</p>}
    </div>
  )
}
