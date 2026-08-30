/**
 * Milestone 4 browser acceptance: Run a Python file from the real UI, see its
 * output stream into the xterm panel, and Stop a runaway program — verifying
 * on the host that the sandbox container is gone.
 *
 * Requires: client (:5173), API (:4000), sync-server (:1234), runner (:4100).
 *   node scripts/e2e-run.mjs [screenshot.png]
 */
import puppeteer from 'puppeteer-core'
import { execFile } from 'node:child_process'
import { devSession } from './lib/session.mjs'

const me = await devSession(`runner-${Date.now().toString(36)}`)
const ROOM = await me.createProject('e2e run')
const SHOT = process.argv[2] ?? 'run.png'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = false
const check = (c, m) => { console.log(`${c ? '  ✓' : '  ✗'} ${m}`); if (!c) failed = true }
const sandboxes = () => new Promise((r) => execFile('docker', ['ps', '-q', '--filter', 'label=colcode.sandbox=1'], (_e, out) => r(out.trim().split('\n').filter(Boolean).length)))

// Respect the per-user run budget left over from other suites.
{
  const probe = await fetch('http://localhost:4000/api/run', { method: 'POST', headers: { 'content-type': 'application/json', cookie: me.cookie }, body: JSON.stringify({ language: 'python', code: 'pass' }) })
  await probe.text()
  if (probe.status === 429) { const w = Number(probe.headers.get('retry-after') ?? 60) * 1000 + 500; console.log(`  (waiting ${w}ms for the rate-limit window)`); await sleep(w) }
  else await sleep(500)
}

process.on('unhandledRejection', async (e) => { console.log('  FATAL:', e.message?.split('\n')[0]); try { await page.screenshot({ path: SHOT.replace(/\.png$/, '-fail.png') }); console.log('  body:', (await page.evaluate(() => document.body.innerText)).slice(0, 200).replace(/\n/g, ' / ')) } catch {} process.exit(1) })
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox', '--window-size=1440,900'] })
const page = (await browser.pages())[0] ?? (await browser.newPage())
await page.setViewport({ width: 1440, height: 900 })
page.on('pageerror', (e) => console.log(`  PAGEERROR: ${e.message}`))
await me.applyTo(page)
await page.goto(`http://localhost:5173/p/${ROOM}`, { waitUntil: 'networkidle0' })
await page.waitForFunction(() => document.body.innerText.includes('Synced'), { timeout: 15000 })
await page.waitForSelector('.monaco-editor .view-lines', { timeout: 15000 })

// xterm renders into a canvas/DOM rows; read text via the terminal buffer exposed by xterm's DOM renderer rows
const termText = () => page.evaluate(() => [...document.querySelectorAll('[data-terminal] .xterm-rows > div')].map((r) => r.textContent).join('\n').replace(/ /g, ' '))
const waitTerm = (re, timeout = 15000) => page.waitForFunction((src) => new RegExp(src).test([...document.querySelectorAll('[data-terminal] .xterm-rows > div')].map((r) => r.textContent).join('\n')), { timeout }, re.source).then(() => true).catch(() => false)

console.log('1. Run button is enabled for runnable files (main.ts is TypeScript) and disabled for README.md')
await page.waitForFunction(() => !document.querySelector('[data-run-button]').disabled, { timeout: 5000 })
check(true, 'main.ts (TypeScript) → Run enabled')
await page.click('[data-file-tree] [data-path="README.md"]')
await page.waitForFunction(() => document.querySelector('[data-run-button]').disabled, { timeout: 5000 })
check(true, 'README.md (Markdown) → Run disabled')
await page.click('[data-file-tree] [data-path="fib.py"]')
await page.waitForFunction(() => !document.querySelector('[data-run-button]').disabled, { timeout: 5000 })
check(true, 'fib.py (Python) → Run enabled')

console.log('2. clicking Run streams the program output into the terminal')
await page.click('[data-run-button="run"]')
check(await waitTerm(/▶ python fib\.py/), 'launch header rendered')
check(await waitTerm(/sandbox: 128m RAM/), 'sandbox limits banner rendered')
check(await waitTerm(/\[0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181\]/), 'fib(0..19) printed')
check(await waitTerm(/✓ exited 0/), 'exit status footer rendered')
check(await page.waitForFunction(() => document.querySelector('[data-run-button]')?.dataset.runButton === 'run', { timeout: 5000 }).then(() => true).catch(() => false), 'button returned to Run')

console.log('3. stderr and non-zero exit are visible')
await page.evaluate(() => { const t = window.__colcode.files.get('fib.py'); t.insert(t.length, '\nimport sys\nprint("warn!", file=sys.stderr)\nsys.exit(3)\n') })
await sleep(300)
await page.click('[data-run-button="run"]')
check(await waitTerm(/warn!/), 'stderr line rendered')
check(await waitTerm(/✗ exited 3/), 'non-zero exit rendered')

console.log('4. Stop cancels a runaway program and the container is gone')
await page.evaluate(() => { const t = window.__colcode.files.get('fib.py'); t.delete(0, t.length); t.insert(0, 'import time\nprint("spinning", flush=True)\nwhile True:\n    time.sleep(0.1)\n') })
await sleep(300)
await page.keyboard.down('Meta'); await page.keyboard.press('Enter'); await page.keyboard.up('Meta')
check(await page.waitForSelector('[data-run-button="stop"]', { timeout: 5000 }).then(() => true).catch(() => false), '⌘⏎ starts a run; button shows Stop')
check(await waitTerm(/spinning/), 'program output arrived while running')
const during = await sandboxes()
check(during >= 1, `a sandbox container is running on the host (${during})`)
await page.click('[data-run-button="stop"]')
check(await waitTerm(/■ cancelled/, 8000), 'terminal shows cancelled')
await sleep(1500)
const after = await sandboxes()
check(after === 0, `container was killed on Stop (${after} left)`)

console.log('5. other languages run through the same UI')
for (const [file, code, expect] of [['hello.js', 'console.log("hello from js", 2 ** 10)', /hello from js 1024/], ['hello.ts', 'const n: number = 7; console.log(`hello from ts ${n * 6}`)', /hello from ts 42/], ['hello.rb', 'puts "hello from ruby #{[1,2,3].sum}"', /hello from ruby 6/]]) {
  await page.click('[data-new-file]'); await page.type('[data-tree-input]', file); await page.keyboard.press('Enter')
  await page.waitForFunction((f) => document.querySelector('[role=tab][aria-selected=true]')?.textContent.includes(f), { timeout: 5000 }, file)
  await page.evaluate((f, c) => { const t = window.__colcode.files.get(f); t.insert(0, c) }, file, code)
  await sleep(300)
  await page.click('[data-run-button="run"]')
  check(await waitTerm(expect, 20000), `${file} → ${expect.source}`)
  await waitTerm(/✓ exited 0/, 20000)
}
await page.click('[data-file-tree] [data-path="fib.py"]')
await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent.includes('fib.py'), { timeout: 5000 })

console.log('6. the wall-clock limit is surfaced in the UI')
await page.evaluate(() => { const t = window.__colcode.files.get('fib.py'); t.delete(0, t.length); t.insert(0, 'while True: pass\n') })
await sleep(300)
await page.click('[data-run-button="run"]')
check(await waitTerm(/⏱ killed: exceeded wall-clock limit/, 12000), 'timeout kill rendered')

// Restore a nice scene for the screenshot: run the original fib
await page.evaluate(() => { const t = window.__colcode.files.get('fib.py'); t.delete(0, t.length); t.insert(0, '# Python: syntax highlighting check\nfrom functools import lru_cache\n\n\n@lru_cache(maxsize=None)\ndef fib(n: int) -> int:\n    """Return the n-th Fibonacci number."""\n    if n < 2:\n        return n\n    return fib(n - 1) + fib(n - 2)\n\n\nif __name__ == "__main__":\n    print([fib(i) for i in range(20)])\n    print("done in the sandbox")\n') })
await sleep(300)
await page.click('[data-run-button="run"]')
await waitTerm(/✓ exited 0/)
await sleep(300)
await page.screenshot({ path: SHOT })
await browser.close()
console.log(failed ? '\nFAILED' : '\nALL PASSED'); process.exit(failed ? 1 : 0)
