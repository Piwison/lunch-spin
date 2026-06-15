# PRD — Milestone 3: Serverless realtime (Vercel + TiDB, polling)

**Status:** Built · code-reviewed · pending TiDB migration + Vercel deploy · **Date:** 2026-06-15

## Build notes
- Cadence: presence ~10s (TTL 25s), session.state + spins.latest ~3s; paused on
  hidden tab. Tables `wheel_presence` + `round_marks` (migration 0006).
- `realtime.ts` deleted; `shared/realtimeState.ts` (+4 tests). Vercel: `createApp`
  (vite-free) + `api/[[...path]].ts` + `vercel.json`; auto-listen guarded by !VERCEL.
- Review fixes: idempotent `toggleRoundMark` (no PK-race 500); `/api/healthz` for
  Vercel; JSON 404 for unmatched `/api/*`; own-veto invalidates session for snappy UI.
- check/test/build green; 135 tests.

## Why
Target prod = **Vercel + TiDB**, but Vercel is serverless: it can't hold the
SSE subscriptions or the in-memory presence/session state in `realtime.ts`.
Refactor realtime from **push (SSE + memory)** to **poll (queries + TiDB)** so
the whole app runs on Vercel, free, with no single-instance constraint.

## Goal
Same shared-wheel UX (live-ish presence, spin broadcast, voting/veto/dietary),
delivered by short polling instead of SSE, with state persisted in TiDB.

## Scope — what changes

### 1. Persist realtime state in TiDB (new tables)
- `wheel_presence(wheelId, userId, name, lastSeen)` — PK (wheelId,userId).
- `round_marks(wheelId, kind, refId, userId)` — PK (wheelId,kind,refId,userId);
  `kind ∈ {veto, vote, dietary}` (refId = restaurantId for veto/vote, tagId for
  dietary). Replaces the in-memory vetoes/votes/dietary maps.

### 2. Replace SSE subscriptions with polled tRPC queries
- `presence.ping(wheelId)` (mutation): upsert my `lastSeen=now` and return active
  members (those with `lastSeen` within a TTL, e.g. 20s). Client calls every ~10s.
- `session.state(wheelId)` (query): rebuild `SessionState` from `round_marks`.
  Client polls ~3s. `veto/vote/dietary/clear` mutations write to `round_marks`.
- `spins.latest(wheelId)` (query): most recent spin row. Client polls ~3s; if a
  new spin id appears and `spunBy !== me`, play the result animation (same as the
  old `onSpin` broadcast). Reuses `spin_history` — no new table.
- Polling **pauses when the tab is hidden** (visibilitychange) to save TiDB RUs.
- Remove `onSpin/onPresence/onSession` subscriptions + `httpSubscriptionLink`/
  `splitLink` from the client (`main.tsx` → plain `httpBatchLink`).
- `realtime.ts` shrinks to thin DB-backed helpers (no EventEmitter).

### 3. Vercel deployment
- Refactor `server/_core/index.ts` to **separate "build app" from "listen"** so
  local (`pnpm dev/start`) listens and Vercel imports the app.
- `api/[[...path]].ts` (Vercel Node function) → the Express app handles `/api/*`.
- `vercel.json`: build client (`vite build` → `dist/public`, served by Vercel
  CDN), route `/api/*` → function, SPA fallback → `index.html`.
- `serveStatic`/Vite bridge stay for local only.

## Decisions to confirm
1. **Polling cadence** (responsiveness vs TiDB free-tier request units).
2. OK to add the two tables + a Drizzle migration (run against TiDB).

## Non-goals
- Instant push (that's Path B / Ably). Optimistic local UI still makes your own
  veto/vote feel instant; others see it on their next poll.
- No auth change (Milestone 2 already did Google).

## Testable (TDD seam)
- `SessionState` rebuild from `round_marks` rows (pure mapping) + tests.
- Presence TTL filter (active = lastSeen within window) + tests.
- Existing `shared/session.ts` logic (veto/vote/dietary) stays the source of truth.

## Success criteria
- check/test/build/CI green.
- On Vercel: sign in (Google), spin, Smart Pick/Add; on a shared wheel a second
  user appears in presence within ~10s, sees a spin within ~3s, and veto/vote
  reflect within ~3s. Works with zero always-on server.

## Risks
- TiDB RU usage from polling — mitigated by hidden-tab pause + modest intervals
  + cheap indexed point queries.
- Vercel function cold starts add latency to API calls (acceptable).
