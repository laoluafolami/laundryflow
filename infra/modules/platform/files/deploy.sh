#!/usr/bin/env bash
# Blue/green deploy on a single VM. Usage: deploy.sh <image-tag>
# Idea: start the NEW version next to the OLD one, wait until it is healthy,
# switch Caddy to it (graceful reload = no dropped requests), then stop the old one.
set -euo pipefail
export HOME="${HOME:-/root}"   # run-command may not set HOME; az and docker need it
TAG="${1:?usage: deploy.sh <image-tag>}"
cd /opt/laundryflow
source ./config                       # ACR_NAME, KV_NAME, APP_NAME
IMAGE="${ACR_NAME}.azurecr.io/${APP_NAME}:${TAG}"
exec 9>/var/lock/laundryflow-deploy.lock; flock -n 9 || { echo "another deploy is running"; exit 1; }

az login --identity --output none
az acr login --name "$ACR_NAME" --output none

# 1) Pull secrets from Key Vault into a root-only env file (never stored in git or in the image)
umask 077
{
  echo "NODE_ENV=production"
  echo "DB_SSL=true"
  echo "DATABASE_URL=$(az keyvault secret show --vault-name "$KV_NAME" --name database-url --query value -o tsv)"
  echo "JWT_SECRET=$(az keyvault secret show --vault-name "$KV_NAME" --name jwt-secret --query value -o tsv)"
  echo "ADMIN_PASSWORD=$(az keyvault secret show --vault-name "$KV_NAME" --name admin-password --query value -o tsv)"
  echo "APPLICATIONINSIGHTS_CONNECTION_STRING=$(az keyvault secret show --vault-name "$KV_NAME" --name appinsights-connection-string --query value -o tsv)"
} > app.env.new
[ -f extra.env ] && cat extra.env >> app.env.new   # optional per-VM overrides (used for fault-injection drills)
mv app.env.new app.env

# 2) Decide colors
CURRENT=$(cat active_color 2>/dev/null || echo none)
if [ "$CURRENT" = "blue" ]; then NEW=green; PORT=3002; else NEW=blue; PORT=3001; fi
echo "current=$CURRENT -> deploying $TAG to $NEW (port $PORT)"

# 3) Start the new container
docker pull "$IMAGE"
docker rm -f "app-$NEW" >/dev/null 2>&1 || true
docker run -d --name "app-$NEW" --restart unless-stopped --env-file app.env \
  -e PORT=3000 -e APP_VERSION="$TAG" -p "127.0.0.1:${PORT}:3000" \
  --log-opt max-size=10m --log-opt max-file=3 "$IMAGE" >/dev/null

# 4) Wait until it is READY (db connected, migrations done). If not, abort and keep the old one serving.
for i in $(seq 1 30); do
  if curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/readyz" >/dev/null 2>&1; then OK=1; break; fi
  sleep 2
done
if [ -z "${OK:-}" ]; then
  echo "NEW VERSION NEVER BECAME READY - aborting, old version keeps serving"
  docker logs --tail 40 "app-$NEW" || true
  docker rm -f "app-$NEW" >/dev/null 2>&1 || true
  echo "DEPLOY_FAILED"; exit 1
fi

# 5) Switch traffic (Caddy reload is graceful: in-flight requests finish)
echo "reverse_proxy 127.0.0.1:${PORT}" > /etc/caddy/upstream.caddy
systemctl reload caddy

# 6) Record state, give old connections time to drain, stop the old container
[ -f current_tag ] && cp current_tag previous_tag
echo "$TAG" > current_tag; echo "$NEW" > active_color
if [ "$CURRENT" != "none" ]; then sleep 10; docker rm -f "app-$CURRENT" >/dev/null 2>&1 || true; fi
docker image prune -f >/dev/null 2>&1 || true
echo "DEPLOY_OK $TAG"
