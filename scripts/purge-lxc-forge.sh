#!/bin/bash
# Purge all Forge containers, volumes, and files from docker-lxc
set -euo pipefail

echo "Stopping Forge stack + CF proxy..."
if [ -d /opt/forge ]; then
  cd /opt/forge
  docker compose --profile sync --profile tunnel down --remove-orphans 2>/dev/null || true
  docker compose down --remove-orphans 2>/dev/null || true
fi

docker rm -f forge-api-1 forge-postgres-1 forge-sync-worker-1 forge-cf-proxy 2>/dev/null || true
# any other forge-named containers
docker ps -a --format '{{.Names}}' | grep -i '^forge' | xargs -r docker rm -f

echo "Removing Forge volumes..."
docker volume rm forge_forge_pg forge_garmin_sessions 2>/dev/null || true
docker volume ls -q | grep -i forge | xargs -r docker volume rm || true

echo "Removing Forge directories..."
rm -rf /opt/forge /opt/forge-proxy
# leftover dumps/scripts
rm -f /tmp/forge.dump /tmp/lxc-forge-proxy.sh /tmp/inspect-lxc-forge.sh /tmp/hop-to-tunnel-host.sh 2>/dev/null || true

echo "Verify clean:"
docker ps -a --format '{{.Names}}' | grep -i forge || echo "(no forge containers)"
docker volume ls | grep -i forge || echo "(no forge volumes)"
ls -la /opt/forge /opt/forge-proxy 2>&1 || true
echo "DONE purge"
