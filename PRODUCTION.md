# Production Setup — Lunch Wheel (off Manus)

A step-by-step to run this app in your own production environment. The app is a
single Node server (tRPC API + built client + SSE realtime) backed by MySQL,
with self-hosted Google sign-in.

> **Recommended free stack:** Render (web service) + TiDB Cloud Serverless (MySQL).
> Trade-off: Render's free tier sleeps after ~15 min idle (cold start on first
> hit). For always-on free, use an Oracle Cloud Always-Free VM instead (§6b).

---

## 0. Prerequisites
- This repo on GitHub (you have it).
- Accounts (all free to start): Google Cloud, TiDB Cloud, Render.
- A domain is **optional** — you can use the free `*.onrender.com` subdomain.

## 1. Database — TiDB Cloud Serverless (free, MySQL-compatible)
1. Create a **TiDB Cloud** account → create a **Serverless** cluster (free tier).
2. **Connect** → create a database (e.g. `lunchwheel`) → copy the connection
   string. It looks like:
   `mysql://<user>:<pass>@<host>:4000/lunchwheel?ssl={"minVersion":"TLSv1.2"}`
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

## 5. Deploy on Render (free)
1. Push the branch with this config to `main` (merge the auth PR first).
2. Render → **New → Blueprint** → connect this repo (it reads `render.yaml`).
3. In the service's **Environment**, set the `sync: false` secrets:
   `DATABASE_URL`, `JWT_SECRET`, `APP_ORIGIN`, `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `OWNER_OPEN_ID` (see §7).
4. Deploy. Render builds (`pnpm install && pnpm build`), starts (`pnpm start`),
   and health-checks `/healthz`.
5. Note your URL (`https://<name>.onrender.com`) → set it as `APP_ORIGIN` and add
   `<url>/api/auth/google/callback` to the Google redirect URIs (§2.4). Redeploy.

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
- **Single instance only** (SSE + in-memory presence/sessions). Don't scale the
  web service horizontally without adding a Redis adapter (`realtime.ts`).
- **No Manus dependency** at runtime: auth is Google; the LLM was removed
  (Smart Pick is heuristic). Forge/storage env vars are not required.
- **CI** (`.github/workflows/ci.yml`) runs check/test/build on every push.
