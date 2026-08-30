/**
 * Milestone 3 acceptance: two real Chrome tabs in one room see each other's
 * cursor, selection, name tag, avatar and file-tree presence — in distinct colors.
 *
 * Requires: client (:5173) and sync-server (:1234) running, Google Chrome installed.
 *   node scripts/e2e-presence.mjs [screenshot-prefix]
 */
import puppeteer from 'puppeteer-core'
import { devSession } from './lib/session.mjs'

const tag = Date.now().toString(36)
const users = { 'Ada Lovelace': await devSession('Ada Lovelace'), 'Brian Kernighan': await devSession('Brian Kernighan') }
const ROOM = await users['Ada Lovelace'].createProject('e2e presence')
await users['Ada Lovelace'].invite(ROOM, users['Brian Kernighan'].user.handle)
const PREFIX = process.argv[2] ?? 'presence'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// expose an nbsp-normalizer inside page contexts (Monaco renders spaces as U+00A0)
const nbspSrc = `window.nbsp = (s) => s.replace(/\\u00a0/g, ' ');`
let failed = false
const check = (c, m) => { console.log(`${c ? '  ✓' : '  ✗'} ${m}`); if (!c) failed = true }
const nbsp = (s) => s.replace(/ /g, ' ')

// One browser per user. Monaco paints on requestAnimationFrame, and headless
// Chrome pauses rAF for background tabs — two tabs in one window would leave
// the inactive user's editor unpainted and every cursor assertion false.
const launch = () => puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox', '--window-size=1440,900'],
})
const browsers = []
const open = async (name) => {
  const browser = await launch()
  browsers.push(browser)
  browser.on('targetcreated', async (t) => { const p = await t.page(); if (p) await p.evaluateOnNewDocument(nbspSrc).catch(() => {}) })
  const page = (await browser.pages())[0] ?? (await browser.newPage())
  await page.evaluateOnNewDocument(nbspSrc)
  await page.setViewport({ width: 1440, height: 900 })
  await users[name].applyTo(page)
  page.on('pageerror', (e) => console.log(`  PAGEERROR(${name}): ${e.message}`))
  await page.goto(`http://localhost:5173/p/${ROOM}`, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => document.body.innerText.includes('Synced'), { timeout: 15000 })
  await page.waitForFunction(() => nbsp(document.querySelector('.view-lines')?.innerText ?? '').includes('Welcome'), { timeout: 15000 })
  return page
}

console.log(`room ${ROOM}`)
console.log('1. two users join; each sees the other in the avatar stack')
const alice = await open('Ada Lovelace')
const bob = await open('Brian Kernighan')
const stackHas = (page, name) => page.waitForSelector(`[data-avatar="${name}"]`, { timeout: 8000 }).then(() => true).catch(() => false)
check(await stackHas(alice, 'Brian Kernighan'), 'Ada sees Brian in the presence stack')
check(await stackHas(bob, 'Ada Lovelace'), 'Brian sees Ada in the presence stack')
const label = await alice.$eval('[data-presence-stack]', (el) => el.innerText)
check(/2 ONLINE/i.test(label), `stack label reads "2 online" (got "${label.trim()}")`)

console.log('2. distinct pastel colors from the DESIGN.md set')
const PASTELS = ['#dfa88f', '#9fc9a2', '#9fbbe0', '#c0a8dd', '#c08532'].map((h) => h.toLowerCase())
const rgbToHex = (rgb) => '#' + rgb.match(/\d+/g).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('')
const colorOf = (page, name) => page.$eval(`[data-avatar="${name}"]`, (el) => getComputedStyle(el).backgroundColor).then(rgbToHex)
const bobColorSeenByAda = await colorOf(alice, 'Brian Kernighan')
const adaColorSeenByBob = await colorOf(bob, 'Ada Lovelace')
check(PASTELS.includes(bobColorSeenByAda) && PASTELS.includes(adaColorSeenByBob), `both colors are DESIGN.md pastels (${adaColorSeenByBob}, ${bobColorSeenByAda})`)
check(bobColorSeenByAda !== adaColorSeenByBob, 'the two users have different colors')

console.log('3. Brian clicks into the editor; Ada sees his cursor + name tag in his color')
await bob.click('.monaco-editor .view-lines')
await bob.keyboard.press('ArrowDown'); await bob.keyboard.press('ArrowDown'); await bob.keyboard.press('End')
const headSel = '.monaco-editor .yRemoteSelectionHead'
const seen = await alice.waitForSelector(headSel, { timeout: 8000 }).then(() => true).catch(() => false)
check(seen, 'Ada renders a remote cursor head decoration')
if (seen) {
  const info = await alice.$eval(headSel, (el) => {
    const after = getComputedStyle(el, '::after')
    return { border: getComputedStyle(el).borderLeftColor, tag: after.content, tagBg: after.backgroundColor, visible: el.classList.contains('tag-visible') }
  })
  check(rgbToHex(info.border) === bobColorSeenByAda, `cursor border is Brian's color (${rgbToHex(info.border)})`)
  check(info.tag.includes('Brian Kernighan'), `name tag content is Brian's name (${info.tag})`)
  check(rgbToHex(info.tagBg) === bobColorSeenByAda, 'name tag background is Brian\'s color')
  check(info.visible, 'name tag is revealed on remote activity')
}

console.log('4. Brian selects a range; Ada sees the selection highlight')
await bob.keyboard.down('Shift'); await bob.keyboard.press('Home'); await bob.keyboard.up('Shift')
const selSeen = await alice.waitForSelector('.monaco-editor .yRemoteSelection', { timeout: 8000 }).then(() => true).catch(() => false)
check(selSeen, 'Ada renders Brian\'s selection range')

console.log('5. Ada types; Brian sees her cursor while text stays in sync')
await alice.click('.monaco-editor .view-lines')
await alice.keyboard.down('Meta'); await alice.keyboard.press('Home'); await alice.keyboard.up('Meta')
await alice.keyboard.type('// hello from Ada\n', { delay: 10 })
const adaSeenByBob = await bob.waitForFunction(() => document.querySelector('.monaco-editor .yRemoteSelectionHead') !== null, { timeout: 8000 }).then(() => true).catch(() => false)
check(adaSeenByBob, 'Brian renders Ada\'s cursor')
const textAtBob = await bob.waitForFunction(() => nbsp(document.querySelector('.view-lines')?.innerText ?? '').includes('hello from Ada'), { timeout: 8000 }).then(() => true).catch(() => false)
check(textAtBob, 'Brian received Ada\'s text')

console.log('6. file-tree presence: Brian opens fib.py, Ada sees a dot on it')
await bob.click('[data-file-tree] [data-path="fib.py"]')
const dot = await alice.waitForFunction(() => !!document.querySelector('[data-file-tree] [data-path="fib.py"] span[title]'), { timeout: 8000 }).then(() => true).catch(() => false)
check(dot, 'Ada sees a presence dot on fib.py')
// Monaco repaints decorations on the next animation frame — wait, don't poll once.
const gone = await alice.waitForFunction(() => document.querySelectorAll('.monaco-editor .yRemoteSelectionHead').length === 0, { timeout: 5000 }).then(() => true).catch(() => false)
check(gone, 'Brian\'s cursor leaves Ada\'s main.ts once he is in another file')

console.log('7. click-to-follow: Ada clicks Brian\'s avatar and lands on his file + line')
await bob.click('.monaco-editor .view-lines')
await bob.keyboard.down('Meta'); await bob.keyboard.press('End'); await bob.keyboard.up('Meta') // last line of fib.py
await sleep(400)
const bobLine = await bob.evaluate(() => window.__editor.getPosition().lineNumber)
await alice.click('[data-follow="Brian Kernighan"]')
const followed = await alice.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent.includes('fib.py'), { timeout: 5000 }).then(() => true).catch(() => false)
check(followed, 'Ada switched to fib.py')
const adaLine = await alice.waitForFunction((l) => window.__editor?.getPosition().lineNumber === l, { timeout: 5000 }, bobLine).then(() => true).catch(() => false)
check(adaLine, `Ada's cursor is on Brian's line (${bobLine})`)
const tip = await alice.$eval('[data-follow="Brian Kernighan"]', (e) => e.title)
check(/fib\.py:\d+/.test(tip), `avatar tooltip shows file:line (${tip})`)

console.log('8. Brian leaves; Ada\'s stack goes back to Solo')
await bob.browser().close()
const solo = await alice.waitForFunction(() => /SOLO/i.test(document.querySelector('[data-presence-stack]')?.innerText ?? ''), { timeout: 10000 }).then(() => true).catch(() => false)
check(solo, 'Ada sees Solo after Brian disconnects')

// Screenshot a live two-user scene for the report
const bob2 = await open('Brian Kernighan')
await bob2.click('.monaco-editor .view-lines')
await bob2.keyboard.press('ArrowDown'); await bob2.keyboard.press('ArrowDown'); await bob2.keyboard.press('ArrowDown'); await bob2.keyboard.press('ArrowDown'); await bob2.keyboard.press('End')
await bob2.keyboard.down('Shift'); await bob2.keyboard.press('Home'); await bob2.keyboard.up('Shift')
await alice.waitForSelector('.monaco-editor .yRemoteSelection', { timeout: 8000 }).catch(() => {})
await sleep(400)
await alice.screenshot({ path: `${PREFIX}-ada.png` })
for (const b of browsers) await b.close().catch(() => {})
console.log(failed ? '\nFAILED' : '\nALL PASSED'); process.exit(failed ? 1 : 0)
