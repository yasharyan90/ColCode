/**
 * Sync-server load test: R rooms × C clients, every client inserting a
 * character every T ms for D seconds. Measures end-to-end propagation latency
 * (insert on one client → observed on another), convergence per room, and
 * server memory before/after. Real projects are created (and deleted) so the
 * persistence path is exercised too.
 *
 *   node scripts/load-sync.mjs [rooms=40] [clientsPerRoom=4] [seconds=20] [intervalMs=100]
 */
import WebSocket from 'ws'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { devSession } from './lib/session.mjs'

const [ROOMS = 40, CLIENTS = 4, SECONDS = 20, INTERVAL = 100] = process.argv.slice(2).map(Number)
process.setMaxListeners(0) // y-websocket registers one process 'exit' hook per provider
const SYNC = process.env.SYNC_URL ?? 'ws://localhost:1234'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const health = () => fetch('http://localhost:1234/health').then((r) => r.json())
const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
const maxOf = (arr) => arr.reduce((m, x) => (x > m ? x : m), 0) // no spread: hundreds of thousands of samples

console.log(`load: ${ROOMS} rooms × ${CLIENTS} clients, 1 insert / ${INTERVAL}ms / client, for ${SECONDS}s  (~${Math.round(ROOMS * CLIENTS * 1000 / INTERVAL)} ops/s offered)`)
const me = await devSession(`load-${Date.now().toString(36)}`)
const before = await health()

// --- create rooms + tokens
const t0 = Date.now()
const rooms = await Promise.all(Array.from({ length: ROOMS }, async (_, i) => {
  const id = await me.createProject(`load ${i}`)
  return { id, token: await me.syncToken(id) }
}))
console.log(`created ${ROOMS} projects in ${Date.now() - t0}ms`)

// --- connect everyone
const latencies = []
let sent = 0, received = 0, errors = 0
const clients = []
const t1 = Date.now()
for (const room of rooms) {
  for (let c = 0; c < CLIENTS; c++) {
    const doc = new Y.Doc()
    const provider = new WebsocketProvider(SYNC, room.id, doc, { WebSocketPolyfill: WebSocket, params: { token: room.token }, disableBc: true })
    provider.on('connection-error', () => { errors++ })
    // 'sync' fires on the first server state; the seed/snapshot may land a beat later.
    const files = doc.getMap('files')
    const synced = new Promise((resolve) => {
      const check = () => { if (files.get('main.ts')) { files.unobserve(check); resolve() } }
      files.observe(check); check()
    })
    clients.push({ room: room.id, c, doc, provider, synced, get text() { return files.get('main.ts') } })
  }
}
await Promise.all(clients.map((c) => c.synced))
const connectMs = Date.now() - t1
console.log(`${clients.length} clients connected + synced in ${connectMs}ms`)

// --- observe: each client stamps its inserts with "<clientId>:<ts>|"; peers measure the delay.
const stampRe = /(\d+):(\d+)\|/g
for (const cl of clients) {
  cl.text.observe((ev) => {
    if (ev.transaction.local) return
    for (const d of ev.delta) {
      if (!d.insert || typeof d.insert !== 'string') continue
      for (const m of d.insert.matchAll(stampRe)) {
        latencies.push(Date.now() - Number(m[2])); received++
      }
    }
  })
}

// --- hammer
const stop = Date.now() + SECONDS * 1000
const tickers = clients.map((cl) => (async () => {
  while (Date.now() < stop) {
    const pos = Math.floor(Math.random() * (cl.text.length + 1))
    cl.text.insert(pos, `${cl.doc.clientID}:${Date.now()}|`)
    sent++
    await sleep(INTERVAL + Math.random() * 10)
  }
})())
const sampler = (async () => { while (Date.now() < stop) { await sleep(5000); const h = await health(); console.log(`  t+${Math.round((SECONDS * 1000 - (stop - Date.now())) / 1000)}s: sent=${sent} received=${received} p50=${pct(latencies, 0.5)}ms p95=${pct(latencies, 0.95)}ms · server rss=${h.rssMb}MB conns=${h.connections}`) } })()
await Promise.all([...tickers, sampler])

// --- settle + converge
await sleep(1500)
let converged = 0
for (const room of rooms) {
  const texts = clients.filter((c) => c.room === room.id).map((c) => c.text.toString())
  if (texts.every((t) => t === texts[0])) converged++
}
const expectedReceipts = sent * (CLIENTS - 1)
const after = await health()

console.log('\nresults')
console.log(`  offered:      ${sent} inserts (${Math.round(sent / SECONDS)} ops/s)`)
console.log(`  delivered:    ${received}/${expectedReceipts} peer receipts (${(100 * received / expectedReceipts).toFixed(2)}%)`)
console.log(`  latency:      p50=${pct(latencies, 0.5)}ms  p95=${pct(latencies, 0.95)}ms  p99=${pct(latencies, 0.99)}ms  max=${maxOf(latencies)}ms`)
console.log(`  convergence:  ${converged}/${ROOMS} rooms identical across all clients`)
console.log(`  server:       rss ${before.rssMb}→${after.rssMb}MB  heap ${before.heapMb}→${after.heapMb}MB  rooms=${after.rooms} conns=${after.connections}  ws errors=${errors}`)

// --- teardown
for (const cl of clients) { cl.provider.destroy(); cl.doc.destroy() }
await sleep(500)
await Promise.all(rooms.map((r) => me.call('DELETE', `/api/projects/${r.id}`)))
const final = await health()
console.log(`  after teardown: rooms=${final.rooms} conns=${final.connections} rss=${final.rssMb}MB`)
const ok = converged === ROOMS && received === expectedReceipts && pct(latencies, 0.95) < 500
console.log(ok ? '\nPASS' : '\nFAIL (convergence, delivery, or p95 > 500ms)')
process.exit(ok ? 0 : 1)
