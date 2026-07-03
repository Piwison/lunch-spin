# Mistake Log — append-only

Moved verbatim from CLAUDE.md on 2026-07-03 (backup:
`.agents/protocol/archive/CLAUDE.md.2026-07-03.bak`). **Append, don't prune.**

**Entry format (one entry per lesson):**

```
N. **One-line title.** What happened (observable facts: commands, errors, PRs).
   → The rule that prevents it (imperative, mechanically checkable).
```

Compaction: when this file exceeds ~40 entries or ~300 lines, move entries that are
marked *(Historical)* or superseded into `archive/mistake-log-archive.md`, keeping
their numbers. Never renumber. (See `40-maintenance.md`.)

---

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
    the mistake log before mentioning deploy platform.
11. **Canvas can't read CSS theme tokens.** The Warm-Appetite light/dark theme
    drives colors via CSS vars (`var(--card)` etc.). `<canvas>` 2D context
    (`ctx.fillStyle = "var(--muted)"`) silently ignores CSS vars → the shape
    draws black/transparent. Resolve tokens at draw time with
    `getComputedStyle(canvas).getPropertyValue("--muted")` and re-draw on theme
    change (add `theme` to the draw deps). WebGL shaders need a `u_dark` uniform,
    not vars. Related: applying alpha to a token (`var(--brand) + "55"`) is
    invalid CSS — use relative color syntax `oklch(from var(--brand) l c h / .33)`.
12. **PostToolUse `prettier --write` hook reformatted whole legacy files.** The new
    format-on-save hook ran `prettier --write` on every edited file. On files that
    predate prettier (most of the repo), this reformatted the *entire* file, so a
    2-line a11y change landed as a ~170-line diff and buried the real change (PR
    #18). → Hook now runs `prettier --check` first and only `--write` if the file
    is already clean — never mass-reformats a legacy file. Deliberate normalization
    belongs in its own `pnpm format` commit, not smuggled into a feature PR.
13. **Docs drifted from reality.** M4 PRD read `building` for days after PR #20
    merged; `todo.md` was 100% checked while the live roadmap sat in `.agents/prd/`.
    → Any commit that changes what a status line describes updates that status line
    in the same commit. On session start, trust files over conversation memory.
