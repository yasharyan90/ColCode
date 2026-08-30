import type { FastifyInstance } from 'fastify'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { requireUser } from './auth.js'

const RUNNER_URL = process.env.RUNNER_URL ?? 'http://localhost:4100'
let SUPPORTED = ['python', 'javascript', 'typescript', 'ruby', 'go']
const MAX_CODE_BYTES = 100 * 1024

interface RunBody {
  language: string
  code: string
  stdin?: string
}

/**
 * POST /api/run — validate, rate-limit, and hand off to the execution worker.
 * The API server never executes code. It streams the worker's NDJSON events
 * straight through to the browser and cancels the run if the browser leaves.
 *
 * Rate limiting is keyed per signed-in user (falls back to IP only for the
 * 401 path, which never reaches the runner).
 */
export async function registerRun(app: FastifyInstance) {
  const inFlight = new Map<string, number>() // per-key concurrent runs

  // The runner is the authority on what it can run; ask it (best effort).
  try {
    const h = await (await fetch(`${RUNNER_URL}/health`, { signal: AbortSignal.timeout(1500) })).json() as { languages?: string[] }
    if (Array.isArray(h.languages) && h.languages.length) SUPPORTED = h.languages
  } catch { app.log.warn(`runner not reachable at boot; assuming languages: ${SUPPORTED.join(', ')}`) }

  app.get('/api/run/languages', async () => ({ languages: SUPPORTED }))

  app.post<{ Body: RunBody }>('/api/run', {
    preHandler: requireUser,
    config: {
      rateLimit: {
        max: Number(process.env.RUN_RATE_MAX ?? 10),
        timeWindow: process.env.RUN_RATE_WINDOW ?? '1 minute',
        keyGenerator: (req) => runKey(req.user?.id ?? req.ip),
        errorResponseBuilder: (_req, ctx) => ({
          statusCode: 429,
          error: `rate limit: at most ${ctx.max} runs per ${ctx.after}`,
          retryAfterMs: ctx.ttl,
        }),
      },
    },
  }, async (request, reply) => {
    const body = request.body
    if (!body || typeof body.code !== 'string' || typeof body.language !== 'string') {
      return reply.code(400).send({ error: 'expected {language, code}' })
    }
    if (!SUPPORTED.includes(body.language)) {
      return reply.code(400).send({ error: `running ${body.language} is not supported yet`, supported: SUPPORTED })
    }
    if (Buffer.byteLength(body.code) > MAX_CODE_BYTES) {
      return reply.code(413).send({ error: 'source too large (100 KB max)' })
    }

    const key = runKey(request.user!.id)
    if ((inFlight.get(key) ?? 0) >= 1) {
      return reply.code(409).send({ error: 'a run is already in progress — stop it first' })
    }
    inFlight.set(key, (inFlight.get(key) ?? 0) + 1)

    // Cancel the run if the browser goes away. NB: `request.raw` emits 'close'
    // once the request *body* is consumed, so it must be the response we watch.
    const abort = new AbortController()
    reply.raw.on('close', () => { if (!reply.raw.writableFinished) abort.abort() })

    try {
      const upstream = await fetch(`${RUNNER_URL}/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ language: body.language, code: body.code, stdin: body.stdin }),
        signal: abort.signal,
      })
      if (!upstream.ok || !upstream.body) {
        const text = await upstream.text().catch(() => '')
        return reply.code(upstream.status === 503 ? 503 : 502).send({ error: text || `runner error ${upstream.status}` })
      }
      reply.hijack()
      reply.raw.writeHead(200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-store',
      })
      await pipeline(Readable.fromWeb(upstream.body as never), reply.raw).catch(() => {})
    } catch (err) {
      if (!reply.sent) return reply.code(502).send({ error: `runner unavailable: ${(err as Error).message}` })
    } finally {
      const n = (inFlight.get(key) ?? 1) - 1
      if (n <= 0) inFlight.delete(key); else inFlight.set(key, n)
    }
  })
}

function runKey(subject: string) {
  return `run:${subject}`
}
