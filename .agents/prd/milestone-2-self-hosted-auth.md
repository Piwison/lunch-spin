# PRD — Milestone 2: Self-hosted auth (Google, off Manus)

**Status:** Built (arctic, env-driven) · security-reviewed · pending Google creds + deploy · **Date:** 2026-06-14

## Build notes
- Library: **arctic** (lean OIDC) per decision. Session layer kept 100% intact.
- New: `shared/googleProfile.ts` (+9 tests) · `server/googleAuth.ts` (login +
  callback) · env vars (`GOOGLE_CLIENT_ID/SECRET`, `APP_ORIGIN`) · client
  `getLoginUrl()` → `/api/auth/google/login` · `.env.example`.
- Security review: no exploitable findings. Hardened: APP_ORIGIN required in
  prod (no Host-header-derived redirect_uri); temp cookies cleared on all paths.
- Status check/test/build green; 131 tests.

## Why
Production won't run on Manus, but login currently *is* Manus (the
`/api/oauth/callback` front-door uses the Manus SDK). Replace just the identity
provider with **Google sign-in**, so the app can run anywhere.

## Key finding (de-risks this)
The session layer is **local HS256 JWT** (`sdk.signSession`/`verifySession` via
`jose` + `getSessionSecret()`) — it does NOT call Manus. So we **keep**:
`COOKIE_NAME`, cookie options, `signSession`/`verifySession`, `protectedProcedure`,
tRPC context, `upsertUser`, the `users` table, `ENV.appId` (set to a constant
like `"lunch-wheel"`). Only the **OAuth handshake** changes.

## Scope — what changes
- **New** `GET /api/auth/google/login`: build Google OIDC authorize URL with
  `state` (CSRF) + **PKCE**, set short-lived state/verifier cookies, 302 to Google.
- **New** `GET /api/auth/google/callback`: verify `state`, exchange `code` at
  Google's token endpoint (with PKCE verifier), verify the `id_token`
  (signature via Google JWKS, `iss`/`aud`/`exp`, `email_verified`), extract
  `sub`/`email`/`name`, `upsertUser({ openId: "google:"+sub, ... })`, issue the
  **existing** session cookie via `createSessionToken`, 302 to `/`.
- **Retire** the Manus `/api/oauth/callback` + `sdk.exchangeCodeForToken`/
  `getUserInfo` usage (keep the file or replace the route).
- **Client**: `getLoginUrl()` → `/api/auth/google/login` (was the Manus portal).
- **Env (new)**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_ORIGIN`
  (for the redirect URI). Keep `JWT_SECRET`; set `VITE_APP_ID=lunch-wheel`;
  set `OWNER_OPEN_ID` to the owner's `google:<sub>` to retain admin.

## Library decision (the one open fork)
- **Lean OIDC (`arctic`)** — *recommended*: a tiny OAuth2/OIDC lib (Google
  provider, PKCE built in). We keep our own session/cookie; it only does the
  handshake. Cleanest fit for an Express + tRPC app that already has sessions.
- **Auth.js (`@auth/express`)** — your stated pick: capable, but it wants to own
  session cookies/routes, which overlaps our existing JWT session. Usable, but
  more framework-fighting for a thin "just authenticate" need.

## What you provide (free, ~10 min)
1. Google Cloud project → **OAuth consent screen** (External) → **OAuth client
   (Web)**.
2. Authorized redirect URIs: `http://localhost:<devport>/api/auth/google/callback`
   and `https://<prod-domain>/api/auth/google/callback`.
3. Paste **Client ID + Secret** into env (`GOOGLE_CLIENT_ID/SECRET`).

## Testable (TDD seam)
- `state`/PKCE generate+verify helpers; Google profile → `upsertUser` payload
  mapping; authorize-URL builder (correct params). Pure → `shared`/util tests.
- Token-exchange + JWKS verification are integration (mock in tests).

## Security (gets a /security-review pass)
- CSRF via `state`; PKCE; verify `id_token` signature + claims; `email_verified`
  required; `httpOnly`/`secure`/`sameSite` on state+session cookies; no secrets
  in client bundle.

## Caveats / non-goals
- Existing Manus-issued sessions become invalid (different openId namespace) →
  everyone re-logs in once. Acceptable (moving off Manus; little/no prod data).
- Old Manus `users` rows are a different `openId` namespace than `google:<sub>`
  → not migrated (fresh start). If real data must carry over, that's a separate
  migration task.
- Not doing: multi-provider, account linking, email magic-link (this milestone).

## Success criteria
- `pnpm check`/`test`/`build`/CI green; `/security-review` clean.
- Local: click "Sign in" → Google → land logged-in; `protectedProcedure` works;
  logout clears the cookie; owner (`OWNER_OPEN_ID`) is admin.
