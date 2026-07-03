# Task Delegation Templates

Copy the template, fill every `{{slot}}`, delete the "Dispatch" line before sending
(it configures YOUR Agent-tool call, it is not part of the subagent prompt).
A template with an unfilled slot must not be dispatched — the slots ARE the three
mandatory elements from `10-model-dispatch.md` §1 (goal+motivation, acceptance, report).

Shared footer for every dispatch (paste verbatim at the end of each prompt):

> REPORT CONTRACT: Return conclusions + file:line refs only — no raw file dumps.
> Artifacts >50 lines: write to a file and return the path + ≤5-line summary.
> End with a PASS/FAIL line per acceptance criterion. On FAIL include the exact
> failing command and last ~20 lines of its output, plus what you already tried.

---

## T1 · Search / exploration

**Dispatch:** `Explore` agent, `model: haiku`. Breadth: "medium" unless multiple
naming conventions are plausible → "very thorough".

```
GOAL: Find {{what — e.g. "every place restaurant exclusion state is computed or displayed"}}.
MOTIVATION: {{why — e.g. "we're about to make the window per-wheel; need the full blast radius"}}.
SCOPE: search under {{dirs, e.g. client/src, server/, shared/}}; this repo only.
KNOWN STARTING POINTS: {{seed symbols/files, e.g. shared/exclusion.ts, spins router}}.
ACCEPTANCE:
- Every match listed as file:line + one-line role description.
- Explicitly state which of the starting points had NO further references.
- State search patterns used, so a re-run can verify coverage.
```

## T2 · Code implementation (spec exists)

**Dispatch:** `general-purpose`, `model: sonnet` (mechanical pattern-application →
`haiku`; invariant-touching per rubric §1.1 → `opus`).

```
GOAL: Implement {{feature/bugfix}} per {{spec ref, e.g. .agents/prd/milestone-N-x.md §Y}}.
MOTIVATION: {{one sentence}}.
CONSTRAINTS: Read CLAUDE.md "Absolute rules" first. TDD: pure logic goes in
shared/{{name}}.ts with shared/{{name}}.test.ts written FIRST. Surgical edits only —
do not reformat or "improve" untouched code. Do not touch: {{explicit exclusions}}.
FILES YOU WILL LIKELY TOUCH: {{list from T1 output — keeps the agent from wandering}}.
ACCEPTANCE:
- pnpm check && pnpm test green; test count increased by ≥{{n}} ({{name the new cases}}).
- grep proof: `{{grep command}}` shows {{expected output}}.
- If server/ or shared/ changed: pnpm build ran and api/index.js is staged.
- git diff --stat contains ONLY the listed files (± test siblings); justify any extra.
```

## T3 · Architecture refactor

**Dispatch:** `Plan` agent on `opus` for the plan; then implementation via T2 chunks
(sonnet), one chunk per dispatch. Never one giant "refactor it all" prompt.

```
GOAL: Produce a step-by-step refactor plan for {{target, e.g. "WheelApp.tsx (1000 lines) → extracted tab components"}}.
MOTIVATION: {{pain, e.g. "page is monolithic; every feature now collides in one file"}}.
CONSTRAINTS: behavior-preserving; each step independently shippable with green
check/test; respect do-not-touch surfaces; pure logic stays in shared/*.
INPUTS: {{file list + line counts; current test coverage; known couplings}}.
ACCEPTANCE (for the plan itself):
- Numbered steps, each ≤{{~150}} changed lines, each with its own verification command.
- Explicit dependency order + which steps are parallelizable.
- A rollback note per step (what to revert if red).
- Names the riskiest step and why.
REPORT: write the plan to .agents/design/{{date}}-{{topic}}-refactor.md, return path + risks.
```

## T4 · Technical research

**Dispatch:** `general-purpose`, `model: sonnet` (needs WebFetch/WebSearch). Harness
or Claude-API questions → `claude-code-guide` agent instead.

```
GOAL: Answer: {{precise question, e.g. "can Vercel serverless functions keep an SSE stream open >30s on the free tier?"}}.
MOTIVATION: {{decision this feeds, e.g. "choosing polling vs SSE for realtime v2"}}.
CONTEXT: our stack is {{relevant slice, e.g. "Vercel free tier + Express-in-one-function, see PRODUCTION.md §5"}}.
ACCEPTANCE:
- Direct answer up front (yes/no/number), then evidence.
- ≥2 independent sources for load-bearing claims, with URLs and dates; official
  docs outrank blog posts. Flag anything only one source supports.
- Distinguish VERIFIED (doc/tested) vs INFERRED vs UNKNOWN — no smoothing over gaps.
- Ends with "implication for our decision: …" in ≤3 sentences.
REPORT: findings to {{scratchpad-or-.agents path}}, return path + the direct answer.
```

## T5 · PR / diff review

**Dispatch:** `code-reviewer` agent (fresh context — never the author session), or
`/code-review` at level `{{medium default; high+ for invariant-touching diffs}}`.

```
GOAL: Adversarial review of {{PR #N / branch / diff range}}.
MOTIVATION: pre-merge gate; assume the author is competent but context-blind.
FOCUS ORDER: (1) correctness bugs & broken invariants — check the diff against
the wheel-logic skill rules and CLAUDE.md absolute rules 2/4/6; (2) missing tests
for changed behavior; (3) type-safety gaps (`any`, unchecked casts); (4) dead code /
reuse opportunities. Style-only nits: mention at most 3, at the end, marked [nit].
ACCEPTANCE:
- Every finding: file:line + failure scenario ("with input X, Y happens") — no
  vague "consider improving".
- Explicit verdict per focus area, including "checked, found nothing" (silence ≠ pass).
- Confirms the deploy-gate mechanicals: api/index.js staged if server/shared changed;
  status lines updated; no unexplained files in git diff --stat.
- Final line: MERGEABLE / MERGEABLE-WITH-NITS / BLOCKED(reasons).
```
