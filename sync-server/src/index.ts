import { createServer } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import type { IncomingMessage } from 'node:http'
import { setupWSConnection, setPersistence, docs } from '@y/websocket-server/utils'
import * as decoding from 'lib0/decoding'
import { authorize, type Identity } from './authorize.js'
import { makePersistence } from './persistence.js'

/**
 * ColCode sync server.
 *
 * One Yjs document per project. Inside it, `files` is a Y.Map<Y.Text> keyed by
 * file path — every open editor binds to one of those Y.Texts through y-monaco.
 * Rooms are addressed by URL path: ws://host/<projectId>?token=<sync-jwt>.
 *
 * Documents are snapshotted to Postgres (see persistence.ts) so projects
 * survive restarts, not just an in-memory session.
 */
const PORT = Number(process.env.PORT ?? 1234)
const log = (m: string) => console.log(`[sync] ${m}`)

setPersistence(makePersistence(log))

const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    const mem = process.memoryUsage()
    res.end(JSON.stringify({ ok: true, service: 'colcode-sync', pid: process.pid, rooms: docs.size, connections, auth: process.env.SYNC_AUTH === 'off' ? 'off' : 'jwt', rssMb: Math.round(mem.rss / 1048576), heapMb: Math.round(mem.heapUsed / 1048576) }))
    return
  }
  res.writeHead(404).end()
})

const wss = new WebSocketServer({ noServer: true })

// y-protocols wire format: [messageType, ...]. Sync messages carry a sub-type.
const MSG_SYNC = 0
const SYNC_STEP1 = 0 // "send me your state" — harmless
const SYNC_STEP2 = 1 // carries document updates
const SYNC_UPDATE = 2 // carries document updates

let connections = 0
const roleOf = new WeakMap<WebSocket, Identity['role']>()

wss.on('connection', (conn: WebSocket, req: IncomingMessage, docName: string) => {
  connections++
  conn.once('close', () => { connections-- })
  setupWSConnection(conn as never, req, { docName })

  // Viewers: enforce read-only on the wire, not just in the UI. Any sync
  // message that carries document updates is dropped before y-websocket sees
  // it; awareness (cursor/presence) and step-1 requests still flow.
  if (roleOf.get(conn) === 'viewer') {
    const inner = conn.listeners('message') as Array<(data: Buffer, isBinary: boolean) => void>
    log(`viewer connection on ${docName}: wrapping ${inner.length} message listener(s)`)
    conn.removeAllListeners('message')
    conn.on('message', (data: Buffer, isBinary: boolean) => {
      const bytes = new Uint8Array(data as ArrayLike<number>)
      if (carriesUpdate(bytes)) { log(`dropped viewer write on ${docName} (${bytes.length} bytes, header ${bytes[0]},${bytes[1]})`); return }
      for (const l of inner) l(data, isBinary)
    })
  }
})

function carriesUpdate(message: Uint8Array): boolean {
  try {
    const dec = decoding.createDecoder(message)
    if (decoding.readVarUint(dec) !== MSG_SYNC) return false
    const sub = decoding.readVarUint(dec)
    return sub === SYNC_STEP2 || sub === SYNC_UPDATE
  } catch { return false }
}

http.on('upgrade', async (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const projectId = decodeURIComponent(url.pathname.slice(1))
  const token = url.searchParams.get('token')

  const identity = await authorize(projectId, token).catch((e) => { log(`authorize error: ${(e as Error).message}`); return null })
  if (!identity) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }

  wss.handleUpgrade(req, socket, head, (conn) => {
    roleOf.set(conn, identity.role)
    wss.emit('connection', conn, req, projectId)
  })
})

http.listen(PORT, () => {
  log(`listening on ws://localhost:${PORT}  (auth: ${process.env.SYNC_AUTH === 'off' ? 'OFF (dev)' : 'jwt'} · persistence: ${process.env.DATABASE_URL ? 'postgres' : 'memory'})`)
})
