# PRD — Milestone 5: Taste Insights

**Status:** Spec locked 2026-07-04 · building · **Branch:** `claude/product-status-review-uvq160`

## Decisions (locked 2026-07-04, with the owner)
- **Feature = Taste Insights.** Confirmed by owner (feature pick).
- **Placement:** lead the existing History tab (already titled "INSIGHTS" above the
  spin list) — no new nav tab. (Owner UX recommendation, confirmed by proceeding.)
- **v1 cards confirmed:** Variety score · Cuisine mix (30d) · In-a-rut/streak ·
  Try-something-new nudge · Who's deciding (shared wheels).
- **Scope reality (discovered during the read-first gate):** two of the five confirmed
  cards ALREADY SHIP in `RestaurantStats.tsx` — "Due for a comeback"
  (`overdueRestaurants`) is the try-something-new nudge, and "Who's been picking"
  (`picksByPerson`) is who's deciding. We will NOT rebuild them (no duplication —
  karpathy). **Net-new v1 = Variety score, Cuisine mix, In-a-rut.** The section becomes
  complete once these land above the existing cards.
- **No backend, no migration:** the cuisine-annotated timeline is assembled client-side
  from the existing `spins.history` (gives `spunAt`, `restaurantId`, `restaurantName`)
  and `restaurants.list` (gives each restaurant's `tags[{category}]`). Primary cuisine
  of a restaurant = its first `category:"cuisine"` tag, else `null` → grouped as
  "Other". So `api/index.js` is untouched; nothing hits the server that didn't already.
- **Pure-logic seam:** all shaping lives in `shared/insights.ts` (+ `.test.ts`),
  matching the repo convention. `shared/stats.ts` is reused, not forked.

## Problem
The product is transactional: spin, close. The History tab shows *what* happened
(counts, comeback nudge, fairness) but not the *pattern* — is the group eating varied
or stuck in a rut? What cuisines dominate? There's no at-a-glance "how are we doing"
read that gives a reason to come back and a gentle push toward variety.

## Goal
Turn recorded spins into a living read of the group's eating habits: a headline
variety score, a 30-day cuisine mix, and a rut callout when the group keeps landing on
the same place/cuisine — sitting above the already-shipped comeback + fairness cards, so
the History tab becomes a real "History & Insights" surface. Pure presentation over
existing data; zero new backend.

## User stories
- **US1 — Variety at a glance:** As a regular, I see a 0–100 variety score with a
  one-line read ("9 places, 5 cuisines across 14 spins — good mix") so I know if we're
  adventurous or repetitive.
- **US2 — Cuisine mix:** I see which cuisines we've actually been eating over the last
  30 days as ranked bars, so imbalance ("70% Italian") is obvious.
- **US3 — In a rut:** When the last few spins cluster on one restaurant or cuisine, a
  callout names it ("Pizza Place — 3 of the last 5 spins"), so we notice the rut.

## How it works
- **Client assembles `SpinEvent[]`** in `HistoryTab` from its two existing queries: map
  `restaurantId → primaryCuisine` from `restaurants.list`, join onto the `spins.history`
  timeline → `{ restaurantId, restaurantName, cuisine, spunAt }[]`. No new query.
- **`shared/insights.ts` (pure)** shapes that array:
  - `withinDays(events, days, now?)` — window filter.
  - `varietyScore(events)` → `{ score, distinctRestaurants, distinctCuisines, totalSpins, read }`.
  - `cuisineMix(events)` → `{ cuisine, count, pct }[]` desc, `null`→"Other".
  - `currentRut(events, { window=5, threshold=3 })` → strongest recent cluster or `null`
    (prefers a restaurant-level rut over a cuisine-level one).
- **UI:** a new `TasteInsights` presentational component renders Variety (lead tile),
  Cuisine mix (bars, 30d), and the In-a-rut callout, using the existing card/bar styling
  and warm-appetite tokens. `HistoryTab` renders it above `RestaurantStats`.

## Components
- `shared/insights.ts` + `shared/insights.test.ts` (new) — the four pure functions.
- `client/src/components/TasteInsights.tsx` (new) — the three net-new cards.
- `client/src/components/HistoryTab.tsx` — build `SpinEvent[]`, render `<TasteInsights>`;
  update the section heading to "HISTORY & INSIGHTS" framing.

## Non-goals
- No new tRPC procedure, DB column, or migration. No server/_core/auth/const changes.
- No change to spin selection, exclusion, or fairness logic.
- Not rebuilding "Due for a comeback" / "Who's been picking" — they already exist.
- No per-user personal insights split (insights are per-wheel/group in v1).

## Success criteria
- History tab leads with a variety score + 30-day cuisine mix, and shows a rut callout
  when the last spins cluster; comeback + fairness cards remain below.
- `pnpm check` clean · `pnpm test` green incl. new `shared/insights.test.ts` ·
  `pnpm build` ok. `api/index.js` unchanged (client-only; no server/shared-imported-by-API change).
- Handles empty/thin data gracefully (0 spins, all-untagged, a single spin) with no crash.
- ⏳ Live smoke (deploy-gate): on a wheel with history, the three cards read correctly;
  hand checklist to owner (sandbox can't reach prod).

## Phases (each: check/test green)
1. **Pure seam** — `shared/insights.ts` + tests (TDD): variety, cuisineMix, currentRut, withinDays.
2. **UI** — `TasteInsights.tsx` + wire into `HistoryTab` with the client-side `SpinEvent[]` join.
3. **Verify** — rubric §5 recipe; fresh-context `code-reviewer`; deploy-gate; flip status.

## Risks / notes
- `spins.history` returns the full timeline (all spins, desc); windowing to 30d is a
  pure filter — fine. If a wheel has thousands of spins the payload is already what the
  History list loads today, so no new cost.
- Restaurants can have 0 or several cuisine tags; "primary = first cuisine tag" is a
  deliberate simplification — multi-cuisine places count once, untagged → "Other".
  Documented so it's not read as a bug.
- Variety score is a defined, explainable metric (distinct restaurants / total spins,
  banded into a read), not an opaque index — tests pin the bands.
