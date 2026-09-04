#!/bin/bash
set -euo pipefail
cd /mnt/Apps/Docker-Compose/Apps/Forge
echo "=== TrueNAS forge ==="
docker compose ps
curl -sf http://127.0.0.1:3030/health; echo
curl -sf http://127.0.0.1:3030/version; echo
docker compose exec -T postgres psql -U forge -d forge -c "SELECT count(*) AS users FROM users;"
docker compose exec -T postgres psql -U forge -d forge -c "SELECT count(*) AS entities FROM sync_entities; SELECT max(updated_at) AS max_upd FROM sync_entities;"
echo "=== cloudflare on TN ==="
ls -la /mnt/Apps/Docker-Compose/Infrastucture/Cloudflared/ 2>/dev/null || true
find /mnt/Apps/Docker-Compose -iname '*cloud*' 2>/dev/null | head -30
docker ps -a --format '{{.Names}} {{.Status}}' | grep -i cloud || true
