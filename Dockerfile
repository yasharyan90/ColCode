# syntax=docker/dockerfile:1.7
# One build graph, four runtime targets: api · sync · runner · web
# docker compose -f docker-compose.prod.yml build   (targets are selected per service)

# ---------- deps: full install (needed to compile TypeScript) ----------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY sync-server/package.json sync-server/
COPY runner/package.json runner/
RUN --mount=type=cache,target=/root/.npm npm ci

# ---------- build: compile every workspace ----------
FROM deps AS build
COPY client client
COPY server server
COPY sync-server sync-server
COPY runner runner
RUN npm run build -w server -w sync-server -w runner \
 && npm run build -w client

# ---------- prod-deps: production-only node_modules ----------
FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY sync-server/package.json sync-server/
COPY runner/package.json runner/
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --workspace server --workspace sync-server --workspace runner \
 && mkdir -p server/node_modules sync-server/node_modules runner/node_modules

# ---------- runtime base ----------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache wget
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=prod-deps /app/node_modules ./node_modules
USER node

# ---------- api ----------
FROM runtime AS api
COPY --from=prod-deps /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --retries=6 CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "server/dist/index.js"]

# ---------- sync ----------
FROM runtime AS sync
COPY --from=prod-deps /app/sync-server/node_modules ./sync-server/node_modules
COPY --from=build /app/sync-server/package.json ./sync-server/package.json
COPY --from=build /app/sync-server/dist ./sync-server/dist
EXPOSE 1234
HEALTHCHECK --interval=10s --timeout=3s --retries=6 CMD wget -qO- http://127.0.0.1:1234/health || exit 1
CMD ["node", "sync-server/dist/index.js"]

# ---------- runner (talks to the host Docker daemon over the mounted socket) ----------
FROM runtime AS runner
USER root
RUN apk add --no-cache docker-cli
USER node
COPY --from=prod-deps /app/runner/node_modules ./runner/node_modules
COPY --from=build /app/runner/package.json ./runner/package.json
COPY --from=build /app/runner/dist ./runner/dist
EXPOSE 4100
HEALTHCHECK --interval=10s --timeout=3s --retries=6 CMD wget -qO- http://127.0.0.1:4100/health || exit 1
CMD ["node", "runner/dist/index.js"]

# ---------- web: static client + reverse proxy + automatic HTTPS ----------
FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/client/dist /srv
