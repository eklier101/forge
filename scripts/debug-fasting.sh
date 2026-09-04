#!/bin/bash
cd /mnt/Apps/Docker-Compose/Apps/Forge
docker compose logs --tail=2000 api 2>&1 | grep -E 'fasting|Invalid fasting|No active|statusCode.:4|statusCode.:5' | tail -60
echo '--- active ---'
docker compose exec -T postgres psql -U forge -d forge -c "SELECT id, payload->>'status', left(payload->>'startedAt',19), payload->>'durationHours' FROM sync_entities WHERE entity_type='fasting_session' AND NOT deleted ORDER BY updated_at DESC LIMIT 8;"
