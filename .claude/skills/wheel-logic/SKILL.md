---
name: wheel-logic
description: Business rules for Lunch Wheel's restaurant exclusion history and server-authoritative spin selection. Use whenever touching spins, exclusions, re-enabling, fairness/voting weights, or the spinHistory table — to avoid breaking the invariants that keep the wheel fair and honest.
---

# Lunch Wheel — exclusion & spin invariants

The "don't pick the same place twice" behaviour and fair spinning are the
product's core. These rules are subtle and easy to break. Source of truth:

- `shared/lunch.ts` — `classifySpins` (what counts as a lunch), the Taipei-day
  helpers (`taipeiDayIndex`, `startOfTaipeiDay`, `endOfTaipeiDay`)
- `shared/exclusion.ts` — `computeExclusions`, `computeExcludedIds`,
  `formatExclusionTimeLeft`, `DEFAULT_EXCLUSION_DAYS = 3`
- `server/db.ts` — `getExclusions(wheelId, windowDays)`, `recordSpin`,
  `reenableRestaurant`, `getSpinHistory`
- `server/routers.ts` — `spins.create` (the authoritative picker)
- `shared/pick.ts` (`pickWinner`), `shared/weight.ts` (`computeWeights`,
  `applyCuisineRotation`, `pickWeighted`), `shared/restaurantRating.ts`
  (`applyStarWeights`), `shared/session.ts` (`vetoedIds`, `voteCounts`,
  `applyVoteWeights`, `applyVetoes`, dietary helpers)
- `drizzle/schema.ts` — `spinHistory`, `wheels.exclusionDays/fairnessMode/rotateCuisines`

## Invariants — do not break

0. **A spin is a lunch** unless it is `skipped`, and provided it was accepted OR
   the same person did not spin again on the same wheel later that Taipei day
   (`classifySpins`). The unit is the person: Ben's spin never replaces Amy's.
   A lunch that is not skipped and not the person's last spin of the day is
   `respun`. Every consumer — exclusion, stats, fairness, cuisine rotation,
   History, the today card — calls `shared/lunch.ts`; none re-derives it.
1. **Most-recent spin wins.** A restaurant's exclusion is decided only by its
   single latest spin inside the window; older spins are ignored.
2. **`manuallyReenabled` overrides exclusion.** If the latest spin row has
   `manuallyReenabled = true`, the restaurant is immediately eligible again.
3. **Exclusion by kind**, computed fresh from "now" on every read (no caching):
   lunch → until `spunAt + exclusionDays * 24h`; respun → until the end of that
   Taipei day; skipped → not excluded. `exclusionDays <= 0` = off.
4. **The server picks the winner — never the client.** `spins.create` receives
   `candidateIds` (a proposal) and re-validates server-side against: on-wheel,
   not excluded, not vetoed, not dietary-blocked. Empty eligible set → throw.
5. **Vetoes, votes, and dietary filters are read from the round's server-side
   marks** (`round_marks`, via `server/db.ts`), never trusted from the client payload.
6. **Weighting only applies when `fairnessMode || rotateCuisines || hasVotes ||
   hasRatings`;** otherwise it's uniform `pickWinner`. Compose in this order:
   `computeWeights` (or a uniform base) → `applyCuisineRotation` →
   `applyStarWeights` → `applyVoteWeights` → `pickWeighted`.
7. **Votes clear after each spin** (`clearVotes`); vetoes/dietary persist for the
   round until `clearSession`.

## TDD seam

Pure logic lives in `shared/*` with `.test.ts` siblings. ANY change to the rules
above must update/extend the matching test first (`shared/lunch.test.ts`,
`shared/exclusion.test.ts`,
`shared/weight.test.ts`, `shared/session.test.ts`, `shared/pick.test.ts`). The
server/client must import these helpers — never reimplement the math inline.

## Common mistakes

- Filtering exclusions on the client and trusting it on the server (re-validate!).
- Using spin *creation/record* time instead of `spunAt` for the window.
- Treating every spin in the window as excluding (only the latest one counts).
- Forgetting that mysql2 `db.execute()` returns a `[rows, fields]` tuple when
  reading history/stats with raw SQL — map over `rows`, not the tuple.
