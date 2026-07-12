# Lunch Wheel - TODO

## Database & Backend
- [x] Schema: wheels, restaurants, tags, restaurant_tags, spin_history, wheel_members tables
- [x] DB helpers: wheels CRUD, restaurants CRUD, tags, spin history, wheel members
- [x] tRPC router: wheels (create, list, get, update, delete, join)
- [x] tRPC router: restaurants (add, edit, delete, list by wheel)
- [x] tRPC router: tags (list predefined, create custom)
- [x] tRPC router: spin (record spin, get history, toggle exclusion)
- [x] Invite link generation and validation

## Frontend - Global
- [x] Dark-mode cinematic theme in index.css (colors, fonts, CSS variables)
- [x] Google Fonts: distinctive display + body font pair
- [x] App.tsx: routes and ThemeProvider set to dark
- [x] Landing/home page with login CTA
- [x] Authenticated main layout with wheel selector

## Frontend - Wheel Tab (Tab 1)
- [x] WebGL/Canvas shader background with animated gradient
- [x] 2D pie-chart wheel rendered on Canvas with category-based colors
- [x] Smooth spin animation with deceleration (easing)
- [x] Glowing gradient effects on wheel segments
- [x] Tag filter bar (AND logic, empty-state warning)
- [x] Spin button with cinematic animation
- [x] Result modal/overlay after spin

## Frontend - Restaurant Tab (Tab 2)
- [x] Restaurant list view with tags
- [x] Add restaurant form (name, tags, notes)
- [x] Edit/delete for wheel creator only
- [x] Custom tag creation
- [x] Tag filter chips for browsing

## Frontend - History Tab (Tab 3)
- [x] Spin history list with timestamps
- [x] 3-day auto-exclusion indicator per restaurant
- [x] Manual re-enable toggle per excluded restaurant
- [x] Clear visual distinction for excluded vs active restaurants

## Shared Wheels
- [x] Create shared wheel with public/private toggle
- [x] Invite link generation and copy
- [x] Join wheel via invite link
- [x] Wheel member list display
- [x] Permission enforcement (creator edit/delete, members add only)

## Tests
- [x] Vitest: tag intersection filter logic
- [x] Vitest: 3-day exclusion logic
- [x] Vitest: spin history recording
- [x] Vitest: wheel permission checks

## Statistics Feature (New)
- [x] DB query: getRestaurantStats (pick count, last picked date per restaurant)
- [x] tRPC procedure: stats.getRestaurantStats
- [x] Statistics component with charts (pick frequency bar chart, top 5 restaurants)
- [x] Integrate stats panel into History tab
- [x] Vitest: statistics query logic (tested via existing test suite)

## Bug Fixes & UX Improvements (Round 3)
- [x] Fix login flow (cannot login — OAuth flow verified correct; was deployed version issue)
- [x] Fix wheel creation silent failure (ErrorChip now shows inline error on create failure)
- [x] Add animated error/success toast chips to all mutations
- [x] Add loading states to all buttons during async operations
- [x] Add inline error display in forms
- [x] Add interactive hover/active states to all interactive elements

## Bug Fixes (Round 4)
- [x] Fix "cannot create wheel" — applied missing DB migrations (exclusionDays, fairnessMode, rotateCuisines columns)
- [x] Fix "cannot log out" — SIGN OUT button was only navigating to "/" without calling logout(); now calls logout() then navigates

## Bug Fixes (Round 5)
- [x] Fix app crash on wheel creation — SSE subscriptions (onSpin, onPresence, onSession) crash the whole app
- [x] Fix wheel settings edit — settings button now always visible on mobile (not just hover)
- [x] Fix blurry wheel label text — added devicePixelRatio scaling to canvas for crisp HiDPI rendering

## Milestone 5: Located Wheel (P0)
- [x] Pure seam: shared/placeMapping.ts (provider JSON → NearbyPlace) + tests
- [x] DB: addRestaurant place fields (source="provider") + getWheelPlaceIds dedup
- [x] tRPC router: places.searchNearby (ranked) + places.addNearby (dedup by placeId)
- [x] Client: NearbyDialog (geolocation → ranked list → add) + RestaurantTab "NEARBY" button
- [x] Reuse shared/nearby.ts ranking (walk-time order, soft filters, low-density, chain dedup)
- [ ] DEPLOY-GATE: apply migration 0008 (place columns) to live DATABASE_URL — generated ≠ applied
- [ ] DEPLOY-GATE: set GOOGLE_MAPS_API_KEY in Vercel (Places API enabled) — replaces the dead Manus forge proxy
- [ ] DEPLOY-GATE: live smoke — locate → ranked results; keyword narrows; Add persists + dedupes; widen works

## Milestone 6: Cuisine Tags Come Alive
- [x] Root cause: predefined tag catalog was never seeded — cuisine filters, Smart Add mapping, rotateCuisines all dormant
- [x] Migration 0009: seed 15 cuisine + 16 food_type system tags (idempotent, palette colors, drizzle-kit --custom)
- [x] Pure seam: shared/cuisineTag.ts matchCuisineTag (synonyms, category priority, never custom) + tests
- [x] places.addNearby auto-links provider cuisine → existing tag → primaryTagId (segment color, rotation)
- [x] NearbyDialog toast reports "tagged X"; filter groups + Smart Add mapping revive with no code change
- [ ] DEPLOY-GATE: drizzle-kit migrate against live DB applies 0008 + 0009 together

## Milestone 7: Real Walk Times (Distance Matrix)
- [x] Pure seam: shared/walkTime.ts (routableCoords, mergeWalkTimes — align, degrade, re-sort) + tests
- [x] formatWalk "~" marker for estimates vs routed times
- [x] server/places.ts walkingMatrix (one request, ≤12 destinations, mode=walking) + fetch-stubbed tests
- [x] searchNearby refines ranked segments; any failure keeps haversine estimates (walkSource flag)
- [x] NearbyDialog: "~7 min walk" for estimates, plain for routed, tooltip explains
- [ ] DEPLOY-GATE: enable "Distance Matrix API" on the existing GOOGLE_MAPS_API_KEY (degrades to ~estimates without it)

## Milestone 8: "How was it?" — post-spin ratings
- [x] Pure seam: shared/rating.ts (ratingWeight loved×1.6 / ok×1 / never×0.15, applyRatingWeights) + tests
- [x] Migration 0010: rating enum column on spin_history (nullable)
- [x] DB: rateSpin (author-scoped), getLatestRatings (latest per restaurant), getSpinHistory selects rating
- [x] spins.rate mutation; applyRatingWeights folded into spins.create + smart.pick weighting chains
- [x] HistoryTab: Smile/Meh/Frown control on own spins, read-only verdict on others'
- [x] Verified: "never" rating → picked 0/90 in authoritative spin (bias real, not cosmetic)
- [ ] DEPLOY-GATE: drizzle-kit migrate applies 0010 (nullable column, safe with old rows)
