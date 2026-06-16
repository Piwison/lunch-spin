# CLAUDE.md — Lunch Wheel

Living guide for working in this repo. **When you (Claude) make a mistake, fix the
code AND add a line to the "Mistake log" below.** Keep this file honest and short.

## Stack & layout

- React 19 + Tailwind 4 (client) · tRPC 11 + Express 4 (server) · Drizzle ORM /
  MySQL · Vitest · Vite 7 · pnpm.
- Path aliases: `@` → `client/src`, `@shared` → `shared/`.
- **Pure business logic lives in `shared/*.ts` with a `.test.ts` sibling.** Server
  and client import these — never reimplement the math inline. This is the TDD seam.
- Layout: `client/src` (UI, pages, components), `server/` (routers, db, `_core`),
  `shared/` (pure logic + tests), `drizzle/` (schema + migrations).

## Commands (must pass before any commit)

```
pnpm check    # tsc --noEmit
pnpm test     # vitest run
pnpm build    # vite build + esbuild server
pnpm db:push  # drizzle-kit generate && migrate  (needs a real DATABASE_URL)
```

## Do-not-touch surfaces

- **Auth / `server/_core/*`** (`oauth.ts`, `sdk.ts`, `context.ts`, `trpc.ts`) and
  `shared/const.ts`. Contract strings `COOKIE_NAME` ("app_session_id"),
  `UNAUTHED_ERR_MSG`, `NOT_ADMIN_ERR_MSG`; HS256 JWT signing/secret derivation;
  `protectedProcedure` (requires `ctx.user`) vs `publicProcedure`. Changing any of
  these logs out every user — don't edit without explicit intent.
- **Generated/migration files** under `drizzle/meta/` — let `drizzle-kit` manage them.

## Domain rules (see the skills)

- **Exclusion & spins:** the `wheel-logic` skill is the source of truth. Key points:
  most-recent spin per restaurant decides exclusion; `manuallyReenabled` overrides;
  window = `spunAt + exclusionDays*24h`; **the server picks the winner**
  (`spins.create`), the client only proposes `candidateIds`.
- **Shaders/animation:** the `shader-style` skill — `u_*` uniforms, `a_pos`,
  `hash`/`noise`, and always `cancelAnimationFrame` + `ResizeObserver.disconnect()`
  on cleanup. CSS motion is gated behind `prefers-reduced-motion`.

## Workflow (lightweight native harness)

- **Before building:** use Plan mode + the `grill-me` skill to pressure-test scope.
  Apply `karpathy-guidelines` (surface assumptions, minimal solution, surgical edits,
  verifiable success criteria).
- **While building:** TDD — `test-driven-development` skill; pure logic in `shared/*`
  with tests first.
- **Before PR / shipping:** run the `deploy-gate` skill checklist. For security-
  sensitive changes (auth/session) use `differential-review` / `semgrep` /
  `supply-chain-risk-auditor`. Use the built-in `/code-review` and `/security-review`.
- We deferred adopting a heavy harness framework; revisit
  `Chachamaru127/claude-code-harness` later. Reference reading:
  `shanraisshan/claude-code-best-practice`.

## iPhone / Claude-on-web workflow

This runs on Claude Code on the web (ephemeral container; cloned fresh each session,
reclaimed after idle). Anything not committed is lost.

- **Morning:** launch tasks from `claude.ai/code`; let agents run in the background.
- **Anytime:** `/recap` to check progress.
- **PRs:** `subscribe_pr_activity` to babysit CI/review instead of polling.
- **Evening:** `handoff` skill to compress the session, then push to git. Use
  `caveman` mode to save output tokens on mobile.

## PR conventions

- Title < 70 chars; body = **Summary** + **Test plan**. No `--no-verify` / force.
- Don't open a PR unless asked. Develop on a `claude/<topic>` branch, not `main`.

## Mistake log (the living part — append, don't prune)

1. **PR merged at the wrong commit.** PR #1 squash-merged at its *open-time* head,
   stranding later commits in a branch. → Before merge, confirm PR head SHA ==
   `git rev-parse <branch>`; after merge, verify
   `git merge-base --is-ancestor <fix-commit> origin/main`.
2. **Migrations generated ≠ applied.** `drizzle/0002`–`0005` were generated but not
   applied to the live DB. Drizzle's `_journal.json` is local bookkeeping. Always run
   `drizzle-kit migrate` against the real `DATABASE_URL` and verify the column exists.
3. **Vercel deploy lag.** ~~(Was: Manus deploy lag — Manus is no longer used.)~~ Push
   to `main` triggers a Vercel auto-deploy; allow ~1 min to build. "Merged" ≠
   "live" — smoke-test the live URL after the Vercel deployment completes.
4. **mysql2 tuple bug.** `db.execute()` (mysql2) returns `[rows, fields]`. Mapping
   over the tuple produced nameless stat rows and crashed the History tab. Unwrap to
   `rows` (see `server/db.ts` `getRestaurantStats`).
5. **`node_modules` is NOT committed** (migrated off Manus to Vercel). `node_modules`
   is gitignored. Never `git add -A` — it can pull in unexpected build artifacts.
6. *(Historical — Manus no longer used.)* **Manus could force-rewrite `main`.**
   Manus re-synced and force-pushed `main` to an orphan history, stranding
   `claude/*` branches and open PRs. Resolved by migrating to Vercel for deploys.
7. *(Historical — Manus no longer used.)* **Manus deploy fixes could strand on
   Manus only.** Runtime fixes applied in Manus's workspace were never pushed back
   to GitHub, causing drift. Resolved by migrating to Vercel for deploys.
8. **Deployment platform is Vercel, not Manus.** The project migrated from Manus to
   Vercel + TiDB Cloud. Never say "Manus redeploys" — it's Vercel auto-deploy on
   push to `main`. `node_modules` is gitignored (was committed under Manus).
9. **Vercel serverless API took three tries to route.** Moving prod to Vercel +
   TiDB (off Manus), the Express API runs as one serverless function. Three
   distinct failures, in order: (a) `api/[[...path]].ts` (Next-style *optional*
   double-bracket) wasn't recognized → every `/api/*` 404'd; single-bracket
   `api/[...path].ts` fixed that. (b) Then `ERR_MODULE_NOT_FOUND` for
   `../server/_core/app`: Vercel's zero-config TS function builder transpiles the
   entry but doesn't bundle relative/`@shared/*`-aliased imports → pre-bundle the
   function with esbuild (`pnpm build` → committed `api/index.js` from
   `server/_core/vercelHandler.ts`). (c) Then `/api/healthz` (one segment) worked
   but `/api/auth/google/login` (multi-segment) 404'd — the `[...path]` filename
   catch-all didn't reliably match nested paths. → **Final, stable setup:** a
   plainly-named `api/index.js` + a `vercel.json` `{ "/api/(.*)" → "/api" }`
   rewrite (no dynamic-route filename magic). Lessons: don't trust Vercel's
   filename catch-all for nested paths — use an explicit rewrite; bundle the
   function yourself so imports resolve; re-run `pnpm build` and **commit
   `api/index.js`** after any `server/`/`shared/` change the API uses; and make
   the terminal 404 echo `req.url` so "reached Express" vs "Vercel routing miss"
   is visible from the response body. The legacy `[OAuth] OAUTH_SERVER_URL not
   configured` log is harmless cold-start noise from `oauth.ts`, unrelated.
10. **Referenced Manus after migrating to Vercel.** After PR #14 merged, told user
    "Once Manus redeploys…" — Manus is gone; deploy is Vercel auto-deploy. Check
    CLAUDE.md mistake log before mentioning deploy platform.

## Skills index (in `.claude/skills/`)

Project-specific: `wheel-logic`, `shader-style`, `deploy-gate`, `frontend-design`.
Workflow: `grill-me`, `karpathy-guidelines`, `test-driven-development`, `handoff`,
`caveman` (+ suite). Security: `differential-review`, `semgrep`,
`supply-chain-risk-auditor`, `audit-prep-assistant`, `code-maturity-assessor`.
Testing: `webapp-testing` (Playwright — best run locally; the web sandbox has no
display).
