#!/bin/bash
set -euo pipefail
echo "=== LXC forge status ==="
docker ps -a --format '{{.Names}} {{.Status}} {{.Ports}}' | grep -iE 'forge|cf-proxy' || true
echo "=== LXC DB ==="
docker exec forge-postgres-1 psql -U forge -d forge -c "SELECT count(*) AS users FROM users;" 2>/dev/null || echo "no lxc pg"
docker exec forge-postgres-1 psql -U forge -d forge -c "SELECT count(*) AS entities FROM sync_entities; SELECT max(updated_at) AS max_upd FROM sync_entities;" 2>/dev/null || true
echo "=== volumes ==="
docker volume ls | grep forge || true
echo "=== find cloudflare ==="
find /opt /root /home /etc -iname '*cloudflare*' 2>/dev/null | head -40
docker ps -a --format '{{.Names}} {{.Image}}' | grep -i cloud || true
ls -la /opt/forge /opt/forge-proxy 2>/dev/null || true
