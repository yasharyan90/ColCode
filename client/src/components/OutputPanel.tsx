import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { xtermTheme } from '../theme/xtermTheme'
import { fonts } from '../theme/tokens'
import type { RunController, RunEvent } from '../run/runController'

interface Props {
  open: boolean
  onToggle: () => void
  controller: RunController
}

// ANSI helpers — colors map through xtermTheme.
const DIM = '\x1b[2m', RESET = '\x1b[0m', RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', BOLD = '\x1b[1m'

/**
 * Output panel: an xterm.js terminal that renders the run event stream.
 * It's display-only for now (no interactive stdin — milestone 6 may add it).
 */
export function OutputPanel({ open, onToggle, controller }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const term = new Terminal({
      theme: xtermTheme,
      fontFamily: fonts.code,
      fontSize: 12.5,
      lineHeight: 1.4,
      cursorBlink: false,
      cursorStyle: 'underline',
      disableStdin: true,
      convertEol: true,
      scrollback: 5000,
      allowProposedApi: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    fit.fit()
    term.write(`${DIM}Press Run to execute the current file in an isolated sandbox.${RESET}\r\n`)
    termRef.current = term
    fitRef.current = fit

    const ro = new ResizeObserver(() => { try { fit.fit() } catch { /* not visible */ } })
    ro.observe(host)

    const unsubscribe = controller.subscribe((ev: RunEvent) => {
      switch (ev.type) {
        case 'launch':
          term.clear()
          term.write(`${DIM}▶ ${ev.language} ${ev.fileName}${RESET}\r\n`)
          break
        case 'start':
          term.write(`${DIM}  sandbox: ${ev.limits.memory} RAM · ${ev.limits.cpus} CPU · ${ev.limits.wallMs / 1000}s · no network${ev.note ? ` · ${ev.note}` : ''}${RESET}\r\n\r\n`)
          break
        case 'stdout':
          term.write(ev.data)
          break
        case 'stderr':
          term.write(`${RED}${ev.data}${RESET}`)
          break
        case 'exit': {
          const secs = (ev.durationMs / 1000).toFixed(2)
          const line =
            ev.reason === 'completed'
              ? ev.code === 0
                ? `${GREEN}✓ exited 0${RESET}${DIM} in ${secs}s${RESET}`
                : `${RED}✗ exited ${ev.code}${RESET}${DIM} in ${secs}s${RESET}`
              : ev.reason === 'timeout'
                ? `${YELLOW}⏱ killed: exceeded wall-clock limit${RESET}${DIM} (${secs}s)${RESET}`
                : ev.reason === 'oom'
                  ? `${YELLOW}⛔ killed: exceeded memory limit${RESET}`
                  : ev.reason === 'output-limit'
                    ? `${YELLOW}✂ killed: output limit reached${RESET}`
                    : `${DIM}■ cancelled${RESET}`
          term.write(`\r\n${line}\r\n`)
          break
        }
        case 'error':
          term.write(`\r\n${RED}${BOLD}error:${RESET} ${RED}${ev.message}${RESET}\r\n`)
          break
      }
    })

    return () => {
      unsubscribe()
      ro.disconnect()
      term.dispose()
      termRef.current = null
    }
  }, [controller])

  // Re-fit when the panel opens.
  useEffect(() => { if (open) requestAnimationFrame(() => { try { fitRef.current?.fit() } catch { /* ignore */ } }) }, [open])

  return (
    <section
      className={['flex shrink-0 flex-col border-t border-hairline bg-panel', open ? 'h-56' : 'h-9'].join(' ')}
      data-output-panel
    >
      <header className="flex h-9 shrink-0 items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <span className="caption-upper text-ink">Output</span>
          <span className="caption-upper text-muted-soft">Problems</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => termRef.current?.clear()}
            className="caption-upper rounded-xs px-1.5 py-0.5 text-muted-soft transition-colors hover:bg-raised hover:text-body"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="grid h-5 w-5 place-items-center rounded-xs text-muted transition-colors hover:bg-raised hover:text-ink"
            aria-label={open ? 'Collapse output' : 'Expand output'}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              {open ? <path d="M2 3.5l3 3 3-3" /> : <path d="M2 6.5l3-3 3 3" />}
            </svg>
          </button>
        </div>
      </header>
      <div ref={hostRef} className={['min-h-0 flex-1 px-3 pb-2', open ? '' : 'hidden'].join(' ')} data-terminal />
    </section>
  )
}
