# Handoff: CI + Manus/GitHub Sync

**Date:** 2026-06-14T02:11:47Z
**Session:** Stood up CI, shipped the dead-animation fix + PWA, and reconciled the recurring GitHub↔Manus history split.
**Status:** Between tasks — everything shipped, verified, and in sync. Clean stopping point.

---

## What We Accomplished This Session

### 1. Added CI (GitHub Actions)
`.github/workflows/ci.yml` — runs `pnpm check` · `pnpm test` · `pnpm build` on every PR and on pushes to `main`. pnpm version read from the `packageManager` field (10.4.1); Node 22; `--frozen-lockfile`; concurrency-cancel on superseded runs. No DB/secrets needed.

### 2. Merged the dev-workflow foundation (PR #3)
CLAUDE.md + `.claude/` skills + session-start hook landed on `main` (commit `902af960`). CI added to this branch's tree so it was self-validating.

### 3. Shipped the dead-animation fix + PWA (PR #4)
- `client/src/index.css` — added the missing `@keyframes`/utility classes (`reveal`, `fade-in`, `animate-orb-spin`, `animate-ring-rotate`, `cta-pulse`, `tab-enter`) + `prefers-reduced-motion` guard. Manus's `main` referenced these classes everywhere but never defined them → they were no-ops.
- PWA: `client/public/manifest.webmanifest`, `client/public/sw.js`, `client/public/icon.svg`, plus hooks in `client/index.html` and `client/src/main.tsx` (SW registration is prod-only). Merged at `49f88580`.

### 4. Reconciled the GitHub↔Manus split (the big one)
Manus merged GitHub `main` into its workspace as a **normal merge** (`91bd6145`, "Merge github/main…"), NOT an orphan force-push — 80 files added, 0 deletions, history intact. Manus's concurrent SSE/trpc/canvas fixes coexist with ours; `client/src/main.tsx` correctly carries both the tRPC subscription setup and our PWA SW registration.

### 5. Round-tripped Manus's deploy fix back to GitHub
Manus found a real prod bug — `serveStatic()` resolved to `server/_core/public` instead of `dist/public`, so `manifest.webmanifest`/`sw.js` 404'd in production. The fix landed as a **Manus-only commit** (`64db0203`); we had Manus push it to GitHub (clean fast-forward), CI re-greened, PWA now serves 200 on the live site.

### 6. Documented the pattern (PR #5)
Added mistake-log **entry #7** to `CLAUDE.md` (`a2ff2943`, merged at `bc6e8e76`): Manus deploy fixes land as Manus-only commits and must be pushed back as a normal fast-forward — reconcile via real merge, never orphan force-push.

**Files changed (net, on `main`):** `.github/workflows/ci.yml`, `CLAUDE.md`, `.claude/**` (skills+hook), `client/src/index.css`, `client/public/{manifest.webmanifest,sw.js,icon.svg}`, `client/index.html`, `client/src/main.tsx`, `server/_core/vite.ts` (Manus).

---

## Where We Paused

Between tasks, clean state. The full arc closed: **review → CI quick-win → ship animation+PWA → reconcile Manus/GitHub → round-trip deploy fix → document → re-sync.**

**Last action:** Manus fast-forwarded its workspace to `bc6e8e76` and confirmed live PWA assets serve 200 (manifest JSON + sw.js JS).
**Next action:** None required. Optional: start a deferred roadmap item.
**Blockers:** None.

**Verified end-state:**
- GitHub `main` == Manus HEAD == `bc6e8e76b2bb6ce6ee8b9341e118362d64dd3e75` (byte-identical, in sync).
- CI green on `main`. Local `pnpm check` clean, 95/95 tests, build emits PWA assets.
- Live URL: https://lunchwheel-8v5qmeks.manus.space — animations live, PWA installable.

---

## Context to Gather for Next Session

1. **GitHub `main` is canonical-but-downstream of Manus.** Always `git fetch origin main` first and check for forced updates (mistake log #6/#7). Reconcile via normal merge; never orphan force-push.
2. **`node_modules` is committed** (Manus convention, mistake log #5). Only `git add` explicit source paths — never `git add -A`. The session-start hook reinstalls deps.
3. **Merged ≠ live** (mistake log #3). After merging, Manus must redeploy for code to go live; docs-only changes need no redeploy.
4. **`server/_core/*` is a do-not-touch surface** — the `serveStatic` fix was Manus's; we only mirrored it, didn't author it.

---

## Questions to Answer (next session, if continuing)

1. Which deferred roadmap item first — **offline-first SW caching** (cache API responses so history works offline) or **share-wheel links** (`?wheel=abc123` invite URLs)? Both suggested by Manus.
2. Should CI become a **required status check** via branch protection (currently advisory only)?

---

## Files to Read

```
# Priority (read first)
CLAUDE.md                          # workflow rules + mistake log (esp. #3, #5, #6, #7)
.github/workflows/ci.yml           # the CI definition
.claude/skills/deploy-gate/SKILL.md  # pre-ship checklist (Manus deploy lag)

# Context
client/src/index.css               # animation keyframes/utilities (lines ~115-150)
client/src/main.tsx                # tRPC client + PWA SW registration coexist
server/_core/vite.ts               # serveStatic() prod path = dist/public
client/public/manifest.webmanifest # PWA manifest + share_target
```
