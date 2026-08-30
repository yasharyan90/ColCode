import Fastify from 'fastify'
import { ensureImages, runInSandbox, startReaper, LIMITS, type RunRequest } from './sandbox.js'
import { SUPPORTED } from './languages.js'

/**
 * ColCode execution worker. The only service with access to the Docker
 * daemon. It is NOT reachable from browsers — the API server proxies to it
 * after auth + rate limiting. Scales independently of the API server.
 *
 *   POST /run  {language, code, stdin?}  →  application/x-ndjson event stream
 *   GET  /health
 */
const PORT = Number(process.env.PORT ?? 4100)
const MAX_CONCURRENT = Number(process.env.RUN_MAX_CONCURRENT ?? 4)

const app = Fastify({ logger: true, bodyLimit: 256 * 1024 })
let active = 0

app.get('/health', async () => ({ ok: true, service: 'colcode-runner', languages: SUPPORTED, active, limits: LIMITS }))

app.post<{ Body: RunRequest }>('/run', async (request, reply) => {
  const body = request.body
  if (!body || typeof body.code !== 'string' || typeof body.language !== 'string') {
    return reply.code(400).send({ error: 'expected {language, code}' })
  }
  if (!SUPPORTED.includes(body.language)) {
    return reply.code(400).send({ error: `unsupported language: ${body.language}`, supported: SUPPORTED })
  }
  if (active >= MAX_CONCURRENT) {
    return reply.code(503).send({ error: 'runner busy, try again shortly' })
  }

  active++
  // Kill the container if the caller disconnects mid-run. (Watch the response:
  // `request.raw` closes as soon as its body is consumed.)
  const abort = new AbortController()
  reply.raw.on('close', () => { if (!reply.raw.writableFinished) abort.abort() })

  reply.hijack()
  const res = reply.raw
  res.writeHead(200, {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-store',
    'x-accel-buffering': 'no',
  })
  try {
    for await (const ev of runInSandbox(body, abort.signal)) {
      if (res.destroyed) break
      res.write(JSON.stringify(ev) + '\n')
    }
  } finally {
    active--
    res.end()
  }
})

await ensureImages((m) => app.log.info(m))
startReaper((m) => app.log.warn(m))
app.listen({ port: PORT, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
