# PRD — Milestone 4: Activation & Onboarding

**Status:** Spec locked 2026-06-28 · building · **Branch:** `claude/milestone-4-activation`

## Decisions (locked 2026-06-28)
- **Guest conversion = earned, not nagged.** Show the "make your own wheel" nudge
  **after the guest's first spin** (in the result moment), on top of the existing
  persistent subtle CTA. (Decision 1 = **b**.)
- **First-run = guided, no surprise writes.** A signed-in user with **zero wheels**
  gets a distinct first-run card with two affordances — **"Start from a sample"**
  (pre-filled starter wheel) and **"Create a blank wheel"** — both of which open
  the **existing create dialog**, just pre-setting its starter-pack toggle. We do
  **not** silently auto-create data; the user still confirms in the dialog.
  (Decision 2 = **b**.)
- **Reuse, don't duplicate:** the sample contents are the existing tested
  `STARTER_RESTAURANTS` (`shared/starter.ts`), surfaced through the create dialog's
  current starter-pack option — no second sample list, no new endpoint.
- **Empty states get a job.** The three main empties (no wheel selected / no
  restaurants / no history) each become an illustrative state with **one** clear
  primary action. (Decision 3 = **yes**.)
- **Pure-logic seam:** the funnel rules ("has the guest spun?", "is this a first
  run?", the sample-wheel contents) live in `shared/onboarding.ts` (+ tests),
  matching the repo's `shared/*` convention. No `server/_core` / `shared/const.ts`
  / auth / DB changes.

## Problem
We capture interest but don't convert or activate it. A guest can spin a public
wheel but is never asked to make their own at the moment they're delighted. A
brand-new signed-in user lands on a generic "NO WHEEL SELECTED" empty state with
no obvious first step and no way to skip the blank-page problem. Empty states
elsewhere are terse text with no next action.

## Goal
Turn first contact into an activated user: a guest who spins is invited to build
their own at the peak moment; a new user has an obvious, low-friction first wheel
(blank or sample); every empty surface points at its next step. Pure
presentation + reuse of existing procedures — zero new backend surface, the
recorded-spin/auth paths untouched.

## User stories
- **US1 — Post-spin conversion** (guest): I spin a public wheel → the result card
  shows a "Make your own wheel — it's free" action alongside Directions / Re-spin
  / Accept. (Today: only a persistent CTA at the bottom of the page.)
- **US2 — First wheel, blank** (new user): I sign in with no wheels → a first-run
  card offers "Create my first wheel" in one tap → I'm in the create flow.
- **US3 — First wheel, sample** (new user): from the same card I tap "Start from a
  sample" → a starter wheel ("My First Wheel") is created with a handful of
  editable sample restaurants → I can spin immediately and edit/delete freely.
- **US4 — Purposeful empties:** an empty wheel (no restaurants), the no-wheel
  state, and an empty history each show an illustrative state with a single
  primary action ("Add restaurants" / "Create a wheel" / "Spin to start a
  history").

## How it works
- **Guest funnel** (`pages/GuestWheel.tsx`): track a client-only spin counter;
  `shouldPromptSignup(count)` (pure) gates a conversion row inside the result
  overlay. Nothing is written — consistent with guest mode's "not recorded by
  construction" guarantee.
- **First-run** (`pages/WheelApp.tsx`): when `isFirstRun(wheelCount)` (the user
  owns/belongs to zero wheels), render a first-run card instead of the generic
  "no wheel selected" empty. Both buttons open `WheelSelector`'s existing create
  dialog via a registered opener callback (`registerCreateOpener`), pre-setting the
  starter-pack toggle — "Start from a sample" = on (adds `STARTER_RESTAURANTS`),
  "Create a blank wheel" = off. Reuses the existing `wheels.create` +
  `restaurants.addBulk` path — **no new endpoint, no duplicated sample data**.
- **Empty states:** tighten the three existing empties to illustration + one
  primary CTA; reuse existing buttons/dialogs.

## Components
- `shared/onboarding.ts` (new, + tests): `shouldPromptSignup(guestSpinCount)`,
  `isFirstRun(wheelCount)`, `FIRST_SPIN_CTA_THRESHOLD`.
- `client/src/pages/GuestWheel.tsx`: spin counter + conversion row in the result
  overlay (US1).
- `client/src/components/WheelSelector.tsx`: optional `registerCreateOpener` prop
  so the first-run card can open the existing create dialog (US2/US3).
- `client/src/pages/WheelApp.tsx`: first-run card replacing the generic zero-wheel
  empty; tightened empty states (US4).

## Non-goals
- No email capture, onboarding analytics backend, or A/B framework.
- No auth / session changes; no new `protectedProcedure`/`publicProcedure` unless
  a sample source genuinely needs one (it doesn't — reuse `wheels.create` +
  `restaurants.add`).
- No change to the recorded-spin / fairness / exclusion logic.

## Success criteria
- A guest who spins sees the conversion CTA in the result; a zero-wheel signed-in
  user has an obvious first action and can go blank **or** sample in one tap; the
  three main empty states each have a clear next step.
- `pnpm check` clean · `pnpm test` green (incl. new `shared/onboarding.test.ts`) ·
  `pnpm build` ok. No `server/_core` / `shared/const.ts` / auth / DB edits, so
  `api/index.js` is unchanged.
- ⏳ Live smoke (deploy-gate): guest spin → CTA; new account → first-run card →
  sample creates an editable wheel; empties read correctly. (Sandbox can't reach
  prod; run on deploy.)

## Phases (each: `check`/`test`/`build` green)
1. **Pure seam** — `shared/onboarding.ts` + `shared/onboarding.test.ts` (TDD).
2. **US1** — guest post-spin conversion row.
3. **US2/US3** — first-run card (blank + sample) in WheelApp.
4. **US4** — purposeful empty states.

## Risks / notes
- "Start from a sample" issues N+1 mutations (create wheel + add each
  restaurant); do it sequentially with a loading state and a toast on done, and
  guard against double-tap. Low risk (existing mutations, owner-scoped).
- First-run detection must use the user's **wheel count**, not "none selected",
  so returning users who simply haven't picked a wheel still see the normal empty.
