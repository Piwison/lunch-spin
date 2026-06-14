# Continuation Prompt for New Session

Copy/paste this to start the next session:

---

## Context

Last session (2026-06-14) shipped CI, fixed the dead animation layer + added a PWA,
and reconciled the recurring GitHub↔Manus history split — including round-tripping
Manus's `serveStatic()` prod fix back to GitHub and documenting the sync protocol
(mistake log #7). Everything is shipped, CI-green, and **GitHub `main` == Manus HEAD
== `bc6e8e76`** (byte-identical, in sync). Live: https://lunchwheel-8v5qmeks.manus.space

## Read First

1. The handoff doc: `.agents/handoff/2026-06-14-ci-manus-sync.md`
2. `CLAUDE.md` — mistake log #3 (merged≠live), #5 (node_modules committed), #6/#7 (Manus sync; never orphan force-push)
3. `.claude/skills/deploy-gate/SKILL.md`

## What I Need Help With

Pick up a deferred roadmap item (or whatever I specify). Candidates from Manus:
- **Offline-first SW caching** — extend `client/public/sw.js` to cache API responses so past spin history is viewable offline (never cache `/api` auth/SSE).
- **Share-wheel links** — `?wheel=abc123` invite URLs so teammates join a wheel without copying an ID.

Before building: `git fetch origin main` and confirm no forced update; develop on a
`claude/<topic>` branch; pure logic in `shared/*` with tests first (TDD).

## Key Files

```
client/public/sw.js                # service worker (offline caching target)
client/src/main.tsx                # SW registration (prod-only)
client/src/pages/WheelApp.tsx      # share-target intake already exists here
shared/*.ts                        # pure logic + .test.ts siblings (TDD seam)
.github/workflows/ci.yml           # CI must stay green
```

## Open Questions

1. Offline-first SW caching, or share-wheel links — which first?
2. Make CI a required status check via branch protection?

## Sync reminder

After any merge to GitHub `main`, have Manus pull (normal fast-forward, never orphan
force-push) and redeploy if runtime code changed. Push any Manus deploy fixes back to
GitHub so the two never drift (mistake log #7).

---

Suggested: start with Plan mode + `grill-me` to scope, then `test-driven-development`.
