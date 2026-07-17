# Staging Environment — Lunch Wheel

Why this exists: Vercel Preview Deployments already run for every PR, but
Google OAuth's `redirect_uri` is built from a single fixed `APP_ORIGIN`
(server/_core/env.ts), which points at production. Signing in on a preview
URL bounces to production, so the entire signed-in app — which is where
almost every feature lives — could only be verified *after* merging to
`main`. This sets up a second, fully isolated deployment so you can sign in
for real and click through everything on your phone before it ever touches
production.

> **What we actually built (July 2026): branch-scoped Preview, not a second
> project.** The recipe below (§1–§6) documents the original separate-project
> plan. In practice we landed on a simpler equivalent that reuses the existing
> `lunch-spin` Vercel project — see **"Branch-scoped staging (the live
> setup)"** immediately below. The isolation guarantees are the same; the only
> difference is that a per-branch `APP_ORIGIN` (set via branch-scoped Preview
> env vars) is what keeps OAuth from bouncing to prod, instead of a whole
> second project.

## Branch-scoped staging (the live setup)

- **Staging URL:** `https://lunch-spin-git-staging-egg0322-gmailcoms-projects.vercel.app`
  — the automatic Preview deployment of the long-lived `staging` branch. Free,
  stable (tracks the branch head), no custom domain needed.
- **Isolation** comes from **branch-scoped `Preview (staging)` environment
  variables** on the existing project: a separate `DATABASE_URL` (staging TiDB
  cluster), a fresh `JWT_SECRET`, and an `APP_ORIGIN` set to the staging URL
  above. Production's own vars are untouched — they stay scoped to
  `Production`. Verify the split any time with `vercel env ls` (staging rows
  read `Preview (staging)`; prod rows read `Production, Preview`).
- **Set/refresh a staging var:** `vercel env add <NAME> preview staging`
  (run each one individually — the CLI prompts for the value; pasting several
  `add` commands at once feeds later commands in as the answer to the first).
- **Deploying staging:** `git push origin staging` → the branch Preview
  rebuilds automatically and picks up the current `Preview (staging)` vars.
  Env vars are snapshotted at build time, so **after adding/changing a staging
  var, push a commit** (or redeploy from the dashboard) so the new value is
  baked in.
- **OAuth:** the staging URL's callback
  (`…vercel.app/api/auth/google/callback`) must be in the OAuth client's
  Authorized redirect URIs, and staging `APP_ORIGIN` must equal the staging
  URL — otherwise sign-in bounces.
- **⚠️ Never `vercel --prod` from a clone linked to `lunch-spin`** — that
  deploys to *production*, not staging. Staging ships only via
  `git push origin staging`.

Mirrors PRODUCTION.md's recipe exactly, just a second copy of each piece so
nothing here can touch live data or the real Google OAuth consent screen.

## What's isolated vs shared

| Piece | Staging | Production |
|---|---|---|
| Vercel project | new project, Production Branch = `staging` | existing project, Production Branch = `main` |
| Database | new TiDB Cloud free cluster | existing cluster |
| Google OAuth client | new client, own redirect URI | existing client |
| `GOOGLE_MAPS_API_KEY` | can reuse the same key (no data isolation concern) | — |
| Domain | `https://<staging-project-name>.vercel.app` | your prod domain |

## Setup (one-time, ~15–20 min)

### 1. Database — TiDB Cloud Serverless (free)
Same as PRODUCTION.md §1: new account or new cluster on your existing TiDB
Cloud account → Serverless (free tier) → copy the connection string
(`mysql://...?ssl={"minVersion":"TLSv1.2"}`) → this is staging's `DATABASE_URL`.

Apply the schema:
```bash
DATABASE_URL='<staging url>' pnpm exec drizzle-kit migrate
```

### 2. Google OAuth client — separate from production
**Google Cloud Console** → new project (or a second OAuth client inside the
existing one) → **APIs & Services → OAuth consent screen** → add yourself as
a test user → **Credentials → Create Credentials → OAuth client ID → Web
application**.

**Authorized redirect URIs** — you won't know the exact Vercel URL until
after step 3's first deploy, so:
1. Do step 3 first, note the assigned `https://<staging-project-name>.vercel.app` URL.
2. Come back and add `https://<staging-project-name>.vercel.app/api/auth/google/callback`.
3. Redeploy (env var change below triggers this anyway).

Copy **Client ID** + **Client secret** for staging's `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET`.

### 3. New Vercel project
**Vercel → Add New → Project** → import the same `Piwison/lunch-spin` repo
(Vercel allows importing one repo into multiple projects) → name it something
like `lunch-spin-staging` → **Settings → Git → Production Branch → `staging`**
(not `main` — this is what keeps it from ever deploying your production code
path or getting confused with the prod project).

Framework preset **Other** (reads `vercel.json`: build `pnpm build`, output
`dist/public`) — identical to prod.

**Settings → Environment Variables** (Production environment, this project only):
- `DATABASE_URL` — staging TiDB URL from step 1
- `JWT_SECRET` — a **new** random value (`openssl rand -base64 48`) — don't reuse prod's
- `APP_ORIGIN` — `https://<staging-project-name>.vercel.app` (from this project's assigned domain)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — staging OAuth client from step 2
- `OWNER_OPEN_ID` — sign in once first, then read your row's `openId` from the
  staging DB's `users` table (same trick as prod)
- `GOOGLE_MAPS_API_KEY` — can reuse the production key
- `VITE_APP_ID=lunch-wheel`
- `NODE_ENV=production`

Deploy. Confirm `GET /api/healthz` → `200 {"ok":true}`.

### 4. Verify
- `git push origin staging` (or merge a branch into `staging`) triggers a
  staging deploy automatically, same as pushing `main` does for prod.
- Sign in with Google on the staging URL → should land signed-in without
  bouncing anywhere — confirms the redirect URI matches.
- Create a wheel, add a restaurant, spin — confirms `DATABASE_URL` is wired
  and migrated.

## Day-to-day workflow

1. Do feature work on a `claude/<topic>` branch as usual.
2. When ready to *see* it: merge (or push) that branch into `staging` →
   Vercel auto-deploys → open the staging URL on your phone, sign in for
   real, click through the actual feature against isolated data.
3. Once it looks right, merge the original feature branch into `main` as normal.
   (`staging` is a verification waypoint, not a long-lived integration branch —
   feel free to reset it to `main` periodically so it doesn't drift:
   `git checkout staging && git reset --hard origin/main && git push --force-with-lease`.)

## Gotchas (same shape as PRODUCTION.md's, don't relearn them here)
- Migrations: `drizzle-kit generate` ≠ applied. Run `migrate` against the
  **staging** `DATABASE_URL` too, separately from prod, whenever a PR adds one.
- `api/index.js` is a committed build artifact — `pnpm build` before pushing
  any `server/`/`shared/` change, same as for prod.
- This is still real infrastructure with its own (free-tier) cost surface —
  don't leave test data assuming it's ephemeral; TiDB Serverless free tier has
  usage caps like any other cluster.
