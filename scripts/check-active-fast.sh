#!/bin/bash
cd /mnt/Apps/Docker-Compose/Apps/Forge
docker compose exec -T postgres psql -U forge -d forge <<'SQL'
SELECT id,
       payload->>'status' AS status,
       left(payload->>'startedAt', 19) AS started,
       payload->>'targetHours' AS target
FROM sync_entities
WHERE entity_type = 'fasting_session'
  AND NOT deleted
  AND payload->>'status' = 'active';
SQL
