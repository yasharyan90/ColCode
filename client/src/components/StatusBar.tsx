import type { CursorInfo } from './EditorPane'
import type { SyncStatus } from '../collab/useProject'

interface Props {
  cursor: CursorInfo
  language: string
  fileName: string
  status: SyncStatus
  synced: boolean
  peerCount: number
  onGoToLine?: () => void
}

const LANGUAGE_LABELS: Record<string, string> = {
  typescript: 'TypeScript', javascript: 'JavaScript', python: 'Python', go: 'Go', ruby: 'Ruby', rust: 'Rust',
  markdown: 'Markdown', json: 'JSON', yaml: 'YAML', html: 'HTML', css: 'CSS', shell: 'Shell', sql: 'SQL', plaintext: 'Plain Text',
}

/** 24px status bar. Left: sync state + room; right: cursor, indentation, encoding, language. */
export function StatusBar({ cursor, language, fileName, status, synced, peerCount, onGoToLine }: Props) {
  const conn =
    status === 'connected'
      ? synced
        ? { label: 'Synced', dot: 'bg-success', pulse: false }
        : { label: 'Syncing…', dot: 'bg-warning', pulse: true }
      : status === 'connecting'
        ? { label: 'Connecting…', dot: 'bg-warning', pulse: true }
        : { label: 'Offline — edits queue locally', dot: 'bg-error', pulse: false }

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-hairline bg-canvas px-3 text-[11.5px] text-muted" data-status-bar>
      <div className="flex items-center gap-1">
        <Item title={`sync: ${status}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${conn.dot} ${conn.pulse ? 'animate-pulse' : ''}`} aria-hidden />
          {conn.label}
        </Item>
        {peerCount > 1 && (
          <Item title="People in this project right now">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><circle cx="4.5" cy="4" r="2" /><path d="M1.5 10.5a3 3 0 016 0" /><path d="M8 6.2a2 2 0 100-4M10.5 10.5a3 3 0 00-2.5-2.95" /></svg>
            {peerCount} in room
          </Item>
        )}
        {fileName && <Item className="font-mono text-muted-soft">{fileName}</Item>}
      </div>
      <div className="flex items-center gap-1">
        <Item title="Go to line (⌃G)" onClick={onGoToLine}>Ln {cursor.line}, Col {cursor.column}</Item>
        <Item>Spaces: 2</Item>
        <Item>UTF-8</Item>
        {language && <Item className="text-body">{LANGUAGE_LABELS[language] ?? language}</Item>}
      </div>
    </footer>
  )
}

function Item({ children, title, onClick, className = '' }: { children: React.ReactNode; title?: string; onClick?: () => void; className?: string }) {
  const cls = `flex h-5 items-center gap-1.5 rounded-xs px-1.5 ${className} ${onClick ? 'cursor-pointer transition-colors hover:bg-raised hover:text-ink' : ''}`
  return onClick
    ? <button type="button" title={title} onClick={onClick} className={cls}>{children}</button>
    : <span title={title} className={cls}>{children}</span>
}
