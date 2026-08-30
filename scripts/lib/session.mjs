/**
 * Test helper: dev-login a user, create a project, and hand back what a test
 * needs to act as that user from Node (cookie, sync token) or from a browser
 * page (session cookie injected, so the UI is already signed in).
 */
export const API = process.env.API_URL ?? 'http://localhost:4000'
export const APP = process.env.APP_URL ?? 'http://localhost:5173'

export async function devSession(name) {
  const res = await fetch(`${API}/api/auth/dev`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
  if (!res.ok) throw new Error(`dev login failed (${res.status}) — is AUTH_DEV_LOGIN=1 in .env?`)
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  const user = await res.json()
  const call = async (method, path, body) => {
    const r = await fetch(`${API}${path}`, { method, headers: { cookie, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined })
    const text = await r.text()
    return { status: r.status, json: text ? JSON.parse(text) : null }
  }
  return {
    user, cookie, call,
    createProject: async (projectName) => (await call('POST', '/api/projects', { name: projectName })).json.id,
    syncToken: async (projectId) => (await call('GET', `/api/projects/${projectId}/sync-token`)).json.token,
    invite: async (projectId, handle, role = 'editor') => call('POST', `/api/projects/${projectId}/members`, { handle, role }),
    /** Make a puppeteer page act as this user. */
    applyTo: async (page) => {
      const [k, v] = cookie.split('=')
      await page.setCookie({ name: k, value: v, domain: 'localhost', path: '/', httpOnly: true })
    },
  }
}
