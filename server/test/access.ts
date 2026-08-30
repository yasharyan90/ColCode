/**
 * Milestone 5 acceptance (API): auth, project CRUD, membership, and that the
 * sync token really is scoped. Uses dev login for two users.
 *   npm run test:access -w server   (API on :4000, sync on :1234)
 */
import WebSocket from 'ws'
const API = process.env.API_URL ?? 'http://localhost:4000'
const SYNC = process.env.SYNC_URL ?? 'ws://localhost:1234'
let failed = false
const check = (c: boolean, m: string) => { console.log(`${c ? '  ✓' : '  ✗'} ${m}`); if (!c) failed = true }

class Session {
  cookie = ''
  async req(method: string, path: string, body?: unknown) {
    const headers: Record<string, string> = { cookie: this.cookie }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await fetch(`${API}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' })
    const sc = res.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0]
    const text = await res.text()
    return { status: res.status, json: text ? JSON.parse(text) : null }
  }
}
const wsStatus = (url: string) => new Promise<number>((resolve) => {
  const ws = new WebSocket(url)
  ws.on('unexpected-response', (_r, res) => resolve(res.statusCode ?? 0))
  ws.on('open', () => { ws.close(); resolve(101) })
  ws.on('error', () => resolve(0))
})

const ada = new Session(), bob = new Session(), anon = new Session()
const tag = Date.now().toString(36)

console.log('1. sign-in')
check((await anon.req('GET', '/api/auth/me')).status === 401, 'anonymous /me → 401')
check((await ada.req('POST', '/api/auth/dev', { name: `Ada ${tag}` })).status === 200, 'dev login Ada')
check((await bob.req('POST', '/api/auth/dev', { name: `Bob ${tag}` })).status === 200, 'dev login Bob')
const me = await ada.req('GET', '/api/auth/me')
check(me.json.handle === `ada-${tag}`, `/me returns handle (${me.json.handle})`)
check((await anon.req('POST', '/api/auth/dev', { name: 'x; drop table' })).status === 400, 'dev login rejects bad names')

console.log('2. projects are private to members')
const created = await ada.req('POST', '/api/projects', { name: 'Ada project' })
check(created.status === 201 && /^[A-Za-z0-9_-]{12}$/.test(created.json.id), `Ada creates a project (${created.json.id})`)
const pid = created.json.id as string
check((await ada.req('GET', `/api/projects/${pid}`)).json.role === 'owner', 'Ada is owner')
check((await bob.req('GET', `/api/projects/${pid}`)).status === 404, 'Bob cannot see it (404, not 403 — existence is not leaked)')
check((await bob.req('GET', '/api/projects')).json.length === 0, 'Bob\'s list is empty')
check((await anon.req('GET', `/api/projects/${pid}`)).status === 401, 'anonymous → 401')

console.log('3. sync tokens are project-scoped and membership-gated')
const adaTok = await ada.req('GET', `/api/projects/${pid}/sync-token`)
check(adaTok.status === 200 && adaTok.json.role === 'owner', 'Ada gets a sync token')
check((await bob.req('GET', `/api/projects/${pid}/sync-token`)).status === 404, 'Bob gets none')
check(await wsStatus(`${SYNC}/${pid}?token=${adaTok.json.token}`) === 101, 'Ada\'s token joins the room')
check(await wsStatus(`${SYNC}/${pid}`) === 401, 'no token → 401 at upgrade')
const other = await ada.req('POST', '/api/projects', { name: 'Other' })
check(await wsStatus(`${SYNC}/${other.json.id}?token=${adaTok.json.token}`) === 401, 'token for project A cannot join project B')

console.log('4. membership management')
check((await bob.req('POST', `/api/projects/${pid}/members`, { handle: `ada-${tag}` })).status === 404, 'non-member cannot invite')
const inv = await ada.req('POST', `/api/projects/${pid}/members`, { handle: `bob-${tag}`, role: 'viewer' })
check(inv.status === 201 && inv.json.role === 'viewer', 'owner invites Bob as viewer')
check((await ada.req('POST', `/api/projects/${pid}/members`, { handle: 'nobody-here' })).status === 404, 'unknown handle → 404')
const bobView = await bob.req('GET', `/api/projects/${pid}`)
check(bobView.status === 200 && bobView.json.role === 'viewer' && bobView.json.members.length === 2, 'Bob now sees the project as viewer')
const bobTok = await bob.req('GET', `/api/projects/${pid}/sync-token`)
check(bobTok.status === 200 && bobTok.json.role === 'viewer', 'Bob\'s sync token carries role=viewer')
check((await bob.req('PATCH', `/api/projects/${pid}`, { name: 'hijacked' })).status === 403, 'viewer cannot rename the project (403)')
check((await bob.req('DELETE', `/api/projects/${pid}`)).status === 403, 'viewer cannot delete the project (403)')
check((await bob.req('DELETE', `/api/projects/${pid}/members/${me.json.id}`)).status === 403, 'viewer cannot remove the owner')
check((await ada.req('POST', `/api/projects/${pid}/members`, { handle: `bob-${tag}`, role: 'editor' })).json.role === 'editor', 'owner promotes Bob to editor')
const bobId = (await bob.req('GET', '/api/auth/me')).json.id
check((await bob.req('DELETE', `/api/projects/${pid}/members/${bobId}`)).status === 200, 'Bob can leave')
check((await bob.req('GET', `/api/projects/${pid}`)).status === 404, 'after leaving, Bob is locked out again')

console.log('5. run endpoint requires a session and is keyed per user')
const anonRun = await anon.req('POST', '/api/run', { language: 'python', code: 'print(1)' })
check(anonRun.status === 401, 'anonymous /api/run → 401 (never reaches the runner)')

console.log('6. cleanup')
check((await ada.req('DELETE', `/api/projects/${pid}`)).status === 200, 'owner deletes project')
check((await ada.req('DELETE', `/api/projects/${other.json.id}`)).status === 200, 'owner deletes other project')
check((await ada.req('GET', `/api/projects/${pid}`)).status === 404, 'deleted project is gone')
check((await ada.req('POST', '/api/auth/logout')).status === 200 && (await ada.req('GET', '/api/auth/me')).status === 401, 'logout clears the session')

console.log(failed ? '\nFAILED' : '\nALL PASSED'); process.exit(failed ? 1 : 0)
