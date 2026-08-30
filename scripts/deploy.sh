#!/usr/bin/env bash
# Build and deploy the production stack — locally, or to a remote Docker host.
#   scripts/deploy.sh                         # this machine's Docker daemon
#   DOCKER_HOST=ssh://deploy@host scripts/deploy.sh   # remote host (needs Docker + your SSH key)
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=${ENV_FILE:-.env.production}
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE — copy .env.production.example and fill it in"; exit 1; }
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
[ -n "${JWT_SECRET:-}" ] && [ ${#JWT_SECRET} -ge 32 ] || { echo "JWT_SECRET must be set (>= 32 chars)"; exit 1; }
[ -n "${POSTGRES_PASSWORD:-}" ] || { echo "POSTGRES_PASSWORD must be set"; exit 1; }
[ -n "${APP_URL:-}" ] || { echo "APP_URL must be set"; exit 1; }
if [ "${AUTH_DEV_LOGIN:-0}" != "0" ]; then echo "WARNING: AUTH_DEV_LOGIN is on — anyone can sign in as anyone. Only for staging."; fi
if [ -z "${GITHUB_CLIENT_ID:-}" ] && [ "${AUTH_DEV_LOGIN:-0}" = "0" ]; then echo "WARNING: no GITHUB_CLIENT_ID and dev login off — nobody will be able to sign in."; fi

# Compose also reads ./.env underneath --env-file for interpolation; make sure prod doesn't inherit dev values.
if [ -f .env ]; then for k in JWT_SECRET POSTGRES_PASSWORD GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET APP_URL; do
  if grep -qE "^$k=.+" .env && ! grep -qE "^$k=.+" "$ENV_FILE"; then echo "WARNING: $k is set in ./.env but empty in $ENV_FILE — Compose will use the ./.env value"; fi
done; fi
echo "→ target: ${DOCKER_HOST:-local docker daemon}"
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" build
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" up -d --remove-orphans
echo "→ waiting for health"
for i in $(seq 1 60); do
  unhealthy=$(docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" ps --format '{{.Name}} {{.Health}}' | grep -vE ' (healthy|)$' | grep -v redis || true)
  [ -z "$unhealthy" ] && break
  sleep 2
done
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" ps
echo "→ up at ${APP_URL}"
