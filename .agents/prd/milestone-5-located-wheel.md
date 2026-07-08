# PRD — Milestone 5: Located Wheel (P0)

**Status:** Built · pending review + deploy · **Branch:** `claude/roadmap-feature-dev-nc6r5b` · **Date:** 2026-07-04

## Decisions (locked)
- **Straight-line P0.** Walking time is a haversine estimate from the searcher's
  location → `estimateWalkMinutes`, never radial metres on screen. A Distance
  Matrix upgrade is a later, drop-in change behind the same pure seam.
- **Places become real restaurants.** A picked nearby place is persisted onto the
  wheel as a normal `restaurants` row with `source="provider"` + `placeId`
  (schema fields shipped in migration `0008_place_fields`). It then spins,
  excludes, and shows history exactly like a user-typed spot.
- **De-dup by `placeId`.** The same physical restaurant can't be added twice;
  user-typed rows (null `placeId`) are never affected.
- **Soft filters, never empties.** Ranking reuses the existing tested
  `shared/nearby.ts` — chain de-dup (nearest wins), walk-time order, soft
  price/open re-ranking, chain demotion, low-density flag. The wheel never empties.
- **Location is ephemeral.** Coordinates are used for one search and never stored.
- **Server stays authoritative.** `places.searchNearby` only *proposes*; nothing
  is written there and the winner is still picked server-side at spin time.
- **Pure seam:** provider-JSON → domain translation lives in
  `shared/placeMapping.ts` (+ tests), matching the repo's `shared/*` convention.
  No `server/_core/oauth|sdk|context|trpc` / `shared/const.ts` / auth edits.
- **Direct Google Places API, not the Manus proxy.** `server/_core/map.ts` is a
  Manus-platform template ("credentials automatically injected") that's dead
  weight since this repo migrated off Manus — PRODUCTION.md says outright
  "Forge/storage env vars are not required." `server/places.ts` (new, outside
  the guarded `server/_core/` directory) calls Google's Places API directly with
  a self-hosted `GOOGLE_MAPS_API_KEY`, the same pattern as this repo's
  `GOOGLE_CLIENT_ID`/`SECRET`.

## Problem
The wheel only knows restaurants you type in. New users face a blank wheel, and
even active wheels miss the "what's actually walkable from here right now" case.
A place-fields schema shipped as groundwork (migration `0008`) but had no server
route or UI wiring it up, and the repo's only maps integration
(`server/_core/map.ts`) was a leftover Manus-platform proxy with no self-hosted
equivalent.

## Goal
Let a member fill a wheel from real nearby restaurants in a few taps — ordered by
walking time, de-duplicated, and honest about price/open status — while the spin
stays server-authoritative and the location is never stored.

## User stories
- **US1 — Find nearby** ✅: I open "Add nearby" → grant location → see nearby
  restaurants ranked by walking time, with price, cuisine, and an open-now hint.
- **US2 — Add to wheel** ✅: I tap "Add" on a place → it becomes a restaurant on
  the wheel (with a working Google Maps link for post-spin DIRECTIONS); it shows
  "Added" and can't be double-added.
- **US3 — Craving filter** ✅: I type a keyword ("ramen") → results narrow to it.
- **US4 — Thin area** ✅: when few spots are walkable, a low-density banner offers
  "Widen search" (radius doubles, capped at 5 km).

## How it works
- **Pure seam** (`shared/placeMapping.ts`, + tests): `haversineMeters`,
  `cuisineFromTypes` (maps Google `types[]` → a cuisine label or null — never
  invents one), `normalizePriceLevel` (0..4 → our 1..4), and `toNearbyPlace` /
  `mapProviderResults` producing the `NearbyPlace` shape `shared/nearby.ts` ranks.
- **Server** (`server/places.ts` + `server/routers.ts` → `places` router):
  - `server/places.ts`: `searchNearbyRestaurants` fetches Google's Places
    nearbysearch endpoint directly (`GOOGLE_MAPS_API_KEY`); `isPlacesConfigured`
    reports whether that key is set. Deliberately outside `server/_core/`.
  - `searchNearby` (mutation, read-only): membership-gated; calls
    `searchNearbyRestaurants`, maps + `rankNearby`s the rows, and marks each with
    `alreadyAdded` (via `getWheelPlaceIds`). Degrades cleanly:
    `PRECONDITION_FAILED` when the key isn't configured, `BAD_GATEWAY` on a
    provider/network error.
  - `addNearby` (mutation): de-dupes by `placeId`, then persists via
    `addRestaurant(..., place)` with `source="provider"`.
- **DB** (`server/db.ts`): `addRestaurant` gains an optional `PlaceFields` arg
  (lat/lng/address/priceLevel/cuisine/placeId → provider source);
  `getWheelPlaceIds(wheelId)` powers de-dup.
- **Client** (`client/src/components/NearbyDialog.tsx`, opened from
  `RestaurantTab`'s new "NEARBY" button): geolocation → search → ranked list with
  walk time (`formatWalk`), price, cuisine, open-now, address; per-row Add;
  grouped-chains note; low-density "widen" affordance; graceful permission-denied
  and not-configured states.

## Components
- `shared/placeMapping.ts` (new, +12 tests).
- `server/places.ts` (new): direct Google Places API client, outside `_core/`.
- `server/db.ts`: `PlaceFields`, `addRestaurant(place?)`, `getWheelPlaceIds`.
- `server/routers.ts`: `places` router (`searchNearby`, `addNearby`).
- `client/src/components/NearbyDialog.tsx` (new) + `RestaurantTab.tsx` button.
- `.env.example`: `GOOGLE_MAPS_API_KEY` (replaces the dead Manus forge vars for
  this feature).
- Regenerated `api/index.js` (server changed).

## Non-goals
- No Distance Matrix / real routing (haversine P0); no map render; no autocomplete.
- No cuisine→tag auto-linking (cuisine is stored as a string for now).
- No auth/session/`shared/const.ts` changes; no new columns (migration 0008 already
  defined them).

## Success criteria
- `pnpm check` clean · `pnpm test` green (incl. `shared/placeMapping.test.ts`,
  178 tests) · `pnpm build` ok · `api/index.js` committed in the same change.
- ⏳ **Deploy-gate (must verify on live, sandbox can't reach the proxy/DB):**
  1. **Migration 0008 applied** to the live `DATABASE_URL` — the place columns
     (`placeId`, `lat`, `lng`, `address`, `priceLevel`, `cuisine`, `openHours`,
     `source`) must actually exist, not just be generated. (`addNearby` writes
     them; a stale DB throws on insert.)
  2. `GOOGLE_MAPS_API_KEY` set in the Vercel env (a Maps Platform key with
     Places API enabled), or "Add nearby" surfaces the "not available on this
     server" state by design.
  3. Live smoke: grant location → results ranked by walk time; keyword narrows;
     Add persists + shows "Added" + de-dupes; widen works in a thin area.

## Risks / notes
- **DB migration must be applied** before `addNearby` can succeed — this is the
  #1 deploy-gate item (see AGENTS.md failure mode #2: generated ≠ applied).
- Haversine underestimates real walking distance (straight line); acceptable for
  ordering at P0. Upgrade path: swap `toNearbyPlace`'s distance source for a
  Distance Matrix call — the pure seam and everything downstream stay put.
- Chain de-dup is wired through `rankNearby` but the mapper reports `chain: null`
  (the nearbysearch payload has no reliable brand key), so no rows fold today;
  the plumbing lights up when a provider with brand data is added.
