# PRD — Milestone 7: Real Walk Times (Distance Matrix)

**Status:** Built · pending review + deploy · **Branch:** `claude/roadmap-feature-dev-nc6r5b` · **Date:** 2026-07-06

## Decisions
- **Refine the ranked segments only.** One Distance Matrix request per nearby
  search (origin = the searcher, destinations = the ≤12 ranked segments —
  under the API's 25-per-request cap). Ranking/dedupe/cap still run on the
  haversine estimates; the refined times then re-sort the final list. Bounded
  cost, and ordering flips between straight-line and walking distance are
  small at lunch-walk radii.
- **Estimates are never thrown away.** A failed request (API not enabled,
  quota, network), a failed element (`status !== "OK"`), or a coordless place
  keeps its haversine estimate. Every place carries
  `walkSource: "route" | "estimate"`.
- **Honest UI.** Route times read plain ("7 min walk"); estimates read
  "~7 min walk" with a tooltip. `formatWalk(minutes, approx)` in
  `shared/nearby.ts` owns the marker.
- **Same seam discipline.** Merging/re-sorting is pure
  (`shared/walkTime.ts`, +6 tests); the server only fetches
  (`walkingMatrix` in `server/places.ts`, +5 fetch-stubbed tests pinning the
  URL contract: pipe-joined destinations, `mode=walking`, first-row elements).

## How it works
`places.searchNearby`: map → `rankNearby` → `routableCoords(segments)` →
`walkingMatrix(origin, coords)` → `mergeWalkTimes(segments, elements)`
(overwrites walkMinutes/distanceMeters, flags walkSource, re-sorts
nearest-first) → response rows gain `walkSource`. On any matrix failure the
`mergeWalkTimes(segments, [])` result (all estimates) stands — exactly the
pre-M7 behavior plus the `~` marker.

## Components
- `shared/walkTime.ts` (new, +6 tests): `routableCoords`, `mergeWalkTimes`,
  `MatrixElement`, `WalkSource`.
- `shared/nearby.ts`: `formatWalk` gains the `approx` marker (test updated).
- `server/places.ts`: `walkingMatrix` (+ `server/places.walkingMatrix.test.ts`).
- `server/routers.ts`: refinement step in `searchNearby`.
- `client/src/components/NearbyDialog.tsx`: `walkSource` on rows; `~` +
  tooltip on estimates.
- Regenerated `api/index.js`.

## Success criteria / verification
- 195 tests green (`walkTime` seam ×6, `walkingMatrix` glue ×5, `formatWalk`
  marker) · `pnpm check` · `pnpm build` clean.
- Sandbox can't reach Google, so the routed path is pinned by the stubbed
  tests; the degradation path (no key/failed matrix → estimates + `~`) is the
  same code path as the seam's `elements: []` case.
- ⏳ Deploy-gate: enable **Distance Matrix API** on the existing
  `GOOGLE_MAPS_API_KEY` (Google Cloud Console → APIs & Services → Library).
  Without it, nearby search still works and shows `~` estimates by design.
  Live smoke: walk times lose the `~` and reflect street routing (e.g. a
  spot across a river ranks farther than its straight-line distance).

## Non-goals
- No caching of matrix results (each search is one cheap request).
- No transit/driving modes; no route polylines/maps.
- No re-weighting of spin bias by refined times (weights aren't part of the
  search response today).
