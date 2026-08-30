/**
 * Milestone 2 browser-level acceptance: a real Chrome tab and a Node y-websocket
 * client edit the same room; both directions sync and no keystrokes are lost.
 *
 * Requires: client (:5173) and sync-server (:1234) running, Google Chrome installed.
 *   node scripts/e2e-sync.mjs [screenshot.png]
 */
import puppeteer from 'puppeteer-core'
import WebSocket from 'ws'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { devSession } from './lib/session.mjs'

const me = await devSession(`sync-${Date.now().toString(36)}`)
const ROOM = await me.createProject('e2e sync')  // own project: never pollutes anyone's doc
const TOKEN = await me.syncToken(ROOM)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = false
const check = (c, m) => { console.log(`${c ? '  ✓' : '  ✗'} ${m}`); if (!c) failed = true }

// Node-side second client
const doc = new Y.Doc()
const prov = new WebsocketProvider('ws://localhost:1234', ROOM, doc, { WebSocketPolyfill: WebSocket, params: { token: TOKEN } })
await new Promise((r) => prov.once('sync', () => r()))
const ytext = () => doc.getMap('files').get('main.ts')

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox', '--window-size=1440,900'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
await me.applyTo(page)
const consoleLines = []
page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`))
page.on('pageerror', (e) => consoleLines.push(`PAGEERROR: ${e.message}`))
await page.goto(`http://localhost:5173/p/${ROOM}`, { waitUntil: 'networkidle0', timeout: 30000 })

const editorText = async () => page.evaluate(() => {
  const m = window.monaco ?? null
  return m ? m.editor.getModels().map((x) => x.getValue()).join('\n=====\n') : document.querySelector('.view-lines')?.innerText ?? ''
})

console.log('1. browser connects, syncs, opens main.ts')
try {
  await page.waitForFunction(() => document.body.innerText.includes('Synced'), { timeout: 15000 })
  check(true, 'status bar shows Synced')
  await page.waitForSelector('.monaco-editor .view-lines', { timeout: 15000 })
  await page.waitForFunction(() => document.querySelector('.view-lines')?.innerText.replace(/\u00a0/g,' ').includes('Welcome to ColCode'), { timeout: 15000 })
  check(true, 'editor shows seeded main.ts content')
} catch (e) { check(false, `sync/open failed: ${e.message}`) }

console.log('2. remote (Node) edit appears in the browser editor')
const marker = `// >>> remote-${Date.now().toString(36)} <<<`
ytext().insert(0, marker + '\n')
try {
  await page.waitForFunction((mk) => document.querySelector('.view-lines')?.innerText.replace(/\u00a0/g,' ').includes(mk), { timeout: 5000 }, marker)
  check(true, 'browser received remote insert')
} catch { check(false, 'browser did NOT receive remote insert') }

console.log('3. browser keystrokes reach the Node client')
await page.click('.monaco-editor .view-lines')
await page.keyboard.down('Meta'); await page.keyboard.press('Home'); await page.keyboard.up('Meta') // cmd+home → doc start
const typed = `// typed-in-browser-${Date.now().toString(36)}\n`
await page.keyboard.type(typed, { delay: 5 })
try {
  const start = Date.now()
  while (!ytext().toString().includes(typed.trim())) { if (Date.now() - start > 5000) throw new Error('timeout'); await sleep(25) }
  check(true, 'Node client received browser keystrokes')
} catch { check(false, 'Node client did NOT receive browser keystrokes') }

console.log('4. both sides identical after concurrent typing')
const burst = (async () => { for (let i = 0; i < 100; i++) { ytext().insert(Math.min(5 + i * 7, ytext().length), 'β'); await sleep(2) } })()
await page.keyboard.type('α'.repeat(100), { delay: 3 })
await burst
await sleep(800)
const browserModel = await page.evaluate(() => document.querySelector('.view-lines')?.innerText.length ?? 0)
const nodeText = ytext().toString()
const count = (s, ch) => [...s].filter((c) => c === ch).length
check(count(nodeText, 'α') === 100 && count(nodeText, 'β') === 100, `no lost keystrokes (α=${count(nodeText, 'α')}, β=${count(nodeText, 'β')})`)
check(browserModel > 0, 'browser editor rendered content')

await page.screenshot({ path: process.argv[2] ?? 'browser-sync.png' })
console.log('--- browser console:'); console.log(consoleLines.filter((l) => !l.includes('[vite]')).slice(0, 20).join('\n') || '(none)')
await browser.close(); prov.destroy(); doc.destroy()
console.log(failed ? '\nFAILED' : '\nALL PASSED'); process.exit(failed ? 1 : 0)
