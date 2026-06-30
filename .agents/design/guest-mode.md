# Spec — Guest (no-sign-in) mode

Decided (2026-06-16): guests with a **public link** can **view + spin** a wheel, with
**view-only** access (no create/edit/delete), and **spins are NOT recorded**. Spin is
**client-side random**. Landing page shows **popular public wheels (auto by spin count)**.

## Principles

- **No write path is ever exposed to guests.** Guest spin happens entirely in the
  browser — the client already has the candidate list and picks a uniform-random
  winner, then animates. Nothing hits the server → "not recorded" is guaranteed by
  construction, not by a flag we might forget.
- Authenticated owners/members keep today's **server-authoritative** spin (fairness,
  rotation, exclusion, history, broadcast). Guests get a plain uniform pick.
- Public read endpoints expose **public-safe fields only** — no owner email, no member
  roster, no history.

## Backend (new, all `publicProcedure`)

- `wheels.getPublic({ id })` → `{ id, name, isPublic, exclusionDays? }`. 404/410 if not
  public. **No** owner/member PII.
- `restaurants.listPublic({ wheelId })` → `[{ id, name, notes, tags, mapUrl }]` for a
  public wheel only. (Exclusion state omitted — guests spin the full list.)
- `wheels.listPublic({ limit })` → popular public wheels for discovery, ordered by spin
  count (lifetime or trailing-30d). Returns `{ id, name, restaurantCount, spinCount }`.
  - Needs a cheap popularity source: `COUNT(spinHistory)` per wheel, or a denormalized
    `spinCount` column updated on `spins.create`. (Decide at build time; COUNT is fine
    to start.)
- Guards live in the procedures: anything not `isPublic` → `NOT_FOUND`.

## Routing & entry

- **`/w/:wheelId`** — public, unauthenticated, read-only spin view. v1 uses numeric id;
  friendly slugs later.
- Reuses `SpinWheel`. Spin button runs the **client-side picker** (uniform random over
  the listed restaurants). Shows result card + **DIRECTIONS** (mapUrl) + **Re-spin**.
- All owner controls absent. Persistent CTA: *"Make your own wheel — sign in."*
- **Share:** for a public wheel, the kebab "Share" copies `${origin}/w/:id` (no invite
  token; it's public). Shared *team* wheels keep their `/join/:token` invite.

## Landing page

- New **"Popular wheels — try without signing in"** section (from `wheels.listPublic`).
- Each card → `/w/:id`. Gives instant value before asking for auth (top conversion lever).

## Guest can / cannot

| | Guest (public link) | Member | Owner |
|---|---|---|---|
| View wheel + restaurants | ✅ | ✅ | ✅ |
| Spin | ✅ client-side | ✅ server | ✅ server |
| Result recorded / exclusion / fairness | ❌ | ✅ | ✅ |
| Vote / veto (shared rounds) | ❌ | ✅ | ✅ |
| Create / edit / delete | ❌ | restaurants only | ✅ |
| History | ❌ | ✅ | ✅ |

## Edge cases

- Public→private later → `/w/:id` shows graceful "no longer public" (410) state.
- Empty public wheel → read-only "no restaurants yet".
- Guest deep-links to `/app/:id` → redirect to `/w/:id` if public, else login.

## Phases

1. Backend public read endpoints (public-safe fields) + popularity source.
2. `/w/:wheelId` guest view: reuse SpinWheel, client-side spin, DIRECTIONS, CTA, 410/empty.
3. "Share" emits `/w/:id` for public wheels.
4. Landing "Popular wheels" section.
5. Polish + conversion CTA after first spin.

**Risk:** additive and low — no changes to protected procedures or the recorded-spin
path. The only sensitive surface is making sure public reads leak no PII.
