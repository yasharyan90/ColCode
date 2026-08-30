import { FileIcon } from './FileIcon'

interface Props {
  files: string[]
  activeFile: string
  onSelect: (name: string) => void
  onClose: (name: string) => void
}

/**
 * Tab strip. The active tab sits flush on the editor surface with a 1px orange top
 * hairline — the accent stays scarce. Inactive tabs are quiet until hovered.
 */
export function EditorTabs({ files, activeFile, onSelect, onClose }: Props) {
  return (
    <div className="flex h-9 shrink-0 items-end overflow-x-auto border-b border-hairline bg-canvas" role="tablist" data-editor-tabs>
      {files.map((name) => {
        const active = name === activeFile
        const label = name.slice(name.lastIndexOf('/') + 1)
        const dir = name.slice(0, name.length - label.length)
        return (
          <div
            key={name}
            role="tab"
            aria-selected={active}
            title={name}
            onClick={() => onSelect(name)}
            onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(name) } }}
            className={[
              'group relative flex h-9 shrink-0 cursor-pointer select-none items-center gap-2 border-r border-hairline pl-3 pr-2 font-mono text-[12.5px] transition-colors',
              active ? 'bg-editor text-ink' : 'text-muted hover:bg-raised/50 hover:text-body',
            ].join(' ')}
          >
            <FileIcon name={label} size={12} className={active ? '' : 'opacity-70'} />
            <span className="max-w-[220px] truncate">{dir && <span className="text-muted-soft">{dir}</span>}{label}</span>
            <button
              type="button"
              aria-label={`Close ${name}`}
              onClick={(e) => { e.stopPropagation(); onClose(name) }}
              className={[
                'grid h-[18px] w-[18px] place-items-center rounded-xs text-muted transition-all hover:bg-strong hover:text-ink',
                active ? 'opacity-70' : 'opacity-0 group-hover:opacity-100',
              ].join(' ')}
            >
              <svg width="9" height="9" viewBox="0 0 9 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden><path d="M1.5 1.5l6 6M7.5 1.5l-6 6" /></svg>
            </button>
            {active && <span className="absolute inset-x-0 top-0 h-px bg-primary" aria-hidden />}
            {active && <span className="absolute inset-x-0 -bottom-px h-px bg-editor" aria-hidden />}
          </div>
        )
      })}
      <div className="flex-1" />
    </div>
  )
}
