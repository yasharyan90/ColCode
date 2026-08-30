import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { xtermTheme } from '../theme/xtermTheme'
import { fonts } from '../theme/tokens'
import { useResizable } from '../lib/useResizable'
import type { RunController, RunEvent } from '../run/runController'

interface Props {
  open: boolean
  onToggle: () => void
  controller: RunController
}

// ANSI helpers — colors map through xtermTheme.
const DIM = '\x1b[2m', RESET = '\x1b[0m', RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', BOLD = '\x1b[1m'

/**
 * Output panel: an xterm.js terminal that renders the run event stream, in a
 * drag-resizable bottom panel. Display-only (no interactive stdin).
 */
export function OutputPanel({ open, onToggle, controller }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const { size: height, onPointerDown } = useResizable(224, { min: 96, max: 640, axis: 'y', invert: true })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const term = new Terminal({
      theme: xtermTheme,
      fontFamily: fonts.code,
      fontSize: 12.5,
      lineHeight: 1.45,
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
    term.write(`${DIM}Press Run (⌘⏎) to execute the current file in an isolated sandbox.${RESET}\r\n`)
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

  // Re-fit when the panel opens or is resized.
  useEffect(() => { if (open) requestAnimationFrame(() => { try { fitRef.current?.fit() } catch { /* ignore */ } }) }, [open, height])

  return (
    <section
      className="relative flex shrink-0 flex-col border-t border-hairline bg-panel"
      style={{ height: open ? height : 36 }}
      data-output-panel
    >
      {open && (
        <div
          onPointerDown={onPointerDown}
          className="group absolute inset-x-0 -top-[3px] z-10 h-[6px] cursor-row-resize"
          aria-hidden
        >
          <div className="mx-auto mt-[2px] h-px w-full bg-transparent transition-colors group-hover:bg-primary/70 group-active:bg-primary" />
        </div>
      )}
      <header className="flex h-9 shrink-0 items-center justify-between pl-4 pr-2">
        <div className="flex h-full items-stretch gap-4">
          <PanelTab active>Output</PanelTab>
          <PanelTab>Problems</PanelTab>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => termRef.current?.clear()}
            className="caption-upper rounded-xs px-1.5 py-0.5 text-[10px] text-muted-soft transition-colors hover:bg-raised hover:text-body"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="grid h-6 w-6 place-items-center rounded-xs text-muted transition-colors hover:bg-raised hover:text-ink"
            aria-label={open ? 'Collapse output' : 'Expand output'}
            title={open ? 'Collapse panel' : 'Expand panel'}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              {open ? <path d="M2 3.5l3 3 3-3" /> : <path d="M2 6.5l3-3 3 3" />}
            </svg>
          </button>
        </div>
      </header>
      <div ref={hostRef} className={['min-h-0 flex-1 px-3 pb-2', open ? '' : 'hidden'].join(' ')} data-terminal />
    </section>
  )
}

function PanelTab({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span className={['caption-upper relative flex items-center text-[10.5px]', active ? 'text-ink' : 'text-muted-soft'].join(' ')}>
      {children}
      {active && <span className="absolute inset-x-0 bottom-0 h-px bg-ink/70" aria-hidden />}
    </span>
  )
}
