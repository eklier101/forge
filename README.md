# Forge

> **Experimental / AI-assisted project.** Large parts of this codebase were written or heavily shaped with AI coding tools. Expect rough edges, incomplete docs, and breaking changes. Use at your own risk. Please report problems and ideas — that feedback is how it gets better.

**[Report a bug](https://github.com/eklier101/forge/issues/new?template=bug_report.md)** · **[Request a feature](https://github.com/eklier101/forge/issues/new?template=feature_request.md)** · [All issues](https://github.com/eklier101/forge/issues)

Offline-first workout app for Android and web. Pair once to your self-hosted API, then keep logging sets even without a connection.

## Stack

| Piece | Tech |
| --- | --- |
| `apps/mobile` | Expo (React Native) → Android APK + web UI |
| `services/api` | Fastify + Postgres (Node) |
| `services/sync-worker` | **Go** Garmin / Renpho poller (optional) |
| Compose | Pulls `ghcr.io/eklier101/forge-api` (+ optional sync-worker) |

No Python runtime.

## Quick start (Docker — pull images)

```bash
cp .env.example .env
# Edit JWT_SECRET and POSTGRES_PASSWORD — do not keep the sample values

docker compose up -d
```

Optional:

```bash
docker compose --profile sync up -d      # Garmin / Renpho worker
docker compose --profile tunnel up -d    # Cloudflare Tunnel
```

CLI:

```bash
docker pull ghcr.io/eklier101/forge-api:latest
docker pull ghcr.io/eklier101/forge-sync-worker:latest
```

Check health: `http://localhost:3030/health` (or `FORGE_HTTP_PORT`).

See [docs/SELF_HOST.md](docs/SELF_HOST.md) for LAN vs tunnel, env vars, and building from source.

## Mobile app

```bash
cd apps/mobile
npm install
npm start
```

- Press `w` for web, or build Android via `npx expo run:android`.
- On first launch, set **Server URL** to your API (e.g. `http://localhost:3030`).
- Create the admin account on first boot, then use **Admin → Invite links** for other users.

## Features

- Invite-code pairing + JWT auth
- Offline SQLite cache + sync queue
- Gym schedule + optional home workout days
- Rule-based week planner (optional Ollama AI polish)
- Rest timer, nutrition + weight logging
- Optional Home Assistant, Garmin/Renpho (Go worker), Health Connect

## Releases

Tagged releases on GitHub build:

- `ghcr.io/eklier101/forge-api:{tag,latest}`
- `ghcr.io/eklier101/forge-sync-worker:{tag,latest}`
- Android APK on the GitHub Release

## License

MIT — see [LICENSE](LICENSE).
