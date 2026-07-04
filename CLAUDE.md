# CLAUDE.md — Lunch Wheel

This file is the **global rulebook + routing index**. Hard cap: **150 lines** (see
`.agents/protocol/40-maintenance.md`). Long-form content lives in the files it routes
to — add detail *there*, not here. **When you (Claude) make a mistake, fix the code
AND append an entry to `.agents/protocol/mistake-log.md`** (format specified in that file).

## Stack & layout

- React 19 + Tailwind 4 (client) · tRPC 11 + Express 4 (server) · Drizzle ORM /
  MySQL (TiDB) · Vitest · Vite 7 · pnpm. Deploys: Vercel auto-deploy on push to `main`.
- Path aliases: `@` → `client/src`, `@shared` → `shared/`.
- **Pure business logic lives in `shared/*.ts` with a `.test.ts` sibling.** Server and
  client import these — never reimplement the math inline. This is the TDD seam.
- Layout: `client/src` (UI), `server/` (routers, db, `_core`), `shared/` (pure logic
  + tests), `drizzle/` (schema + migrations), `api/` (generated serverless bundle).

## Commands (must pass before any commit)

```
pnpm check    # tsc --noEmit
pnpm test     # vitest run
pnpm build    # vite build + esbuild server  → regenerates api/index.js
pnpm db:push  # drizzle-kit generate && migrate  (needs a real DATABASE_URL)
```

A `Stop` hook runs `check` + `test` and blocks the first "done" on red (first stop
attempt per turn only — re-verify green yourself after it fires). It does NOT cover
`build`, `api/index.js` regeneration, or migrations — those are on you (see
`.agents/protocol/00-quick-diagnostic.md` §3 and the `deploy-gate` skill).

## Absolute rules (no exceptions without explicit user intent)

1. **Do-not-touch surfaces** (a PreToolUse hook blocks edits — don't fight it):
   `server/_core/*`, `shared/const.ts`, `.env*`. Changing the auth contract
   (`COOKIE_NAME`, JWT signing, `protectedProcedure`) logs out every user.
2. **The server picks the spin winner** (`spins.create`); the client only proposes
   `candidateIds`. Never move selection client-side for authed wheels.
3. Never `git add -A`. Never `--no-verify` / force-push. Develop on `claude/<topic>`
   branches, never on `main`. Don't open a PR unless asked.
4. Any change under `server/` or `shared/` that the API imports → run `pnpm build`
   and **commit the regenerated `api/index.js`** in the same PR.
5. Generated files under `drizzle/meta/` belong to `drizzle-kit` — don't hand-edit.
6. A migration is not "applied" until `drizzle-kit migrate` ran against the real
   `DATABASE_URL` and the column was verified. Sandbox usually can't — then say so.
7. Status lines (PRD `**Status:**`, `todo.md` header) update **in the same commit**
   as the change they describe. On session start, files beat conversation memory.
8. This container is ephemeral: **commit + push before ending any session.**
   Unpushed work does not exist.

## Routing index (read the target file BEFORE working in its area)

| Topic | Source of truth |
|---|---|
| Spin/exclusion/fairness rules | `wheel-logic` skill |
| WebGL/canvas/animation conventions | `shader-style` skill |
| Pre-merge/ship checklist | `deploy-gate` skill |
| Harness failure modes + fixes | `.agents/protocol/00-quick-diagnostic.md` |
| New-feature workflow (US/UX gate → autonomous build) | `.agents/protocol/50-feature-lifecycle.md` |
| Which model/agent to dispatch, escalation | `.agents/protocol/10-model-dispatch.md` |
| Quality bar, when to escalate/stop/ask | `.agents/protocol/20-judgment-rubric.md` |
| Delegation prompt templates | `.agents/protocol/30-delegation-templates.md` |
| Who may edit which file; compaction | `.agents/protocol/40-maintenance.md` |
| Past incidents (append new ones!) | `.agents/protocol/mistake-log.md` |
| Long-term risks & handoff notes | `.agents/protocol/90-letter-to-future-sessions.md` |
| Product roadmap & feature status | `.agents/prd/*.md` (status line per PRD) |
| Design decisions | `.agents/design/*.md` |
| Prod setup / deploy / migrations | `PRODUCTION.md` |
| Session handoffs | `.agents/handoff/` (`handoff` skill) |

`README.md` is the platform template doc — ignore it for product questions.

Other skills in `.claude/skills/` (invoke by name as needed): workflow —
`grill-me`, `karpathy-guidelines`, `test-driven-development`, `handoff`, `caveman`
(+ suite, incl. `cavecrew`); security — `differential-review`, `semgrep`,
`supply-chain-risk-auditor`, `audit-prep-assistant`, `code-maturity-assessor`;
UI/testing — `frontend-design`, `webapp-testing` (Playwright; needs a display —
best run locally).

## Workflow

- **New feature? Follow `50-feature-lifecycle.md`:** confirm **user story + UX/UI
  design with the owner FIRST** (the gate), then run spec → build → verify → ship
  **autonomously** to completion. Pressure-test scope with `grill-me`; apply
  `karpathy-guidelines`. PRD in `.agents/prd/` with locked decisions before code.
  Bugfixes/refactors/chores skip the gate — just do them (branched + verified).
- **While building:** TDD (`test-driven-development` skill); pure logic in
  `shared/*` tests-first. Delegate per `10-model-dispatch.md` — main context
  receives conclusions and `file:line`, not raw scans.
- **Before PR/ship:** `deploy-gate` checklist. Security-sensitive (auth/session):
  `differential-review` / `semgrep` / built-in `/security-review`.
- **Web/iPhone sessions:** launch from claude.ai/code; `subscribe_pr_activity` to
  babysit CI instead of polling; `handoff` skill + push before idle; `caveman`
  mode to save output tokens on mobile.

## PR conventions

- Title < 70 chars; body = **Summary** + **Test plan**.
- Before merge: PR head SHA == `git rev-parse <branch>`. After merge:
  `git merge-base --is-ancestor <fix-commit> origin/main`.
- "Merged" ≠ "live": Vercel builds ~1 min after push to `main`; smoke-test the
  live URL (sandbox can't reach it — hand the checklist to the user, see issue #19).

## Top recurring lessons (full log: `.agents/protocol/mistake-log.md`)

1. Deploy truth: merged ≠ applied ≠ live — verify each hop (log #1, #2, #3, #9).
2. `<canvas>`/WebGL can't read CSS vars — resolve tokens at draw time (log #11).
3. Docs drift kills weak-model sessions — status lines update with the change (log #13).
