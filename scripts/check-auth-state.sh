#!/bin/bash
set -euo pipefail
cd /mnt/Apps/Docker-Compose/Apps/Forge
docker compose exec -T postgres psql -U forge -d forge <<'SQL'
SELECT id, username, role FROM users;
SELECT id, device_name, left(created_at::text,19) AS created
FROM devices
WHERE user_id='c1e57045-7c13-47fd-a534-ad0979318ed6'
ORDER BY created_at DESC
LIMIT 8;
SELECT id, payload->>'status' AS status,
       left(payload->>'startedAt',19) AS started,
       left(coalesce(payload->>'endedAt',''),19) AS ended
FROM sync_entities
WHERE user_id='c1e57045-7c13-47fd-a534-ad0979318ed6'
  AND entity_type='fasting_session'
  AND NOT deleted
  AND (payload->>'status'='active' OR id LIKE 'fasting-2026-08-06%' OR id LIKE 'fasting-2026-08-07T17%')
ORDER BY updated_at DESC;
SQL
echo "JWT_LEN=$(grep ^JWT_SECRET= .env | cut -d= -f2- | wc -c)"
echo "CONTAINER_JWT_LEN=$(docker compose exec -T api printenv JWT_SECRET | wc -c)"
