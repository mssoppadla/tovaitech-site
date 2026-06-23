#!/usr/bin/env bash
# On-VPS deploy for the company site. Independent of the appointments stack: separate compose
# project + port 8090. Sync -> rebuild app container -> smoke. No external DB; content lives in a
# persistent docker volume (site-data) that survives redeploys.
set -euo pipefail
cd "$(dirname "$0")/../.."
# Load secrets from deploy/.env (rendered by CI from GitHub environment secrets) into the
# environment, line by line, so values with spaces/$/!/etc. are kept literal. The compose file
# uses the pass-through "environment" form to inject them into the container without interpolation.
if [ -f deploy/.env ]; then
  set -a
  while IFS='=' read -r k v; do
    case "$k" in ''|\#*) continue ;; esac
    export "$k=$v"
  done < deploy/.env
  set +a
fi
COMPOSE="docker compose -p tovaitech-site -f deploy/docker-compose.yml"
echo "[1/3] sync code"; git fetch --all --quiet && git reset --hard origin/main
echo "[2/3] build + up"; $COMPOSE up -d --build
echo "[3/3] smoke"; ok=0; for i in $(seq 1 30); do
  if curl -fsS http://localhost:8090/ | grep -qi 'tovaitech'; then ok=1; break; fi; sleep 2; done
[ "$ok" = "1" ] || { echo "site smoke failed"; exit 1; }
echo "OK - company site deployed (port 8090)."
