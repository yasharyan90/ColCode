import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import type { Awareness } from 'y-protocols/awareness'
import { loadUserName, makeUser, pickColor, saveUserName, type Peer, type PresenceUser } from './presence'

export type SyncStatus = 'connecting' | 'connected' | 'disconnected'

export interface ProjectSession {
  doc: Y.Doc
  provider: WebsocketProvider
  awareness: Awareness
  files: Y.Map<Y.Text>
}

export interface ProjectState {
  session: ProjectSession | null
  fileNames: string[]
  status: SyncStatus
  synced: boolean
  /** Everyone in the room, self first, then by clientId. */
  peers: Peer[]
  self: PresenceUser | null
  setName: (name: string) => void
  setActiveFile: (file: string | null) => void
}

/** Dev: the sync server's own port. Prod: same origin under /sync (Caddy strips the prefix). */
const SYNC_URL =
  import.meta.env.VITE_SYNC_URL ??
  (import.meta.env.DEV ? 'ws://localhost:1234' : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/sync`)

/** Resolve a peer's cursor (a Yjs relative position written by y-monaco) to a line number. */
function cursorLine(state: Record<string, unknown>, files: Y.Map<Y.Text>): number | null {
  const sel = state.selection as { head?: Y.RelativePosition } | undefined
  const file = state.file as string | undefined
  if (!sel?.head || !file || !files.doc) return null
  const text = files.get(file)
  if (!text) return null
  const abs = Y.createAbsolutePositionFromRelativePosition(sel.head, files.doc)
  if (!abs || abs.type !== text) return null
  const before = text.toString().slice(0, abs.index)
  return (before.match(/\n/g)?.length ?? 0) + 1
}

/**
 * One Y.Doc + one WebsocketProvider per project. The room name is the project
 * ID; the server authorizes the join before the socket enters the room.
 *
 * `files` is a Y.Map<Y.Text> keyed by path. Editors bind to individual Y.Texts;
 * the file list re-renders when keys are added/removed.
 *
 * Presence rides on the provider's built-in awareness protocol: we publish
 * `user` + `file`, y-monaco publishes `selection`. No separate presence system.
 *
 * The doc/provider are created inside the effect (not useMemo) so that React
 * StrictMode's mount→unmount→mount cycle tears down and recreates them as a
 * pair — a provider destroyed in cleanup is never reused.
 */
export function useProject(projectId: string, token: string | null, displayName?: string, avatar?: string | null): ProjectState {
  const [session, setSession] = useState<ProjectSession | null>(null)
  const [status, setStatus] = useState<SyncStatus>('connecting')
  const [synced, setSynced] = useState(false)
  const [fileNames, setFileNames] = useState<string[]>([])
  const [peers, setPeers] = useState<Peer[]>([])
  const [self, setSelf] = useState<PresenceUser | null>(null)

  useEffect(() => {
    const doc = new Y.Doc()
    const files = doc.getMap<Y.Text>('files')
    const provider = new WebsocketProvider(SYNC_URL, projectId, doc, {
      params: token ? { token } : {},
    })
    const awareness = provider.awareness

    const onStatus = ({ status }: { status: SyncStatus }) => setStatus(status)
    const onSync = (isSynced: boolean) => setSynced(isSynced)
    const onFiles = () => setFileNames([...files.keys()].sort())

    const readPeers = (): Peer[] => {
      const out: Peer[] = []
      awareness.getStates().forEach((state, clientId) => {
        const user = state.user as PresenceUser | undefined
        if (!user) return
        out.push({ clientId, user, file: (state.file as string | null) ?? null, line: cursorLine(state, files), isSelf: clientId === doc.clientID })
      })
      return out.sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || a.clientId - b.clientId)
    }
    const onAwareness = () => setPeers(readPeers())

    // Choose a color once the first awareness sync arrives so we can avoid
    // colors already in use; until then we're provisional.
    let colorChosen = false
    const chooseIdentity = () => {
      if (colorChosen) return
      colorChosen = true
      const taken: string[] = []
      awareness.getStates().forEach((s, id) => { if (id !== doc.clientID && s.user) taken.push(s.user.color) })
      const user = makeUser(displayName ?? loadUserName(), pickColor(doc.clientID, taken), avatar)
      awareness.setLocalStateField('user', user)
      setSelf(user)
    }

    provider.on('status', onStatus)
    provider.on('sync', onSync)
    files.observe(onFiles)
    awareness.on('change', onAwareness)
    // Provisional identity right away (so a solo user sees themselves), then
    // re-pick color on first sync when we know who's in the room.
    const provisional = makeUser(displayName ?? loadUserName(), pickColor(doc.clientID, []), avatar)
    awareness.setLocalStateField('user', provisional)
    setSelf(provisional)
    provider.once('sync', chooseIdentity)

    setSession({ doc, provider, awareness, files })
    if (import.meta.env.DEV) (window as unknown as { __colcode?: unknown }).__colcode = { doc, provider, awareness, files, Y }
    setStatus(provider.wsconnected ? 'connected' : 'connecting')
    setSynced(provider.synced)
    onFiles()
    onAwareness()

    return () => {
      provider.off('status', onStatus)
      provider.off('sync', onSync)
      files.unobserve(onFiles)
      awareness.off('change', onAwareness)
      provider.destroy()
      doc.destroy()
      setSession(null)
      setSynced(false)
      setFileNames([])
      setPeers([])
      setSelf(null)
      setStatus('connecting')
    }
  }, [projectId, token, displayName, avatar])

  const setName = useCallback((name: string) => {
    const trimmed = name.trim().slice(0, 32)
    if (!session || !trimmed) return
    const current = session.awareness.getLocalState()?.user as PresenceUser | undefined
    const user = makeUser(trimmed, current?.color ?? pickColor(session.doc.clientID, []), current?.avatar)
    session.awareness.setLocalStateField('user', user)
    saveUserName(trimmed)
    setSelf(user)
  }, [session])

  const setActiveFile = useCallback((file: string | null) => {
    session?.awareness.setLocalStateField('file', file)
  }, [session])

  return { session, fileNames, status, synced, peers, self, setName, setActiveFile }
}
