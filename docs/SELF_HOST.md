# Self-host Forge

Run Forge on your own machine with **prebuilt Docker images** — no compile required for the default path.

## What you’ll run

| Service | Required | Profile | Notes |
| --- | --- | --- | --- |
| `postgres` | yes | — | App database |
| `api` | yes | — | Node/Fastify API (`ghcr.io/eklier101/forge-api`) |
| `sync-worker` | optional | `sync` | **Go** Garmin / Renpho poller (`ghcr.io/eklier101/forge-sync-worker`) |
| `cloudflared` | optional | `tunnel` | Public hostname via Cloudflare Tunnel |

There is **no Python** in the stack.

## Quick start (pull images)

```bash
cp .env.example .env
# Set JWT_SECRET and POSTGRES_PASSWORD — do not keep the samples

docker compose up -d

# Optional Garmin / Renpho worker
docker compose --profile sync up -d

# Optional Cloudflare Tunnel
docker compose --profile tunnel up -d
```

CLI one-liners:

```bash
docker pull ghcr.io/eklier101/forge-api:latest
docker pull ghcr.io/eklier101/forge-sync-worker:latest
```

1. Open `http://localhost:3030/health` (or your `FORGE_HTTP_PORT`).
2. Open the Android app or web UI and set **Server URL** to your API (LAN IP or tunnel hostname).
3. First boot creates the **admin** account; use **Admin → Invite links** for others.

## How clients reach Forge

1. **LAN / IP** — map `FORGE_HTTP_PORT` (default **3030**). Server URL: `http://YOUR_LAN_IP:3030`.
2. **Cloudflare Tunnel** — enable profile `tunnel`, set `TUNNEL_TOKEN`, use your public hostname.

## Build from source (contributors)

Uncomment the `build:` blocks in `docker-compose.yml` (exported from `docker-compose.public.yml`) and comment out the `image:` lines, then:

```bash
docker compose up -d --build
```

## License

MIT — see [LICENSE](../LICENSE).
