# Lunch Wheel — Post-MVP Roadmap (tracking)

Branch: `claude/post-mvp-review-roadmap-8cqtym`
Started: 2026-07-22

Legend: ⬜ todo · 🔄 in progress · ✅ done (gated: `pnpm check && pnpm test && pnpm build`) · 🔒 blocked (needs owner/ops action)

**Deploy path (STAGING.md):** merge a `claude/*` branch into `staging` → Vercel staging
deploy (isolated DB + OAuth) → sign in and click through → then merge to `main`. Apply
each migration to the **staging** DB first (its own cluster), then to prod.

> ### ⚠️ PENDING DB MIGRATIONS — apply before/at deploy
> Schema is fully generated (0000–0016; `drizzle-kit generate` = "no changes"). The
> new, **not-yet-applied** ones are **`0014`** (hot indexes), **`0015`**
> (`restaurant_ratings` + backfill) and **`0016`** (restaurant open-hours columns).
> `drizzle-kit migrate` is idempotent and
> journal-tracked, so **one command per env applies all pending in order** — no need to
> run them individually:
> ```
> DATABASE_URL='<staging>' pnpm exec drizzle-kit migrate   # verify on staging, then:
> DATABASE_URL='<prod>'    pnpm exec drizzle-kit migrate
> ```
> Both are non-destructive (add indexes / new table + INSERT; never touch existing
> columns). To see what prod has already: `SELECT tag FROM __drizzle_migrations`
> (or just run migrate — it only applies what's missing).

Every `server/`- or `shared/`-touching commit rebuilds & commits `api/index.js` in the
same commit. New logic lands in `shared/*.ts` with the test written first. Schema
changes ship a migration that must be **applied to the live DB** (not just generated).

---

## P2 — Quick wins (client/config only; no `api/index.js` change) — ✅ DONE

- ✅ QueryClient defaults — `staleTime:30s` + `refetchOnWindowFocus:false` in
      `client/src/main.tsx` (polled queries keep their explicit `refetchInterval`)
- ✅ Dev-gate the JSX-loc plugin — `@builder.io/vite-plugin-jsx-loc` only in
      `mode==='development'` (`vite.config.ts`); no `data-loc` attrs in prod DOM
- ✅ Vendor chunk split — `manualChunks` → react-vendor / radix-vendor / data-vendor.
      WheelApp chunk 73→46 KB gz; ~125 KB gz of vendor now in long-cache chunks
- ✅ Drop unused deps — removed `framer-motion`, `recharts`, `@aws-sdk/client-s3`,
      `@aws-sdk/s3-request-presigner` (0 imports; −42 packages incl. transitives)

## P1 — Scale & cost (server + client + migration)

- ✅ Consolidate shared-wheel polling → one `wheels.realtime` procedure returning
      `{ members, session, latestSpin }` (one membership check + 3 concurrent reads via
      `Promise.all`, one round-trip). `WheelApp.tsx` drops the `wheels.get` 3s poll and
      the `session.state` + `spins.latest` polls for a single `wheels.realtime` poll;
      presence stays its own 10s heartbeat. Result on an active shared wheel: 3s-band
      Vercel invocations 3→1, DB reads ~7→4 (now index-backed). `routers.ts` + client
      only — session-contract files untouched; `api/index.js` rebuilt.
- ✅ DB indexes → migration `drizzle/0014_productive_wilson_fisk.sql` (0013 was taken by
      the notifications feature) + schema `index()` entries. 11 indexes, all `CREATE INDEX`
      (non-destructive): `spin_history(wheelId,spunAt)` + `(restaurantId)`, `restaurants(wheelId)`,
      `restaurant_tags(restaurantId)` + `(tagId)`, `wheel_members(wheelId,userId)` + `(userId)`,
      `tags(wheelId)`, `notifications(wheelId,createdAt)`, `wheels(ownerId)` + `(inviteToken)`.
      Generated via `drizzle-kit generate`; `api/index.js` rebuilt (schema is in the bundle).
- 🔒 DEPLOY-GATE (owner): apply `0014` to live DB via `drizzle-kit migrate` — generated ≠ applied
      (known failure mode #2). Non-destructive, safe on existing rows.

## P0 — Activate what's already built (owner ops + my verify)

- 🔒 Owner: `drizzle-kit migrate` applies 0008–0013 to live DB; confirm columns/indexes
- 🔒 Owner: enable **Distance Matrix API** on `GOOGLE_MAPS_API_KEY` (Places API unchanged)
- ⬜ Me (after gates open): verify distance mode end-to-end; the "Recompute no-op" resolves
- ⬜ Me: re-run the instrumented join-redirect test, read logs, land the precise fix
      (Round 11 #1)

## P3 / P4 — New feature (spec first) + design pass

Scope evolved during design review (wireframes): now a **5-star rating system**
(Google-style) in the Restaurant tab + a star-based Team Taste card. Building in
green increments, fairness-core change deferred to last.

- ✅ Permission: members can **add + edit** restaurants; **delete** stays owner-only
- ✅ Foundation: `shared/restaurantRating.ts` (pure, TDD) + `restaurant_ratings` table
      (migration 0015 + backfill) + `restaurants.rate` / `restaurants.ratings` API
- ✅ Restaurant tab UI: row `★ avg` chip + ⋮ → detail sheet (star control, team avg,
      owner Edit/Delete)
- ✅ Switch spin-weighting source enum→star aggregate (`applyStarWeights`; behaviour-
      preserving anchors; wheel-logic + TDD) + History control migrated to stars
- ✅ Team Taste card (star-based) in History tab (`shared/tasteProfile.ts`, TDD)
- ✅ Post-spin rating nudge (result modal) + "Top rated" sort in Restaurant tab
- 🔒 DEPLOY-GATE (owner): apply migration 0015 (+ 0014) to the **staging** DB, verify on
      the staging URL, then apply to the live DB (`drizzle-kit migrate` per env — STAGING.md)
- ⬜ Design/a11y pass from owner-provided screenshots (shot-list in chat)

---

## Round 12 — owner requests 2026-07-23

### A. Open-hours filter — ✅ BUILT (migration 0016; batches with 0014/0015)
Shipped: `shared/openHours.ts` (15 tests) + migration 0016 + `places.fetchPlaceHours`
+ `server/openHours.ts` refresh + **server-side hard filter in `spins.create`** +
`restaurants.list` `openStatus`/`minutesUntilClose` + `restaurants.refreshHours` +
client chips / wheel filtering / closing-soon warning in the result modal.
Owner's rules honoured: closed = removed · unknown hours = kept · <30 min = warn only.

<details><summary>original investigation notes</summary>
Goal: for Google-Maps-sourced restaurants, store weekly opening hours and auto-drop
closed places at spin time.
- FINDING: `restaurants.openHours` (json) **already exists** (migration 0008) but is
  **always null** — `shared/placeMapping.ts` only maps `opening_hours.open_now` (a
  momentary boolean) into `open`, and nothing ever writes weekly hours. Dead column.
- Still needs migration **0016**: `hoursUpdatedAt` (timestamp, cache freshness — hours
  change) + `utcOffsetMinutes` (int, from Places `utc_offset_minutes`, so "is it open
  now" needs no tz database). `openHours` json is reused for the `periods` payload.
- Needs a Places **Details** fetch per place (Places API already enabled) — `openHours`
  is not in the nearby-search payload.
</details>

### B. Slow first load — ✅ OPTIMIZED (items 1–3, 5, 6)
Shipped: `Home` gates the WebGL shader + cursor RAF + `listPublic` behind `isGuest`
(signed-in visitors no longer render the marketing page before redirecting) and
prefetches the `WheelApp` chunk; fonts moved off the critical path (preload +
`media="print"` swap + noscript); analytics injected from JS only when configured
(was shipping a literal `%VITE_ANALYTICS_ENDPOINT%` → 404 every load); `useAuth`'s
localStorage write moved out of `useMemo`.
Not done: **#4 serverless/TiDB cold start** (infra-level — would need a warmer or
connection tuning) and merging the `auth.me → wheels.list → wheel data` waterfall
into one bootstrap procedure (bigger refactor; say the word).

<details><summary>original measured causes</summary>
1. A signed-in returning user renders the **entire marketing landing page first** —
   `Home` is eager (in the entry chunk), mounts a **WebGL shader** + a `requestAnimation
   Frame` magnetic-cursor loop + fires `wheels.listPublic`, and only *then* an effect
   sees `user` and redirects to `/app`, which lazy-loads the `WheelApp` chunk.
2. **Serial request waterfall**, each a separate serverless hop: `auth.me` → `wheels.list`
   → `wheels.get` + `restaurants.list` (+ `restaurants.ratings`).
3. **Render-blocking Google Fonts**: a plain `<link rel=stylesheet>` to fonts.googleapis
   .com in `<head>` (2 extra hosts before first paint), requesting Poppins **8 weights +
   italic** + Fredoka 4 weights.
4. **Serverless cold start**: `getDb()` opens a fresh mysql2 connection (TLS to TiDB) per
   cold lambda; module-scope cached, so only cold requests pay it.
5. Built `index.html` ships a literal **`%VITE_ANALYTICS_ENDPOINT%`** (env unset at build)
   → the browser requests a bogus relative URL every load.
6. `useAuth` does `localStorage.setItem(JSON.stringify(...))` **inside a `useMemo`** — a
   side effect on every render.
</details>

### C. Spin fairness — ✅ verified uniform, owner accepted (no code change)
- `pickWinner` is `floor(rng()*n)` over the eligible set; `pickWeighted` is correct
  proportional selection. 20k-trial simulation using the real `shared/pick.ts`: over 65
  spins, one place reaching **6 picks is normal** (expected max ≈ 5.7–7.0).
- **`fairnessMode` is opt-in and defaults to `false`** — so weighting is OFF unless the
  wheel enables it. "DUE FOR A COMEBACK" in the History tab is **purely informational
  and does not change the odds**, which is the mismatch the owner is seeing.
- 5 never-picked in 65 spins: ~impossible under uniform if the wheel has ≲20 places
  (0.0%), but plausible at ~30 (8–20%). Need the wheel's restaurant count to finish the
  call; also check no tag filter was left on (`filterRestaurantsByTags`) and whether
  those 5 were added later.

## Changelog

- 2026-07-22 — roadmap created; P2 started.
- 2026-07-22 — P2 shipped (gated: check ✓ / 250 tests ✓ / build ✓). Bundle: entry
  chunk 134→30 KB gz, WheelApp 73→46 KB gz, vendor isolated for long-term caching.
- 2026-07-22 — P1 code shipped: migration 0014 (11 hot indexes) + `wheels.realtime`
  polling consolidation. All gated (check / 250 tests / build). Remaining P1: owner
  applies 0014 to the live DB (deploy-gate).
- 2026-07-22 — P3 shipped: 5-star restaurant ratings end-to-end (foundation → restaurant-tab
  sheet → spin-weighting switch + History stars → Team Taste card) + members-can-edit
  permission. 274 tests, all gated. Deploy-gate: owner applies migration 0015.
- 2026-07-23 — Round 12: first-load optimizations + open-hours filter (migration 0016).
  289 tests, all gated. Spin fairness verified uniform — no change needed.
  Deploy-gate: 0014 + 0015 + 0016 in one `drizzle-kit migrate` per env, staging first.
