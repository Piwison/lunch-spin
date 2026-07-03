# Model Dispatch Protocol

How the main session (any model) delegates work so that quality stays near-flagship
while spend stays low. Written 2026-07-03 against the live harness — every model name
and agent below was verified in-environment, not recalled from memory.

## 0. Verified inventory (re-verify if this file is >3 months old)

**Models dispatchable via the `Agent` tool `model` param:** `haiku` · `sonnet` ·
`opus` · `fable`. Exact IDs announced by this environment: `claude-haiku-4-5-20251001`,
`claude-sonnet-5`, `claude-opus-4-8`, `claude-fable-5`. The bare aliases map to the
harness's current default version of each tier — do not hardcode dated IDs in prompts.

**Effort:** this harness does NOT expose a per-call effort/reasoning knob on the
`Agent` tool. The real levers are: (a) model tier, (b) how tightly you scope the
prompt, (c) the `/code-review` skill's level argument (`low|medium|high|xhigh|max`).
Where this document says "effort: high", implement it as *bigger model + explicit
instruction to enumerate edge cases*, not as a parameter. (Unverified whether other
surfaces expose more; do not invent parameters.)

**Project agents** (`.claude/agents/*.md`, model pinned in frontmatter):
`a11y-checker` (haiku) · `code-reviewer` (sonnet) · `component-architect` (sonnet) ·
`design-reviewer` (sonnet; needs a display — best local).
**Built-in agent types:** `Explore` (read-only search) · `Plan` (architecture plans) ·
`general-purpose` · `claude-code-guide` (harness questions).
⚠️ `cavecrew-investigator/-builder/-reviewer` appear in the cavecrew skill docs but are
NOT registered agent types — do not dispatch them by name; use the skill's guidance
with `Explore`/`general-purpose` instead.

## 1. Every delegation carries three things (no exceptions)

1. **Goal + motivation** — what to produce and *why* (one sentence each). Motivation
   lets the subagent make sane micro-decisions without coming back.
2. **Acceptance criteria** — observable, checkable by the subagent itself before it
   returns (commands to run, strings that must exist, tests that must pass).
3. **Report format** — exactly what to return (see §3). If any of the three is
   missing, do not dispatch; you are about to waste a spawn.

Templates: `.agents/protocol/30-delegation-templates.md`.

## 2. Routing table (default assignments)

| Task shape | Dispatch | Rationale |
|---|---|---|
| Locate code / inventory / "where is X used" | `Explore` on `haiku` | Read-only, breadth over depth |
| Mechanical batch edit (rename, lint fixes, apply known pattern) | `general-purpose` on `haiku` | Pattern is given; judgment not needed |
| Implement a scoped feature/bugfix (spec exists) | `general-purpose` on `sonnet` | Needs local judgment, not architecture |
| Write/extend tests for `shared/*` | `general-purpose` on `sonnet` | TDD seam, mechanical once cases listed |
| Diff review before ship | `code-reviewer` (sonnet) or `/code-review` level `medium` | Fresh context avoids self-rubber-stamping |
| Component structure planning | `component-architect` (sonnet) | Pre-pinned |
| A11y pass | `a11y-checker` (haiku) | Pre-pinned |
| Architecture / refactor spanning >3 modules / gnarly debugging | `Plan` or `general-purpose` on `opus` | Cheap models visibly degrade here |
| Security-sensitive diff (anything near auth/session) | `opus` + `differential-review` skill + `/security-review` | Highest-stakes surface in repo |
| Ambiguous product/taste decision | **No model.** Ask the user | Judgment isn't purchasable downward — see rubric §3 |

Main session stays the orchestrator: it decomposes, dispatches, integrates, verifies.
It does not do bulk reading or batch edits itself when a cheaper agent can.

## 3. Report contract (protects the main context)

Subagents MUST return:
- Conclusions + `file:line` references — never raw file dumps.
- For produced artifacts >50 lines: write to a file (repo path or scratchpad), return
  the path + a ≤5-line summary.
- A one-line self-check result against each acceptance criterion (`PASS`/`FAIL: why`).
- On failure: the exact failing command + last ~20 lines of output, and what was
  already tried. (This becomes the escalation payload — see §4.)

The dispatching session copies at most the conclusions into its own notes. If a
subagent returns a wall of text, that is a dispatch-prompt bug — fix the template.

## 4. Escalation / de-escalation ladder

- **haiku's retry budget is zero:** fails once → re-dispatch to `sonnet`. Do not retry
  haiku with a reworded prompt; the reword costs more than the upgrade. (This is the
  one exception to rubric §1.2's "retry once at the same tier".)
- **sonnet fails twice on the same subtask** → escalate to `opus`, attaching the full
  failure trail (both attempts' failing commands/output/diffs). Never escalate with
  a bare "it didn't work".
- **opus fails twice** → stop; report to the user with the trail. Do not burn spend
  on a third identical attempt (rubric §4: repeated identical failure = wrong path).
- **De-escalate after breakthrough:** once the expensive model has produced the
  general pattern/fix recipe, hand *batch application* back to `haiku`/`sonnet` with
  the recipe embedded in the prompt.
- **Hard cap: two retry rounds per matter at the sonnet/opus tiers** (haiku's cap is
  zero, above). Exceeding it means the approach is wrong, not the model (see
  `20-judgment-rubric.md` §4).

## 5. Lifecycle hooks (already configured — know them, use them, don't fight them)

| Hook | File | What it enforces |
|---|---|---|
| SessionStart | `.claude/hooks/session-start.sh` | `pnpm install` so check/test/build work |
| PreToolUse (Write/Edit) | `.claude/hooks/guard-edit.mjs` | Denies edits to `.env*`, `server/_core/*`, `shared/const.ts` |
| PostToolUse (Write/Edit) | `.claude/hooks/post-edit.mjs` | prettier `--check`-then-`--write` (never mass-reformats legacy files), eslint --fix |
| Stop | `.claude/hooks/stop-gate.mjs` | Runs `pnpm check` + `pnpm test`; blocks "done" on red (once per turn) |

Rules of engagement:
- A PreToolUse denial is a **policy decision, not an error** — do not retry the same
  edit or route around via Bash. If the change is genuinely needed, ask the user.
- The Stop gate blocks only the FIRST stop attempt per turn (`stop_hook_active`
  short-circuits the retry) — it is a tripwire, not a guarantee. After it fires,
  re-run `pnpm check && pnpm test` yourself and confirm green before declaring done.
- Extending hooks (e.g. adding a `pnpm build` check for `api/index.js` staleness) is
  a **user-approval** change: hooks execute with full trust (`40-maintenance.md`).
- When delegating risky batch edits, remind the subagent the hooks exist so it
  interprets denials correctly instead of looping.

## 6. Cost hygiene for the dispatching session

- Never spawn an agent for work smaller than the spawn overhead (~reading 3 small
  files). Inline it.
- Parallelize independent dispatches in one message; serialize only true dependencies.
- One matter = one agent conversation: use `SendMessage` to continue a subagent that
  already has context instead of spawning a cold clone.
