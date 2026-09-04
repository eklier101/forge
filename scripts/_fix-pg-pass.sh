#!/bin/bash
set -euo pipefail
cd /opt/forge
PW=$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)
docker compose exec -T postgres psql -U forge -d forge -v ON_ERROR_STOP=1 -c "ALTER USER forge WITH PASSWORD '$PW';"
docker compose up -d api
sleep 4
curl -s http://127.0.0.1:3000/health; echo
curl -s http://127.0.0.1:3000/auth/status; echo
curl -s http://127.0.0.1:3000/version; echo
curl -sI http://127.0.0.1:3000/download/forge.apk | head -n 8
