interface Props {
  files: string[]
  activeFile: string
  onSelect: (name: string) => void
  onClose: (name: string) => void
}

/** Tab strip. The active tab gets a 1px orange underline — the accent stays scarce. */
export function EditorTabs({ files, activeFile, onSelect, onClose }: Props) {
  return (
    <div className="flex h-9 shrink-0 items-end border-b border-hairline bg-canvas">
      {files.map((name) => {
        const active = name === activeFile
        return (
          <div
            key={name}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(name)}
            className={[
              'group relative flex h-9 cursor-pointer items-center gap-2 border-r border-hairline px-3 font-mono text-[12.5px] transition-colors',
              active ? 'bg-editor text-ink' : 'text-muted hover:bg-raised/60 hover:text-body',
            ].join(' ')}
          >
            <span>{name}</span>
            <button
              type="button"
              aria-label={`Close ${name}`}
              onClick={(e) => {
                e.stopPropagation()
                onClose(name)
              }}
              className="grid h-4 w-4 place-items-center rounded-xs text-muted-soft opacity-0 transition-opacity hover:bg-strong hover:text-ink group-hover:opacity-100"
            >
              ×
            </button>
            {active && <span className="absolute inset-x-0 top-0 h-px bg-primary" aria-hidden />}
          </div>
        )
      })}
    </div>
  )
}
