import { FileIcon } from './FileIcon'

/** Cursor-style path strip under the tabs: project › folder › file. */
export function Breadcrumbs({ projectName, path }: { projectName: string; path: string }) {
  const parts = path.split('/').filter(Boolean)
  const file = parts[parts.length - 1]
  const dirs = parts.slice(0, -1)
  return (
    <div className="flex h-[22px] shrink-0 items-center gap-1 overflow-hidden border-b border-hairline-soft bg-editor px-4 text-[11.5px] text-muted" data-breadcrumbs>
      <Crumb>{projectName}</Crumb>
      {dirs.map((d, i) => (
        <span key={i} className="flex items-center gap-1">
          <Chevron />
          <Crumb>{d}</Crumb>
        </span>
      ))}
      {file && (
        <span className="flex items-center gap-1.5">
          <Chevron />
          <FileIcon name={file} size={11} />
          <span className="font-mono text-[11.5px] text-body">{file}</span>
        </span>
      )}
    </div>
  )
}

function Crumb({ children }: { children: React.ReactNode }) {
  return <span className="truncate">{children}</span>
}

function Chevron() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.2" className="shrink-0 text-muted-soft" aria-hidden>
      <path d="M3 1.5l2.5 2.5L3 6.5" />
    </svg>
  )
}
