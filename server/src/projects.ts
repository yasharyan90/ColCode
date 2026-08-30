import type { FastifyInstance, FastifyReply } from 'fastify'
import { randomBytes } from 'node:crypto'
import { pool } from './db.js'
import { requireUser, signToken } from './auth.js'

type Role = 'owner' | 'editor' | 'viewer'

/**
 * Projects & membership. Access control is decided here and nowhere else:
 * the sync server trusts a project-scoped token that only this module issues
 * (after checking membership); the runner trusts the API.
 */
export async function registerProjects(app: FastifyInstance) {
  const auth = { preHandler: requireUser }

  app.get('/api/projects', auth, async (request) => {
    const { rows } = await pool.query(
      `select p.id, p.name, p.owner_id as "ownerId", p.created_at as "createdAt", p.updated_at as "updatedAt", m.role,
              (select count(*)::int from project_members where project_id = p.id) as "memberCount"
       from projects p join project_members m on m.project_id = p.id
       where m.user_id = $1 order by p.updated_at desc`,
      [request.user!.id],
    )
    return rows
  })

  app.post<{ Body: { name?: string } }>('/api/projects', auth, async (request, reply) => {
    const name = (request.body?.name ?? '').trim().slice(0, 80)
    if (!name) return reply.code(400).send({ error: 'name is required' })
    const id = newProjectId()
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query('insert into projects (id, name, owner_id) values ($1, $2, $3)', [id, name, request.user!.id])
      await client.query('insert into project_members (project_id, user_id, role) values ($1, $2, $3)', [id, request.user!.id, 'owner'])
      await client.query('commit')
    } catch (e) {
      await client.query('rollback'); throw e
    } finally {
      client.release()
    }
    return reply.code(201).send({ id, name, role: 'owner' })
  })

  app.get<{ Params: { id: string } }>('/api/projects/:id', auth, async (request, reply) => {
    const access = await roleFor(request.params.id, request.user!.id)
    if (!access) return reply.code(404).send({ error: 'project not found' })
    const { rows: [project] } = await pool.query(
      'select id, name, owner_id as "ownerId", created_at as "createdAt", updated_at as "updatedAt" from projects where id = $1', [request.params.id])
    const { rows: members } = await pool.query(
      `select u.id, u.handle, u.name, u.avatar_url as "avatarUrl", m.role from project_members m join users u on u.id = m.user_id
       where m.project_id = $1 order by m.added_at`, [request.params.id])
    return { ...project, role: access, members }
  })

  app.patch<{ Params: { id: string }; Body: { name?: string } }>('/api/projects/:id', auth, async (request, reply) => {
    if (!(await requireRole(request.params.id, request.user!.id, ['owner'], reply))) return
    const name = (request.body?.name ?? '').trim().slice(0, 80)
    if (!name) return reply.code(400).send({ error: 'name is required' })
    await pool.query('update projects set name = $2, updated_at = now() where id = $1', [request.params.id, name])
    return { ok: true }
  })

  app.delete<{ Params: { id: string } }>('/api/projects/:id', auth, async (request, reply) => {
    if (!(await requireRole(request.params.id, request.user!.id, ['owner'], reply))) return
    await pool.query('delete from projects where id = $1', [request.params.id])
    return { ok: true }
  })

  app.post<{ Params: { id: string }; Body: { handle?: string; role?: Role } }>('/api/projects/:id/members', auth, async (request, reply) => {
    if (!(await requireRole(request.params.id, request.user!.id, ['owner'], reply))) return
    const handle = (request.body?.handle ?? '').trim().toLowerCase()
    const role: Role = request.body?.role === 'viewer' ? 'viewer' : 'editor'
    const { rows: [user] } = await pool.query('select id, handle, name from users where lower(handle) = $1 limit 1', [handle])
    if (!user) return reply.code(404).send({ error: `no user with handle "${handle}" has signed in yet` })
    await pool.query(
      `insert into project_members (project_id, user_id, role) values ($1, $2, $3)
       on conflict (project_id, user_id) do update set role = case when project_members.role = 'owner' then 'owner' else excluded.role end`,
      [request.params.id, user.id, role])
    return reply.code(201).send({ id: user.id, handle: user.handle, name: user.name, role })
  })

  app.delete<{ Params: { id: string; userId: string } }>('/api/projects/:id/members/:userId', auth, async (request, reply) => {
    const isSelf = request.params.userId === request.user!.id
    if (!isSelf && !(await requireRole(request.params.id, request.user!.id, ['owner'], reply))) return
    const { rows: [target] } = await pool.query('select role from project_members where project_id = $1 and user_id = $2', [request.params.id, request.params.userId])
    if (!target) return reply.code(404).send({ error: 'not a member' })
    if (target.role === 'owner') return reply.code(400).send({ error: 'the owner cannot be removed' })
    await pool.query('delete from project_members where project_id = $1 and user_id = $2', [request.params.id, request.params.userId])
    return { ok: true }
  })

  /**
   * Short-lived token the browser hands to the WebSocket server. Scoped to one
   * project and carrying the role, so the sync server can authorize the join
   * with a signature check alone — and can enforce viewer read-only later.
   */
  app.get<{ Params: { id: string } }>('/api/projects/:id/sync-token', auth, async (request, reply) => {
    const role = await roleFor(request.params.id, request.user!.id)
    if (!role) return reply.code(404).send({ error: 'project not found' })
    const u = request.user!
    const token = await signToken({ sub: u.id, name: u.name, handle: u.handle, project: request.params.id, role }, '1h', 'sync')
    return { token, role, expiresInSeconds: 3600 }
  })
}

async function roleFor(projectId: string, userId: string): Promise<Role | null> {
  const { rows } = await pool.query<{ role: Role }>('select role from project_members where project_id = $1 and user_id = $2', [projectId, userId])
  return rows[0]?.role ?? null
}

async function requireRole(projectId: string, userId: string, roles: Role[], reply: FastifyReply): Promise<boolean> {
  const role = await roleFor(projectId, userId)
  if (!role) { reply.code(404).send({ error: 'project not found' }); return false }
  if (!roles.includes(role)) { reply.code(403).send({ error: `requires role: ${roles.join(' or ')}` }); return false }
  return true
}

/** 12 URL-safe chars — matches the sync server's room-id rule. */
function newProjectId() {
  return randomBytes(9).toString('base64url').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12)
}
