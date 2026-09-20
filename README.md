# NeoCash

Monorepo: Node/Express + Prisma/Postgres backend (`/backend`), Vue 3 + Vite frontend (`/frontend`).

- Backend deploys to **Railway** (root directory: `backend`)
- Frontend deploys to **Cloudflare Pages** (root directory: `frontend`)

No secrets are committed to this repo. Fill in the environment variables below in each
platform's dashboard after connecting this repo.

## 1. Backend on Railway

1. New Project → Deploy from GitHub repo → select this repo.
2. In the service's **Settings**, set **Root Directory** to `backend`. Railway will pick up
   `backend/railway.toml` automatically (build: `npm ci && npm run build`, start:
   `npm run start`, healthcheck: `/healthz`).
3. Add a **PostgreSQL** database to the same Railway project (New → Database → PostgreSQL).
4. In the backend service's **Variables** tab, add:

   ```
   NODE_ENV=production
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   JWT_SECRET=<generated - see chat>
   ADMIN_JWT_SECRET=<generated - see chat>
   ADMIN_ACCOUNT_CREATION_PASS=<generated - see chat>
   SECURITY_INGEST_KEY=<generated - see chat>
   SECURITY_SETTINGS_ENCRYPTION_KEY=<generated - see chat>
   FIREBASE_SERVICE_ACCOUNT_JSON_BASE64=<see chat - Google Sign-In admin credentials>
   WELCOME_BONUS=146.84
   USDT_TO_INR_RATE=103
   LEVEL_B_COMMISSION=0.03
   LEVEL_C_COMMISSION=0.015
   ORDER_EXPIRY_MINUTES=30
   APP_BASE_URL=https://neocash.online
   CORS_ORIGINS=https://neocash.online,https://www.neocash.online,https://<your-project>.pages.dev
   ADMIN_PANEL_ORIGINS=https://neocash.online,https://www.neocash.online
   ADMIN_PANEL_API_BASE_URL=https://api.neocash.online
   GLOBAL_RATE_LIMIT=240
   AUTH_RATE_LIMIT=20
   ORDER_LOCK_SWEEP_MS=30000
   REQUEST_TIMEOUT_MS=35000
   ROUTE_OPERATION_TIMEOUT_MS=12000
   MAX_CONCURRENT_REQUESTS=300
   DATABASE_CONNECTION_LIMIT=5
   DATABASE_POOL_TIMEOUT=10
   ENABLE_WS=true
   SECURITY_EVENT_BUFFER_SIZE=5000
   ```

   `${{Postgres.DATABASE_URL}}` is a Railway reference variable — type `${{` in the value
   field and pick the Postgres service's `DATABASE_URL`.

5. Deploy. Once live, note the Railway-provided domain (or attach a custom domain, e.g.
   `api.neocash.online` via CNAME) and update `ADMIN_PANEL_API_BASE_URL` to match if it
   differs from the placeholder above.
6. Confirm `https://<your-backend-domain>/healthz` returns `{"status":"ok","db":"up",...}`.

## 2. Frontend on Cloudflare Pages

1. Workers & Pages → Create → Pages → Connect to Git → select this repo.
2. Build settings:
   - **Root directory**: `frontend`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Environment variable** `NODE_VERSION` = `20.19.0`
3. Frontend already ships committed defaults in `frontend/.env.production` pointing at
   `https://api.neocash.online` (no secrets — these are public build-time values). To
   override without editing code, add the same keys under Pages → Settings →
   Environment variables:

   ```
   VITE_APP_ENV=production
   VITE_API_BASE_URL=https://api.neocash.online
   VITE_API_BASE_URLS=https://api.neocash.online
   VITE_API_FAILOVER_TIMEOUT_MS=2500
   VITE_WS_BASE_URL=wss://api.neocash.online
   ```

4. Deploy. Point your custom domain (`neocash.online`) at the Pages project once live, then
   go back to the backend's `CORS_ORIGINS` and confirm it includes the final domain(s).

## Notes

- The app uses Google Sign-In via Firebase (project `neocassh`). Add `neocash.online` and
  `www.neocash.online` as authorized domains in that Firebase project's Authentication
  settings, or Google sign-in popups will fail.
- WebSocket live-order updates (`ENABLE_WS`) are a latency optimization only — the frontend
  polls order status every 5s regardless, so the app works fully with `ENABLE_WS=false` if
  you want to shed memory on a small instance.
- `backend/render.yaml` is left in place from a prior Render-based deploy path and is unused
  by the Railway setup above; safe to ignore or delete.
