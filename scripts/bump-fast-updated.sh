#!/bin/bash
set -euo pipefail
cd /mnt/Apps/Docker-Compose/Apps/Forge
USER_ID='c1e57045-7c13-47fd-a534-ad0979318ed6'
OLD_ID='fasting-2026-08-06T17:52:40.947Z'
NEW_ID='fasting-2026-08-07T17:30:00.000Z'

docker compose exec -T postgres psql -U forge -d forge <<SQL
-- Bump updated_at so a stale offline push can't resurrect the pre-lunch active fast
UPDATE sync_entities
SET updated_at = now()
WHERE user_id = '${USER_ID}'
  AND id IN ('${OLD_ID}', '${NEW_ID}');

SELECT id, payload->>'status' AS status,
       left(payload->>'startedAt',19) AS started,
       left(coalesce(payload->>'endedAt',''),19) AS ended,
       left(updated_at::text,19) AS updated
FROM sync_entities
WHERE user_id = '${USER_ID}'
  AND id IN ('${OLD_ID}', '${NEW_ID}');
SQL
