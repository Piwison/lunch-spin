# Feature Development Lifecycle

The one workflow for building any NEW user-facing feature in this product. Set by the
owner 2026-07-03. The point: the owner controls *what we build and how it feels*; the
agent owns *making it real correctly, without hand-holding*.

## The gate (Phase 0) — REQUIRES the owner. Do not skip, do not assume.

Before any spec or code, get explicit owner confirmation on BOTH:
1. **User story** — who, what they want, why (the job-to-be-done). One or a few
   `US#` lines, in the owner's words or confirmed by them.
2. **UX/UI design** — the shape of the experience: where it lives in the app, the key
   screens/states, the interaction, the feel. Rough is fine (a described flow, a
   sketch, options to pick) but it must be *confirmed*, not inferred.

Use `AskUserQuestion` (options + a recommendation) or a plain proposal. Pressure-test
with `grill-me` if scope is fuzzy. **No PRD, no branch, no code until both are
confirmed by the owner.** If the owner only confirms the story, keep going on UX/UI —
don't jump to building.

## After the gate — RUN AUTONOMOUSLY to completion (no further confirmation)

Once US + UX/UI are confirmed, proceed through all of the following without stopping to
ask, until the task is complete:

1. **Spec** — write a PRD in `.agents/prd/milestone-N-<slug>.md` with locked decisions,
   user stories, non-goals, success criteria, and phased plan (mirror the existing M1–M4
   PRDs). Status line: `Spec locked <date> · building · Branch: claude/<topic>`.
2. **Build** — branch `claude/<topic>`; TDD; pure logic in `shared/*` tests-first;
   delegate per `10-model-dispatch.md`; obey CLAUDE.md absolute rules and the
   do-not-touch hooks.
3. **Verify** — run the `20-judgment-rubric.md` §5 recipe end-to-end: `pnpm check` +
   `pnpm test` green with the new behavior actually covered; `pnpm build` + staged
   `api/index.js` if `server/`/`shared/` changed; grep-proof; fresh-context
   `code-reviewer`; `deploy-gate` skill. Flip the PRD status line to shipped.
4. **Complete** — commit + push to the branch. Report done with the evidence. Hand the
   owner the live-smoke checklist (sandbox can't reach prod).

## The only reasons to break autonomy and come back mid-build

(From `20-judgment-rubric.md` §3 — these override "run autonomously":)
- A spec ambiguity where two readings produce **different diffs/schemas** (§3.1) — and
  it wasn't settled at the gate.
- Anything on the **irreversible list** (§3.2): data-destructive migration, force-push,
  editing a do-not-touch surface, external publishing.
- An **environment blocker** you cannot clear (§3.3): missing secret, sandbox can't
  reach prod/DB, OAuth needs a human.
- The **two-round failure cap** is hit (§4.4): stop, report the trail, don't grind.

Anything else — naming, file layout, which component to reuse, test structure, copy
tweaks within the confirmed design — is the agent's call. Decide, note the assumption
in the report, keep moving.

## Scope note

This lifecycle is for **new features**. Bugfixes, doc reconciliation, refactors, and
chores don't need the Phase 0 gate — apply `karpathy-guidelines` and just do them
(still on a `claude/<topic>` branch, still verified). If unsure whether something is "a
feature," the test is: *does it add a user-facing capability or change the UX?* If yes,
gate it.
