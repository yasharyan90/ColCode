import { spawn, execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { promisify } from 'node:util'
import { LANGUAGES } from './languages.js'

const execFileP = promisify(execFile)

/**
 * Hard limits applied to every run. All "run code" input is hostile.
 * These are enforced by the kernel via Docker (cgroups/namespaces), not by
 * anything the program could opt out of.
 */
export const LIMITS = {
  wallMs: Number(process.env.RUN_WALL_MS ?? 5000),        // wall-clock, then SIGKILL
  memory: process.env.RUN_MEMORY ?? '128m',               // cgroup memory cap; swap disabled
  cpus: process.env.RUN_CPUS ?? '0.5',                    // CPU quota
  pids: Number(process.env.RUN_PIDS ?? 64),               // fork-bomb guard
  maxOutputBytes: Number(process.env.RUN_MAX_OUTPUT ?? 64 * 1024),
  maxCodeBytes: 100 * 1024,
  maxStdinBytes: 16 * 1024,
} as const

export type ExitReason = 'completed' | 'timeout' | 'output-limit' | 'oom' | 'cancelled'

export type RunEvent =
  | { type: 'start'; language: string; limits: { wallMs: number; memory: string; cpus: string }; note?: string }
  | { type: 'stdout'; data: string }
  | { type: 'stderr'; data: string }
  | { type: 'exit'; code: number | null; reason: ExitReason; durationMs: number }
  | { type: 'error'; message: string }

export interface RunRequest {
  language: string
  code: string
  stdin?: string
}

/**
 * Execute one program in a fresh, single-use container and stream events.
 *
 * Isolation (per run):
 *   --network none                 no network namespace access at all
 *   --read-only + tmpfs /tmp       immutable rootfs; only a small noexec tmpfs is writable
 *   --user 65534                   unprivileged (nobody)
 *   --cap-drop ALL, no-new-privs   no capabilities, no setuid escalation
 *   --memory/--memory-swap         hard RAM cap, swap disabled (OOM-kill, not thrash)
 *   --cpus, --pids-limit           CPU quota, process-count cap
 *   wall-clock timer               docker kill after LIMITS.wallMs
 *   output cap                     docker kill after LIMITS.maxOutputBytes
 * The container is created, used once, and force-removed. Nothing is reused.
 *
 * `signal` aborts the run (client went away) — the container is killed.
 */
export async function* runInSandbox(req: RunRequest, signal?: AbortSignal): AsyncGenerator<RunEvent> {
  const spec = LANGUAGES[req.language]
  if (!spec) { yield { type: 'error', message: `unsupported language: ${req.language}` }; return }
  if (Buffer.byteLength(req.code) > LIMITS.maxCodeBytes) { yield { type: 'error', message: 'source too large' }; return }
  if (req.stdin && Buffer.byteLength(req.stdin) > LIMITS.maxStdinBytes) { yield { type: 'error', message: 'stdin too large' }; return }

  const name = `cc-${randomBytes(6).toString('hex')}`
  const started = Date.now()
  let reason: ExitReason = 'completed'
  let bytesOut = 0
  const lim = {
    wallMs: spec.limits?.wallMs ?? LIMITS.wallMs,
    memory: spec.limits?.memory ?? LIMITS.memory,
    cpus: spec.limits?.cpus ?? LIMITS.cpus,
    pids: spec.limits?.pids ?? LIMITS.pids,
    tmpfs: `/tmp:rw,${spec.limits?.tmpfsExec ? 'exec' : 'noexec'},nosuid,size=${spec.limits?.tmpfsSize ?? '8m'},mode=1777`,
  }

  const kill = (why: ExitReason) => {
    if (reason === 'completed') reason = why
    execFile('docker', ['kill', name], () => {})
  }

  try {
    // The rootfs is read-only (docker cp is refused), so the source travels in
    // an env var and a sh wrapper writes it to the tmpfs before exec'ing the
    // interpreter. execFile passes argv directly — no shell quoting on the host.
    const wrapper = `umask 077 && printf '%s' "$CODE" > /tmp/${spec.file} && unset CODE && exec "$@"`

    await execFileP('docker', [
      'create', '--name', name, '--interactive',
      '--network', 'none',
      '--read-only', '--tmpfs', lim.tmpfs,
      '--user', '65534:65534',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--memory', lim.memory, '--memory-swap', lim.memory,
      '--cpus', lim.cpus, '--pids-limit', String(lim.pids),
      '--workdir', '/tmp',
      ...Object.entries(spec.env ?? {}).flatMap(([k, v]) => ['--env', `${k}=${v}`]),
      '--env', `CODE=${req.code}`,
      '--label', 'colcode.sandbox=1',
      spec.image, 'sh', '-c', wrapper, 'sandbox', ...spec.cmd,
    ], { maxBuffer: 1024 * 1024 })

    yield { type: 'start', language: req.language, limits: { wallMs: lim.wallMs, memory: lim.memory, cpus: lim.cpus }, ...(spec.note ? { note: spec.note } : {}) }

    const proc = spawn('docker', ['start', '--attach', '--interactive', name], { stdio: ['pipe', 'pipe', 'pipe'] })
    if (req.stdin) proc.stdin.write(req.stdin)
    proc.stdin.end()

    const timer = setTimeout(() => kill('timeout'), lim.wallMs)
    const onAbort = () => kill('cancelled')
    if (signal?.aborted) onAbort()
    signal?.addEventListener('abort', onAbort, { once: true })

    // Fan both streams into one ordered async queue.
    const queue: RunEvent[] = []
    let notify: (() => void) | null = null
    let done = false
    const push = (ev: RunEvent) => { queue.push(ev); notify?.() }
    const onChunk = (type: 'stdout' | 'stderr') => (chunk: Buffer) => {
      bytesOut += chunk.length
      if (bytesOut > LIMITS.maxOutputBytes) {
        const allowed = Math.max(0, chunk.length - (bytesOut - LIMITS.maxOutputBytes))
        if (allowed > 0) push({ type, data: chunk.subarray(0, allowed).toString('utf8') })
        kill('output-limit')
        return
      }
      push({ type, data: chunk.toString('utf8') })
    }
    proc.stdout.on('data', onChunk('stdout'))
    proc.stderr.on('data', onChunk('stderr'))
    let exitCode: number | null = null
    proc.on('close', (code) => { exitCode = code; done = true; notify?.() })
    proc.on('error', (err) => { push({ type: 'error', message: err.message }); done = true; notify?.() })

    while (!done || queue.length) {
      if (queue.length) { yield queue.shift()! ; continue }
      await new Promise<void>((r) => { notify = r })
      notify = null
    }
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)

    // Distinguish an OOM kill from our own kills, and surface the real exit code.
    let oom = false
    let code: number | null = exitCode
    try {
      const { stdout } = await execFileP('docker', ['inspect', '--format', '{{.State.OOMKilled}} {{.State.ExitCode}}', name])
      const [o, c] = stdout.trim().split(' ')
      oom = o === 'true'
      code = Number(c)
    } catch { /* container already gone */ }
    if (oom && reason === 'completed') reason = 'oom'
    yield { type: 'exit', code, reason, durationMs: Date.now() - started }
  } catch (err) {
    yield { type: 'error', message: (err as Error).message.split('\n')[0] }
  } finally {
    await execFileP('docker', ['rm', '--force', name]).catch((e) => console.warn(`[sandbox] rm ${name} failed: ${(e as Error).message.split('\n')[0]}`))
  }
}

/**
 * Containers are single-use, so any sandbox container that exists when the
 * runner boots — or that outlives the wall-clock limit by a wide margin — is
 * an orphan from a crash or restart. Reap them so a runner failure can never
 * leave user code running. Called at startup and then every `everyMs`.
 */
const MAX_WALL_MS = Math.max(LIMITS.wallMs, ...Object.values(LANGUAGES).map((l) => l.limits?.wallMs ?? 0))

export async function reapOrphans(log: (msg: string) => void, maxAgeMs = MAX_WALL_MS * 3): Promise<number> {
  let out = ''
  try {
    ;({ stdout: out } = await execFileP('docker', ['ps', '-a', '--filter', 'label=colcode.sandbox=1', '--format', '{{.ID}} {{.CreatedAt}}']))
  } catch { return 0 }
  const now = Date.now()
  const stale = out.split('\n').filter(Boolean).map((line) => {
    const [id, ...created] = line.split(' ')
    // docker prints e.g. "2026-08-30 07:18:58 +0000 UTC"
    const ts = Date.parse(created.slice(0, 3).join(' ').replace(' +', '+').replace(/\+(\d{2})(\d{2})$/, '+$1:$2'))
    return { id, age: Number.isNaN(ts) ? Infinity : now - ts }
  }).filter((c) => c.age > maxAgeMs)
  if (stale.length === 0) return 0
  await execFileP('docker', ['rm', '--force', ...stale.map((c) => c.id)]).catch(() => {})
  log(`reaped ${stale.length} orphaned sandbox container(s)`)
  return stale.length
}

export function startReaper(log: (msg: string) => void, everyMs = 30_000) {
  void reapOrphans(log, 0) // at boot, everything is an orphan
  const t = setInterval(() => void reapOrphans(log), everyMs)
  t.unref()
}

/** Ensure every language image is present (dev convenience; prod pre-bakes them). */
export async function ensureImages(log: (msg: string) => void) {
  for (const [lang, spec] of Object.entries(LANGUAGES)) {
    try {
      await execFileP('docker', ['image', 'inspect', spec.image])
    } catch {
      log(`pulling ${spec.image} for ${lang}…`)
      await execFileP('docker', ['pull', spec.image])
    }
  }
}
