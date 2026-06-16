# Continuation Prompt — Lunch Wheel (post Vercel go-live)

Copy/paste this to start the next session:

---

## Context

Lunch Wheel is now live at `https://lunch-spin-beige.vercel.app` on Vercel + TiDB
(off Manus). Three Vercel API routing bugs were debugged and fixed (PRs #10–12),
documented in CLAUDE.md mistake-log #8. The user is signed in as admin
(`OWNER_OPEN_ID` set). The outstanding action is a live smoke test to confirm
migration 0006 landed on TiDB and the full feature set works in prod.

## Read First

1. Handoff doc: `.agents/handoff/2026-06-16-vercel-live.md`
2. `CLAUDE.md` (mistake-log #8 — Vercel routing lessons, and the "regenerate &
   commit `api/index.js`" rule after any server/shared change)
3. `.claude/skills/deploy-gate/SKILL.md` (updated for Vercel + TiDB)

## What I Need Help With

Pick a track:

**A. Smoke test** — guide me through the live smoke test:
- Verify `SHOW TABLES LIKE 'wheel_presence'` on TiDB (migration 0006)
- Core loop: Spin → History
- Smart Pick/Add with mood input
- Shared wheel: presence + veto/vote + spin broadcast across 2 browsers

**B. Custom domain** — set up a real domain:
- Buy at Cloudflare/Porkbun, update `APP_ORIGIN` + Google OAuth redirect URI,
  update Vercel project, redeploy, smoke test

**C. New feature** — use `grill-me` to scope Milestone 4 before building

**D. Harden** — prune stale branches + `/security-review` on Google auth surface

## Key Files

```
api/index.js                        — committed Vercel function bundle (esbuild)
server/_core/vercelHandler.ts       — esbuild entry / handler wrapper
server/_core/app.ts                 — Express factory (routes + diagnostic 404)
vercel.json                         — rewrite rules (explicit /api/(.*) → /api)
drizzle/0006_boring_ego.sql         — migration for realtime tables (TiDB pending)
CLAUDE.md                           — mistake-log including #8
```

## Reminder

If you touch anything under `server/` or `shared/` that the API uses:
**`pnpm build` then `git add api/index.js` then commit** — or prod breaks silently.
