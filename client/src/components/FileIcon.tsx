/**
 * Language-tinted file glyph — Cursor/VS Code style colored file icons, rendered as a
 * tiny two-letter mono label so the tree, tabs and breadcrumbs share one vocabulary.
 * Hues come from the syntax + presence palettes so they never fight the editor.
 */
const KINDS: Record<string, { label: string; color: string }> = {
  ts: { label: 'TS', color: '#8fc1e8' }, tsx: { label: 'TX', color: '#8fc1e8' }, mts: { label: 'TS', color: '#8fc1e8' }, cts: { label: 'TS', color: '#8fc1e8' },
  js: { label: 'JS', color: '#e6c07b' }, jsx: { label: 'JX', color: '#e6c07b' }, mjs: { label: 'JS', color: '#e6c07b' }, cjs: { label: 'JS', color: '#e6c07b' },
  py: { label: 'PY', color: '#9fc9a2' },
  go: { label: 'GO', color: '#7fcfd8' },
  rb: { label: 'RB', color: '#dfa88f' },
  rs: { label: 'RS', color: '#e0b08a' },
  java: { label: 'JV', color: '#e0b08a' }, c: { label: 'C', color: '#9fbbe0' }, h: { label: 'H', color: '#9fbbe0' }, cpp: { label: 'C+', color: '#9fbbe0' }, cs: { label: 'C#', color: '#c0a8dd' },
  php: { label: 'PH', color: '#c0a8dd' },
  json: { label: '{}', color: '#e6c07b' }, yml: { label: 'YM', color: '#c0a8dd' }, yaml: { label: 'YM', color: '#c0a8dd' }, toml: { label: 'TM', color: '#c0a8dd' },
  md: { label: 'MD', color: '#c9c7bd' }, txt: { label: 'TX', color: '#a09c92' },
  html: { label: '<>', color: '#dfa88f' }, css: { label: 'CS', color: '#c0a8dd' }, scss: { label: 'SC', color: '#c0a8dd' },
  sh: { label: '$_', color: '#a8d4a0' }, sql: { label: 'SQ', color: '#e6c07b' },
}

export function fileKind(name: string) {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
  return KINDS[ext] ?? { label: ext ? ext.slice(0, 2).toUpperCase() : '·', color: '#807d72' }
}

export function FileIcon({ name, size = 14, className = '' }: { name: string; size?: number; className?: string }) {
  const k = fileKind(name)
  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center rounded-[3px] font-mono font-semibold leading-none ${className}`}
      style={{ width: size + 4, height: size, fontSize: size * 0.62, color: k.color, background: `${k.color}1a`, letterSpacing: '0.02em' }}
    >
      {k.label}
    </span>
  )
}

/** Small colored dot for compact contexts (tabs, breadcrumbs) — same hue as the icon. */
export function FileDot({ name }: { name: string }) {
  return <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: fileKind(name).color }} />
}
