/**
 * Milestone 2 acceptance test: two independent clients on the same room
 * converge with no lost keystrokes under concurrent, interleaved typing.
 *
 * Run with the sync server up:  npm run test:sync -w sync-server
 */
import WebSocket from 'ws'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { SignJWT } from 'jose'

const URL = process.env.SYNC_URL ?? 'ws://localhost:1234'
const ROOM = `test-${Date.now().toString(36)}`
const FILE = 'main.ts'
const SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? 'test-secret')

/** Mint a project-scoped sync token the way the API server does. */
const syncToken = (name: string, project = ROOM, role = 'editor') =>
  new SignJWT({ sub: `user-${name}`, name, handle: name.toLowerCase(), project, role })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setAudience('sync').setExpirationTime('10m').sign(SECRET)

function client(name: string, token?: string) {
  const doc = new Y.Doc()
  // disableBc: y-websocket would otherwise share updates between same-process
  // providers over an in-process BroadcastChannel, bypassing the server.
  const provider = new WebsocketProvider(URL, ROOM, doc, { WebSocketPolyfill: WebSocket as never, params: token ? { token } : {}, disableBc: true })
  const synced = new Promise<void>((resolve) => provider.once('sync', () => resolve()))
  return { name, doc, provider, synced }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitFor(pred: () => boolean, label: string, timeoutMs = 5000) {
  const start = Date.now()
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for: ${label}`)
    await sleep(25)
  }
}

let failed = false
function check(cond: boolean, msg: string) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`)
  if (!cond) failed = true
}

const a = client('A', await syncToken('A'))
const b = client('B', await syncToken('B'))
await Promise.all([a.synced, b.synced])

const textA = () => a.doc.getMap<Y.Text>('files').get(FILE)!
const textB = () => b.doc.getMap<Y.Text>('files').get(FILE)!

console.log(`room ${ROOM}`)
console.log('1. server seeds a fresh room once (no duplicate seed from two joiners)')
await waitFor(() => !!textA() && !!textB(), 'seeded files on both clients')
const seededA = textA().toString()
check(seededA.length > 0, `seeded ${seededA.length} chars`)
check(seededA === textB().toString(), 'both clients see identical seed')
check(seededA.split('Welcome to ColCode').length === 2, 'seed applied exactly once')

console.log('2. simple edit propagates A → B')
textA().insert(0, '// from A\n')
await waitFor(() => textB().toString().startsWith('// from A'), 'B receives A edit')
check(true, 'B received A edit')

console.log('3. concurrent interleaved typing, 300 keystrokes each, no lost characters')
const N = 300
const markerA = 'α', markerB = 'β'
const typeA = (async () => {
  for (let i = 0; i < N; i++) { textA().insert(Math.min(10 + i * 3, textA().length), markerA); await sleep(1) }
})()
const typeB = (async () => {
  for (let i = 0; i < N; i++) { textB().insert(Math.min(12 + i * 2, textB().length), markerB); await sleep(1) }
})()
await Promise.all([typeA, typeB])
await waitFor(() => textA().toString() === textB().toString(), 'convergence after concurrent typing', 10000)
const finalA = textA().toString()
const count = (s: string, ch: string) => [...s].filter((c) => c === ch).length
check(finalA === textB().toString(), 'A and B converged to identical text')
check(count(finalA, markerA) === N, `all ${N} of A's keystrokes present (${count(finalA, markerA)})`)
check(count(finalA, markerB) === N, `all ${N} of B's keystrokes present (${count(finalA, markerB)})`)
check(finalA.length === seededA.length + '// from A\n'.length + 2 * N, 'final length is exactly seed + all inserts')

console.log('4. late joiner C receives full converged state')
const c = client('C', await syncToken('C'))
await c.synced
await waitFor(() => c.doc.getMap<Y.Text>('files').get(FILE)?.toString() === finalA, 'C matches')
check(true, 'late joiner matches')

console.log('5. server authorizes on upgrade: bad room id, no token, wrong project, bad signature all get 401')
const rejects = (url: string) => new Promise<boolean>((resolve) => {
  const ws = new WebSocket(url)
  ws.on('unexpected-response', (_req, res) => resolve(res.statusCode === 401))
  ws.on('open', () => { ws.close(); resolve(false) })
  ws.on('error', () => resolve(true))
})
check(await rejects(`${URL}/bad room!`), 'invalid room id rejected')
check(await rejects(`${URL}/${ROOM}`), 'missing token rejected')
check(await rejects(`${URL}/${ROOM}?token=${await syncToken('X', 'some-other-project')}`), 'token for a different project rejected')
const forged = (await syncToken('X')).replace(/\.[^.]+$/, '.AAAA')
check(await rejects(`${URL}/${ROOM}?token=${forged}`), 'token with a bad signature rejected')

console.log('6. viewer role is read-only on the wire')
const v = client('V', await syncToken('V', ROOM, 'viewer'))
await v.synced
const textV = () => v.doc.getMap<Y.Text>('files').get(FILE)!
check(textV().toString() === finalA, 'viewer receives the document')
const beforeLen = textA().length
textV().insert(0, '// VIEWER WRITE\n')
await sleep(600)
check(!textA().toString().includes('VIEWER WRITE'), 'viewer\'s local insert never reaches other clients')
check(textA().length === beforeLen, 'editor\'s document length unchanged')
textA().insert(0, '// editor still works\n')
await waitFor(() => textV().toString().includes('editor still works'), 'viewer keeps receiving updates')
check(true, 'viewer still receives editors\' updates after being filtered')
v.provider.destroy(); v.doc.destroy()

for (const x of [a, b, c]) { x.provider.destroy(); x.doc.destroy() }
console.log(failed ? '\nFAILED' : '\nALL PASSED')
process.exit(failed ? 1 : 0)
