import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import { Redis } from 'ioredis'
import { migrate } from './db.js'
import { registerAuth } from './auth.js'
import { registerProjects } from './projects.js'
import { registerRun } from './run.js'

/**
 * ColCode API server. Owns auth, project/file CRUD, and the run-code endpoint.
 * Talks to Postgres, Redis and the execution worker — never runs user code.
 *   /api/auth/*      GitHub OAuth + JWT session cookie (+ dev login locally)
 *   /api/projects/*  projects, members, project-scoped sync tokens
 *   /api/run         hand-off to the runner, rate-limited per user
 */
const app = Fastify({ logger: true, bodyLimit: 256 * 1024, trustProxy: true })

await app.register(cookie)

// Rate-limit state in Redis when available so multiple API instances share it.
const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, { connectTimeout: 500, maxRetriesPerRequest: 1, lazyConnect: true }) : null
if (redis) {
  try { await redis.connect() } catch (e) { app.log.warn(`redis unavailable, rate limits are per-process: ${(e as Error).message}`) }
}
await app.register(rateLimit, { global: false, ...(redis && redis.status === 'ready' ? { redis } : {}) })

await migrate()
await registerAuth(app)
await registerProjects(app)
await registerRun(app)

app.get('/api/health', async () => ({ ok: true, service: 'colcode-api', milestone: 5, redis: redis?.status ?? 'off' }))

const port = Number(process.env.PORT ?? 4000)
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
