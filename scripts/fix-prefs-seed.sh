#!/bin/bash
set -euo pipefail
cd /mnt/Apps/Docker-Compose/Apps/Forge
docker compose exec -T postgres psql -U forge -d forge <<'SQL'
INSERT INTO preferences (user_id)
SELECT id FROM users u
WHERE NOT EXISTS (SELECT 1 FROM preferences p WHERE p.user_id = u.id);
SELECT count(*) AS prefs FROM preferences;
SQL
docker compose up -d --build api
