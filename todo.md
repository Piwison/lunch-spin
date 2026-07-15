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

## Round 7 — UX from real testing
- [x] Auto-open the user's first wheel on login (no re-picking every visit); first-run card still shown at zero wheels
- [x] Spin "suddenly faster then stop" — velocity discontinuity at the free-spin→land hand-off;
      quad ease-out with duration set so its initial speed equals the free-spin speed (no lurch)
- [x] Paste a Google Maps link → "Look up" resolves the place name (Place Details / Find Place,
      short-link expansion): shared/mapLink.ts (pure, +tests), server/places.ts resolvePlaceLink
      (+stubbed tests), places.resolveLink router; RestaurantTab prefills name + matched cuisine tag
- [x] Extra bottom padding on the fixed mobile nav so it isn't clipped on devices w/o safe-area inset
- [x] Hid the "Import wheel" option (not useful for normal users; dialog kept dormant)
- [ ] DEPLOY-GATE: "Look up" needs Places API on GOOGLE_MAPS_API_KEY (already enabled) — verify live

## Bug Fixes (Round 6) — post-launch UX from real testing
- [x] SPIN never stops on shared wheels — animation effect restarted on every poll re-render;
      rewrote SpinWheel as a two-phase (free-spin → land) animation keyed only on isSpinning,
      reading segments/onSpinEnd/targetId from refs so re-renders can't restart it
- [x] SPIN ~3s dead-wait before moving — now starts spinning instantly on click and decelerates
      onto the server-chosen winner when it arrives (hides the serverless round-trip)
- [x] Too many filter tags — filters now list only tags actually attached to a restaurant on the
      wheel (the M6 predefined catalog is 31 tags), in both WheelApp and RestaurantTab
- [x] Mobile tab bar scrolled away — docked the Wheel/Restaurants/History nav fixed to the
      viewport bottom (safe-area padding + content bottom-padding so nothing hides behind it)

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

## Round 9 — real-user testing (reported 2026-07-14; specs resolved via grill, NOT STARTED)

Status: RECORDED + SPEC'D. Ready to implement; not yet started. Gate each with
pnpm check && test && build, and rebuild api/index.js for any server/ or shared/ change.

1. [ ] Join broken — invitee opens the REAL invite link (/join/:token) but "joins,
       nothing changes": not shown as a member / can't see the wheel.
       Where: JoinWheel.tsx → wheels.join (routers.ts:170) → addWheelMember (db.ts:166).
       Mutation returns success (they see "JOINED!"), so addWheelMember didn't throw.
       getUserWheels DOES include joined wheels, so the sidebar isn't the cause.
       PLAN: REPRODUCE FIRST against live — confirm the wheel_members row actually
       persists on the live DB (known failure mode #2: migrations generated≠applied),
       and that both invitee AND owner rosters refresh (wheels.get isn't polled — likely
       a missing invalidate/refetch after join on both sides). Fix root cause, one guard.
2. [x] Shared/guest views default to LIGHT mode.
       DECISION: force light ONLY on /w/ (GuestWheel) and /join (JoinWheel) — ignore
       OS/localStorage on those routes. Logged-in app keeps light-default + working toggle.
       DONE: App.tsx keys ThemeProvider on route (switchable=false, defaultTheme="light"
       for /w/ and /join/); removed GuestWheel's ThemeToggle so there's no dark option there.
3. [ ] Replace top-right SIGN OUT button with a profile AVATAR → dropdown.
       Where: WheelApp.tsx header (:357-381). Menu items (v1): name+email header,
       Default wheel (#5), Theme toggle (MOVED off header into menu), Sign out.
       The standalone header ThemeToggle goes away. (Office is NOT here — #4 made it
       a per-wheel setting, so there's no user-level office.)
4. [ ] Per-wheel DISTANCE MODE — walking time from the wheel's origin to each restaurant.
       (Redesigned from "per-user office" after PM grill: home vs office, privacy,
       and "not all wheels relate to the office" pushed it onto the wheel.)
       DECISIONS:
       - Lives as a toggle in WHEEL SETTINGS (owner-only; editWheel dialog in
         WheelSelector). OFF by default; fully optional, nothing is gated on it.
       - New wheel columns (migration — apply to live DB, deploy gate): distanceEnabled
         (bool, default false), originLat, originLng, originLabel (default "Office",
         editable — personal wheels may relabel e.g. "Home").
       - Shared wheels: ONE shared origin, framed as "Office / meeting point", set by
         the owner and team-visible (a workplace, so acceptable). Home is steered to
         personal wheels only — we don't expose members' homes.
       - Origin input (in wheel settings): paste a Google Maps link (reuse
         resolvePlaceLink) OR "use my location" (geolocation). Owner-only.
       - Metric: WALKING TIME via existing walkingMatrix() (Distance Matrix, mode=walking),
         formatted with shared/walkTime.ts. Requires Distance Matrix API (deploy gate).
       - Coverage: restaurants with coords or a saved Maps link (resolve + CACHE lat/lng
         on the restaurant row — a restaurant is a public place). Name-only → "no
         location", skipped.
       - Compute: auto when the origin is saved (all located restaurants) + auto for each
         newly-added restaurant; manual "Recompute" button too. Recompute all when the
         origin changes. Because the origin is a single per-wheel value, walk-times are
         the SAME for everyone → persist walkSeconds (nullable) on the restaurant row
         (NOT per-user), members read it.
       - Display: inline "~N min" on Restaurant-tab rows + optional "nearest first" sort
         toggle; also show the winner's walk-time in the spin result modal.
5. [x] Default wheel (auto-opened on entry).
       DECISIONS: users.defaultWheelId column (migration, deploy gate). Star/pin toggle
       on each wheel row in WheelSelector to set it; profile menu shows current default.
       WheelApp auto-open (:118-124) uses defaultWheelId, falls back to wheels[0].
       DONE: migration 0011_default_wheel.sql (users.defaultWheelId, nullable, no
       default needed). server: setUserDefaultWheel (db.ts) + wheels.setDefault
       (routers.ts, membership-gated, wheelId: number|null). Client: star toggle per
       row in WheelSelector (WheelActionsMenu's sibling, not nested — avoids
       button-in-button); WheelApp auto-open prefers user.defaultWheelId, falls back to
       wheels[0]. auth.me already re-fetches the full DB user row per-request
       (server/_core/sdk.ts authenticateRequest → db.getUserByOpenId), so
       defaultWheelId flows through with no change to the prohibited session-contract
       files (context.ts/sdk.ts/trpc.ts untouched).
       DEPLOY-GATE: apply migration 0011 to the live DB (generated ≠ applied).
       Profile-menu display of the current default is wired in #3, next.
6. [x] Add-restaurant tags: fewer presets + user-extensible per category.
       Where: RestaurantTab.tsx TagSelector (:156).
       DECISIONS: show a CURATED 5 presets per category (Cuisine + Food Type) with a
       "More" expander revealing the rest (nothing removed). "Create tag" flow lets the
       user pick the category (Cuisine / Food Type / Custom) — createCustom must accept a
       category param so the new tag lands under that heading.
       DONE: curated 5/5 (Japanese/Chinese/Italian/Thai/Korean,
       Pizza/Burgers/Noodles/Salad/Sandwiches) + "+N more" toggle; create-tag dialog has a
       Cuisine/Food Type/Custom picker; createCustomTag (db.ts) + tags.createCustom
       (routers.ts) take a category param (default "custom").
7. [x] Notification chips too long → duration: 3000 on the Toaster in App.tsx
       (ThemedToaster toastOptions). Applies to ALL toasts.
       DONE.
8. [x] Spin takes too long → users lose patience. Make it SNAPPIER, ~3s total,
       still a smooth stop (no lurch — keep the velocity-matched hand-off).
       Where: SpinWheel.tsx — reduce MIN_LAND_ROTATIONS (4) and the derived landDuration
       so the deceleration is ~2s (total ~3s with typical server latency); keep the
       free-spin→land velocity match. (Free-spin can't be hard-capped without the winner,
       but the landing is the main lever.)
       DONE: MIN_LAND_ROTATIONS 4→2 (landing now ~1.6-2.4s; velocity-match formula is
       rotation-count-invariant so the no-lurch guarantee still holds).
