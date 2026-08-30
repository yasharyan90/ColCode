import { useMemo, useState } from 'react'
import * as Y from 'yjs'
import type { Peer } from '../collab/presence'

interface Props {
  files: Y.Map<Y.Text> | undefined
  fileNames: string[]
  activeFile: string
  peers: Peer[]
  readOnly: boolean
  onOpen: (name: string) => void
  onDeleted: (name: string) => void
  onRenamed: (from: string, to: string) => void
}

interface Node { name: string; path: string; children?: Node[]; isDir: boolean }

/**
 * Explorer. Folders are implicit — a folder exists because a file path
 * contains it — so "new folder" only lives locally until a file is put in it.
 * All mutations go through the shared Y.Map, so every collaborator sees them.
 */
export function FileTree({ files, fileNames, activeFile, peers, readOnly, onOpen, onDeleted, onRenamed }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [pendingDirs, setPendingDirs] = useState<string[]>([])
  const [editing, setEditing] = useState<{ kind: 'new-file' | 'new-dir' | 'rename'; dir: string; path?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const tree = useMemo(() => buildTree(fileNames, pendingDirs), [fileNames, pendingDirs])
  const activeDir = activeFile.includes('/') ? activeFile.slice(0, activeFile.lastIndexOf('/')) : ''

  const toggle = (path: string) => setCollapsed((s) => { const n = new Set(s); n.has(path) ? n.delete(path) : n.add(path); return n })

  const commit = (value: string) => {
    const name = value.trim().replace(/^\/+|\/+$/g, '')
    if (!editing) return
    if (!name) { setEditing(null); return }
    if (!/^[\w.\- ]+(\/[\w.\- ]+)*$/.test(name)) { setError('Use letters, digits, . _ - and / for folders'); return }
    const full = editing.dir ? `${editing.dir}/${name}` : name
    setError(null)
    try {
      if (editing.kind === 'new-file') {
        if (!files) return
        if (files.has(full)) { setError('A file with that name exists'); return }
        createFile(files, full)
        onOpen(full)
      } else if (editing.kind === 'new-dir') {
        setPendingDirs((d) => [...d, full])
        setCollapsed((s) => { const n = new Set(s); n.delete(full); return n })
      } else if (editing.kind === 'rename' && editing.path) {
        if (!files) return
        const target = editing.dir ? `${editing.dir}/${name}` : name
        if (target !== editing.path) {
          if (fileNames.includes(editing.path)) {
            if (files.has(target)) { setError('A file with that name exists'); return }
            renameFile(files, editing.path, target)
            onRenamed(editing.path, target)
          } else {
            // folder rename: move every file under it
            renameFolder(files, editing.path, target, fileNames, onRenamed)
            setPendingDirs((d) => d.map((x) => x === editing.path ? target : x))
          }
        }
      }
      setEditing(null)
    } catch (e) { setError((e as Error).message) }
  }

  const remove = (node: Node) => {
    if (!files) return
    if (node.isDir) {
      const under = fileNames.filter((f) => f.startsWith(node.path + '/'))
      files.doc?.transact(() => { for (const f of under) files.delete(f) })
      under.forEach(onDeleted)
      setPendingDirs((d) => d.filter((x) => x !== node.path && !x.startsWith(node.path + '/')))
    } else {
      files.delete(node.path)
      onDeleted(node.path)
    }
  }

  return (
    <nav className="flex min-h-0 flex-1 flex-col" data-file-tree>
      <div className="flex h-9 items-center justify-between px-4">
        <span className="caption-upper text-muted">Explorer</span>
        {!readOnly && (
          <div className="flex items-center gap-0.5">
            <IconButton title="New file" data-new-file onClick={() => setEditing({ kind: 'new-file', dir: activeDir })}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M3 1.5h4l2.5 2.5v6.5h-6.5z M7 1.5v2.5h2.5 M6 6v3 M4.5 7.5h3" /></svg>
            </IconButton>
            <IconButton title="New folder" data-new-folder onClick={() => setEditing({ kind: 'new-dir', dir: activeDir })}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M1.5 3h3l1 1h5v5.5h-9z M6 5.5v3 M4.5 7h3" /></svg>
            </IconButton>
          </div>
        )}
      </div>
      <ul className="flex-1 overflow-y-auto pb-4">
        {editing && editing.dir === '' && editing.kind !== 'rename' && (
          <li><InlineInput depth={0} placeholder={editing.kind === 'new-file' ? 'file-name.py' : 'folder-name'} onCommit={commit} onCancel={() => { setEditing(null); setError(null) }} /></li>
        )}
        {tree.map((node) => (
          <TreeNode
            key={node.path} node={node} depth={0}
            activeFile={activeFile} peers={peers} collapsed={collapsed} readOnly={readOnly}
            editing={editing} onToggle={toggle} onOpen={onOpen}
            onNew={(kind, dir) => setEditing({ kind, dir })}
            onRename={(n) => setEditing({ kind: 'rename', dir: n.path.includes('/') ? n.path.slice(0, n.path.lastIndexOf('/')) : '', path: n.path })}
            onDelete={remove} onCommit={commit} onCancel={() => { setEditing(null); setError(null) }}
          />
        ))}
      </ul>
      {error && <p className="px-4 pb-2 text-[11.5px] text-error">{error}</p>}
    </nav>
  )
}

function TreeNode(props: {
  node: Node; depth: number; activeFile: string; peers: Peer[]; collapsed: Set<string>; readOnly: boolean
  editing: { kind: 'new-file' | 'new-dir' | 'rename'; dir: string; path?: string } | null
  onToggle: (p: string) => void; onOpen: (p: string) => void
  onNew: (kind: 'new-file' | 'new-dir', dir: string) => void; onRename: (n: Node) => void; onDelete: (n: Node) => void
  onCommit: (v: string) => void; onCancel: () => void
}) {
  const { node, depth, activeFile, peers, collapsed, readOnly, editing } = props
  const isCollapsed = collapsed.has(node.path)
  const here = peers.filter((p) => !p.isSelf && (node.isDir ? p.file?.startsWith(node.path + '/') : p.file === node.path))
  const active = !node.isDir && node.path === activeFile
  const isRenaming = editing?.kind === 'rename' && editing.path === node.path

  const row = isRenaming ? (
    <InlineInput depth={depth} initial={node.name} onCommit={props.onCommit} onCancel={props.onCancel} />
  ) : (
    <div
      role="treeitem"
      aria-selected={active}
      data-path={node.path}
      data-kind={node.isDir ? 'dir' : 'file'}
      onClick={() => node.isDir ? props.onToggle(node.path) : props.onOpen(node.path)}
      className={[
        'group flex w-full cursor-pointer items-center gap-1.5 py-1 pr-2 text-left text-[13px] transition-colors',
        active ? 'bg-raised text-ink' : 'text-body hover:bg-raised/60 hover:text-ink',
      ].join(' ')}
      style={{ paddingLeft: 12 + depth * 14 }}
    >
      {node.isDir ? (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3" className={['shrink-0 text-muted transition-transform', isCollapsed ? '' : 'rotate-90'].join(' ')} aria-hidden><path d="M3.5 2l3 3-3 3" /></svg>
      ) : (
        <FileGlyph name={node.name} />
      )}
      <span className={['truncate', node.isDir ? '' : 'font-mono text-[12.5px]'].join(' ')}>{node.name}</span>
      {here.length > 0 && (
        <span className="ml-auto flex shrink-0 -space-x-0.5" title={here.map((p) => p.user.name).join(', ')}>
          {here.slice(0, 3).map((p) => <span key={p.clientId} className="inline-block h-2 w-2 rounded-full border border-canvas" style={{ background: p.user.color }} />)}
        </span>
      )}
      {!readOnly && (
        <span className={['flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100', here.length ? '' : 'ml-auto'].join(' ')} onClick={(e) => e.stopPropagation()}>
          {node.isDir && <IconButton title="New file here" onClick={() => props.onNew('new-file', node.path)}>+</IconButton>}
          <IconButton title="Rename" data-rename onClick={() => props.onRename(node)}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M6.5 1.5l2 2-5 5h-2v-2z" /></svg>
          </IconButton>
          <IconButton title="Delete" data-delete onClick={() => props.onDelete(node)}>×</IconButton>
        </span>
      )}
    </div>
  )

  return (
    <li>
      {row}
      {node.isDir && !isCollapsed && (
        <ul>
          {editing && editing.kind !== 'rename' && editing.dir === node.path && (
            <li><InlineInput depth={depth + 1} placeholder={editing.kind === 'new-file' ? 'file-name.py' : 'folder-name'} onCommit={props.onCommit} onCancel={props.onCancel} /></li>
          )}
          {node.children!.map((c) => <TreeNode key={c.path} {...props} node={c} depth={depth + 1} />)}
        </ul>
      )}
    </li>
  )
}

function InlineInput({ depth, initial = '', placeholder, onCommit, onCancel }: { depth: number; initial?: string; placeholder?: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial)
  return (
    <div style={{ paddingLeft: 12 + depth * 14 }} className="py-0.5 pr-2">
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        data-tree-input
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onCommit(value); if (e.key === 'Escape') onCancel() }}
        onBlur={() => (value.trim() && value !== initial ? onCommit(value) : onCancel())}
        className="h-6 w-full rounded-sm border border-primary bg-editor px-1.5 font-mono text-[12.5px] text-ink outline-none"
      />
    </div>
  )
}

function IconButton({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...rest} className="grid h-5 w-5 place-items-center rounded-xs text-muted transition-colors hover:bg-strong hover:text-ink">
      {children}
    </button>
  )
}

function FileGlyph({ name }: { name: string }) {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  const label = ext ? (ext.length <= 3 ? ext.toUpperCase() : ext.slice(0, 2).toUpperCase()) : '·'
  return (
    <span className="grid h-4 w-6 shrink-0 place-items-center rounded-xs border border-hairline-strong text-[9px] font-semibold tracking-wide text-muted">
      {label}
    </span>
  )
}

// ---------- tree building & Y.Map mutations ----------

function buildTree(paths: string[], pendingDirs: string[]): Node[] {
  const root: Node = { name: '', path: '', isDir: true, children: [] }
  const dirOf = new Map<string, Node>([['', root]])
  const ensureDir = (path: string): Node => {
    const existing = dirOf.get(path)
    if (existing) return existing
    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    const parent = ensureDir(parentPath)
    const node: Node = { name: path.slice(path.lastIndexOf('/') + 1), path, isDir: true, children: [] }
    parent.children!.push(node)
    dirOf.set(path, node)
    return node
  }
  for (const d of pendingDirs) ensureDir(d)
  for (const p of paths) {
    const parentPath = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
    ensureDir(parentPath).children!.push({ name: p.slice(p.lastIndexOf('/') + 1), path: p, isDir: false })
  }
  const sort = (n: Node) => {
    n.children!.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))
    n.children!.forEach((c) => c.isDir && sort(c))
  }
  sort(root)
  return root.children!
}

function createFile(files: Y.Map<Y.Text>, path: string) {
  files.set(path, new Y.Text())
}

/** Y types can't be moved between keys, so a rename is copy-then-delete in one transaction. */
function renameFile(files: Y.Map<Y.Text>, from: string, to: string) {
  files.doc!.transact(() => {
    const content = files.get(from)?.toString() ?? ''
    const text = new Y.Text()
    files.set(to, text)
    text.insert(0, content)
    files.delete(from)
  })
}

function renameFolder(files: Y.Map<Y.Text>, from: string, to: string, names: string[], onRenamed: (a: string, b: string) => void) {
  const under = names.filter((f) => f.startsWith(from + '/'))
  files.doc!.transact(() => {
    for (const f of under) renameFile(files, f, to + f.slice(from.length))
  })
  under.forEach((f) => onRenamed(f, to + f.slice(from.length)))
}
