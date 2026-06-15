# Production Setup — Lunch Wheel (off Manus)

A step-by-step to run this app in your own production environment. The app is a
single Node server (tRPC API + built client + SSE realtime) backed by MySQL,
with self-hosted Google sign-in.

> **Recommended free stack:** Vercel (frontend + serverless API) + TiDB Cloud
> Serverless (MySQL). Realtime is polling-based (Milestone 3), so it runs fine on
> serverless and has no single-instance constraint. The Dockerfile/Render path
> still works for an always-on alternative (§6b).

---

## 0. Prerequisites
- This repo on GitHub (you have it).
- Accounts (all free to start): Google Cloud, TiDB Cloud, Render.
- A domain is **optional** — you can use the free `*.onrender.com` subdomain.

## 1. Database — TiDB Cloud Serverless (free, MySQL-compatible)
1. Create a **TiDB Cloud** account → create a **Serverless** cluster (free tier).
2. **Connect** → create a database (the free Serverless plan ships a `test`
   database you can use as-is) → copy the connection string. It looks like:
   `mysql://<user>:<pass>@<host>:4000/test?ssl={"minVersion":"TLSv1.2"}`
   (TiDB requires TLS — keep the `ssl` part.)
3. Save it as `DATABASE_URL` for later.

## 2. Google sign-in (OAuth client)
1. **Google Cloud Console** → create/select a project.
2. **APIs & Services → OAuth consent screen** → External → fill app name/email →
   add your Google account under **Test users** (until you publish).
3. **Credentials → Create Credentials → OAuth client ID → Web application.**
4. **Authorized redirect URIs** (add both):
   - `http://localhost:3000/api/auth/google/callback`
   - `https://<your-prod-domain>/api/auth/google/callback`
5. Copy **Client ID** + **Client secret** → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

## 3. Secrets
- `JWT_SECRET` — generate a long random value: `openssl rand -base64 48`.
- `VITE_APP_ID` — any constant, e.g. `lunch-wheel`.
- `APP_ORIGIN` — your public URL, e.g. `https://lunchwheel.onrender.com`
  (REQUIRED in production; the OAuth redirect_uri is built from it).

## 4. Run database migrations
From your machine (or a one-off job) with the prod `DATABASE_URL` exported:
```bash
DATABASE_URL='<prod url>' pnpm exec drizzle-kit migrate
```
Verify the tables exist (users, wheels, restaurants, tags, spin_history, …).
(See mistake-log #2: generated ≠ applied — always run `migrate` against prod.)

## 5. Deploy on Vercel (free)
The repo includes `vercel.json` + `api/[[...path]].ts` (the Express app runs as a
serverless function; the Vite client is served from `dist/public` by Vercel's CDN;
`/api/*` → the function; other paths → SPA `index.html`).

1. Merge to `main` first (PR `claude/serverless-realtime → main`).
2. Vercel → **Add New → Project** → import this repo. Framework preset: **Other**
   (it reads `vercel.json`: build `pnpm build`, output `dist/public`).
3. **Settings → Environment Variables** — add: `DATABASE_URL`, `JWT_SECRET`,
   `APP_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OWNER_OPEN_ID`,
   `VITE_APP_ID=lunch-wheel`, `NODE_ENV=production`.
4. Deploy. Note your URL (`https://<project>.vercel.app`).
5. Set `APP_ORIGIN` to that URL and add `<url>/api/auth/google/callback` to the
   Google redirect URIs (§2.4) → redeploy.
6. Liveness probe: `GET /api/healthz` (also `/healthz` via rewrite).

> If the function build fails to resolve `@shared/*` imports, ensure Vercel uses
> the repo's `tsconfig.json` paths (it normally does via esbuild). Polling
> realtime means no always-on server is needed.

## 6. Domain (optional)
- **Free:** use the `*.onrender.com` subdomain — nothing to do.
- **Custom (~$10/yr):** buy at Cloudflare/Porkbun → in Render add the custom
  domain → create the CNAME it shows → update `APP_ORIGIN` + the Google redirect
  URI to the custom domain → redeploy.

### 6b. Always-on free alternative (Oracle Cloud)
If cold starts bother you: create an **Oracle Cloud Always-Free** VM (Ubuntu),
install Node 22 + pnpm, clone the repo, set env, `pnpm install && pnpm build`,
run under `systemd`, and put **Caddy** in front for automatic HTTPS. Use the same
TiDB `DATABASE_URL`. (More setup, but $0 forever and no sleep.) A `Dockerfile` is
included if you prefer containers.

## 7. First admin
`OWNER_OPEN_ID` grants admin. After you sign in once via Google, read your row:
```sql
SELECT openId, email FROM users ORDER BY id DESC LIMIT 5;
```
Set `OWNER_OPEN_ID` to your `google:<sub>` value, then redeploy.

## 8. Smoke test (deploy-gate)
- Load the site → **Sign in** → Google → land logged-in.
- Create a wheel, add restaurants, **Spin** → result matches History.
- **Smart Pick** → lands on the shown winner with a reason; mood changes picks.
- **Smart Add** → parses a list, confirm adds, dups skipped.
- Open in a second browser/account → shared wheel presence + live spin broadcast.

## Operational notes
- **Realtime is polling-based** (presence/votes/spins persisted in TiDB), so the
  app scales horizontally and runs on serverless — no single-instance constraint.
- **No Manus dependency** at runtime: auth is Google; the LLM was removed
  (Smart Pick is heuristic). Forge/storage env vars are not required.
- Run migrations through **0006** (`pnpm exec drizzle-kit migrate`) — adds the
  `wheel_presence` + `round_marks` tables.
- **CI** (`.github/workflows/ci.yml`) runs check/test/build on every push.
