/**
 * Milestone 4 acceptance: the sandbox actually stops hostile programs.
 * Runs against the runner directly (:4100) and the API (:4000).
 *   npm run test:limits -w runner
 */
const RUNNER = process.env.RUNNER_URL ?? 'http://localhost:4100'
const API = process.env.API_URL ?? 'http://localhost:4000'

let failed = false
const check = (c: boolean, m: string) => { console.log(`${c ? '  ✓' : '  ✗'} ${m}`); if (!c) failed = true }

interface Ev { type: string; data?: string; code?: number | null; reason?: string; durationMs?: number; message?: string }

// The API requires a session; dev-login once and reuse the cookie.
let cookie = ''
async function login() {
  const res = await fetch(`${API}/api/auth/dev`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `limits-${Date.now().toString(36)}` }) })
  cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  if (!res.ok) throw new Error(`dev login failed: ${res.status}`)
}
const apiHeaders = () => ({ 'content-type': 'application/json', cookie })

async function run(base: string, code: string, path = '/run', language = 'python'): Promise<{ status: number; events: Ev[]; stdout: string; stderr: string; ms: number; json?: unknown }> {
  const t0 = Date.now()
  const res = await fetch(`${base}${path}`, { method: 'POST', headers: apiHeaders(), body: JSON.stringify({ language, code }) })
  if (!res.headers.get('content-type')?.includes('ndjson')) return { status: res.status, events: [], stdout: '', stderr: '', ms: Date.now() - t0, json: await res.json().catch(() => null) }
  const text = await res.text()
  const events = text.split('\n').filter(Boolean).map((l) => JSON.parse(l) as Ev)
  const joined = (t: string) => events.filter((e) => e.type === t).map((e) => e.data).join('')
  return { status: res.status, events, stdout: joined('stdout'), stderr: joined('stderr'), ms: Date.now() - t0 }
}
const exit = (r: { events: Ev[] }) => r.events.find((e) => e.type === 'exit')

const h = await (await fetch(`${RUNNER}/health`)).json() as { limits: { wallMs: number; memory: string; pids: number; maxOutputBytes: number } }
console.log(`runner limits: wall ${h.limits.wallMs}ms · mem ${h.limits.memory} · pids ${h.limits.pids} · output ${h.limits.maxOutputBytes}B`)

console.log('1. hello world runs and streams stdout + stderr separately')
{
  const r = await run(RUNNER, 'import sys\nprint("hello")\nprint("oops", file=sys.stderr)\nprint(sum(range(10)))')
  check(r.stdout === 'hello\n45\n', `stdout captured (${JSON.stringify(r.stdout)})`)
  check(r.stderr === 'oops\n', `stderr captured (${JSON.stringify(r.stderr)})`)
  check(exit(r)?.code === 0 && exit(r)?.reason === 'completed', `exit 0 / completed (${JSON.stringify(exit(r))})`)
}

console.log('2. runaway CPU loop is killed at the wall-clock limit')
{
  const r = await run(RUNNER, 'while True:\n    pass')
  const e = exit(r)
  check(e?.reason === 'timeout', `reason=timeout (${e?.reason})`)
  check(r.ms < h.limits.wallMs + 3000, `killed within ${h.limits.wallMs}ms + slack (took ${r.ms}ms)`)
}

console.log('3. memory bomb is OOM-killed by the cgroup, not the host')
{
  const r = await run(RUNNER, 'x = []\nwhile True:\n    x.append(bytearray(8 * 1024 * 1024))')
  const e = exit(r)
  check(e?.reason === 'oom' || e?.code === 137, `oom-killed (reason=${e?.reason}, code=${e?.code})`)
}

console.log('4. fork bomb is stopped by the pids limit')
{
  const r = await run(RUNNER, 'import os\nn=0\nwhile True:\n    try:\n        os.fork(); n+=1\n    except BaseException as ex:\n        print("fork failed after", n, type(ex).__name__); break')
  check(r.stdout.includes('fork failed'), `fork() refused (${r.stdout.trim().split('\n')[0]})`)
  check(r.ms < h.limits.wallMs + 3000, `host stayed responsive (${r.ms}ms)`)
}

console.log('5. output flood is capped')
{
  const r = await run(RUNNER, 'while True:\n    print("x" * 1000)')
  const e = exit(r)
  check(e?.reason === 'output-limit', `reason=output-limit (${e?.reason})`)
  check(r.stdout.length <= h.limits.maxOutputBytes + 1024, `stdout capped at ~${h.limits.maxOutputBytes}B (got ${r.stdout.length})`)
}

console.log('6. no network inside the sandbox')
{
  // Direct-IP connect (no DNS) fails fast with ENETUNREACH; a DNS lookup would
  // just hang until the wall-clock kill — also "blocked", but slower to prove.
  const r = await run(RUNNER, 'import socket\ntry:\n    socket.create_connection(("1.1.1.1", 80), timeout=2)\n    print("NETWORK OK")\nexcept OSError as ex:\n    print("blocked:", type(ex).__name__, ex.errno)\nprint("ifaces:", [i[1] for i in socket.if_nameindex()])')
  check(r.stdout.startsWith('blocked:'), `TCP connect fails (${r.stdout.split('\n')[0]})`)
  check(/ 101$/m.test(r.stdout.split('\n')[0]), 'errno is ENETUNREACH (101): the netns has no route at all, not just a firewall')
}

console.log('7. filesystem is read-only, unprivileged, and single-use')
{
  const r = await run(RUNNER, 'import os\ntry:\n    open("/etc/pwned","w").write("x"); print("WROTE")\nexcept Exception as ex:\n    print("ro:", type(ex).__name__)\nprint("uid", os.getuid())\nopen("/tmp/scratch","w").write("ok"); print("tmp ok")')
  check(r.stdout.includes('ro:'), 'rootfs is read-only')
  check(r.stdout.includes('uid 65534'), 'runs as nobody (uid 65534)')
  check(r.stdout.includes('tmp ok'), '/tmp scratch space works')
  const r2 = await run(RUNNER, 'import os\nprint(os.path.exists("/tmp/scratch"))')
  check(r2.stdout.trim() === 'False', 'next run gets a fresh container (no leftover /tmp)')
}

console.log('8. API layer: auth, validation and rate limiting')
{
  const anon = await fetch(`${API}/api/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ language: 'python', code: 'print(1)' }) })
  check(anon.status === 401, `anonymous run → 401 (${anon.status})`)
  await login()
  // Earlier suites may have used this minute's budget; wait for the window to reset.
  const probe = await fetch(`${API}/api/run`, { method: 'POST', headers: apiHeaders(), body: JSON.stringify({ language: 'python', code: 'pass' }) })
  await probe.text()
  if (probe.status === 429) {
    const wait = Number(probe.headers.get('retry-after') ?? 60) * 1000 + 500
    console.log(`  (rate-limit window still open — waiting ${wait}ms for it to reset)`)
    await new Promise((r) => setTimeout(r, wait))
  }
  await new Promise((r) => setTimeout(r, 500)) // let the probe's in-flight slot release
  const bad = await run(API, 'print(1)', '/api/run')
  check(bad.status === 200 && bad.stdout === '1\n', `API proxies a run end-to-end (status ${bad.status}${bad.json ? ' ' + JSON.stringify(bad.json) : ''})`)
  const unsupported = await fetch(`${API}/api/run`, { method: 'POST', headers: apiHeaders(), body: JSON.stringify({ language: 'brainfuck', code: '+' }) })
  check(unsupported.status === 400, `unsupported language → 400 (${unsupported.status})`)
  let limited = 0
  for (let i = 0; i < 12; i++) {
    const res = await fetch(`${API}/api/run`, { method: 'POST', headers: apiHeaders(), body: JSON.stringify({ language: 'python', code: 'print(1)' }) })
    if (res.status === 429) limited++
    await res.text()
  }
  check(limited > 0, `burst of 12 runs hits the per-user rate limit (${limited} rejected with 429)`)
  const concurrent = await Promise.all([
    fetch(`${API}/api/run`, { method: 'POST', headers: apiHeaders(), body: JSON.stringify({ language: 'python', code: 'import time; time.sleep(1)' }) }),
    new Promise<Response>((r) => setTimeout(() => r(fetch(`${API}/api/run`, { method: 'POST', headers: apiHeaders(), body: JSON.stringify({ language: 'python', code: 'pass' }) })), 200)),
  ])
  const statuses = concurrent.map((r) => r.status)
  await Promise.all(concurrent.map((r) => r.text()))
  check(statuses.includes(409) || statuses.includes(429), `second concurrent run per user is refused (${statuses.join(', ')})`)
}

console.log('9. language matrix: every supported language runs, isolated the same way')
{
  const matrix: Array<[string, string, RegExp]> = [
    ['javascript', 'console.log("js", [1,2,3].map(x => x * 2).join(","), typeof fetch)', /^js 2,4,6 function$/m],
    ['typescript', 'type P = { x: number }; const p: P = { x: 41 }; console.log("ts", p.x + 1)', /^ts 42$/m],
    ['ruby', 'puts "rb #{(1..5).reduce(:+)} #{RUBY_VERSION.split(".").first}"', /^rb 15 3$/m],
    ['go', 'package main\nimport ("fmt"; "os"; "net")\nfunc main() { _, err := net.Dial("tcp", "1.1.1.1:80"); fmt.Println("go", 6*7, err != nil, os.Getuid()) }', /^go 42 true 65534$/m],
  ]
  for (const [lang, code, expect] of matrix) {
    const r = await run(RUNNER, code, '/run', lang)
    const e = exit(r)
    check(expect.test(r.stdout) && e?.code === 0, `${lang}: ${JSON.stringify(r.stdout.trim().split('\n')[0])} exit=${e?.code} reason=${e?.reason} (${r.ms}ms)${r.stderr ? ' stderr=' + JSON.stringify(r.stderr.slice(0, 80)) : ''}`)
  }
  const jsLoop = await run(RUNNER, 'while(true){}', '/run', 'javascript')
  check(exit(jsLoop)?.reason === 'timeout', `javascript runaway loop killed (${exit(jsLoop)?.reason})`)
  const goNet = await run(RUNNER, 'package main\nimport ("fmt"; "os")\nfunc main() { err := os.WriteFile("/etc/x", []byte("x"), 0644); fmt.Println("ro:", err != nil) }', '/run', 'go')
  check(/ro: true/.test(goNet.stdout), 'go: rootfs read-only even with exec tmpfs')
  const langs = await (await fetch(`${API}/api/run/languages`)).json() as { languages: string[] }
  check(['python', 'javascript', 'typescript', 'ruby', 'go'].every((l) => langs.languages.includes(l)), `API advertises ${langs.languages.join(', ')}`)
}

console.log('10. no sandbox containers left behind')
{
  await new Promise((r) => setTimeout(r, 1500))
  const { execFile } = await import('node:child_process')
  const left = await new Promise<string>((r) => execFile('docker', ['ps', '-a', '-q', '--filter', 'label=colcode.sandbox=1'], (_e, out) => r(out.trim())))
  check(left === '', `zero leftover containers${left ? ` (found: ${left.split('\n').length})` : ''}`)
}

console.log(failed ? '\nFAILED' : '\nALL PASSED')
process.exit(failed ? 1 : 0)
