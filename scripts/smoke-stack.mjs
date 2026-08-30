/**
 * End-to-end smoke test against a deployed stack (staging: NODE_ENV=staging + dev login).
 * Proves the production images + Caddy routing: sign-in → project → Yjs sync over /sync →
 * a sandboxed run through the runner (Docker socket) → snapshot persisted.
 *   node scripts/smoke-stack.mjs http://localhost:8081
 */
import puppeteer from 'puppeteer-core'
const BASE = process.argv[2] ?? 'http://localhost:8081'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = false
const check = (c, m) => { console.log(`${c ? '  ✓' : '  ✗'} ${m}`); if (!c) failed = true }

const login = await fetch(`${BASE}/api/auth/dev`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Smoke Tester' }) })
check(login.status === 200, `dev login on staging (${login.status})`)
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]
const proj = await (await fetch(`${BASE}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ name: 'smoke' }) })).json()
check(/^[A-Za-z0-9_-]{12}$/.test(proj.id), `project created (${proj.id})`)

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] })
const page = (await browser.pages())[0]; await page.setViewport({ width: 1440, height: 900 })
page.on('pageerror', (e) => console.log('  PAGEERROR', e.message))
const [k, v] = cookie.split('='); await page.setCookie({ name: k, value: v, domain: 'localhost', path: '/', httpOnly: true })
await page.goto(`${BASE}/p/${proj.id}`, { waitUntil: 'networkidle0' })
const synced = await page.waitForFunction(() => document.body.innerText.includes('Synced'), { timeout: 20000 }).then(() => true).catch(() => false)
check(synced, 'editor connects to the sync server through Caddy (/sync) and syncs')
await page.waitForFunction(() => document.querySelector('[data-file-tree] [data-path="fib.py"]'), { timeout: 10000 })
await page.click('[data-file-tree] [data-path="fib.py"]')
await page.waitForFunction(() => !document.querySelector('[data-run-button]')?.disabled, { timeout: 10000 })
await page.click('[data-run-button="run"]')
const out = await page.waitForFunction(() => [...document.querySelectorAll('[data-terminal] .xterm-rows > div')].map((r) => r.textContent).join('\n').includes('4181]'), { timeout: 30000 }).then(() => true).catch(() => false)
check(out, 'Run executes fib.py in a sandbox created by the containerised runner')
const exited = await page.waitForFunction(() => [...document.querySelectorAll('[data-terminal] .xterm-rows > div')].map((r) => r.textContent).join('\n').includes('exited 0'), { timeout: 10000 }).then(() => true).catch(() => false)
check(exited, 'exit status streamed back')
await page.evaluate(() => { const t = window.__colcode?.files.get('fib.py'); t?.insert(0, '# persisted\n') })
await sleep(3000)
await browser.close()
const detail = await (await fetch(`${BASE}/api/projects/${proj.id}`, { headers: { cookie } })).json()
check(detail.role === 'owner', 'project metadata served by the API container')
await fetch(`${BASE}/api/projects/${proj.id}`, { method: 'DELETE', headers: { cookie } })
console.log(failed ? '\nFAILED' : '\nALL PASSED'); process.exit(failed ? 1 : 0)
