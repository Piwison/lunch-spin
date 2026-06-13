---
name: wheel-logic
description: Business rules for Lunch Wheel's restaurant exclusion history and server-authoritative spin selection. Use whenever touching spins, exclusions, re-enabling, fairness/voting weights, or the spinHistory table — to avoid breaking the invariants that keep the wheel fair and honest.
---

# Lunch Wheel — exclusion & spin invariants

The "don't pick the same place twice" behaviour and fair spinning are the
product's core. These rules are subtle and easy to break. Source of truth:

- `shared/exclusion.ts` — `computeExclusions`, `computeExcludedIds`,
  `formatExclusionTimeLeft`, `DEFAULT_EXCLUSION_DAYS = 3`
- `server/db.ts` — `getExclusions(wheelId, windowDays)`, `recordSpin`,
  `reenableRestaurant`, `getSpinHistory`
- `server/routers.ts` — `spins.create` (the authoritative picker)
- `shared/pick.ts` (`pickWinner`), `shared/weight.ts` (`computeWeights`,
  `applyCuisineRotation`, `applyVoteWeights`, `pickWeighted`),
  `shared/session.ts` (`vetoedIds`, `applyVetoes`, dietary helpers)
- `drizzle/schema.ts` — `spinHistory`, `wheels.exclusionDays/fairnessMode/rotateCuisines`

## Invariants — do not break

1. **Most-recent spin wins.** A restaurant's exclusion is decided only by its
   single latest spin inside the window; older spins are ignored.
2. **`manuallyReenabled` overrides exclusion.** If the latest spin row has
   `manuallyReenabled = true`, the restaurant is immediately eligible again.
3. **Window math is `excludedUntil = spunAt + exclusionDays * 24h`**, computed
   fresh from "now" on every read. No caching. `exclusionDays <= 0` = off.
4. **The server picks the winner — never the client.** `spins.create` receives
   `candidateIds` (a proposal) and re-validates server-side against: on-wheel,
   not excluded, not vetoed, not dietary-blocked. Empty eligible set → throw.
5. **Vetoes, votes, and dietary filters are read from server session state**
   (`server/realtime.ts`), never trusted from the client payload.
6. **Weighting only applies when `fairnessMode || rotateCuisines || hasVotes`;**
   otherwise it's uniform `pickWinner`. Compose in this order: `computeWeights`
   → `applyCuisineRotation` → `applyVoteWeights` → `pickWeighted`.
7. **Votes clear after each spin** (`clearVotes`); vetoes/dietary persist for the
   round until `clearSession`.

## TDD seam

Pure logic lives in `shared/*` with `.test.ts` siblings. ANY change to the rules
above must update/extend the matching test first (`shared/exclusion.test.ts`,
`shared/weight.test.ts`, `shared/session.test.ts`, `shared/pick.test.ts`). The
server/client must import these helpers — never reimplement the math inline.

## Common mistakes

- Filtering exclusions on the client and trusting it on the server (re-validate!).
- Using spin *creation/record* time instead of `spunAt` for the window.
- Treating every spin in the window as excluding (only the latest one counts).
- Forgetting that mysql2 `db.execute()` returns a `[rows, fields]` tuple when
  reading history/stats with raw SQL — map over `rows`, not the tuple.
