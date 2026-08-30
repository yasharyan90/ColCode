import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Member, type ProjectDetail } from '../api'
import type { AuthState } from '../auth/useAuth'
import { TopBar } from '../components/TopBar'
import { FileTree } from '../components/FileTree'
import { EditorTabs } from '../components/EditorTabs'
import { EditorPane, type CursorInfo } from '../components/EditorPane'
import { OutputPanel } from '../components/OutputPanel'
import { StatusBar } from '../components/StatusBar'
import { PresenceStyles } from '../components/PresenceStyles'
import { languageForFile } from '../lib/monaco'
import { useProject } from '../collab/useProject'
import { RunController, RUNNABLE_LANGUAGES, refreshRunnableLanguages, type RunStatus } from '../run/runController'
import type { Peer } from '../collab/presence'
import { navigate } from '../router'

/**
 * The editor for one project. Loads project metadata + a project-scoped sync
 * token from the API (which is where access control lives), then joins the
 * Yjs room with it. File contents live in the Yjs doc; only UI state is local.
 */
export function EditorPage({ projectId, auth }: { projectId: string; auth: AuthState }) {
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.get<ProjectDetail>(`/api/projects/${projectId}`),
      api.get<{ token: string }>(`/api/projects/${projectId}/sync-token`),
    ]).then(([p, t]) => { if (!cancelled) { setProject(p); setToken(t.token) } })
      .catch((e) => { if (!cancelled) setLoadError(e.message) })
    return () => { cancelled = true }
  }, [projectId])

  // Sync tokens live 1h; refresh well before that so reconnects keep working.
  useEffect(() => {
    if (!token) return
    const t = setInterval(() => api.get<{ token: string }>(`/api/projects/${projectId}/sync-token`).then((r) => setToken(r.token)).catch(() => {}), 45 * 60 * 1000)
    return () => clearInterval(t)
  }, [token, projectId])

  if (loadError) return <ErrorState message={loadError} />
  if (!project || !token) return <div className="flex h-full items-center justify-center bg-canvas"><p className="display text-2xl text-muted">Opening project…</p></div>
  return <Workspace project={project} token={token} auth={auth} onMembers={(members) => setProject({ ...project, members })} />
}

function Workspace({ project, token, auth, onMembers }: { project: ProjectDetail; token: string; auth: AuthState; onMembers: (m: Member[]) => void }) {
  const { session, fileNames, status, synced, peers, self, setName, setActiveFile: publishActiveFile } =
    useProject(project.id, token, auth.user?.name, auth.user?.avatarUrl)
  const files = session?.files
  const readOnly = project.role === 'viewer'

  const [openFiles, setOpenFiles] = useState<string[]>([])
  const [activeFile, setActiveFile] = useState<string>('')
  const [cursor, setCursor] = useState<CursorInfo>({ line: 1, column: 1 })
  const [outputOpen, setOutputOpen] = useState(true)

  const controller = useMemo(() => new RunController(), [])
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  useEffect(() => controller.onStatus(setRunStatus), [controller])
  const [, setLangTick] = useState(0)
  useEffect(() => { void refreshRunnableLanguages().then(() => setLangTick((t) => t + 1)) }, [])

  // Click-to-follow: jump to a collaborator's file and cursor line.
  const [reveal, setReveal] = useState<{ line: number; nonce: number } | null>(null)
  const follow = useCallback((peer: Peer) => {
    if (!peer.file || !files?.has(peer.file)) return
    setOpenFiles((prev) => (prev.includes(peer.file!) ? prev : [...prev, peer.file!]))
    setActiveFile(peer.file)
    setReveal({ line: peer.line ?? 1, nonce: Date.now() })
  }, [files])

  useEffect(() => { publishActiveFile(activeFile || null) }, [activeFile, publishActiveFile])

  useEffect(() => {
    if (synced && openFiles.length === 0 && fileNames.length > 0) {
      const first = fileNames.includes('main.ts') ? 'main.ts' : fileNames[0]
      setOpenFiles([first]); setActiveFile(first)
    }
  }, [synced, fileNames, openFiles.length])

  // Files deleted or renamed remotely: drop dead tabs.
  useEffect(() => {
    if (!files || !synced) return
    setOpenFiles((prev) => {
      const next = prev.filter((f) => files.has(f))
      return next.length === prev.length ? prev : next
    })
    if (activeFile && !files.has(activeFile)) setActiveFile((prev) => (files.has(prev) ? prev : ''))
  }, [fileNames, activeFile, files, synced])

  const openFile = useCallback((name: string) => {
    setOpenFiles((prev) => (prev.includes(name) ? prev : [...prev, name]))
    setActiveFile(name)
  }, [])
  const closeFile = useCallback((name: string) => {
    setOpenFiles((prev) => {
      const next = prev.filter((f) => f !== name)
      if (activeFile === name) setActiveFile(next[next.length - 1] ?? '')
      return next
    })
  }, [activeFile])
  const onRenamed = useCallback((from: string, to: string) => {
    setOpenFiles((prev) => prev.map((f) => (f === from ? to : f)))
    setActiveFile((prev) => (prev === from ? to : prev))
  }, [])

  const activeText = activeFile ? files?.get(activeFile) : undefined
  const activeLanguage = activeFile ? languageForFile(activeFile) : ''
  const canRun = !!activeText && RUNNABLE_LANGUAGES.has(activeLanguage)
  const runActive = useCallback(() => {
    if (!activeText || !canRun) return
    setOutputOpen(true)
    void controller.start(activeFile, activeLanguage, activeText.toString())
  }, [activeText, canRun, controller, activeFile, activeLanguage])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runActive() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [runActive])

  return (
    <div className="flex h-full flex-col bg-canvas text-body">
      <PresenceStyles peers={peers} />
      <TopBar
        project={project}
        meId={auth.user?.id ?? ''}
        peers={peers}
        self={self}
        onRename={setName}
        onMembers={onMembers}
        onFollow={follow}
        run={{ status: runStatus, canRun, language: activeLanguage, onRun: runActive, onStop: () => controller.stop() }}
        auth={auth}
      />

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-60 shrink-0 flex-col border-r border-hairline bg-canvas">
          <FileTree files={files} fileNames={fileNames} activeFile={activeFile} peers={peers} readOnly={readOnly}
            onOpen={openFile} onDeleted={closeFile} onRenamed={onRenamed} />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <EditorTabs files={openFiles} activeFile={activeFile} onSelect={setActiveFile} onClose={closeFile} />
          <div className="min-h-0 flex-1 bg-editor">
            {activeText ? (
              <EditorPane
                key={`${project.id}:${activeFile}`}
                path={`${project.id}/${activeFile}`}
                language={activeLanguage}
                ytext={activeText}
                awareness={session!.awareness}
                readOnly={readOnly}
                reveal={reveal}
                onCursorChange={setCursor}
              />
            ) : (
              <EmptyState synced={synced} status={status} />
            )}
          </div>
          <OutputPanel open={outputOpen} onToggle={() => setOutputOpen((o) => !o)} controller={controller} />
        </main>
      </div>

      <StatusBar cursor={cursor} language={activeLanguage} fileName={activeFile} status={status} synced={synced} peerCount={peers.length} />
    </div>
  )
}

function EmptyState({ synced, status }: { synced: boolean; status: string }) {
  const msg = !synced ? (status === 'connected' ? 'Syncing project…' : 'Connecting to sync server…') : 'Open a file to start editing'
  return <div className="flex h-full items-center justify-center"><p className="display text-2xl text-muted">{msg}</p></div>
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-canvas">
      <p className="display text-2xl text-muted">{message}</p>
      <button type="button" onClick={() => navigate('/')} className="rounded-md border border-hairline-strong px-3 py-1.5 text-[13px] text-body hover:bg-raised">Back to projects</button>
    </div>
  )
}
