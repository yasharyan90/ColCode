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
  /** Opens Monaco's command palette (the centered "command center" pill, like Cursor). */
  onCommand: () => void
  /** Export every file in the project as a .zip (client-side). */
  onDownload: () => void
  fileCount: number
  run: RunControls
  auth: AuthState
}

/** 40px top bar: wordmark + breadcrumb left, command center middle, presence · share · run right. */
export function TopBar({ project, meId, peers, self, onRename, onMembers, onFollow, onCommand, onDownload, fileCount, run, auth }: Props) {
  const [membersOpen, setMembersOpen] = useState(false)
  return (
    <header className="relative flex h-10 shrink-0 items-center justify-between border-b border-hairline bg-canvas px-3" data-top-bar>
      <div className="flex min-w-0 items-center gap-2.5">
        <a href="/" onClick={onLinkClick} title="All projects" className="rounded-sm transition-opacity hover:opacity-80"><Wordmark /></a>
        <span className="text-hairline-strong">/</span>
        <span className="truncate text-[13px] text-body" data-project-name>{project.name}</span>
        {project.role !== 'owner' && <span className="caption-upper rounded-full border border-hairline-strong px-2 py-px text-[10px] text-muted">{project.role}</span>}
      </div>

      <button
        type="button"
        onClick={onCommand}
        title="Command palette (F1)"
        data-command-center
        className="absolute left-1/2 hidden h-7 w-[min(34vw,380px)] -translate-x-1/2 items-center gap-2 rounded-md border border-hairline bg-editor px-2.5 text-[12px] text-muted transition-colors hover:border-hairline-strong hover:text-body md:flex"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden><circle cx="5.25" cy="5.25" r="3.5" /><path d="M8 8l2.5 2.5" /></svg>
        <span className="flex-1 truncate text-left">{project.name}</span>
        <kbd className="rounded-xs border border-hairline-strong px-1 font-sans text-[10px] leading-4 text-muted-soft">F1</kbd>
      </button>

      <div className="flex items-center gap-2">
        <PresenceStack peers={peers} onFollow={onFollow} />
        {self && <SelfChip user={self} onRename={onRename} />}
        <button
          type="button"
          onClick={() => setMembersOpen((o) => !o)}
          data-share-button
          className={[
            'flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] transition-colors',
            membersOpen ? 'border-hairline-strong bg-raised text-ink' : 'border-hairline-strong text-body hover:bg-raised hover:text-ink',
          ].join(' ')}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><circle cx="4.5" cy="4" r="2" /><path d="M1.5 10.5a3 3 0 016 0" /><path d="M8 6.2a2 2 0 100-4M10.5 10.5a3 3 0 00-2.5-2.95" /></svg>
          Share
          <span className="rounded-full bg-strong px-1.5 text-[10.5px] font-semibold leading-4 text-body">{project.members.length}</span>
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={fileCount === 0}
          title={fileCount === 0 ? 'No files to download yet' : `Download all ${fileCount} ${fileCount === 1 ? 'file' : 'files'} as .zip`}
          data-download-button
          className="flex h-7 items-center gap-1.5 rounded-md border border-hairline-strong px-2.5 text-[12.5px] text-body transition-colors hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 1.5v6.5M3.5 5.5L6 8l2.5-2.5M2 10.5h8" /></svg>
          <span className="hidden lg:inline">Download</span>
          <span className="rounded-full bg-strong px-1.5 font-mono text-[9.5px] font-semibold leading-4 text-muted">.zip</span>
        </button>
        <RunButton run={run} />
        <button
          type="button"
          onClick={() => auth.logout().then(() => location.assign('/login'))}
          title={`Signed in as ${auth.user?.name ?? ''} — sign out`}
          className="ml-1 grid h-6 w-6 place-items-center overflow-hidden rounded-full border border-hairline-strong bg-strong text-[10px] font-semibold text-ink transition-colors hover:border-muted"
        >
          {auth.user?.avatarUrl ? <img src={auth.user.avatarUrl} alt="" className="h-full w-full object-cover" /> : auth.user ? initials(auth.user.name) : '?'}
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
    <div className="mr-1 flex items-center gap-2" data-presence-stack data-count={others.length}>
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
      <span className="caption-upper text-[10px] text-muted">{others.length === 0 ? 'Solo' : `${others.length + 1} online`}</span>
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
      className="flex h-7 items-center gap-1.5 rounded-md border border-transparent px-2 text-[12.5px] text-body transition-colors hover:border-hairline-strong hover:bg-raised hover:text-ink">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: user.color }} aria-hidden />
      {user.name}
    </button>
  )
}

function RunButton({ run }: { run: RunControls }) {
  if (run.status === 'running') {
    return (
      <button type="button" onClick={run.onStop} data-run-button="stop" className="flex h-7 items-center gap-2 rounded-md border border-hairline-strong bg-raised px-3 text-[12.5px] font-medium text-ink transition-colors hover:bg-strong">
        <span className="inline-block h-2 w-2 animate-pulse rounded-[1px] bg-error" aria-hidden />
        Stop
      </button>
    )
  }
  const title = run.canRun ? `Run ${run.language} in the sandbox (⌘⏎)` : run.language ? `${run.language} can't be run here yet` : 'Open a file to run it'
  return (
    <button type="button" onClick={run.onRun} disabled={!run.canRun} title={title} data-run-button="run"
      className="flex h-7 items-center gap-1.5 rounded-md bg-primary pl-2.5 pr-3 text-[12.5px] font-medium text-on-primary transition-colors hover:bg-primary-active active:bg-primary-active disabled:cursor-not-allowed disabled:bg-strong disabled:text-muted">
      <svg width="9" height="10" viewBox="0 0 9 10" fill="currentColor" aria-hidden><path d="M1 1.2v7.6a.6.6 0 00.9.5l6-3.8a.6.6 0 000-1L1.9.7A.6.6 0 001 1.2z" /></svg>
      Run
      <kbd className="ml-0.5 hidden rounded-xs bg-on-primary/15 px-1 font-sans text-[10px] leading-4 sm:inline">⌘⏎</kbd>
    </button>
  )
}
