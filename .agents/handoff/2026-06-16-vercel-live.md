# Handoff: Vercel + TiDB Go-Live

**Date:** 2026-06-16T11:00:00Z  
**Session:** Production deployment of Lunch Wheel to Vercel + TiDB (off Manus)  
**Status:** Between tasks — deployment complete, pending live smoke test

---

## What We Accomplished This Session

### 1. Fixed ERR_MODULE_NOT_FOUND (PR #10 → main `5c481d1d`)

Vercel's zero-config Node function builder transpiles `api/[...path].ts` but
doesn't bundle relative/`@shared/*` imports — extensionless ESM import failed
at runtime.

**Fix:** New `server/_core/vercelHandler.ts` is esbuild-bundled by `pnpm build`
into `api/index.js` (committed). All `server/` + `@shared/*` deps inlined;
only `node_modules` packages stay external.

**Files changed:**
- `server/_core/vercelHandler.ts` — new entry point (imported by esbuild)
- `api/index.js` — committed esbuild bundle (replaces `api/[...path].ts`)
- `package.json` — build script extended with the esbuild step
- `server/_core/app.ts` — terminal 404 now echoes `req.url`/`req.originalUrl`

### 2. Fixed multi-segment route 404 (PR #12 → main `f6f461aa`)

`api/[...path].js` filename catch-all reliably served `/api/healthz` (one
segment) but Vercel silently 404'd multi-segment paths like
`/api/auth/google/login` before they ever reached Express.

**Fix:** Renamed function to `api/index.js` (plain filename, no catch-all
magic) + added explicit `vercel.json` rewrite: `"/api/(.*)" → "/api"`.

**Files changed:**
- `vercel.json` — new `/api/(.*)` → `/api` rewrite (replaces `/healthz` alias)
- `api/index.js` — (same file, renamed from `[...path].js`)
- `server/_core/vercelHandler.ts` — comment updated, `/api` prefix normalizer kept

### 3. Documented Vercel fight (PR #13 → main `a2da5a1a`)

- `CLAUDE.md` mistake-log **#8**: records all three routing failures + the
  stable `api/index.js` + explicit rewrite setup + "regenerate & commit" rule.
- `.claude/skills/deploy-gate/SKILL.md`: updated off Manus → Vercel + TiDB;
  §2 now targets migration 0006 on TiDB; §4 is the Vercel deploy/bundle checklist.

### 4. Production is live

- App: `https://lunch-spin-beige.vercel.app`
- `/api/healthz` → `{"ok":true}`
- Google sign-in → works
- `OWNER_OPEN_ID` set (user is admin)
- Vercel + TiDB fully operational; Manus no longer the host

---

## Where We Paused

Between tasks. Deployment is done; smoke test is next.

**Last action:** Merged PR #13 (docs); local synced to `a2da5a1a`.  
**Next action:** User to run the live smoke test (see below) then pick next track.  
**Blockers:** None technical — need human to drive the browser test.

---

## Outstanding: Live Smoke Test

The user chose "live smoke test first" but hasn't done it yet. Run in order:

**0. Confirm migration 0006 landed** (highest risk):
```sql
SHOW TABLES LIKE 'wheel_presence';
SHOW TABLES LIKE 'round_marks';
```
If missing → `DATABASE_URL='<tidb prod url>' pnpm exec drizzle-kit migrate`

**1. Core loop** — create wheel → add restaurants → Spin → check History tab
(History once crashed on malformed stat rows; 200 OK = safe).

**2. Smart Pick/Add** — Smart Pick with mood input → Smart Add paste list → confirm.

**3. Shared wheel** (step 0 must pass):
- Open same wheel in 2nd browser/incognito → presence within ~10s
- Veto/vote in one → reflects in other within ~3s
- Spin in one → animation in other within ~3s

**What to send if anything breaks:** step number + error or the JSON body
(our 404s now echo `{"path":"..."}` which pins the cause).

---

## Context for Next Session

1. **`api/index.js` must be regenerated after server/shared changes** — it's a
   committed esbuild bundle (`pnpm build` rebuilds it). Easy to forget, breaks
   prod silently.
2. **Migration 0006** (`wheel_presence` + `round_marks`) must be applied to the
   TiDB live DB for presence/voting/dietary to work. Unverified on prod.
3. **`OWNER_OPEN_ID`** is set — user can create/manage wheels as admin.
4. **The `OAUTH_SERVER_URL` log line** is harmless cold-start noise from legacy
   `oauth.ts`; not actionable.

---

## Files to Read

```
# Core deployment files
api/index.js                        — the committed Vercel function bundle
server/_core/vercelHandler.ts       — esbuild entry; exports default handler
server/_core/app.ts                 — Express app factory (routes, healthz, 404)
vercel.json                         — rewrite rules

# Living docs
CLAUDE.md                           — mistake-log #8 captures Vercel lessons
.claude/skills/deploy-gate/SKILL.md — updated checklist for Vercel + TiDB

# Migrations (TiDB)
drizzle/0006_boring_ego.sql         — wheel_presence + round_marks tables
drizzle/meta/_journal.json          — generated but NOT = applied to prod
```

---

## Possible Next Tracks

| Track | What it involves |
|---|---|
| Smoke test | Browser walk (user-driven); verify migration 0006 on TiDB |
| New feature | Milestone 4 via grill-me + PRD; Smart Pick improvements, history insights |
| Custom domain | Buy domain → update `APP_ORIGIN` + Google redirect URI → update docs |
| Harden | Prune stale `claude/*` branches, `/security-review` Google auth surface |
