# ColCode

Real-time collaborative code editor — "Cursor meets Google Docs". Multiple users edit the same
project simultaneously with live cursors, and can run code and see shared output.

Design reference: [`DESIGN.md`](./DESIGN.md) (Cursor, via `npx getdesign add cursor`). The editor
uses a dark derivation of those tokens — see `client/src/theme/tokens.ts` for the reasoning.

## Quick start

```bash
cp .env.example .env         # set JWT_SECRET; GitHub OAuth keys optional (dev login works without)
docker compose up -d         # Postgres + Redis
npm install
npm run dev                  # client :5173 · API :4000 · sync :1234 · runner :4100 (needs Docker)
```
Open http://localhost:5173 — sign in with GitHub, or the dev login when `AUTH_DEV_LOGIN=1`.

## Layout

```
client/            React + Vite + TS + Tailwind v4 · Monaco editor (local workers, no CDN)
  src/theme/       tokens.ts (source of truth) · cursorDark.ts (Monaco theme)
  src/lib/         monaco.ts (worker wiring + theme registration + language map)
  src/components/  TopBar · FileTree · EditorTabs · EditorPane · OutputPanel · StatusBar
server/            Fastify API · auth (GitHub OAuth + JWT cookie) · projects & members · /api/run
  src/db.ts        Postgres schema (users, projects, project_members, project_docs)
  test/access.ts   auth + access-control suite
runner/            execution worker — the only service that touches Docker; single-use sandbox per run
  src/sandbox.ts   isolation flags, wall-clock/output caps, orphan reaper
  test/limits.ts   proves the limits actually stop hostile programs
sync-server/       y-websocket server · one Y.Doc per project · rooms authorized on upgrade
  src/authorize.ts verifies the project-scoped sync JWT (signature + project match)
  src/persistence.ts  Postgres snapshots: load on open, debounced save, save on last leave
  test/            two-clients.ts — CRDT convergence test
  src/collab/      useProject.ts (doc + provider + awareness) · presence.ts (identity, colors)
  src/pages/       LoginPage · DashboardPage · EditorPage   (router.ts is 40 lines, on purpose)
scripts/e2e-sync.mjs      real-Chrome ↔ Node client sync test (puppeteer-core)
scripts/e2e-presence.mjs  two real Chrome users: cursors, name tags, avatars, file-tree dots
scripts/e2e-run.mjs       Run/Stop from the real UI; output in xterm; container gone on Stop
scripts/e2e-project.mjs   sign-in → project → folder tree → reload + sync-server restart → sharing
scripts/load-sync.mjs     sync-server load test: R rooms × C clients, latency/convergence/memory
```

## Real-time model

- One Yjs document per project, room name = project ID (`ws://localhost:1234/<projectId>`).
- Inside it, `files: Y.Map<Y.Text>` keyed by path; each open editor binds one Y.Text via y-monaco.
- The client never owns text — no `value`/`onChange`; the CRDT is the source of truth.
- `setPersistence.bindState` loads the project's snapshot from Postgres (`project_docs`) or seeds
  a starter project; edits are snapshotted on a 2 s debounce and when the last client leaves.
  A sync-server restart loses nothing.

## Auth & access control

- **Session**: GitHub OAuth → our HS256 JWT in an httpOnly `colcode_session` cookie (7 d). With
  `AUTH_DEV_LOGIN=1` (never in production) `POST /api/auth/dev {name}` signs in without OAuth.
- **Projects** are private to members (`owner` / `editor` / `viewer`). Non-members get 404, not
  403, so project IDs don't leak existence. Only owners rename, delete, or manage members.
- **Sync token**: `GET /api/projects/:id/sync-token` issues a 1 h JWT (`aud: sync`) carrying the
  project ID and role — only after a membership check. The sync server verifies signature +
  project match on the WebSocket upgrade; a token for project A cannot join project B.
- **Run**: `/api/run` requires a session and rate-limits per user ID (Redis-backed when available).
- **Viewers are read-only on the wire**: the sync server drops any sync message that carries
  document updates from a `viewer` connection (awareness and state requests still flow), so the
  read-only editor in the UI is not the only line of defense.

## Running code

Every run is hostile input. The browser POSTs `{language, code}` to `/api/run`; the API server
validates, rate-limits per user (10/min, 1 concurrent — keyed by IP until auth lands) and streams
the runner's NDJSON events back. It never executes anything. The **runner** creates a fresh
container per run and force-removes it afterwards:

| Control | Mechanism |
|---|---|
| No network | `--network none` — the netns has only `lo`, connects fail with `ENETUNREACH` |
| Immutable FS | `--read-only`; an 8 MB `noexec` tmpfs at `/tmp` is the only writable path |
| Unprivileged | `--user 65534`, `--cap-drop ALL`, `no-new-privileges` |
| Memory | `--memory 128m --memory-swap 128m` → cgroup OOM-kill (exit 137) |
| CPU / processes | `--cpus 0.5`, `--pids-limit 64` (fork bombs die after a handful of forks) |
| Wall clock | `docker kill` after 5 s |
| Output | killed after 64 KB |
| Crash safety | on boot and every 30 s the runner reaps any sandbox container older than 3× the wall limit |

Source is delivered via an env var and written to the tmpfs by a `sh` wrapper (the read-only
rootfs refuses `docker cp`).

| Language | Image | Notes |
|---|---|---|
| Python | `python:3.12-alpine` | |
| JavaScript | `node:24-alpine` | |
| TypeScript | `node:24-alpine` | types stripped by Node, not checked |
| Ruby | `ruby:3.3-alpine` | |
| Go | `golang:1.23-alpine` | compiles per run (~6–10 s): 512 MB, 1 CPU, 20 s, 256 MB **exec** tmpfs (tmpfs pages count against the cgroup) |

The runner's `/health` advertises its languages; the API and client pick them up from there.
Completion: TS/JS use Monaco's TypeScript service; Python/Go/Ruby get keyword + builtin + snippet
providers on top of word-based suggestions.

## Presence

Presence rides on y-websocket's built-in awareness protocol — nothing separate:

- We publish `user: {name, color}` and `file` (the file we're viewing); y-monaco publishes
  `selection` as Yjs relative positions, so cursors survive concurrent edits.
- Colors are the five DESIGN.md timeline pastels, assigned least-used-first so the first five
  collaborators are always distinct. Names come from `?name=`, then localStorage, else generated;
  click your name in the top bar to change it.
- Remote cursors/selections are y-monaco decorations (`.yRemoteSelection-<id>`,
  `.yRemoteSelectionHead-<id>`); `PresenceStyles` injects one CSS rule set per peer. Name tags
  appear on remote activity and on hover, then fade so code stays readable.
- Avatars show the GitHub picture when there is one; the tooltip reads `name · file:line`, and
  clicking an avatar follows that collaborator (opens their file, reveals their cursor line).

## Load test (sync server, single process, Apple Silicon laptop)

| Rooms × clients | Offered | Delivered | p50 / p95 / p99 | Converged | RSS |
|---|---|---|---|---|---|
| 40 × 4 (160 conns) | 1,525 ops/s | 100% | 1 / 3 / 10 ms | 40/40 | 63 → 170 MB |
| 100 × 5 (500 conns) | 3,506 ops/s | 100% | 24 / 134 / 169 ms | 100/100 | 56 → 245 MB |

Latency is the time from an insert on one client to its observation on a peer. Beyond a few
thousand ops/s per process, run more sync-server instances behind a sticky-room load balancer
(rooms are independent); cross-instance rooms would need y-redis — not needed at this scale.

## Deploying

Production runs as six containers from one Dockerfile (targets `web`, `api`, `sync`, `runner`):

```
web (Caddy) ──► api ──► postgres · redis · runner ──► host Docker daemon (sandboxes)
     │                                                 
     └────────► sync ──► postgres
```
Only `web` publishes ports. Caddy serves the built client, proxies `/api/*` to the API and
`/sync/*` to the sync server (prefix stripped), and obtains TLS certificates automatically when
`SITE_ADDRESS` is a domain. `postgres`/`redis` live on an internal network; the runner is
reachable only from the API and is the sole service holding the Docker socket.

```bash
cp .env.production.example .env.production   # APP_URL, SITE_ADDRESS, secrets, GitHub OAuth keys
scripts/deploy.sh                            # build + up + wait for health, on this machine
DOCKER_HOST=ssh://deploy@your-host scripts/deploy.sh   # same thing on a remote Docker host
```

Notes:
- `JWT_SECRET` and `POSTGRES_PASSWORD`: `openssl rand -hex 32`. The GitHub OAuth app's callback
  must be exactly `${APP_URL}/api/auth/github/callback`.
- Dev login is refused when `NODE_ENV=production`. For a staging stack without OAuth use
  `NODE_ENV=staging AUTH_DEV_LOGIN=1` and a separate project name:
  `docker compose -p colcode-staging -f docker-compose.prod.yml --env-file .env.staging up -d`,
  then `node scripts/smoke-stack.mjs http://localhost:8081` exercises sign-in → sync → run.
- Compose also reads `./.env` underneath `--env-file` for interpolation; `deploy.sh` warns when a
  value is set there but empty in `.env.production`.
- The runner needs the sandbox images on the daemon it talks to; it pulls missing ones at boot.
- Docker-socket access is root-equivalent on the host. Harden with a socket proxy
  (e.g. tecnativa/docker-socket-proxy allowing only container create/start/kill/rm) or point
  `DOCKER_HOST` at a dedicated, rootless or remote daemon used only for sandboxes.
- Backups: `pgdata` holds everything (users, projects, Yjs snapshots). `docker compose exec
  postgres pg_dump -U colcode colcode > backup.sql`.
- Scaling: `api` and `runner` are stateless (Redis shares rate limits); `sync` scales by running
  more instances with sticky routing per project (rooms are independent).

### Client on Vercel

Vercel can host the static client only: the sync server is a long-lived WebSocket process and the
runner needs a Docker daemon, neither of which fits serverless. The split deployment is:

```
browser ──► Vercel (static client)
   │            └─ /api/*  ──rewrite──► https://api.your-domain.com/api/*   (Caddy → api)
   └──────── wss://api.your-domain.com/sync/<projectId>   (Caddy → sync, direct — no proxy)
```

`vercel.json` at the repo root does the client build (`npm ci -w client`, `npm run build -w client`,
output `client/dist`), the SPA fallback, cache/security headers, and the `/api/*` rewrite. Because
Vercel proxies `/api` server-side, the session cookie stays first-party — no CORS, no
`SameSite=None`. Vercel does not proxy WebSocket upgrades, so the sync socket goes straight to the
backend host via `VITE_SYNC_URL`.

1. Run the backend stack on any Docker host as above, with `SITE_ADDRESS=api.your-domain.com`
   (Caddy gets the certificate) and **`APP_URL` set to the Vercel URL** — that is where the
   browser lives, so it drives the OAuth callback and `Secure` cookies. The GitHub OAuth app's
   callback becomes `https://<vercel-domain>/api/auth/github/callback`.
2. In `vercel.json`, replace `api.colcode.example.com` with your backend host. (You can also change
   the rewrite later without a redeploy under Project → CDN → Routing.)
3. Import the repo in Vercel with the **Root Directory left at the repo root** (the lockfile and
   workspaces live there — `vercel.json` scopes the install/build to `client`), and add one
   environment variable: `VITE_SYNC_URL=wss://api.your-domain.com/sync`.
4. Deploy: push to the connected branch, or `npx vercel --prod`.

Checks: `https://<vercel-domain>/api/health` returns `{"ok":true,...}` through the rewrite;
sign-in redirects back to the Vercel domain; a project page shows "connected" (the WebSocket in
devtools points at `wss://api.your-domain.com/sync/<id>?token=…`).

Notes:
- Preview deployments share the backend; set `VITE_SYNC_URL` for the Preview environment too, and
  point a second GitHub OAuth app + `APP_URL` at a preview alias if you want sign-in on previews.
- The Docker host's Caddy still serves the client as well, so `https://api.your-domain.com` keeps
  working as a fallback origin (its `/api` cookie is a separate session from the Vercel one).
- `/api/run` streams NDJSON through Vercel's proxy; the stream is passed through, but a run is
  capped by the upstream proxy timeout as well as the runner's own per-language limit.

## Tests

```bash
npm run typecheck
npm run build
npm run test:sync    # two Node clients converge under concurrent typing (sync server must be up)
npm run test:e2e     # real Chrome tab ↔ Node client (client + sync server must be up)
npm run test:e2e:presence  # two Chrome users see each other's cursors, tags, avatars
npm run test:limits        # sandbox: timeout, OOM, fork bomb, output cap, no network, read-only, rate limit
npm run test:e2e:run       # Run/Stop through the real UI
npm run test:access        # auth, project privacy, membership, sync-token scoping (31 checks)
npm run test:e2e:project   # dashboard → folder tree → persistence across a sync-server restart → sharing
npm run test:load -- 40 4 20 100   # rooms clients seconds intervalMs — prints p50/p95, delivery %, convergence
```

## Milestones

- [x] 1 — Single-user Monaco editor with the `cursor-dark` theme
- [x] 2 — Yjs + y-websocket: multi-tab sync with no lost keystrokes
- [x] 3 — Awareness: remote cursors, selections, name tags
- [x] 4 — Output panel (xterm.js) + sandboxed execution with resource limits
- [x] 5 — Auth, Postgres persistence, multi-file file tree
- [x] 6 — More languages, presence polish, load testing
