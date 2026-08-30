/**
 * Milestone 5 browser acceptance: sign in, create a project, build a folder
 * tree collaboratively, survive a full reload AND a sync-server restart
 * (Postgres snapshot), share with a second user, and lock out a third.
 *
 * Requires all dev services + docker compose (postgres). Restarts the sync
 * server by killing its tsx process and relaunching `npm run dev:sync`.
 *   node scripts/e2e-project.mjs [screenshot.png]
 */
import puppeteer from 'puppeteer-core'
import { execFile, spawn } from 'node:child_process'
import { openSync } from 'node:fs'

const SHOT = process.argv[2] ?? 'project.png'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = false
let shotN = 0
let currentPage = null
const check = (c, m) => { console.log(`${c ? '  ✓' : '  ✗'} ${m}`); if (!c) { failed = true; currentPage?.screenshot({ path: SHOT.replace(/\.png$/, `-fail${++shotN}.png`) }).catch(() => {}) } }
const tag = Date.now().toString(36)
const nbspSrc = `window.nbsp = (s) => s.replace(/\\u00a0/g, ' ');`

const launch = () => puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox', '--window-size=1440,900'] })
const browsers = []
const open = async () => {
  const b = await launch(); browsers.push(b)
  const page = (await b.pages())[0] ?? (await b.newPage())
  await page.evaluateOnNewDocument(nbspSrc)
  await page.setViewport({ width: 1440, height: 900 })
  page.on('pageerror', (e) => console.log(`  PAGEERROR: ${e.message}`))
  return page
}
const signIn = async (page, name) => {
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-dev-login] input', { timeout: 10000 })
  await page.type('[data-dev-login] input', name)
  await page.click('[data-dev-login] button[type=submit]')
  await page.waitForSelector('[data-project-list]', { timeout: 10000 })
}
const waitSynced = (page) => page.waitForFunction(() => document.body.innerText.includes('Synced'), { timeout: 15000 })
const treePaths = (page) => page.$$eval('[data-file-tree] [data-path]', (els) => els.map((e) => `${e.dataset.kind}:${e.dataset.path}`))
const editorText = (page) => page.evaluate(() => nbsp(document.querySelector('.view-lines')?.innerText ?? ''))
// Monaco mounts asynchronously after the tab appears — never type before the model for that file exists.
const editorReady = (page, file) => page.waitForFunction((f) => window.__editor?.getModel()?.uri.toString().endsWith('/' + f) && !!document.querySelector('.monaco-editor .view-lines'), { timeout: 15000 }, file)

console.log('1. sign in → dashboard → create a project → editor opens with the seed')
const ada = await open()
currentPage = ada
await signIn(ada, `Ada ${tag}`)
check(true, 'dev login lands on the dashboard')
await ada.type('[data-new-project] input', 'Tree project')
await ada.click('[data-new-project] button[type=submit]')
await ada.waitForFunction(() => /^\/p\/[A-Za-z0-9_-]{12}$/.test(location.pathname), { timeout: 10000 })
const projectPath = await ada.evaluate(() => location.pathname)
const pid = projectPath.split('/').pop()
check(true, `navigated to ${projectPath}`)
await waitSynced(ada)
await ada.waitForFunction(() => nbsp(document.querySelector('.view-lines')?.innerText ?? '').includes('Welcome'), { timeout: 30000 })
check((await ada.$eval('[data-project-name]', (e) => e.textContent)) === 'Tree project', 'top bar shows the project name')

console.log('2. folder tree: new folder, file inside it, rename, delete — all through the shared doc')
await ada.click('[data-new-folder]')
await ada.type('[data-tree-input]', 'src'); await ada.keyboard.press('Enter')
await ada.waitForFunction(() => [...document.querySelectorAll('[data-file-tree] [data-path]')].some((e) => e.dataset.path === 'src' && e.dataset.kind === 'dir'), { timeout: 5000 })
check(true, 'folder "src" appears')
// new file inside src via the row's "+" (hover reveals; click via JS)
await ada.evaluate(() => document.querySelector('[data-file-tree] [data-path="src"] button[title="New file here"]').click())
await ada.type('[data-tree-input]', 'app.py'); await ada.keyboard.press('Enter')
await ada.waitForFunction(() => [...document.querySelectorAll('[data-file-tree] [data-path]')].some((e) => e.dataset.path === 'src/app.py'), { timeout: 5000 })
check(true, 'file "src/app.py" created and opened')
await ada.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent.includes('src/app.py'), { timeout: 5000 })
await editorReady(ada, 'src/app.py')
await ada.click('.monaco-editor .view-lines')
await ada.keyboard.type('print("from src/app.py")', { delay: 5 })
await ada.waitForFunction(() => window.__colcode.files.get('src/app.py')?.toString().includes('from src/app.py'), { timeout: 5000 })
await sleep(300)
await ada.evaluate(() => document.querySelector('[data-file-tree] [data-path="src/app.py"] [data-rename]').click())
await ada.evaluate(() => { const i = document.querySelector('[data-tree-input]'); i.select() })
await ada.keyboard.type('main.py'); await ada.keyboard.press('Enter')
await ada.waitForFunction(() => [...document.querySelectorAll('[data-file-tree] [data-path]')].some((e) => e.dataset.path === 'src/main.py') && ![...document.querySelectorAll('[data-file-tree] [data-path]')].some((e) => e.dataset.path === 'src/app.py'), { timeout: 5000 })
check(true, 'renamed to src/main.py (content moved)')
check(await ada.waitForFunction(() => nbsp(document.querySelector('.view-lines')?.innerText ?? '').includes('from src/app.py'), { timeout: 15000 }).then(() => true).catch(() => false), 'editor follows the rename and keeps the content')
if (failed) console.log('  state:', JSON.stringify(await ada.evaluate(() => { const o = {}; window.__colcode.files.forEach((t, k) => { o[k] = t.toString().slice(0, 30) }); return { files: o, tab: document.querySelector('[role=tab][aria-selected=true]')?.textContent, model: window.__editor?.getModel()?.getValue().slice(0, 30), uri: window.__editor?.getModel()?.uri.toString(), tree: [...document.querySelectorAll('[data-file-tree] [data-path]')].map((e) => e.dataset.path), input: !!document.querySelector('[data-tree-input]'), err: document.querySelector('[data-file-tree] .text-error')?.textContent } })))
await ada.evaluate(() => document.querySelector('[data-file-tree] [data-path="README.md"] [data-delete]').click())
await ada.waitForFunction(() => ![...document.querySelectorAll('[data-file-tree] [data-path]')].some((e) => e.dataset.path === 'README.md'), { timeout: 5000 })
check(true, 'README.md deleted')
const paths = await treePaths(ada)
check(paths[0] === 'dir:src' && paths.includes('file:src/main.py') && paths.includes('file:fib.py') && paths.includes('file:main.ts'), `tree = ${paths.join(', ')}`)

console.log('3. persistence: full reload keeps the tree and content')
await sleep(2500) // snapshot debounce
await ada.reload({ waitUntil: 'networkidle0' })
await waitSynced(ada)
await ada.waitForFunction(() => [...document.querySelectorAll('[data-file-tree] [data-path]')].some((e) => e.dataset.path === 'src/main.py'), { timeout: 10000 })
check(true, 'tree restored after reload')

console.log('4. persistence: sync-server restart (in-memory state gone) → Postgres snapshot restores it')
const before = await (await fetch('http://localhost:1234/health')).json()
await new Promise((r) => execFile('sh', ['-c', "for p in $(pgrep -f 'tsx'); do if lsof -p $p 2>/dev/null | grep -q sync-server; then kill $p; fi; done"], () => r()))
await sleep(1000)
const logFd = openSync('sync-server-restarted.log', 'a')
const child = spawn('npm', ['run', 'dev:sync'], { cwd: process.cwd(), stdio: ['ignore', logFd, logFd], detached: true }); child.unref()
let after = null
for (let i = 0; i < 60; i++) { await sleep(500); try { const h = await (await fetch('http://localhost:1234/health')).json(); if (h.ok && h.pid !== before.pid) { after = h; break } } catch {} }
check(after && after.pid !== before.pid, `sync server restarted (pid ${before.pid} → ${after?.pid}); in-memory rooms discarded`)
await ada.reload({ waitUntil: 'networkidle0' })
await waitSynced(ada)
await ada.waitForFunction(() => [...document.querySelectorAll('[data-file-tree] [data-path]')].some((e) => e.dataset.path === 'src/main.py'), { timeout: 10000 })
await ada.evaluate(() => document.querySelector('[data-file-tree] [data-path="src/main.py"]').click())
await ada.waitForFunction(() => nbsp(document.querySelector('.view-lines')?.innerText ?? '').includes('from src/app.py'), { timeout: 10000 })
check(true, 'tree and file content restored from the Postgres snapshot')
check(!(await treePaths(ada)).includes('file:README.md'), 'deleted file stays deleted (snapshot, not re-seed)')

console.log('5. access control in the browser: stranger locked out, invited user gets in')
const bob = await open()
await signIn(bob, `Bob ${tag}`)
await bob.goto(`http://localhost:5173${projectPath}`, { waitUntil: 'networkidle0' })
await bob.waitForFunction(() => document.body.innerText.includes('project not found'), { timeout: 10000 })
check(true, 'Bob (not a member) sees "project not found"')
await ada.click('[data-share-button]')
await ada.waitForSelector('[data-members-panel] input')
await ada.type('[data-members-panel] input', `bob-${tag}`)
await ada.click('[data-members-panel] button[type=submit]')
await ada.waitForFunction((h) => document.querySelector('[data-members-panel]')?.innerText.includes(h), { timeout: 5000 }, `bob-${tag}`)
check((await ada.$eval('[data-share-button]', (e) => e.textContent)).includes('2'), 'share button counts 2 members')
await bob.goto(`http://localhost:5173${projectPath}`, { waitUntil: 'networkidle0' })
await waitSynced(bob)
check(await bob.waitForSelector(`[data-avatar="Ada ${tag}"]`, { timeout: 8000 }).then(() => true).catch(() => false), 'Bob joins and sees Ada in presence')
check(await ada.waitForSelector(`[data-avatar="Bob ${tag}"]`, { timeout: 8000 }).then(() => true).catch(() => false), 'Ada sees Bob')
await bob.evaluate(() => document.querySelector('[data-file-tree] [data-path="src/main.py"]').click())
await bob.waitForFunction(() => nbsp(document.querySelector('.view-lines')?.innerText ?? '').includes('from src/app.py'), { timeout: 10000 })
check(true, 'Bob sees the same file content')
const dash = await bob.goto('http://localhost:5173/', { waitUntil: 'networkidle0' }).then(() => bob.$eval('[data-project-list]', (e) => e.innerText))
check(dash.includes('Tree project') && /editor/i.test(dash), 'project appears on Bob\'s dashboard as editor')

await ada.bringToFront(); await sleep(300)
await ada.screenshot({ path: SHOT })
for (const b of browsers) await b.close().catch(() => {})
console.log(failed ? '\nFAILED' : '\nALL PASSED'); process.exit(failed ? 1 : 0)
