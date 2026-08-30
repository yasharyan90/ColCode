import pg from 'pg'
import * as Y from 'yjs'
import { STARTER_FILES } from './starter.js'

/**
 * Yjs document persistence in Postgres (project_docs.state = encoded update).
 *
 *   bindState  — on first open: load the snapshot, or seed a starter project.
 *                Then save on a debounce while clients edit.
 *   writeState — when the last client leaves: final save.
 *
 * Without DATABASE_URL (e.g. isolated tests) it degrades to in-memory with a
 * loud warning; projects then live only as long as the process.
 */
const SAVE_DEBOUNCE_MS = Number(process.env.SNAPSHOT_DEBOUNCE_MS ?? 2000)
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null

const timers = new Map<string, ReturnType<typeof setTimeout>>()
const ephemeral = new Set<string>()

export function seed(ydoc: Y.Doc) {
  const files = ydoc.getMap<Y.Text>('files')
  if (files.size > 0) return
  ydoc.transact(() => {
    for (const [name, content] of Object.entries(STARTER_FILES)) {
      const text = new Y.Text()
      files.set(name, text)
      text.insert(0, content)
    }
  }, 'seed')
}

export async function save(projectId: string, ydoc: Y.Doc, log: (m: string) => void) {
  if (!pool) return
  const state = Buffer.from(Y.encodeStateAsUpdate(ydoc))
  try {
    await pool.query(
      `insert into project_docs (project_id, state, updated_at) values ($1, $2, now())
       on conflict (project_id) do update set state = excluded.state, updated_at = now()`,
      [projectId, state],
    )
    await pool.query('update projects set updated_at = now() where id = $1', [projectId])
  } catch (e) {
    log(`snapshot save failed for ${projectId}: ${(e as Error).message}`)
  }
}

export function makePersistence(log: (m: string) => void) {
  if (!pool) log('DATABASE_URL not set — documents are in-memory only')
  return {
    provider: pool,
    bindState: async (projectId: string, ydoc: Y.Doc) => {
      let loaded = false
      let persistent = false
      if (pool) {
        try {
          const { rows } = await pool.query<{ state: Buffer | null }>(
            'select d.state from projects p left join project_docs d on d.project_id = p.id where p.id = $1', [projectId])
          persistent = rows.length > 0 // a room with no project row is ephemeral (tests, dev) — never saved
          if (rows[0]?.state) { Y.applyUpdate(ydoc, new Uint8Array(rows[0].state), 'persistence'); loaded = true }
        } catch (e) {
          log(`snapshot load failed for ${projectId}: ${(e as Error).message}`)
        }
      }
      if (!loaded) seed(ydoc)
      if (!persistent) { ephemeral.add(projectId); return }

      ydoc.on('update', (_update: Uint8Array, origin: unknown) => {
        if (origin === 'persistence') return
        clearTimeout(timers.get(projectId))
        timers.set(projectId, setTimeout(() => { timers.delete(projectId); void save(projectId, ydoc, log) }, SAVE_DEBOUNCE_MS))
      })
    },
    writeState: async (projectId: string, ydoc: Y.Doc) => {
      clearTimeout(timers.get(projectId)); timers.delete(projectId)
      if (ephemeral.delete(projectId)) return
      await save(projectId, ydoc, log)
    },
  }
}
