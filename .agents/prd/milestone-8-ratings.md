# PRD — Milestone 8: "How was it?" — post-spin ratings

**Status:** Built · pending review + deploy · **Branch:** `claude/roadmap-feature-dev-nc6r5b` · **Date:** 2026-07-12

## Problem
The wheel decides lunch but never learns whether the pick was any good. Every
spin is treated the same forever — a place the team hated has the same odds as
their favorite. There was no feedback loop closing decision → outcome.

## Decisions
- **Rate the meal, not the moment.** The rating UI lives in the **History tab**
  (you rate after you've eaten), not the result overlay (you haven't eaten yet).
  Three verdicts, best→worst: **Loved it / It was OK / Never again**.
- **Your spins, your call.** `spins.rate` is scoped to the spin's own author
  (`spunBy`), so on a shared wheel you rate your own picks — no contention, no
  "someone re-rated my lunch." Others' rated spins show a read-only verdict.
- **Latest rating per restaurant is a persistent preference** that biases future
  spins: loved ×1.6, ok ×1.0, never ×0.15 — strongly suppressed but never zero
  (the wheel-never-empties invariant that governs exclusion and soft-filters).
- **Composes, doesn't special-case.** `applyRatingWeights` has the exact shape
  of `applyVoteWeights`/`applyMoodBoost` and slots into both authoritative
  weighting chains (`spins.create`, `smart.pick`) after cuisine rotation and
  before votes — so a live team vote can still override a "never again" for one
  round.

## How it works
- **Pure seam** `shared/rating.ts` (+8 tests): `RATINGS`, `Rating`,
  `ratingLabel`, `isRating`, `ratingWeight`, `applyRatingWeights`.
- **Schema** (migration `0010_spin_rating.sql`): `rating enum('loved','ok','never')`
  on `spin_history`, nullable = unrated.
- **DB**: `rateSpin(spinId, wheelId, spunBy, rating)` (author-scoped update,
  returns the affected restaurantId or null); `getLatestRatings(wheelId)` →
  `Map<restaurantId, Rating>` (most-recent rated spin wins); `getSpinHistory`
  now selects `rating`.
- **Server**: `spins.rate` mutation (member-gated + author-scoped → NOT_FOUND
  otherwise); `applyRatingWeights(base, getLatestRatings(...))` folded into
  `spins.create` and `smart.pick`, with `hasRatings` added to the "any signal?"
  gate so ratings bias even an otherwise-plain wheel.
- **Client**: History rows get a Smile/Meh/Frown control (own spins, editable,
  active state colored) or a read-only verdict (others' rated spins).

## Verification (local DB + live API + rendered UI)
- 203 tests green (incl. `shared/rating.test.ts` ×8).
- Live API: spin → `spins.rate` "loved" persists → history reflects it;
  rating a spin that isn't yours → `NOT_FOUND`.
- **Authoritative-pick proof:** with exclusion/fairness/rotation off, a
  restaurant rated "never" was picked **0/90** spins while the other five landed
  15–26 each — the rating biases the server pick, not just the display.
- Screenshot: History rating controls, active loved/never states.

## Deploy-gate
- `drizzle-kit migrate` against the live DB applies `0010` (stacks with the
  still-pending 0008/0009). The `rating` column is nullable, so pre-migration
  rows and the new code coexist; `getSpinHistory` reads the column with no
  fallback, so the column must exist before the new API serves history.

## Non-goals
- No result-overlay prompt (semantically premature — you rate after eating).
- No aggregate "team loved/hated" rollup in stats yet (latest-per-restaurant is
  the signal; a loved/avoid stats card is a clean follow-up).
- No decay of old ratings (latest wins; revisit if preferences go stale).
