---
name: deploy-gate
description: Pre-ship checklist for Lunch Wheel. Use before merging or shipping any change that could affect the live app — it captures the real, repeatedly-hit gotchas around migrations, Vercel deploy lag, the serverless API bundle, and PR merge commits.
---

# Lunch Wheel — deploy gate

Run through this before declaring anything "shipped". Each item exists because we
were burned by it.

## 1. Local green

- [ ] `pnpm check` (tsc) passes
- [ ] `pnpm test` passes (pure logic in `shared/*` has tests)
- [ ] `pnpm build` succeeds

## 2. Database migrations (the #1 trap)

Drizzle's `drizzle/meta/_journal.json` being populated means a migration was
**generated**, NOT that it was **applied to the live database**.

- [ ] Identify pending migrations (`drizzle/00XX_*.sql`). The live DB must be
      migrated through **0006** (`wheel_presence` + `round_marks` — the polling
      realtime tables; missing them breaks presence/voting on shared wheels).
- [ ] Apply against the real DB (TiDB): `DATABASE_URL=<prod> pnpm exec drizzle-kit migrate`
      (or `pnpm db:push` = generate + migrate). TiDB needs the `?ssl=...` suffix.
- [ ] Verify the new column/table actually exists before code relies on it. New
      code reads `wheels.exclusionDays/fairnessMode/rotateCuisines` and the
      `round_marks`/`wheel_presence` tables with no fallback — missing = runtime error.

## 3. PR merge — confirm the right commit lands

We once merged a PR at its *open-time* head and stranded later fixes. So:

- [ ] Before merge, the PR head SHA == `git rev-parse <branch>`.
- [ ] After merge, confirm the fix is actually in main:
      `git merge-base --is-ancestor <fix-commit> origin/main` (exit 0 = yes).
      (Squash merges create a *new* commit on main, so check the merge commit /
      that the file changes landed, not the branch SHA itself.)

## 4. Vercel deploy — "merged" ≠ "shipped"

The app is hosted on **Vercel** (frontend on the CDN, Express API as the single
`api/index.js` serverless function), deploying from GitHub `main`. Code in `main`
is **not live** until Vercel finishes a production deploy.

- [ ] Confirm the production deploy for the merged `main` SHA went green (Vercel
      dashboard / the commit's Vercel status), not just a PR preview.
- [ ] `GET /api/healthz` → `200 {"ok":true}` (liveness; no DB).
- [ ] Vercel API gotchas (all hit in this repo — see CLAUDE.md mistake #8):
      the function is `api/index.js` (a committed esbuild bundle of
      `server/_core/vercelHandler.ts`) reached via the `vercel.json` `/api/(.*)`
      rewrite. If you change anything under `server/`/`shared/` the API uses,
      **re-run `pnpm build` and commit the regenerated `api/index.js`.** A 404 on
      a nested `/api/...` path that echoes `{"path":...}` means it reached Express;
      a bare Vercel "404: NOT_FOUND" means the rewrite/routing is wrong.
- [ ] Smoke-check the live URL: sign in (Google), load the wheel, do one spin,
      open History (the tab that crashed when stats rows were malformed), and on a
      shared wheel confirm presence + a veto/vote reflect within a few seconds.

## 5. Repo hygiene

- [ ] `node_modules/` is committed here (a Manus convention) — only `git add`
      explicit source paths; never `git add -A` (it pulls in `.bin` symlink churn
      from `pnpm install`).
- [ ] No secrets in the diff; `.env*` stays gitignored.
