import { useEffect, useRef, useState } from 'react'
import { initials, type Peer, type PresenceUser } from '../collab/presence'
import type { RunStatus } from '../run/runController'
import type { Member, ProjectDetail } from '../api'
import type { AuthState } from '../auth/useAuth'
import { Wordmark } from './Wordmark'
import { MembersPanel } from './MembersPanel'
import { onLinkClick } from '../router'

export interface RunControls {
  status: RunStatus
  canRun: boolean
  language: string
  onRun: () => void
  onStop: () => void
}

interface Props {
  project: ProjectDetail
  meId: string
  peers: Peer[]
  self: PresenceUser | null
  onRename: (name: string) => void
  onMembers: (m: Member[]) => void
  onFollow: (peer: Peer) => void
  run: RunControls
  auth: AuthState
}

/** 40px top bar: wordmark + breadcrumb left, presence · share · run right. */
export function TopBar({ project, meId, peers, self, onRename, onMembers, onFollow, run, auth }: Props) {
  const [membersOpen, setMembersOpen] = useState(false)
  return (
    <header className="relative flex h-10 shrink-0 items-center justify-between border-b border-hairline bg-canvas px-3">
      <div className="flex items-center gap-3">
        <a href="/" onClick={onLinkClick} title="All projects"><Wordmark /></a>
        <span className="text-muted-soft">/</span>
        <span className="text-[13px] text-body" data-project-name>{project.name}</span>
        {project.role !== 'owner' && <span className="caption-upper rounded-full bg-strong px-2 py-0.5 text-muted">{project.role}</span>}
      </div>

      <div className="flex items-center gap-3">
        <PresenceStack peers={peers} onFollow={onFollow} />
        {self && <SelfChip user={self} onRename={onRename} />}
        <button
          type="button"
          onClick={() => setMembersOpen((o) => !o)}
          data-share-button
          className="caption-upper h-7 rounded-md border border-hairline-strong px-2.5 text-muted transition-colors hover:bg-raised hover:text-body"
        >
          Share · {project.members.length}
        </button>
        <RunButton run={run} />
        <button
          type="button"
          onClick={() => auth.logout().then(() => location.assign('/login'))}
          title={`Signed in as ${auth.user?.name ?? ''} — sign out`}
          className="grid h-6 w-6 place-items-center rounded-full bg-strong text-[10px] font-semibold text-ink"
        >
          {auth.user ? initials(auth.user.name) : '?'}
        </button>
      </div>
      {membersOpen && <MembersPanel project={project} meId={meId} onChange={onMembers} onClose={() => setMembersOpen(false)} />}
    </header>
  )
}

function PresenceStack({ peers, onFollow }: { peers: Peer[]; onFollow: (p: Peer) => void }) {
  const others = peers.filter((p) => !p.isSelf)
  const shown = others.slice(0, 5)
  const extra = others.length - shown.length
  return (
    <div className="flex items-center gap-2" data-presence-stack data-count={others.length}>
      <div className="flex -space-x-1.5">
        {shown.map((p) => (
          <button key={p.clientId} type="button" onClick={() => onFollow(p)} data-follow={p.user.name}
            title={`${p.user.name}${p.file ? ` · ${p.file}${p.line ? `:${p.line}` : ''}` : ''} — click to follow`}
            className="rounded-full transition-transform hover:z-10 hover:scale-110 focus:outline-none">
            <Avatar user={p.user} title="" />
          </button>
        ))}
        {extra > 0 && <span className="grid h-6 w-6 place-items-center rounded-full border border-canvas bg-strong text-[10px] font-semibold text-body">+{extra}</span>}
      </div>
      <span className="caption-upper text-muted">{others.length === 0 ? 'Solo' : `${others.length + 1} online`}</span>
    </div>
  )
}

function Avatar({ user, title }: { user: PresenceUser; title: string }) {
  return (
    <span title={title} data-avatar={user.name} className="grid h-6 w-6 place-items-center overflow-hidden rounded-full border-2 text-[10px] font-semibold" style={{ background: user.color, color: user.colorText, borderColor: user.color }}>
      {user.avatar ? <img src={user.avatar} alt="" className="h-full w-full object-cover" /> : initials(user.name)}
    </span>
  )
}

function SelfChip({ user, onRename }: { user: PresenceUser; onRename: (n: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(user.name)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])
  useEffect(() => { if (!editing) setDraft(user.name) }, [user.name, editing])
  const commit = () => { setEditing(false); if (draft.trim() && draft.trim() !== user.name) onRename(draft) }
  return editing ? (
    <input ref={inputRef} value={draft} maxLength={32} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      className="h-7 w-36 rounded-md border border-hairline-strong bg-editor px-2 text-[12.5px] text-ink outline-none focus:border-muted" aria-label="Your display name" />
  ) : (
    <button type="button" onClick={() => setEditing(true)} title="Click to change your display name" data-self-name={user.name}
      className="flex h-7 items-center gap-1.5 rounded-md border border-hairline-strong px-2 text-[12.5px] text-body transition-colors hover:bg-raised hover:text-ink">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: user.color }} aria-hidden />
      {user.name}
    </button>
  )
}

function RunButton({ run }: { run: RunControls }) {
  if (run.status === 'running') {
    return (
      <button type="button" onClick={run.onStop} data-run-button="stop" className="flex h-7 items-center gap-1.5 rounded-md border border-hairline-strong bg-raised px-3 text-[13px] font-medium text-ink transition-colors hover:bg-strong">
        <span className="inline-block h-2 w-2 rounded-[1px] bg-error" aria-hidden />
        Stop
      </button>
    )
  }
  const title = run.canRun ? `Run ${run.language} in the sandbox (⌘⏎)` : run.language ? `Running ${run.language} arrives in milestone 6` : 'Open a file to run it'
  return (
    <button type="button" onClick={run.onRun} disabled={!run.canRun} title={title} data-run-button="run"
      className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-on-primary transition-colors hover:bg-primary-active active:bg-primary-active disabled:cursor-not-allowed disabled:bg-strong disabled:text-muted">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden><path d="M2 1.5v7l6-3.5z" /></svg>
      Run
    </button>
  )
}
