#!/bin/bash
cd /mnt/Apps/Docker-Compose/Apps/Forge
docker compose exec -T postgres psql -U forge -d forge <<'SQL'
SELECT id,
       jsonb_typeof(payload->'durationHours') AS dur_type,
       payload->'durationHours' AS dur,
       payload->>'status' AS status
FROM sync_entities
WHERE entity_type = 'fasting_session' AND NOT deleted
ORDER BY updated_at DESC
LIMIT 10;
SQL
