---
name: deploy-gate
description: Pre-ship checklist for Lunch Wheel. Use before merging or shipping any change that could affect the live app — it captures the real, repeatedly-hit gotchas around migrations, Manus deploy lag, and PR merge commits.
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

- [ ] Identify pending migrations (`drizzle/00XX_*.sql`). As of this writing
      `0002`–`0005` (tag scoping, exclusionDays, fairnessMode, rotateCuisines)
      must be applied to the production DB.
- [ ] Apply against the real DB: `DATABASE_URL=<prod> pnpm exec drizzle-kit migrate`
      (or `pnpm db:push` = generate + migrate).
- [ ] Verify the new column/table actually exists before code relies on it. New
      code reads `wheels.exclusionDays/fairnessMode/rotateCuisines` with no
      fallback — a missing column = runtime error.

## 3. PR merge — confirm the right commit lands

We once merged a PR at its *open-time* head and stranded later fixes. So:

- [ ] Before merge, the PR head SHA == `git rev-parse <branch>`.
- [ ] After merge, confirm the fix is actually in main:
      `git merge-base --is-ancestor <fix-commit> origin/main` (exit 0 = yes).

## 4. Manus deploy — "merged" ≠ "shipped"

The app is hosted on Manus, which deploys from GitHub. Code in `main` is **not
live** until Manus redeploys.

- [ ] Trigger a redeploy from the merged `main` on Manus.
- [ ] Smoke-check the live URL: load the wheel, do one spin, open History
      (the tab that crashed when stats rows were malformed).

## 5. Repo hygiene

- [ ] `node_modules/` is committed here (a Manus convention) — only `git add`
      explicit source paths; never `git add -A` (it pulls in `.bin` symlink churn
      from `pnpm install`).
- [ ] No secrets in the diff; `.env*` stays gitignored.
