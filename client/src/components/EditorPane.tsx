import Editor, { type OnMount } from '@monaco-editor/react'
import { useEffect, useRef } from 'react'
import type * as Monaco from 'monaco-editor'
import type * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'
import { MonacoBinding } from 'y-monaco'
import { CURSOR_DARK } from '../theme/cursorDark'
import { fonts } from '../theme/tokens'

export interface CursorInfo {
  line: number
  column: number
}

interface Props {
  path: string
  language: string
  ytext: Y.Text
  awareness: Awareness
  readOnly?: boolean
  /** Bump `nonce` to scroll `line` into view (used by click-to-follow). */
  reveal?: { line: number; nonce: number } | null
  onCursorChange: (cursor: CursorInfo) => void
}

/**
 * One Monaco instance per open file, bound to a Y.Text via y-monaco. The CRDT
 * is the source of truth: local edits go into the Y.Text, remote updates flow
 * back into the model. No `value`/`onChange` — React never owns the text.
 *
 * Awareness carries remote cursors: y-monaco writes our selection into the
 * awareness state and renders every peer's as decorations (see PresenceStyles).
 */
export function EditorPane({ path, language, ytext, awareness, readOnly = false, reveal, onCursorChange }: Props) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const bindingRef = useRef<MonacoBinding | null>(null)
  const pendingReveal = useRef<{ line: number; nonce: number } | null>(null)

  const applyReveal = (editor: Monaco.editor.IStandaloneCodeEditor, target: { line: number }) => {
    // The model may still be filling from the Y.Text on a fresh mount; wait a frame.
    requestAnimationFrame(() => {
      const line = Math.max(1, Math.min(target.line, editor.getModel()?.getLineCount() ?? target.line))
      editor.revealLineInCenter(line)
      editor.setPosition({ lineNumber: line, column: 1 })
      editor.focus()
    })
  }

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor
    if (pendingReveal.current) { applyReveal(editor, pendingReveal.current); pendingReveal.current = null }
    const model = editor.getModel()
    if (model) bindingRef.current = new MonacoBinding(ytext, model, new Set([editor]), awareness)
    flashTagsOnRemoteActivity(editor, awareness)
    if (import.meta.env.DEV) Object.assign(window as object, { __editor: editor, __binding: bindingRef.current })
    editor.onDidChangeCursorPosition((e) => {
      onCursorChange({ line: e.position.lineNumber, column: e.position.column })
    })
    editor.focus()
  }

  useEffect(() => {
    if (!reveal) return
    const editor = editorRef.current
    if (editor) applyReveal(editor, reveal)
    else pendingReveal.current = reveal // pane is still mounting (follow across files)
  }, [reveal])

  useEffect(() => {
    return () => {
      bindingRef.current?.destroy()
      bindingRef.current = null
      // y-monaco leaves our last selection in awareness when it unbinds; clear it
      // so peers don't see a ghost cursor in a file we've navigated away from.
      awareness.setLocalStateField('selection', null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- awareness is stable for the life of the session
  }, [])

  return (
    <Editor
      path={path}
      language={language}
      defaultValue=""
      theme={CURSOR_DARK}
      onMount={handleMount}
      loading={<div className="h-full w-full bg-editor" />}
      options={{ ...EDITOR_OPTIONS, readOnly, readOnlyMessage: { value: 'You have view-only access to this project.' } }}
    />
  )
}

/**
 * Name tags are hidden by default so they don't clutter the code; whenever a
 * peer's cursor moves we reveal that peer's tag for a moment (like Docs/Figma).
 */
function flashTagsOnRemoteActivity(editor: Monaco.editor.IStandaloneCodeEditor, awareness: Awareness) {
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  const onChange = ({ updated }: { updated: number[] }) => {
    for (const clientId of updated) {
      if (clientId === awareness.clientID) continue
      clearTimeout(timers.get(clientId))
      // Decorations re-render asynchronously; apply the class on the next frame.
      requestAnimationFrame(() => {
        editor.getDomNode()?.querySelectorAll(`.yRemoteSelectionHead-${clientId}`).forEach((el) => el.classList.add('tag-visible'))
      })
      timers.set(clientId, setTimeout(() => {
        editor.getDomNode()?.querySelectorAll(`.yRemoteSelectionHead-${clientId}`).forEach((el) => el.classList.remove('tag-visible'))
      }, 2000))
    }
  }
  awareness.on('change', onChange)
  editor.onDidDispose(() => awareness.off('change', onChange))
}

const EDITOR_OPTIONS: Monaco.editor.IStandaloneEditorConstructionOptions = {
  fontFamily: fonts.code,
  fontSize: 13,
  lineHeight: 20,
  fontLigatures: true,
  letterSpacing: 0,
  tabSize: 2,
  insertSpaces: true,
  minimap: { enabled: true, renderCharacters: false, scale: 1 },
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'on',
  cursorWidth: 2,
  renderLineHighlight: 'line',
  lineNumbersMinChars: 4,
  glyphMargin: false,
  folding: true,
  bracketPairColorization: { enabled: false },
  guides: { indentation: true, bracketPairs: false },
  padding: { top: 12, bottom: 12 },
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  renderWhitespace: 'none',
  wordWrap: 'off',
  automaticLayout: true,
  quickSuggestions: true,
  suggestOnTriggerCharacters: true,
  stickyScroll: { enabled: false },
}
