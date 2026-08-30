# Making ColCode — the build log

Every operation, command, and file used to build ColCode, in the order it happened. Six
milestones plus the production deployment. Commands were run from the repo root
(`/Users/yasharyan/Desktop/ColCode`) unless a `cd` is shown.

Legend: **cmd** = shell command · **new** = file created · **edit** = file changed · **verify** = how it was checked.

---

## 0. Design reference

| Step | Operation |
|---|---|
| cmd | `npx -y getdesign@latest add cursor` → generated `DESIGN.md` (Cursor's light cream brand: canvas `#f7f7f4`, ink `#26251e`, Cursor Orange `#f54e00`, JetBrains Mono on code, hairline-only depth, 8/12 px radii, five timeline pastels). |
| decision | Spec demands a *dark* editor → derive a dark theme from the same tokens (ink becomes the editor floor, cream becomes text, orange stays the single scarce accent, pastels reserved for presence colors). |

---

## Milestone 1 — Single-user Monaco editor with the `cursor-dark` theme

### Scaffold
| Step | Operation |
|---|---|
| cmd | `npm create vite@latest client -- --template react-ts` |
| cmd | `cd client && rm -rf src/assets src/App.css public/vite.svg && npm install` |
| cmd | `npm install monaco-editor @monaco-editor/react @fontsource-variable/inter @fontsource-variable/jetbrains-mono` |
| cmd | `npm install -D tailwindcss @tailwindcss/vite` |
| new | `package.json` (root; npm workspaces `client`, `server`; scripts `dev`, `dev:client`, `dev:server`, `build`, `typecheck`) |
| new | `.gitignore` |
| new | `client/vite.config.ts` — React + Tailwind plugins, `/api → :4000` proxy, `optimizeDeps.include: ['monaco-editor']` |
| new | `client/index.html` — dark color-scheme, `<div id="root">` |
| new | `client/src/theme/tokens.ts` — **single source of truth** for colors/syntax/fonts/radii + derivation rationale |
| new | `client/src/theme/cursorDark.ts` — Monaco `IStandaloneThemeData` (`cursor-dark`): token rules + ~70 workbench colors, no shadows |
| new | `client/src/lib/monaco.ts` — local Vite workers (no CDN), `defineTheme`, TS compiler defaults, `languageForFile()` |
| new | `client/src/index.css` — Tailwind v4 `@theme` mirroring tokens, fonts, `.display`, `.caption-upper` |
| new | `client/src/sample/starter.ts` — demo files (`main.ts`, `fib.py`, `README.md`) |
| new | `client/src/main.tsx`, `client/src/App.tsx` |
| new | `client/src/components/TopBar.tsx`, `FileTree.tsx`, `EditorTabs.tsx`, `EditorPane.tsx`, `OutputPanel.tsx` (stub), `StatusBar.tsx` |
| new | `server/package.json`, `server/tsconfig.json`, `server/src/index.ts` — Fastify skeleton with `GET /api/health` |
| cmd | `npm install fastify -w server && npm install -D tsx typescript @types/node -w server` |
| cmd | `cd client && npm pkg set scripts.typecheck="tsc -b --noEmit"` |
| new | `README.md` |

### Fixes discovered
| Problem | Fix |
|---|---|
| `monaco.languages.typescript` undefined (Monaco ≥ 0.55) | edit `client/src/lib/monaco.ts` → `monaco.typescript.*` |
| Worker imports `monaco-editor/esm/vs/...` blocked by the package `exports` map | edit imports → `monaco-editor/editor/editor.worker?worker`, `monaco-editor/language/json/json.worker?worker`, … |

### Verify
| Step | Operation |
|---|---|
| cmd | `npm run typecheck` · `npm run build` (4.1 MB Monaco chunk, expected) |
| cmd | `npm run dev:server &` · `npm run dev:client &` · `curl localhost:4000/api/health` · `curl localhost:5173/api/health` (proxy) |
| cmd | Headless screenshot (Chrome extension not connected): `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=1440,900 --timeout=12000 --user-data-dir=<scratch> --screenshot=<scratch>/milestone1.png http://localhost:5173/` (note: `--virtual-time-budget` hangs on Vite's HMR socket) |

---

## Milestone 2 — Yjs + y-websocket: multi-tab sync with no lost keystrokes

### Sync server workspace
| Step | Operation |
|---|---|
| new | `sync-server/package.json`, `sync-server/tsconfig.json` (copied from server) |
| cmd | `npm pkg set 'workspaces[2]=sync-server' 'scripts.dev:sync=npm run dev -w sync-server'` |
| cmd | `npm install yjs y-websocket y-monaco -w client` |
| cmd | `npm install yjs @y/websocket-server ws -w sync-server` · `npm install -D tsx typescript @types/node @types/ws y-websocket jose -w sync-server` |
| cmd | **pin** `npm install @y/websocket-server@0.1.1 -w sync-server` (0.1.5 drags in a yjs 14 prerelease that mismatches the yjs 13 client) |
| cmd | `mv client/src/sample/starter.ts sync-server/src/starter.ts` (seed now lives server-side) |
| new | `sync-server/src/authorize.ts` — room authorization on WebSocket upgrade (dev allow-all at first) |
| new | `sync-server/src/index.ts` — `ws` server, `http.on('upgrade')` → `authorize()` → `setupWSConnection`; seed via `setPersistence.bindState`; `/health` |
| new | `sync-server/test/two-clients.ts` — CRDT convergence test |

### Client
| Step | Operation |
|---|---|
| new | `client/src/collab/useProject.ts` — one `Y.Doc` + `WebsocketProvider` per project, `files: Y.Map<Y.Text>` |
| new | `client/src/vite-env.d.ts`, `client/.env.example` (`VITE_SYNC_URL`) |
| edit | `client/src/components/EditorPane.tsx` — `MonacoBinding(ytext, model, editors, null)`; no `value`/`onChange` |
| edit | `client/src/App.tsx` — Yjs-backed file list; `?project=` picks the room |
| edit | `client/src/components/StatusBar.tsx` — Connecting / Syncing / Synced / Offline |
| edit | `client/vite.config.ts` — alias `monaco-editor/esm/vs/editor/editor.api(.js)` → `monaco-editor` (y-monaco's deep import is blocked by the exports map; alias also guarantees one Monaco instance); `optimizeDeps.include` += y-monaco, yjs, y-websocket |
| edit | `server/package.json`, `sync-server/package.json` — `tsx watch --ignore '../node_modules/**' src/index.ts` (tsx restarted on root `node_modules` changes) |

### Fixes discovered
| Problem | Fix |
|---|---|
| Provider created in `useMemo` but destroyed in effect cleanup → dead under StrictMode | create doc/provider **inside** `useEffect` |
| `setContentInitializor` missing in 0.1.1 | seed inside `setPersistence.bindState` |
| Vite dev server had stale paths after workspace install hoisted `monaco-editor` | `pkill -f vite && rm -rf client/node_modules/.vite && npm run dev:client` |

### Verify
| Step | Operation |
|---|---|
| cmd | `npm run test:sync -w sync-server` (13 checks: seed once, A→B, 300+300 interleaved keystrokes converge, late joiner, rejections) |
| cmd | `npm install -D puppeteer-core` (root) · new `scripts/e2e-sync.mjs` (real Chrome ↔ Node client) · `node scripts/e2e-sync.mjs` |
| note | Monaco renders spaces as U+00A0 — DOM assertions normalize ` `; editing a source file right before an e2e run triggers a Vite reload mid-test |

---

## Milestone 3 — Awareness: remote cursors, selections, name tags

| Step | Operation |
|---|---|
| new | `client/src/collab/presence.ts` — `PresenceUser`, `Peer`, name persistence (`?name=` → localStorage → generated), least-used-first pastel picking, `initials()` |
| edit | `client/src/collab/useProject.ts` — publish `user` + `file` on awareness, `peers[]`, `setName()`, `setActiveFile()` |
| new | `client/src/components/PresenceStyles.tsx` — per-peer CSS for `.yRemoteSelection-<id>` / `.yRemoteSelectionHead-<id>` + `::after` name tag |
| edit | `client/src/index.css` — base geometry for remote cursors, `.tag-visible` reveal/fade |
| edit | `client/src/components/EditorPane.tsx` — pass awareness to `MonacoBinding`; `flashTagsOnRemoteActivity()`; **clear awareness `selection` on unmount** (ghost-cursor bug) |
| edit | `client/src/components/TopBar.tsx` — avatar stack, "N online", rename-yourself chip |
| edit | `client/src/components/FileTree.tsx` — presence dots per file |
| edit | `client/src/components/StatusBar.tsx` — "N in room" |
| edit | `client/src/App.tsx` — wire presence |
| edit | dev-only globals for tests: `window.__colcode` (useProject), `__editor`/`__binding` (EditorPane), `__monaco` (monaco.ts) |
| new | `scripts/e2e-presence.mjs` — two real Chrome users (17 checks) |
| cmd | `node scripts/e2e-presence.mjs` |

**Big detour, worth remembering:** decorations "never rendered" in tests because headless Chrome pauses `requestAnimationFrame` in background tabs and Monaco paints on rAF. Diagnosed with CDP `Debugger.pause` + direct DOM probes; fix was **one browser instance per simulated user**.

---

## Milestone 4 — Output panel (xterm.js) + sandboxed execution

### Runner workspace
| Step | Operation |
|---|---|
| cmd | `docker version` / `docker info` (memory + pids limits, cgroup v2) · `docker pull python:3.12-alpine` |
| new | `runner/package.json`, `runner/tsconfig.json` |
| cmd | `npm pkg set 'workspaces[3]=runner' 'scripts.dev:runner=…' 'scripts.test:limits=…'` |
| cmd | `npm install fastify -w runner` · `npm install -D tsx typescript @types/node -w runner` |
| cmd | `npm install @fastify/rate-limit -w server` · `npm install @xterm/xterm @xterm/addon-fit -w client` |
| new | `runner/src/languages.ts` — image / file / cmd table |
| new | `runner/src/sandbox.ts` — `docker create` with `--network none --read-only --tmpfs /tmp --user 65534 --cap-drop ALL --security-opt no-new-privileges --memory --memory-swap --cpus --pids-limit`, wall-clock `docker kill`, output cap, OOM detection via `docker inspect`, `docker rm --force`; source delivered via `CODE` env + `sh -c 'printf … > /tmp/main.py && unset CODE && exec "$@"'`; **orphan reaper** at boot + every 30 s |
| new | `runner/src/index.ts` — `POST /run` → NDJSON stream, `GET /health`, concurrency cap |
| new | `runner/test/limits.ts` — timeout, OOM, fork bomb, output flood, no network, read-only, uid, single-use, API validation/rate-limit, leftover containers |

### API + client
| Step | Operation |
|---|---|
| new | `server/src/run.ts` — `/api/run`: validate, per-user rate limit, proxy NDJSON from the runner, cancel on disconnect |
| edit | `server/src/index.ts` — register `@fastify/rate-limit` (global: false) |
| new | `client/src/run/runController.ts` — fetch + NDJSON parse + abort |
| new | `client/src/theme/xtermTheme.ts` |
| edit | `client/src/components/OutputPanel.tsx` — xterm.js terminal, launch header, sandbox banner, exit footer |
| edit | `client/src/components/TopBar.tsx` — Run ⇄ Stop button · `client/src/App.tsx` — ⌘⏎ |
| edit | `client/src/index.css` — xterm host styles |
| new | `scripts/e2e-run.mjs` — Run/Stop through the UI, container gone on Stop (checked with `docker ps` on the host) |

### Fixes discovered
| Problem | Fix |
|---|---|
| `docker cp` refused on a `--read-only` container | source via env var + sh wrapper |
| `request.raw.on('close')` fires when the *body* is consumed → both services aborted their own runs | `reply.raw.on('close')` guarded by `writableFinished` |
| Custom rate-limit body returned 500 | add `statusCode: 429` in `errorResponseBuilder` |
| tsx restart mid-run orphaned a container | reaper |
| Docker Desktop netns shows kernel tunnel devices | assert `ENETUNREACH` (errno 101), not "only lo" |

### Verify
`npm run test:limits` (22) · `node scripts/e2e-run.mjs` (16) · milestone 2–3 suites re-run.

---

## Milestone 5 — Auth, Postgres persistence, folder tree

### Infra + deps
| Step | Operation |
|---|---|
| new | `docker-compose.yml` — Postgres 16 + Redis 7 for dev · `.env.example` · `.env` (JWT secret via `openssl rand -hex 24`) |
| cmd | `docker compose up -d` |
| cmd | `npm install pg jose @fastify/cookie ioredis -w server` · `npm install -D @types/pg -w server` |
| cmd | `npm install pg jose -w sync-server` · `npm install -D @types/pg -w sync-server` |
| edit | all `dev` scripts → `tsx watch --env-file=../.env --ignore '../node_modules/**' src/index.ts` (**flag after `watch`**; the first attempt put it before and tsx tried to run a file named `watch`) |

### API server
| Step | Operation |
|---|---|
| new | `server/src/db.ts` — pool + idempotent schema (`users`, `projects`, `project_members`, `project_docs`), `upsertUser`, `getUser` |
| new | `server/src/auth.ts` — HS256 JWT via `jose`, httpOnly cookie, GitHub OAuth (`/api/auth/github`, `/callback`), dev login (`/api/auth/dev`, refused in production), `/me`, `/logout`, `requireUser` |
| new | `server/src/projects.ts` — CRUD, members (owner/editor/viewer), `GET /api/projects/:id/sync-token` (1 h, `aud: sync`) |
| edit | `server/src/run.ts` — `preHandler: requireUser`, rate-limit key = user id |
| edit | `server/src/index.ts` — cookie plugin, Redis-backed rate limit, `migrate()`, register auth/projects/run |
| new | `server/test/access.ts` (31 checks) · `npm install -D ws @types/ws -w server` |

### Sync server
| Step | Operation |
|---|---|
| edit | `sync-server/src/authorize.ts` — verify sync JWT (signature + `project` claim match) |
| new | `sync-server/src/persistence.ts` — `bindState` load-or-seed, 2 s debounced save, `writeState` on last leave; rooms with no project row are ephemeral |
| edit | `sync-server/src/index.ts` — use persistence; health reports auth/persistence mode |
| edit | `sync-server/test/two-clients.ts` — mint sync tokens with `jose`; 4 rejection cases |

### Client
| Step | Operation |
|---|---|
| new | `client/src/api.ts`, `client/src/auth/useAuth.ts`, `client/src/router.ts` (40-line history router) |
| new | `client/src/pages/LoginPage.tsx`, `DashboardPage.tsx`, `EditorPage.tsx` (the old `App` shell, now per project with token) |
| new | `client/src/components/Wordmark.tsx`, `UserMenu.tsx`, `MembersPanel.tsx` |
| edit | `client/src/components/FileTree.tsx` — **rewritten**: folders, new file/folder, rename (files & folders), delete, all via the shared `Y.Map` (rename = copy + delete in one transaction) |
| edit | `client/src/components/TopBar.tsx` — breadcrumb, Share panel, user avatar/sign-out |
| edit | `client/src/components/EditorPane.tsx` — `readOnly` for viewers · `client/src/collab/useProject.ts` — display name from account |
| edit | `client/src/App.tsx` — router + auth gate |
| new | `scripts/lib/session.mjs` — dev-login helper that injects the cookie into puppeteer pages |
| new | `scripts/e2e-project.mjs` (19 checks incl. kill + restart of the sync server) |
| edit | `scripts/e2e-sync.mjs`, `e2e-presence.mjs`, `e2e-run.mjs`, `runner/test/limits.ts` — ported to authenticated sessions |

### Fixes discovered
| Problem | Fix |
|---|---|
| `erasableSyntaxOnly` rejects constructor parameter properties | explicit field in `ApiError` |
| `content-type: application/json` with empty body → 400 in tests | only send the header with a body |
| `<li>` nested in `<li>` (rename input) | `InlineInput` renders a `<div>` |
| Tree rows are `div[role=treeitem][data-path]`, not buttons | test selectors updated |

### Verify
`npm run test:access` · `npm run test:e2e:project` · `npm run test:sync` · `npm run test:limits` · e2e sync/presence/run.

---

## Milestone 6 — More languages, presence polish, load test

| Step | Operation |
|---|---|
| cmd | `docker pull node:24-alpine golang:1.23-alpine ruby:3.3-alpine`; timed each under the hardened flags (Node/TS 0.25 s, Ruby 0.16 s, Go ~6 s cold compile, needs `exec` tmpfs) |
| edit | `runner/src/languages.ts` — Python, JavaScript, TypeScript, Ruby, Go with per-language `limits` (Go: 512 MB / 1 CPU / 20 s / 256 MB **exec** tmpfs — tmpfs pages count against the cgroup) |
| edit | `runner/src/sandbox.ts` — honor per-language limits/env/tmpfs; reaper max-age covers the slowest language |
| edit | `server/src/run.ts` — discover languages from runner `/health`; `GET /api/run/languages` |
| edit | `client/src/run/runController.ts` — `refreshRunnableLanguages()` · `OutputPanel.tsx` — banner note |
| edit | `client/src/lib/monaco.ts` — keyword/builtin/snippet completion providers for Python, Go, Ruby |
| edit | `sync-server/src/index.ts` — **viewer read-only on the wire** (drop sync step-2/update messages from viewer connections); health adds `pid`, `connections`, `rssMb`, `heapMb` |
| edit | `sync-server/test/two-clients.ts` — viewer case; `disableBc: true` (same-process providers otherwise share updates over an in-process BroadcastChannel, bypassing the server) |
| edit | `client/src/collab/presence.ts` (`avatar`, `line`), `useProject.ts` (`cursorLine()` from relative positions), `EditorPane.tsx` (`reveal` + pending reveal applied in `onMount`), `EditorPage.tsx` (`follow()`), `TopBar.tsx` (avatar images, `name · file:line` tooltip, click-to-follow) |
| new | `scripts/load-sync.mjs` — R rooms × C clients; latency p50/p95/p99, delivery %, convergence, RSS |
| edit | `runner/test/limits.ts` — language matrix; `scripts/e2e-run.mjs` — JS/TS/Ruby through the UI; `scripts/e2e-presence.mjs` — follow test |
| cmd | `node scripts/load-sync.mjs 40 4 20 100` → 1,525 ops/s, 100 %, p95 3 ms · `node scripts/load-sync.mjs 100 5 20 100` → 3,506 ops/s, 100 %, p95 134 ms, 100/100 converged |
| cmd | `docker compose exec -T postgres psql -U colcode -c "delete from projects where name like 'load %'"` (test cleanup) |

**Test-hygiene lessons:** wait for `window.__editor`'s model URI before typing (Monaco mounts after the tab appears); y-websocket's `sync` event fires before the server's async seed lands — wait for the file in the map; never `Math.max(...hundredsOfThousands)`.

---

## Production deployment

| Step | Operation |
|---|---|
| new | `Dockerfile` — multi-stage: `deps` (`npm ci`) → `build` (`npm run build -w server -w sync-server -w runner && npm run build -w client`) → `prod-deps` (`npm ci --omit=dev`) → targets `api`, `sync`, `runner` (+ `apk add docker-cli`), `web` (`caddy:2-alpine` + `client/dist`) |
| new | `.dockerignore` · `deploy/Caddyfile` (static SPA, `/api/*` → api:4000, `/sync/*` → sync:1234 prefix-stripped, auto-HTTPS when `SITE_ADDRESS` is a domain, security headers) |
| new | `docker-compose.prod.yml` — `name: colcode-prod`; networks `edge` / `data` (internal) / `exec` (internal); only `web` published; runner mounts `/var/run/docker.sock`; healthchecks, memory limits, volumes |
| new | `.env.production.example` · `.env.production` (secrets via `openssl rand -hex 32`) · `scripts/deploy.sh` (preflight, build, up, wait for health; remote via `DOCKER_HOST=ssh://…`) |
| edit | `client/src/collab/useProject.ts` — prod sync URL = same origin `/sync` · `server/src/auth.ts` — cookie `secure` iff `APP_URL` is https |
| edit | `client/package.json` — `optionalDependencies` for `@rolldown/binding-linux-{arm64,x64}-musl`, `@tailwindcss/oxide-linux-*-musl`, `lightningcss-linux-*-musl` (npm/cli#4828: lockfile only had macOS bindings, `npm ci` in Docker failed) · `rm client/package-lock.json` · `npm install` |
| cmd | `docker compose -f docker-compose.prod.yml --env-file .env.production build` |
| cmd | `docker compose -f docker-compose.prod.yml --env-file .env.production up -d` |
| fix | first attempt inherited the dev project name and attached to the dev Postgres volume (`auth_failed`) → added `name: colcode-prod`, `docker compose -p colcode -f docker-compose.prod.yml down --remove-orphans`, `docker compose up -d` (dev restored), redeploy |
| fix | Compose merges `./.env` underneath `--env-file` → GitHub OAuth keys set explicitly in `.env.production`; `deploy.sh` warns about fall-through |
| verify | `curl` smoke through Caddy on :8080 (index, `/api/health`, 401s, `/sync` 401, headers, network isolation) |
| verify | staging instance of the same images: new `.env.staging` (`NODE_ENV=staging`, `AUTH_DEV_LOGIN=1`), `docker compose -p colcode-staging -f docker-compose.prod.yml --env-file .env.staging up -d`, new `scripts/smoke-stack.mjs http://localhost:8081` (sign-in → sync via `/sync` → sandboxed run via the containerised runner), then `… down -v` |

---

## Every npm script that exists now

```
npm run dev / dev:client / dev:server / dev:sync / dev:runner
npm run typecheck · npm run build
npm run test:sync          sync-server/test/two-clients.ts
npm run test:access        server/test/access.ts
npm run test:limits        runner/test/limits.ts
npm run test:e2e           scripts/e2e-sync.mjs
npm run test:e2e:presence  scripts/e2e-presence.mjs
npm run test:e2e:run       scripts/e2e-run.mjs
npm run test:e2e:project   scripts/e2e-project.mjs
npm run test:load          scripts/load-sync.mjs [rooms clients seconds intervalMs]
scripts/deploy.sh          production build + deploy
node scripts/smoke-stack.mjs <baseUrl>   end-to-end smoke against a deployed staging stack
```

## Final file tree (source only)

```
DESIGN.md · README.md · making.md · package.json · Dockerfile · .dockerignore
docker-compose.yml (dev: postgres+redis) · docker-compose.prod.yml · deploy/Caddyfile
.env.example · .env.production.example · scripts/deploy.sh
client/   vite.config.ts · index.html · src/{main.tsx, App.tsx, api.ts, router.ts, index.css, vite-env.d.ts}
          src/theme/{tokens.ts, cursorDark.ts, xtermTheme.ts}
          src/lib/monaco.ts · src/collab/{useProject.ts, presence.ts} · src/auth/useAuth.ts
          src/run/runController.ts · src/pages/{LoginPage,DashboardPage,EditorPage}.tsx
          src/components/{TopBar,FileTree,EditorTabs,EditorPane,OutputPanel,StatusBar,PresenceStyles,MembersPanel,UserMenu,Wordmark}.tsx
server/   src/{index.ts, db.ts, auth.ts, projects.ts, run.ts} · test/access.ts
sync-server/ src/{index.ts, authorize.ts, persistence.ts, starter.ts} · test/two-clients.ts
runner/   src/{index.ts, sandbox.ts, languages.ts} · test/limits.ts
scripts/  lib/session.mjs · e2e-sync.mjs · e2e-presence.mjs · e2e-run.mjs · e2e-project.mjs · load-sync.mjs · smoke-stack.mjs · deploy.sh
```
