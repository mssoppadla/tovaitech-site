# tovaitech-site — Tovaitech company website

Standalone static company site (the `/` landing + future product pages). **Deployed independently
of any product** (e.g. the appointments app) — its own repo, its own container on host port `8090`,
its own CI/CD. Updating this site never rebuilds or restarts the appointments stack.

## Structure
- `public/` — static site (`index.html` + `styles/app.css`)
- `deploy/` — Caddy static server + compose (port 8090)
- `scripts/vps/deploy.sh` — on-VPS deploy (sync → reload → smoke)
- `.github/workflows/deploy.yml` — manual-approved SSH deploy to the VPS

## Routing (on the VPS front proxy)
The front proxy terminates TLS for `tovaitech.in` and routes by path:
- `/appointments/*`, `/admin`, `/api/*` → the appointments stack (port 8080)
- everything else (`/`, product pages) → this site (port 8090)

## Local preview
`docker compose -p tovaitech-site -f deploy/docker-compose.yml up` then open http://localhost:8090
