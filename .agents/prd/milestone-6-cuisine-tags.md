# PRD — Milestone 6: Cuisine Tags Come Alive

**Status:** Built · pending review + deploy · **Branch:** `claude/roadmap-feature-dev-nc6r5b` · **Date:** 2026-07-06

## Discovery that reframed the milestone
The planned feature was "auto-link provider cuisine → wheel tag" (Milestone 5's
known gap). Investigating the tag system revealed the real problem: **the
predefined tag catalog was never seeded.** The schema (`createdBy` NULL =
predefined system tag), the todo ("tags: list predefined, create custom"), and
the UI (CUISINE / FOOD TYPE filter groups) all assume system tags exist — but
no seed ever shipped, and `createCustomTag` only creates `custom`-category
tags. So Smart Add's cuisine mapping, the rotate-cuisines wheel setting, and
both cuisine filter groups were **dormant on every wheel**: there was no way to
obtain a cuisine-category tag through the app at all.

## Decisions
- **Seed, don't invent.** Milestone 1's locked rule ("map to existing cuisine
  tags only — never invents tags") stays intact. The migration is what makes
  the tags exist; runtime code still only ever *matches*.
- **Catalog aligned with the matchers.** Seed names exactly match what
  `shared/placeMapping.ts` emits from provider types and what
  `shared/parseAddList.ts` guesses from names: 15 cuisines + 16 food types.
- **Idempotent data migration** (`drizzle/0009_seed_predefined_tags.sql`,
  scaffolded via `drizzle-kit generate --custom` so drizzle owns the journal):
  every insert is guarded by `NOT EXISTS (name, category, wheelId IS NULL)` —
  re-running or a hand-seeded DB never duplicates.
- **Colors from the designed segment palette** (`client/src/lib/palette.ts`),
  so a tag's chip and the wheel segment it colors speak one language.
- **Pure seam:** `shared/cuisineTag.ts` (+6 tests) — case-insensitive,
  synonym-aware (`Barbecue→BBQ`, `Coffee Shop→Cafe`, …), cuisine-category wins
  over food_type on a name clash, and custom-category tags are never matched
  (a user's custom tag named "Japanese" must not silently own provider adds).

## How it works
- `places.addNearby` (server): after the placeId dedupe, `getTagsForWheel` →
  `matchCuisineTag(place.cuisine, tags)` → the matched tag id is passed to
  `addRestaurant`, becoming `primaryTagId` — the place gets its wheel-segment
  color, joins tag filtering, and participates in cuisine rotation. Response
  gains `taggedAs` so the client can say what happened.
- `NearbyDialog` (client): success toast reads "Added Rintaro · tagged
  Japanese" when a tag was linked.
- **Free riders** (no code change needed): Smart Add's `resolveAddList` now
  actually finds cuisine tags to map to; the wheel + restaurant-list FILTER BY
  TAGS panels now render their CUISINE and FOOD TYPE groups; `rotateCuisines`
  becomes functional once restaurants carry cuisine tags.

## Verification (local DB + live API + rendered UI)
- `shared/cuisineTag.test.ts`: 6 tests green (184 total).
- Migration applied locally: 31 predefined rows (15 cuisine / 16 food_type);
  raw re-run of the SQL left the count at 31 (idempotency proven).
- Live `places.addNearby`: cuisine "Japanese" → `taggedAs: "Japanese"`,
  restaurant row shows `primaryTagId` + tag `Japanese(cuisine, #e2674f)`;
  cuisine "Barbecue" → synonym-resolved `BBQ(food_type)`.
- Screenshots: FILTER BY TAGS now renders both seeded groups.

## Deploy-gate
1. Run `drizzle-kit migrate` against the live `DATABASE_URL` — applies 0008
   (place columns, still pending) **and** 0009 (tag seed) in one go.
2. Live smoke: filter panel shows CUISINE/FOOD TYPE; "Add nearby" (once
   `GOOGLE_MAPS_API_KEY` is set) tags provider places; Smart Add maps cuisines.

## Non-goals
- No backfill of cuisine tags onto existing provider-added restaurants (none
  exist in prod yet — the addNearby endpoint ships in this same PR).
- No user-facing management of predefined tags (they're global, system-owned).
