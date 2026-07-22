# Lunch Wheel — Post-MVP Roadmap (tracking)

Branch: `claude/post-mvp-review-roadmap-8cqtym`
Started: 2026-07-22

Legend: ⬜ todo · 🔄 in progress · ✅ done (gated: `pnpm check && pnpm test && pnpm build`) · 🔒 blocked (needs owner/ops action)

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

- ⬜ Pick the feature (grill to a spec): scheduled "11:45 spin" (PWA push) **or** team taste profile
- ⬜ Write **user story + spec** before any feature code
- ⬜ Implement behind TDD (`shared/*.ts` first) + migration if needed
- ⬜ Design/a11y pass from owner-provided screenshots (shot-list in chat)

---

## Changelog

- 2026-07-22 — roadmap created; P2 started.
- 2026-07-22 — P2 shipped (gated: check ✓ / 250 tests ✓ / build ✓). Bundle: entry
  chunk 134→30 KB gz, WheelApp 73→46 KB gz, vendor isolated for long-term caching.
- 2026-07-22 — P1 code shipped: migration 0014 (11 hot indexes) + `wheels.realtime`
  polling consolidation. All gated (check / 250 tests / build). Remaining P1: owner
  applies 0014 to the live DB (deploy-gate).
