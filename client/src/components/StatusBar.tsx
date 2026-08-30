import type { CursorInfo } from './EditorPane'
import type { SyncStatus } from '../collab/useProject'

interface Props {
  cursor: CursorInfo
  language: string
  fileName: string
  status: SyncStatus
  synced: boolean
  peerCount: number
}

const LANGUAGE_LABELS: Record<string, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  python: 'Python',
  markdown: 'Markdown',
  json: 'JSON',
  plaintext: 'Plain Text',
}

/** 24px status bar. Left: sync state + file; right: cursor, language. */
export function StatusBar({ cursor, language, fileName, status, synced, peerCount }: Props) {
  const conn =
    status === 'connected'
      ? synced
        ? { label: 'Synced', dot: 'bg-success' }
        : { label: 'Syncing…', dot: 'bg-warning' }
      : status === 'connecting'
        ? { label: 'Connecting…', dot: 'bg-warning' }
        : { label: 'Offline — edits queue locally', dot: 'bg-error' }

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-hairline bg-canvas px-3 text-[11.5px] text-muted">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5" title={`sync: ${status}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${conn.dot}`} aria-hidden />
          {conn.label}
        </span>
        {fileName && <span className="font-mono">{fileName}</span>}
        {peerCount > 1 && <span>{peerCount} in room</span>}
      </div>
      <div className="flex items-center gap-4">
        <span>
          Ln {cursor.line}, Col {cursor.column}
        </span>
        <span>Spaces: 2</span>
        <span>UTF-8</span>
        {language && <span className="text-body">{LANGUAGE_LABELS[language] ?? language}</span>}
      </div>
    </footer>
  )
}
