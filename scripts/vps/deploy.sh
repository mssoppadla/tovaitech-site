#!/usr/bin/env bash
# On-VPS deploy for the company site. Independent of the appointments stack: separate compose
# project + port 8090. Sync -> reload static container -> smoke. No DB, no migrations.
set -euo pipefail
cd "$(dirname "$0")/../.."
COMPOSE="docker compose -p tovaitech-site -f deploy/docker-compose.yml"
echo "[1/3] sync code"; git fetch --all --quiet && git reset --hard origin/main
echo "[2/3] up (static)"; $COMPOSE up -d
echo "[3/3] smoke"; ok=0; for i in $(seq 1 20); do
  if curl -fsS http://localhost:8090/ | grep -qi 'tovaitech'; then ok=1; break; fi; sleep 2; done
[ "$ok" = "1" ] || { echo "site smoke failed"; exit 1; }
echo "OK - company site deployed (port 8090)."
