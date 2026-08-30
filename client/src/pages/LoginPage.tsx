import { useState } from 'react'
import type { AuthState } from '../auth/useAuth'
import { Wordmark, LogoMark } from '../components/Wordmark'
import { FileIcon } from '../components/FileIcon'
import { navigate } from '../router'
import { colors, syntax } from '../theme/tokens'

/**
 * Sign-in page. Left: what ColCode is (live editor preview, features, languages).
 * Right: the sign-in card and a three-step "how it works". Content stays inside the
 * DESIGN.md system — hairlines, one orange, display weight 400.
 */
export function LoginPage({ auth }: { auth: AuthState }) {
  return (
    <div className="login-bg h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-6 py-6 lg:px-10">
        <header className="flex items-center justify-between">
          <Wordmark size={15} />
          <span className="caption-upper hidden text-[10px] text-muted sm:block">Real-time collaborative editor</span>
        </header>

        <div className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:py-14">
          <section className="fade-up">
            <p className="caption-upper text-primary">Live · Sandboxed · Conflict-free</p>
            <h1 className="display mt-3 text-[40px] leading-[1.05] text-ink sm:text-[48px]">Code together, live.</h1>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted">
              ColCode is a shared code editor: one project, many cursors, instant sync. Write in the same
              file at the same time, follow a teammate's caret, and run the code in an isolated sandbox
              without leaving the page.
            </p>

            <EditorPreview />

            <ul className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2">
              <Feature icon={<CursorsIcon />} title="Shared cursors and selections">
                Every collaborator's caret is live, colored and named. Click an avatar to jump to where they are.
              </Feature>
              <Feature icon={<PlayIcon />} title="Run in a sandbox">
                One click executes the open file in a locked-down container — memory, CPU and time limits, no network.
              </Feature>
              <Feature icon={<MergeIcon />} title="Conflict-free by design">
                Edits merge with CRDTs. No locks, no "someone else is editing", no lost keystrokes — even while offline.
              </Feature>
              <Feature icon={<ShieldIcon />} title="Roles that hold">
                Owner, editor, viewer. Invite by GitHub handle; viewers see everything and can change nothing.
              </Feature>
            </ul>

            <div className="mt-10 flex flex-wrap items-center gap-2">
              <span className="caption-upper mr-1 text-[10px] text-muted">Runs</span>
              {['main.py', 'app.js', 'index.ts', 'script.rb', 'main.go'].map((f) => (
                <span key={f} className="flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-[12px] text-body">
                  <FileIcon name={f} size={11} />
                  {LANG_NAMES[f.slice(f.lastIndexOf('.') + 1)]}
                </span>
              ))}
              <span className="text-[12px] text-muted-soft">— syntax + IntelliSense for many more</span>
            </div>
          </section>

          <aside className="fade-up w-full max-w-md justify-self-center lg:justify-self-end" style={{ animationDelay: '80ms' }}>
            <SignInCard auth={auth} />
            <HowItWorks />
          </aside>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline-soft pt-4 text-[11.5px] text-muted-soft">
          <span>Built on Yjs CRDTs, Monaco and Docker sandboxes.</span>
          <span className="font-mono">colcode · v0.1</span>
        </footer>
      </div>
    </div>
  )
}

const LANG_NAMES: Record<string, string> = { py: 'Python', js: 'JavaScript', ts: 'TypeScript', rb: 'Ruby', go: 'Go' }

function SignInCard({ auth }: { auth: AuthState }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submitDev = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await auth.devLogin(name); navigate('/') } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="rounded-xl border border-hairline bg-editor p-7 sm:p-8">
      <LogoMark size={28} />
      <h2 className="display mt-5 text-[24px] leading-tight text-ink">Sign in</h2>
      <p className="mt-1.5 text-[13.5px] text-muted">Use your GitHub account. ColCode never sees your password.</p>

      <div className="mt-7 flex flex-col gap-3">
        {auth.providers.github ? (
          <a href="/api/auth/github" className="flex h-11 items-center justify-center gap-2.5 rounded-md bg-primary text-[14px] font-medium text-on-primary transition-colors hover:bg-primary-active">
            <GitHubIcon /> Continue with GitHub
          </a>
        ) : (
          <div className="rounded-md border border-hairline px-3 py-2.5 text-[12.5px] leading-relaxed text-muted">
            GitHub sign-in is off — set <code className="font-mono text-body">GITHUB_CLIENT_ID</code> / <code className="font-mono text-body">GITHUB_CLIENT_SECRET</code> in <code className="font-mono text-body">.env</code>.
          </div>
        )}

        {auth.providers.dev && (
          <form onSubmit={submitDev} className="mt-3 flex flex-col gap-2 border-t border-hairline-soft pt-5" data-dev-login>
            <div className="flex items-center justify-between">
              <label htmlFor="dev-name" className="caption-upper text-[10px] text-muted">Dev login</label>
              <span className="caption-upper rounded-full bg-strong px-2 py-px text-[9.5px] text-muted">local only</span>
            </div>
            <div className="flex gap-2">
              <input
                id="dev-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={32}
                autoFocus
                className="h-10 min-w-0 flex-1 rounded-md border border-hairline-strong bg-canvas px-3 text-[14px] text-ink outline-none placeholder:text-muted-soft focus:border-muted"
              />
              <button type="submit" disabled={busy || !name.trim()} className="h-10 rounded-md border border-hairline-strong bg-raised px-4 text-[14px] font-medium text-ink transition-colors hover:bg-strong disabled:opacity-50">
                Sign in
              </button>
            </div>
            {error && <p className="text-[12.5px] text-error">{error}</p>}
          </form>
        )}
      </div>
    </div>
  )
}

function HowItWorks() {
  const steps: [string, string][] = [
    ['Sign in with GitHub', 'Your session is a secure cookie — no separate account to manage.'],
    ['Create a project, invite by handle', 'Owners add editors and viewers from the Share menu.'],
    ['Edit together, press ⌘⏎ to run', 'Output streams back into the shared panel in real time.'],
  ]
  return (
    <ol className="mt-6 flex flex-col gap-3 px-1">
      {steps.map(([title, body], i) => (
        <li key={title} className="flex gap-3">
          <span className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full border border-hairline-strong font-mono text-[10.5px] text-muted">{i + 1}</span>
          <div>
            <p className="text-[13px] font-medium text-ink">{title}</p>
            <p className="text-[12.5px] text-muted">{body}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function Feature({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md border border-hairline text-body">{icon}</span>
      <div>
        <p className="text-[13.5px] font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{children}</p>
      </div>
    </li>
  )
}

// ---------- Live editor preview (static mock in the real theme) ----------

const ADA = colors.presence[0]
const GRACE = colors.presence[2]

function EditorPreview() {
  const T = (s: string) => <span style={{ color: syntax.type }}>{s}</span>
  const K = (s: string) => <span style={{ color: syntax.keyword }}>{s}</span>
  const S = (s: string) => <span style={{ color: syntax.string }}>{s}</span>
  const F = (s: string) => <span style={{ color: syntax.function }}>{s}</span>
  const C = (s: string) => <span className="italic" style={{ color: syntax.comment }}>{s}</span>
  const P = (s: string) => <span style={{ color: syntax.property }}>{s}</span>
  const lines: React.ReactNode[] = [
    C('// Shared with Ada and Grace — 3 online'),
    <>{K('type')} {T('Stage')} = {S("'thinking'")} | {S("'editing'")} | {S("'done'")}</>,
    '',
    <>{K('export function')} {F('summarize')}({P('events')}: {T('Event')}[]) {'{'}<RemoteCaret name="Ada" color={ADA} /></>,
    <>  {K('const')} last = events.{F('at')}(-1)</>,
    <>  {K('if')} (!last) {K('return')} {S("'no events'")}</>,
    <>  {K('return')} <span className="rounded-[2px]" style={{ background: `${GRACE}40` }}>{S('`${events.length} events, ${last.stage}`')}</span><RemoteCaret name="Grace" color={GRACE} /></>,
    '}',
    '',
    <>console.{F('log')}({F('summarize')}(timeline))</>,
  ]
  return (
    <div className="mt-8 overflow-hidden rounded-lg border border-hairline bg-editor" aria-hidden>
      <div className="flex h-8 items-end border-b border-hairline bg-canvas">
        {['main.ts', 'fib.py', 'README.md'].map((f, i) => (
          <span key={f} className={['relative flex h-8 items-center gap-1.5 border-r border-hairline px-3 font-mono text-[11.5px]', i === 0 ? 'bg-editor text-ink' : 'text-muted'].join(' ')}>
            <FileIcon name={f} size={11} />{f}
            {i === 0 && <span className="absolute inset-x-0 top-0 h-px bg-primary" />}
          </span>
        ))}
        <span className="ml-auto mr-3 flex items-center gap-2 pb-2">
          {[ADA, GRACE, colors.presence[1]].map((c) => <span key={c} className="-ml-2 h-4 w-4 rounded-full border-2 border-canvas" style={{ background: c }} />)}
          <span className="caption-upper text-[9.5px] text-muted">3 online</span>
        </span>
      </div>
      <pre className="overflow-x-auto px-3 py-3 font-mono text-[12px] leading-[20px] text-body">
        {lines.map((l, i) => (
          <div key={i} className={['flex', i === 3 ? 'bg-raised' : ''].join(' ')}>
            <span className="w-7 shrink-0 select-none pr-3 text-right text-muted-soft">{i + 1}</span>
            <span className="relative whitespace-pre">{l}</span>
          </div>
        ))}
      </pre>
      <div className="flex items-center justify-between border-t border-hairline bg-panel px-3 py-1.5 font-mono text-[11px]">
        <span className="text-muted"><span className="text-muted-soft">▶ typescript main.ts</span>{'  '}<span style={{ color: colors.success }}>✓ exited 0</span> in 0.21s</span>
        <span className="flex items-center gap-1.5 text-muted"><span className="h-1.5 w-1.5 rounded-full" style={{ background: colors.success }} />Synced</span>
      </div>
    </div>
  )
}

function RemoteCaret({ name, color }: { name: string; color: string }) {
  return (
    <span className="relative inline-block h-[14px] w-0 align-middle">
      <span className="absolute -left-px top-0 h-[16px] w-[2px]" style={{ background: color }} />
      <span className="absolute -top-[15px] left-0 whitespace-nowrap rounded-[3px] rounded-bl-none px-1.5 font-sans text-[9.5px] font-medium leading-[14px]" style={{ background: color, color: colors.editor }}>{name}</span>
    </span>
  )
}

// ---------- icons ----------

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}
const iconProps = { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
function CursorsIcon() { return <svg {...iconProps}><path d="M2.5 2l4 9 1.2-3.3L11 6.5z" /><path d="M9 10.5l2.5 2.5" /></svg> }
function PlayIcon() { return <svg {...iconProps}><path d="M4 2.5v9l7-4.5z" /></svg> }
function MergeIcon() { return <svg {...iconProps}><circle cx="3.5" cy="3" r="1.5" /><circle cx="3.5" cy="11" r="1.5" /><circle cx="10.5" cy="7" r="1.5" /><path d="M3.5 4.5v5M3.5 9.5c0-2.5 5.5-1 5.5-2.5" /></svg> }
function ShieldIcon() { return <svg {...iconProps}><path d="M7 1.5l4.5 1.8v3.4c0 2.6-1.9 4.6-4.5 5.8-2.6-1.2-4.5-3.2-4.5-5.8V3.3z" /><path d="M5 7l1.5 1.5L9.5 5.5" /></svg> }
