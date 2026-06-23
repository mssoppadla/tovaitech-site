# CLAUDE.md — tovaitech-site (company website)

Company site for Tovaitech (the `/` landing, plus the Meta-required `/privacy` and
`/data-deletion` pages). Runs as a **small Node/Express app** that server-renders every page
from an editable content store and exposes a password-protected admin to change content at
runtime (no redeploy).
**Independently deployable** — its own container on host port **8090**; deploying it never touches
the appointments product (`clinic-app`, 8080) or cpmai.

## Layout
- `server/` — Express app (`server.js` + `package.json`). Server-renders `/`, `/privacy`,
  `/data-deletion`; serves the admin at `/site-admin`; content API under `/site-api/*`.
- `public/` — static assets: `styles/app.css`, `admin.html` (the editor UI), and a tiny
  `index.html` that just redirects `/index.html` → `/`.
- `data/` — `content.default.json` is the bundled seed (committed). The live store
  `content.json` is written to the runtime `DATA_DIR` (a persistent docker volume) and is
  **gitignored**.
- `deploy/` — `Dockerfile` (node:20-alpine) + `docker-compose.yml` (build, port 8090,
  `site-data` volume, `ADMIN_PASSWORD`/`SESSION_SECRET` env). `.env.example` documents the env.
  `Caddyfile` is deprecated/unused.
- `scripts/vps/deploy.sh` — on-VPS deploy: git sync → `docker compose up -d --build` → smoke.
- `.github/workflows/deploy.yml` — manual-approved SSH deploy (same VPS secrets as clinic-app).
- `ship.sh` / `ship.bat` — one-command release (branch → commit → push → PR → merge).

## Routes / paths
- Public: `/` (landing), `/privacy`, `/data-deletion`, `/healthz`.
- Admin UI: `/site-admin`. Content API: `/site-api/{login,logout,session,content}`.
- These are namespaced as `/site-*` on purpose: the host Caddy routes `/admin` and `/api` to
  clinic-app (8080), so the site's own admin/API must avoid those prefixes.

## Production
- VPS dir `/opt/tovaitech-site`, container on 8090. Secrets (`ADMIN_PASSWORD`, optional
  `SESSION_SECRET`) live as GitHub **`production` environment secrets**; the deploy workflow
  renders `deploy/.env` on the VPS from them over SSH stdin (never committed, never on argv).
  Create `deploy/.env` by hand only for a manual/local deploy. The `site-data` volume persists
  content across redeploys.
- The host Caddy (`/etc/caddy/Caddyfile`) terminates TLS for `tovaitech.in` and routes `/` here
  (8090) while `/appointments|/admin|/api` go to clinic-app (8080).
- Meta tech-provider URLs: `https://tovaitech.in/privacy` and `https://tovaitech.in/data-deletion`.

## Rules
No external DB — content is a JSON file on the `site-data` volume; keep it that way. Pages are
server-rendered so the Meta crawler sees real content without JS. Keep styling consistent with
clinic-app's `app.css` design tokens. Never commit `deploy/.env`, `data/content.json`, or
`node_modules`. Release with `./ship.sh "message"`, then approve the deploy in GitHub Actions.
