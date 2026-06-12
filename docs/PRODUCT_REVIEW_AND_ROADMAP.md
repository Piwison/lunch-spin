# Lunch Wheel — Product Review & Roadmap

_Review date: 2026-06-10 · Reviewer perspective: senior product builder / TDD_

---

## 1. What this is

A "what's for lunch?" decision app. A user creates a **wheel**, fills it with
**restaurants** (each carrying **tags** — cuisine / food-type / custom), and
**spins** to pick one. Wheels can be **shared** via invite link so a team
decides together. Two pieces of genuine product thinking lift it above a toy:

- **3-day smart exclusion** — a spun restaurant drops off the wheel for 3 days
  so you don't eat the same thing twice, with a manual re-enable escape hatch.
- **Tag intersection filtering (AND)** — "Japanese AND Noodle" narrows the wheel
  to what the group actually wants right now.

The stack is solid and modern: React 19 + Tailwind 4, tRPC 11 end-to-end types,
Drizzle/MySQL, Manus OAuth. Typecheck is clean (`pnpm check` ✓) and the suite is
green (16/16). The wheel itself is a nice touch — Canvas pie render + a WebGL
shader background.

**Overall: a strong v1.1 skeleton with real product instincts, held back by a
few correctness bugs, thin test depth in the new areas, and some data-model
scoping gaps that will bite as soon as it has more than one real group on it.**

---

## 2. Top issues, ranked by product impact

### 🔴 P0 — The wheel can land on the wrong answer (trust-breaking)

`client/src/components/SpinWheel.tsx:278`

```ts
const totalDelta = extraRotations + ((targetCenter - startAngleRef.current) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
startAngleRef.current = currentAngleRef.current;   // reassigned AFTER it was used above
targetAngleRef.current = currentAngleRef.current + totalDelta;
```

`totalDelta` is computed against `startAngleRef.current`, but that ref still
holds the **previous** spin's start angle — it's only updated to
`currentAngleRef.current` on the next line. On the first spin both are `0`, so it
looks correct. On every subsequent spin the landing angle is off by the previous
spin's offset, so the wheel **visually stops on a different segment than
`segments[targetIdx]`** — the value that's actually recorded (`recordSpin`) and
shown in the result modal.

For a spinner, this is the cardinal sin: the animation and the answer disagree.
Users will not trust it twice.

**Fix:** compute the delta from the true current angle (reorder so
`startAngleRef.current = currentAngleRef.current` happens first, then derive
`targetCenter - startAngleRef.current`). This belongs in a pure, unit-tested
helper — see §4.

### 🔴 P0 — Custom tags are global, not scoped

`drizzle/schema.ts` (tags has no `wheelId`), `server/routers.ts` `tags.list`
is a `publicProcedure` returning `getAllTags()`.

Any custom tag any user creates appears in **every** user's filter bar and tag
picker, on every wheel. With one user it's invisible; with ten it's a junk
drawer and a low-grade data leak (you can see other teams' tag vocabulary).
Predefined system tags being global is fine; user-created ones must be scoped to
the wheel (or the creator).

**Fix:** add `wheelId` (and/or keep `createdBy`) to `tags`, scope `tags.list`
to `{ wheelId }` returning system tags + that wheel's custom tags, and add a
membership check (it's currently fully public).

### 🟠 P1 — The new features are tested in name only

`server/stats.test.ts` asserts `expect(caller.stats.getRestaurantStats).toBeDefined()`
four times. It exercises no aggregation, no sorting, no membership enforcement —
the comments even say "this would need a real database to test properly." So the
two headline features (stats, and arguably exclusion at the DB layer) have **no
behavioral coverage**. The genuinely good tests (`wheel.test.ts`) only cover
*reimplemented copies* of the filter/exclusion logic, not the shipping code in
`server/db.ts`.

This is the gap most worth closing for a TDD-minded team: extract the pure logic
(spin landing math, exclusion grouping, stats sorting) so it can be tested
directly, and stand up an integration harness (sqlite/pglite or a test MySQL)
for the DB helpers.

### 🟠 P1 — Shared wheels aren't actually shared in real time

The marquee social feature has no liveness. If two teammates open the same wheel,
a spin by one doesn't surface for the other except on manual refetch. There's no
"Alex is spinning…", no shared result, no presence. Today it's a shared
*database*, not a shared *moment*. (See roadmap Phase 2.)

### 🟡 P2 — Smaller correctness / model smells

- **`primaryTagId` is dead weight.** It's written on add/update but the UI colors
  segments from `r.tags[0]` (`WheelApp.tsx:64`). Two sources of "primary tag"
  truth that can disagree. Pick one.
- ~~**Spin outcome is client-trusted.**~~ Fixed in Phase 2: `spins.create`
  picks the winner server-side from the re-validated eligible set; the wheel
  animates to that segment (`pickWinner` + `computeSpin({ targetIdx })`, tested).
- **`getExclusions` groups in app memory** — pulls all recent spins
  and de-dupes in JS. Fine at small scale, worth a windowed SQL query later.
- ~~**3-day window is hardcoded** in two places (`db.ts`) and in the UI copy.~~
  Fixed in Phase 1: `wheels.exclusionDays` (off/1/3/7 days), editable per wheel.
- **`getRestaurantStats` uses raw `db.execute`** and casts `any`; MySQL returns
  `COUNT` as a string in some drivers, so `pickCount` typing is unverified.
- ~~**No empty/error states beyond the wheel tab.**~~ Fixed in Phase 1: the
  Wheel tab now has a loading skeleton and an error + retry state.

---

## 3. Product / UX feedback

- **Reduce time-to-first-spin.** New user → must create a wheel → add restaurants
  one by one → then spin. That's a long cold start. Ship a **starter wheel**
  (e.g. "Nearby Lunch" seeded with common chains) or a bulk/paste-a-list import
  so the first spin happens in <30s.
- **The result is a dead end.** After "TODAY'S LUNCH: Ramen House" the only
  action is Close. Add the obvious next steps: **Directions/Map** (you already
  have `Map.tsx` and Google Maps types), **Re-spin**, **Accept** (locks it in /
  marks the visit), **Share result**.
- **Surface the smart-exclusion value.** The 3-day exclusion is the cleverest
  thing here but it's nearly invisible (a small "· N excluded" note). Tell the
  story: "Skipping Ramen House — you had it Tuesday." That's the feature people
  will describe to a friend.
- **Stats should drive decisions, not just report.** "Top 5 picked" is vanity.
  More useful: "haven't picked in a while," "your group's blind spots," fairness
  ("everyone's vetoes respected"). Tie stats back into the spin.
- **Mobile is the real context.** Deciding lunch happens on a phone, standing in
  a group. Audit touch targets, the fixed result overlay, and the sidebar
  wheel-selector on small screens; consider a PWA install + share-target.
- **Group decision-making is the actual job.** The deep version of this product
  isn't "random picker," it's "fair group decision": vetoes, votes, dietary
  constraints, "two people are vegetarian today." That's the moat over the
  thousand generic spinner apps.

---

## 4. Engineering / optimization recommendations

**Make the core logic pure and tested.** Three pieces of real logic are
currently entangled with React/DB and therefore under-tested:

1. `pickAndLand(segments, rng)` → `{ targetIdx, targetAngle }` (fixes P0, fully
   unit-testable: assert the landed angle's segment === targetIdx for N spins
   from arbitrary start angles).
2. `computeExcluded(spins, now, windowDays)` → already mirrored in tests; import
   the *real* one from a shared module so test and prod can't drift.
3. `rankStats(rows)` → sorting/typing of pick counts, tested directly.

**Stand up a DB integration test harness** (pglite/sqlite memory or a disposable
MySQL in CI) and write real tests for `db.ts`: exclusion windowing, stats
aggregation, membership/permission enforcement on every procedure.

**Tighten the data model:** scope custom tags; drop or canonicalize
`primaryTagId`; add the per-wheel exclusion-window setting.

**Add the CI/quality floor:** there's no lint config, no CI workflow, no
formatting gate in the repo. Add ESLint + a GitHub Action running
`check → test → build` on PRs (a `SessionStart` hook can keep web sessions able
to run these too).

**Performance is fine for now**; the only real hotspots later are the
in-memory exclusion grouping and the unbounded `getSpinHistory`/stats queries —
both want pagination + indexed, windowed SQL once a wheel has thousands of spins.

---

## 5. Roadmap

Framing: **earn trust → make it social → make it smart → grow.** Each phase is
shippable on its own.

### Phase 0 — Trust & Correctness ✅ (shipped on this branch)
_Goal: the wheel is honest and the new features are actually tested._
- [x] Fix the spin-landing desync — extracted `computeSpin` into the pure,
      tested `shared/wheel.ts`. (Also caught a second latent bug: the random
      *fractional* extra rotation was shifting the landing position; extra turns
      are now whole turns only.)
- [x] Scope custom tags to a wheel — added `tags.wheelId`, made `tags.list`/
      `tags.createCustom` wheel-scoped with membership/public checks
      (migration `0002_tag_wheel_scope.sql`; run `pnpm db:push` to apply).
- [x] Replace hollow/duplicated tests with real ones — pure logic for exclusion,
      stats, and tag filtering now lives in `shared/*` and is unit-tested against
      the **production** code (25 tests, was 16). Removed the two server test
      files that reimplemented or asserted nothing.
- [~] Resolve `primaryTagId` vs `tags[0]` — documented, not yet unified (note below).
- [x] Add CI (`check`/`test`/`build`) via `.github/workflows/ci.yml`.
- [ ] _Deferred:_ DB integration harness for `server/db.ts` (membership/permission
      paths still need a live DB to test); ESLint config; SessionStart hook.

> **`primaryTagId`:** kept as the single stored "primary tag" but the wheel/list
> colour still reads `tags[0]`; these are reconciled because the writer always
> stores `tagIds[0]` as the primary. A follow-up could make the UI read
> `primaryTagId` directly to remove the implicit ordering dependency.

### Phase 1 — Decision Loop & Onboarding ✅
_Goal: first spin in under a minute; the result leads somewhere._
- [x] Bulk/paste restaurant import — paste a list (one per line or comma-sep),
      de-duped against the wheel. Pure parser in `shared/import.ts` (tested),
      `restaurants.addBulk` procedure, Import dialog in the Restaurants tab.
- [x] Result actions — Directions (Google Maps search), Re-spin, Accept replace
      the dead-end Close button on the result overlay.
- [x] Starter wheel on signup — curated "Nearby Lunch" list in
      `shared/starter.ts` (tested), seeded via `restaurants.addBulk` from a
      "Add starter restaurants" toggle in Create Wheel (on by default for a
      user's first wheel).
- [x] Make exclusion visible and human — the Wheel tab now shows a "Skipping
      (picked recently)" panel naming each excluded restaurant and when it's
      back, and History shows "excluded · Xd Yh left" / "excluded · Zm left".
      Both use `formatExclusionTimeLeft` from `shared/exclusion.ts` (tested).
- [x] Per-wheel exclusion window setting (off / 1 / 3 / 7 days) — added
      `wheels.exclusionDays` (migration `0003_wheel_exclusion_days.sql`; run
      `pnpm db:push`), set at wheel creation and editable via the new wheel
      settings (gear icon) dialog. `computeExclusions`/`computeExcludedIds`
      take `windowDays`; server's `getExclusions`/`reenableRestaurant` use the
      wheel's own setting.
- [x] Loading/empty/error states across all tabs — the Wheel tab now shows a
      skeleton while restaurants load and an inline error + retry button on
      failure (Restaurants/History already had these).

### Phase 2 — Make Sharing Live ✅
_Goal: a shared wheel is a shared moment, not a shared table._
- [x] Server-authoritative spin (anti-tamper, fairness) — `spins.create` picks
      the winner on the server from the live eligible set (`pickWinner`, tested)
      and records it; the client animates to that segment via the new
      `computeSpin({ targetIdx })`. Applies to every wheel, not just shared,
      so the animation and the recorded/displayed result can never disagree.
- [x] Real-time spins (push) — `spins.onSpin` is a tRPC SSE subscription fed by
      an in-process emitter (`server/realtime.ts`); a teammate's spin is pushed
      to every open client and surfaced (toast + refresh). Client uses a
      `splitLink` routing subscriptions to `httpSubscriptionLink`.
- [x] Presence + "who's here now" — `presence.onPresence` SSE subscription;
      the server ref-counts connections (multiple tabs collapse to one) and
      broadcasts the live roster. Shown as green "here now" dots + a count on
      the team roster.
- [x] Member roles/permissions surfaced in UI — shared wheels show a team
      roster (`WheelMembers`) with the creator marked by a crown and "You"
      highlighted; the owner is always listed even if not in the members table.

> The realtime emitters are single-process (fine for one Node instance). Scaling
> to multiple instances means swapping them for Redis pub/sub behind the same
> `server/realtime.ts` interface. The plumbing is runtime-verified at the module
> level; full multi-browser push couldn't be exercised in this environment.

### Phase 3 — Make It Smart ✅
_Goal: better-than-random group decisions — the moat._
- [x] Weighted wheels / fairness mode — a per-wheel `fairnessMode` toggle
      (migration `0004_wheel_fairness_mode.sql`) weights the server-authoritative
      spin toward neglected restaurants: weight grows with days since last pick,
      never-picked get the max boost, capped so one ancient pick can't dominate
      (`computeWeights` + `pickWeighted` in `shared/weight.ts`, tested). Set in
      the Create Wheel and wheel-settings dialogs.
- [x] Decision-grade stats: "blind spots" & "overdue" — `overdueRestaurants` /
      `daysSinceLastPick` (`shared/stats.ts`, tested) surface a "Time to revisit"
      panel (never-picked first, then longest-overdue) in the stats view.
- [x] Vetoes & lightweight voting (per person, per session) — a "This round"
      panel on shared wheels lets each member veto ("not today", drops it from
      the wheel) or vote ("I want this", biases the spin). State is ephemeral,
      ref-counted in `server/realtime.ts`, broadcast live over the
      `session.onSession` SSE subscription, and enforced server-side in
      `spins.create` (vetoes filtered, votes folded into the weights via
      `applyVetoes`/`applyVoteWeights` in `shared/session.ts`, tested). Votes
      clear after each spin; "Clear round" resets everything.
- [x] Dietary constraints (per person, per session) — each member can "avoid"
      tags for the round (e.g. someone's vegetarian today); the group respects
      the union and restaurants carrying an avoided tag drop from the wheel.
      `excludedDietaryTagIds`/`applyDietary` (`shared/session.ts`, tested),
      enforced server-side in `spins.create`, live via `session.dietary` +
      `onSession`, "Avoid today" chips in the round panel.
- [x] "Rotate cuisines" fairness variant — per-wheel `rotateCuisines` toggle
      (migration `0005_wheel_rotate_cuisines.sql`) that damps a just-picked
      cuisine and boosts neglected ones, composing with fairness + votes
      (`applyCuisineRotation` in `shared/weight.ts`, tested).
- [x] Group-fairness stats — `picksByPerson` (`shared/stats.ts`, tested) drives
      a "Who's picking" bar breakdown on shared wheels so one person isn't
      always deciding.

### Phase 4 — Grow (ongoing)
- [ ] PWA + mobile share-target; "add this place to our wheel" from a link.
- [ ] Places/maps autocomplete when adding restaurants (name, geo, hours).
- [ ] Notifications ("lunch poll opens at 11:30").
- [ ] Multi-provider auth; export/import wheels.

---

## 6. One-line summary

Good bones and genuinely good product instincts (smart exclusion, tag
intersection, the wheel craft) — **fix the landing bug and the tag scoping,
put real tests under the new features, then turn "shared database" into "shared
moment" and "random" into "fair."** That's the path from clever demo to
something a team opens every day at 11:45.
