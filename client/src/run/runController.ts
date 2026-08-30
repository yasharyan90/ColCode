/**
 * Owns one code run at a time from the browser side: POSTs to /api/run,
 * parses the NDJSON event stream, and fans events out to subscribers (the
 * output terminal, the Run/Stop button). Aborting the fetch cancels the run
 * all the way down to the container.
 */
export type RunEvent =
  | { type: 'start'; language: string; limits: { wallMs: number; memory: string; cpus: string }; note?: string }
  | { type: 'stdout'; data: string }
  | { type: 'stderr'; data: string }
  | { type: 'exit'; code: number | null; reason: 'completed' | 'timeout' | 'output-limit' | 'oom' | 'cancelled'; durationMs: number }
  | { type: 'error'; message: string }
  | { type: 'launch'; fileName: string; language: string } // local: emitted before the request

export type RunStatus = 'idle' | 'running'

/** Static fallback; EditorPage refreshes this from /api/run/languages. */
export const RUNNABLE_LANGUAGES = new Set(['python', 'javascript', 'typescript', 'ruby', 'go'])

export async function refreshRunnableLanguages() {
  try {
    const res = await fetch('/api/run/languages', { credentials: 'same-origin' })
    if (!res.ok) return
    const { languages } = await res.json() as { languages: string[] }
    RUNNABLE_LANGUAGES.clear(); languages.forEach((l) => RUNNABLE_LANGUAGES.add(l))
  } catch { /* keep fallback */ }
}

type Listener = (ev: RunEvent) => void
type StatusListener = (s: RunStatus) => void

export class RunController {
  private listeners = new Set<Listener>()
  private statusListeners = new Set<StatusListener>()
  private abort: AbortController | null = null
  status: RunStatus = 'idle'

  subscribe(fn: Listener) { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  onStatus(fn: StatusListener) { this.statusListeners.add(fn); return () => { this.statusListeners.delete(fn) } }

  private emit(ev: RunEvent) { for (const l of this.listeners) l(ev) }
  private setStatus(s: RunStatus) { this.status = s; for (const l of this.statusListeners) l(s) }

  async start(fileName: string, language: string, code: string) {
    if (this.status === 'running') return
    this.setStatus('running')
    this.abort = new AbortController()
    this.emit({ type: 'launch', fileName, language })
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ language, code }),
        signal: this.abort.signal,
      })
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string }
        this.emit({ type: 'error', message: err.error ?? `HTTP ${res.status}` })
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1)
          if (line) this.emit(JSON.parse(line) as RunEvent)
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') this.emit({ type: 'exit', code: null, reason: 'cancelled', durationMs: 0 })
      else this.emit({ type: 'error', message: (err as Error).message })
    } finally {
      this.abort = null
      this.setStatus('idle')
    }
  }

  stop() { this.abort?.abort() }
}
