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

1. [x] Join broken — invitee opens the REAL invite link (/join/:token) but "joins,
       nothing changes": not shown as a member / can't see the wheel.
       THREE fixes shipped:
       1. wheels.get (carries .members, read by WheelMembers/the owner's "Team" panel)
          never refreshed after first load — someone joining wouldn't show up until a
          manual page reload. Fixed: WheelApp.tsx now polls it every 3s once the wheel
          is known shared (matches the existing session.state/spins.latest pattern).
       2. JoinWheel.tsx's success handler never invalidated wheels.list — if the
          invitee already had the app open earlier in the same browser session,
          WheelSelector's sidebar would render its stale pre-join snapshot right after
          the redirect. Fixed: invalidates wheels.list + wheels.get(id) on join success.
       3. (Most likely THE real root cause) A NOT-yet-signed-in invitee clicking
          "SIGN IN TO JOIN" would complete Google OAuth and land on "/" — never back on
          /join/:token — so wheels.join was NEVER CALLED for a first-time invitee.
          CORRECTION to the earlier note here: the culprit isn't server/_core/oauth.ts
          (that route, /api/oauth/callback, is dead Manus-era code — getLoginUrl() never
          points at it). The live handler is server/googleAuth.ts, which sits OUTSIDE
          _core/ (same pattern as server/places.ts's own "deliberately lives outside the
          guarded auth directory" comment) and is NOT one of AGENTS.md's Prohibited-#1
          files — so this needed the user's go-ahead to fix (given), not a hard stop.
          Fix: getLoginUrl(redirectTo?) now appends ?redirect=<path>; JoinWheel's sign-in
          link passes `/join/:token`. googleAuth.ts carries it through the round-trip via
          a new g_oauth_redirect cookie (same shape as the existing state/verifier temp
          cookies) — preserved across the canonical-origin bounce too — and the callback
          redirects there instead of a hardcoded "/". safeRedirectPath() (exported, unit
          tested — server/googleAuth.test.ts, 9 cases) only allows a single-leading-slash
          same-origin path, rejecting `//`, `/\`, and scheme-bearing values (open-redirect
          guard) and defaulting to "/" on anything else. COOKIE_NAME / session-token
          issuance / CSRF state-comparison logic untouched.
       Still unresolved: whether the wheel_members row actually persists on the LIVE DB
       (known failure mode #2 — migrations generated≠applied) can't be verified from this
       sandbox (no DATABASE_URL). Live smoke-test both the already-signed-in and
       not-yet-signed-in invitee paths after deploy.
2. [x] Shared/guest views default to LIGHT mode.
       DECISION: force light ONLY on /w/ (GuestWheel) and /join (JoinWheel) — ignore
       OS/localStorage on those routes. Logged-in app keeps light-default + working toggle.
       DONE: App.tsx keys ThemeProvider on route (switchable=false, defaultTheme="light"
       for /w/ and /join/); removed GuestWheel's ThemeToggle so there's no dark option there.
3. [x] Replace top-right SIGN OUT button with a profile AVATAR → dropdown.
       Where: WheelApp.tsx header (:357-381). Menu items (v1): name+email header,
       Default wheel (#5), Theme toggle (MOVED off header into menu), Sign out.
       The standalone header ThemeToggle goes away. (Office is NOT here — #4 made it
       a per-wheel setting, so there's no user-level office.)
       DONE: avatar button (gradient initial, matches the old name-pill styling) opens
       a DropdownMenu: name+email label, "Default wheel" (jumps to it, or a disabled
       "star one in the sidebar" hint if unset), theme toggle, sign out (destructive
       variant). Client-only — api/index.js unchanged.
4. [x] Per-wheel DISTANCE MODE — walking time from the wheel's origin to each restaurant.
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
       DONE: migration 0012 (wheels.distanceEnabled/originLat/originLng/originLabel,
       restaurants.walkSeconds). Pure seam shared/wheelDistance.ts (partitionForDistance/
       chunk/extractWalkSeconds, 14 tests) + orchestration server/distance.ts
       (recomputeWheelDistances, maybeComputeOneDistance — best-effort, never throws to
       the caller; graceful-degradation tests). server: setWheelOrigin/setRestaurantCoords/
       setRestaurantWalkSeconds (db.ts); wheels.setDistanceOrigin (owner-only, requires
       coords to enable, recomputes on save) + wheels.recomputeDistances (member-gated
       manual refresh) (routers.ts); restaurants.add + places.addNearby call
       maybeComputeOneDistance best-effort. Client: WheelSelector's WHEEL SETTINGS dialog
       gets a Distance mode section (toggle, label, Maps-link "Look up", "Use my current
       location", separate "Save distance settings" button since it's its own async flow);
       RestaurantTab shows a "Distances from {label}" bar (nearest-first sort toggle +
       Recompute) when enabled, "~N min"/"no location" chip per row; WheelApp spin-result
       modal shows the winner's walk time. Chunks Distance Matrix requests at 25
       destinations/call.
       DEPLOY-GATE: apply migration 0012 to the live DB. Needs Distance Matrix API enabled
       on GOOGLE_MAPS_API_KEY (degrades to no-op — walkSeconds stays null — if missing,
       same graceful-degradation contract as the located-wheel feature).

       POST-MERGE INCIDENT (2026-07-15): migrations 0011/0012 were merged to main but not
       applied to the live DB (exactly the deploy-gate above) — broke EVERY sign-in
       (upsertUser's INSERT now lists defaultWheelId, which didn't exist yet) plus
       wheels.list/restaurants.list for anyone already signed in. Root cause confirmed via
       live Vercel runtime logs, not guesswork. Fixed by the user running
       `DATABASE_URL='<prod>' pnpm exec drizzle-kit migrate` directly — no code change
       needed, the code was correct, the live schema just hadn't caught up. Lesson: a
       DEPLOY-GATE checklist item in a PR description is not enough by itself — it needs to
       actually block or be verified before/immediately after merge, since "merged" reads
       as "done" under time pressure.

       BUG FIX (2026-07-15): pasting a Maps link and looking up an origin, then clicking
       the (first, more prominent) "Save Settings" button instead of the separate "Save
       distance settings" button below it, silently discarded the resolved location — it
       only ever lived in local form state; "Save Settings" only called wheels.update, never
       setDistanceOrigin. Root-caused (not patched): the two-independent-save-buttons
       design was itself the bug. Fixed by unifying into ONE save action — the single "Save
       Settings" button now calls both wheels.update and wheels.setDistanceOrigin together
       (Promise.all), closes the dialog and shows one toast only if both succeed, and keeps
       the dialog open with the specific inline error if either fails, so a distance-mode
       edit can never be silently lost again.

       UX FOLLOW-UP (2026-07-15): wheel settings were only reachable via the sidebar's
       kebab (⋮) menu — reported as inconvenient. Grilled and resolved: added a second
       entry point, a gear icon pinned top-right of the Wheel tab's content (owner-only,
       works for personal AND shared wheels — unlike the Team panel, which only renders on
       shared wheels). The kebab menu's Settings item stays too (useful without opening the
       wheel first). Implementation reuses the existing registerCreateOpener imperative-
       opener pattern (WheelSelector already does this for the create-wheel dialog) as
       registerSettingsOpener, so the dialog/state/mutations aren't duplicated — the gear
       icon just calls into WheelSelector's existing settings dialog for the selected wheel.
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
