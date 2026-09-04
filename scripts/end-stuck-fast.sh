#!/bin/bash
set -euo pipefail
cd /mnt/Apps/Docker-Compose/Apps/Forge
docker compose exec -T postgres psql -U forge -d forge <<'SQL'
UPDATE sync_entities
SET payload = jsonb_set(
      jsonb_set(
        jsonb_set(
          payload,
          '{status}',
          '"completed"'
        ),
        '{endedAt}',
        to_jsonb(to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      ),
      '{durationHours}',
      to_jsonb(
        EXTRACT(EPOCH FROM (now() - (payload->>'startedAt')::timestamptz)) / 3600.0
      )
    ),
    updated_at = now()
WHERE entity_type = 'fasting_session'
  AND NOT deleted
  AND payload->>'status' = 'active'
RETURNING id, payload->>'status' AS status, round((payload->>'durationHours')::numeric, 2) AS hours;
SQL
