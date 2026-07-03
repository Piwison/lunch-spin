# Externalized Judgment Rubric

Flagship-model judgment, compiled into checks any model can execute. Every rule is
keyed to **externally observable signals** — command output, diff shape, error text,
file contents — never to introspection. Each rule has a ✅ positive and ❌ negative
example, most drawn from this repo's real history (`mistake-log.md`).

---

## 1. When to escalate the model (or add rigor)

**Rule 1.1 — Escalate when the task changes *invariants*, not just *values*.**
If the diff would touch: winner-selection (`spins.create`), exclusion-window math
(`shared/exclusion*`), auth/session, migration files, or `vercel.json`/`api/` routing —
treat as high-stakes: `opus` tier + fresh-context review before merge.
- ✅ "Change exclusion window from 3 days to a per-wheel setting" → touches
  `shared/exclusion` math + schema → opus + tests-first + code-reviewer.
- ❌ "Change the SPIN button copy to 'SPIN!'" → JSX string literal, no invariant →
  haiku/sonnet, no review board needed. Escalating this wastes budget.

**Rule 1.2 — Escalate on the *second distinct* failure, not the first.**
One failure = information; fix and retry once at the same tier. A second failure with
a *different* error at the same tier = the model is out of depth. (Exception: a
dispatched **haiku** subagent gets zero retries — `10-model-dispatch.md` §4.)
- ✅ sonnet's fix for a failing test produces a *new* failing test → attach both
  failure outputs, escalate to opus.
- ❌ sonnet's first attempt has a typo (`tsc` names the exact line) → just fix it;
  escalation here is waste.

**Rule 1.3 — Signals that rigor is too low (any ONE observed → redo with more rigor):**
diff touches files the task never mentioned; diff >3× the size the plan predicted;
test added *after* implementation asserts only "does not throw"; commit message can't
name a verifiable behavior change.

## 2. When is a task *actually* done (acceptance)

**Rule 2.1 — Done = the gate commands pass AND the specific behavior was observed.**
`pnpm check` + `pnpm test` green is the *floor*, not done. (The Stop hook only trips
on the first stop attempt per turn — verify green yourself; don't lean on it.)
Done additionally requires the feature-specific observable named in the task's
acceptance criteria (a test that fails on revert, a grep that finds the new string, a
screenshot, a curl response).
- ✅ M4 first-run card: done = new `shared/onboarding.test.ts` passes AND
  `grep -n "isFirstRun" client/src/pages/WheelApp.tsx` shows the wiring AND 147 tests green.
- ❌ "Tests pass" after a change that no test covers (test count unchanged, no new
  assertion) — that's "didn't break the old stuff", not "built the new thing".

**Rule 2.2 — Done for anything touching `server/`/`shared/` includes the bundle.**
Observable: `git show --stat HEAD` lists `api/index.js` alongside the source change,
or the PR body states why not (client-only import).
- ✅ Log #9's terminal rule: server change → `pnpm build` → `api/index.js` in the commit.
- ❌ PR that edits `server/routers.ts` with no `api/index.js` diff → prod Vercel
  function still runs the old code; "works locally" is a false done.

**Rule 2.3 — Done for docs/status: the status line matches the repo state** (log #13).
Observable: PRD `**Status:**` line agrees with `git log` for that feature's files.

## 3. When to stop and ask the user (instead of blind retry)

**Rule 3.1 — Ask when two readings of the spec produce different *diffs*.**
Observable test: write one sentence per interpretation; if they lead to different
files/schemas being edited, ask (one crisp question, options + your recommendation).
- ✅ "Add notifications" — email? push? in-app toast? Different stacks entirely → ask.
- ❌ "Fix the typo in the result modal" — only one plausible diff → just do it.
  Asking here is throughput-theft.

**Rule 3.2 — Ask before any action on the irreversible list:** deleting user data,
schema-destructive migrations (DROP/ALTER that loses data), force-push, editing
do-not-touch surfaces, external publishing. No retry-count exemption — a blocked
guard-edit hook + real need = ask, never route around.

**Rule 3.3 — Ask when the blocker is an environment fact you cannot change:**
sandbox can't reach `*.vercel.app`/TiDB; missing secret; OAuth needs a human.
Observable: the same command fails with network/auth errors twice. Package the exact
command for the user to run; do not "try alternatives" that simulate the result.

**Rule 3.4 — Otherwise, don't ask.** If the answer is derivable from repo files,
conventions, or this protocol, derive it and state the assumption in your report.

## 4. "Wrong path" vs "needs debugging"

**Rule 4.1 — Same command, same error, after a claimed fix → your fix isn't landing**
(wrong file, wrong process, cached build). Verify the edit is actually in the file
(`grep`), then check for a stale artifact (`api/index.js`, `dist/`, vite cache) before
touching logic again.
- ✅ Log #9b: `ERR_MODULE_NOT_FOUND` persisted through source edits → the *bundle*
  was stale; the fix was esbuild pre-bundling, not more import tweaks.

**Rule 4.2 — Each fix reveals a *new* error in the same layer, 3 times → the layer
is wrong; change approach, don't debug on.**
- ✅ Log #9 in full: `[[...path]]` 404 → `[...path]` module error → nested-path 404.
  Three distinct failures inside "filename-based routing" → abandoned the layer for an
  explicit `vercel.json` rewrite. That decision — *stop paying rent on a bad
  abstraction* — is the pattern to copy.
- ❌ Anti-pattern: trying a 4th filename variant (`[[...slug]].js`…). If you're
  enumerating syntax variants, you're gambling, not engineering.

**Rule 4.3 — Error text names YOUR code (file:line in `client/`,`server/`,`shared/`)
→ debug. Error names the platform/framework internals or infra → suspect
configuration/architecture first**, and search the mistake log + PRODUCTION.md for
precedent before writing code.

**Rule 4.4 — The two-round cap is absolute.** Two full fix-attempt rounds on one
matter without the acceptance criterion moving → stop, write down the trail, escalate
(model or user). "One more try" past this point has ~never paid off in this repo.

## 5. Quality floor — concrete verification recipe (run in order)

1. `pnpm check` → exit 0.
2. `pnpm test` → all green; if your task added behavior, the test count **increased**
   (or an existing test's assertions visibly strengthened — name it).
3. Server/shared touched? → `pnpm build` succeeds; `api/index.js` regenerated + staged.
4. `git diff --stat` reviewed: every changed file is explainable by the task in one
   sentence. Unexplainable file → revert it (log #12's 170-line-churn lesson).
5. Grep-proof the change: at least one `grep` command whose output demonstrates the
   new behavior exists (function wired, string rendered, route registered).
6. Status lines / docs updated in the same commit (rule 2.3).
7. Fresh-context review for anything beyond mechanical (dispatch `code-reviewer`;
   author-context review of your own diff does not count).
8. Commit + push. Then — only then — report done, listing evidence from steps 1–7.
