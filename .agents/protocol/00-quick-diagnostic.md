# Quick Diagnostic — Top 3 Failure Modes of This Harness

Audit date: 2026-07-03 · Auditor: claude-fable-5 (one-time flagship session).
Every finding below is grounded in observed behavior in THIS repo/harness, not theory.
Fixes are written so a small model can follow them mechanically.

---

## 1. Context flooding: tool output pollutes the main conversation

**Observed:** MCP servers (github, Vercel, Notion, Supabase, GDrive) disconnect and
reconnect repeatedly in web sessions, each time dumping 100+ tool names into context.
Whole-file `Read`s of 1000-line files (e.g. `client/src/pages/WheelApp.tsx`) when only
~40 lines were needed. `README.md` is a 44KB template doc that mostly does not apply.

**Cost:** every wasted KB is re-read on every subsequent turn; long sessions slow down
and the model starts missing its own earlier findings ("context rot").

**Mechanical rules (any model can follow):**
- `Grep` before `Read`. Read with `offset`/`limit` around the match. Never read a file
  >300 lines end-to-end unless you are about to rewrite it.
- Fan-out searches (>3 files to inspect, only the conclusion needed) → dispatch an
  `Explore` agent on `model: haiku`. Main context receives conclusions + `file:line` only.
- Any generated artifact >50 lines → `Write` it to a file, report the path, not the body.
- Ignore `README.md` for product questions — it is the platform template. Product truth
  lives in `.agents/prd/`, `.agents/design/`, `todo.md`, `PRODUCTION.md`.
- **Trigger for `/compact`:** you have finished a milestone/PR-sized unit AND the next
  unit does not need the working detail (diffs, logs) of the previous one. Compact at
  that boundary, never mid-investigation.

## 2. Context rot across resumed sessions: conversation memory diverges from repo truth

**Observed:** this session was resumed 3+ times. The M4 PRD said `building` for days
after the work merged (PR #20). `todo.md` was 100% checked while the real roadmap lived
elsewhere. A model that trusts conversation memory or stale status lines will re-do or
skip work.

**Mechanical rules:**
- **Files are the single source of truth.** On every session start/resume, before acting:
  `git log --oneline -5`, `git status`, and read the status line of the PRD you think
  you are working on. If they disagree with what the conversation claims, the files win.
- Any commit that changes what a status line describes MUST update that status line
  *in the same commit* (PRD `**Status:**` lines, `todo.md` header).
- Before ending any session with uncommitted insight: write a handoff to
  `.agents/handoff/YYYY-MM-DD-<topic>.md` (use the `handoff` skill), then commit+push.
  This container is ephemeral — **unpushed work does not exist**.

## 3. "Done" that isn't deployable: the stop-gate has holes

**Observed:** the `Stop` hook (`.claude/hooks/stop-gate.mjs`) runs `pnpm check` +
`pnpm test` and blocks the FIRST "done" on red — but only the first per turn
(`stop_hook_active` skips the recheck), so it's a tripwire, not a guarantee: re-verify
green yourself after it fires. And mistake-log history shows the
failures that actually hurt were *outside* that gate: migrations generated but never
applied (#2), `api/index.js` not rebuilt after `server/`/`shared/` changes (#9),
merged ≠ live on Vercel (#3), PR merged at a stale head (#1).

**Mechanical rules (run before ANY merge/ship; this is the `deploy-gate` skill — use it):**
- Changed anything under `server/` or `shared/` that the API imports?
  → `pnpm build` and **commit the regenerated `api/index.js`**. Verify:
  `git diff --stat HEAD -- api/index.js` must be non-empty in your PR if server/shared changed.
- Added a migration? → it is NOT applied until `drizzle-kit migrate` ran against the real
  `DATABASE_URL` and you verified the column/table exists. Say "generated, not applied"
  in the PR body if you could not run it (sandbox usually can't reach TiDB).
- Before merge: PR head SHA == `git rev-parse <branch>`. After merge:
  `git merge-base --is-ancestor <fix-commit> origin/main`.
- After deploy: smoke-test the live URL (~1 min Vercel build lag). The sandbox cannot
  reach `*.vercel.app` — if so, hand the smoke checklist to the user explicitly
  (see issue #19 for the canonical checklist). Never report "live" from the sandbox.

---

*Referenced by CLAUDE.md. If a new recurring failure mode appears, append a §4 here and
log the incident in `.agents/protocol/mistake-log.md`.*
