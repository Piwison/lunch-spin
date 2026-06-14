// Self-hosted Google sign-in (replaces the Manus OAuth front-door). It performs
// only the OAuth handshake via `arctic`; the session itself stays our existing
// local HS256 JWT cookie (sdk.createSessionToken / verifySession), so all the
// session/auth contracts in _core are untouched.

import type { Express, Request, Response } from "express";
import { parse as parseCookie } from "cookie";
import { decodeJwt } from "jose";
import { generateCodeVerifier, generateState, Google } from "arctic";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { mapGoogleClaims } from "@shared/googleProfile";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { getSessionCookieOptions } from "./_core/cookies";
import * as db from "./db";

const SCOPES = ["openid", "profile", "email"];
const STATE_COOKIE = "g_oauth_state";
const VERIFIER_COOKIE = "g_oauth_verifier";
const TEMP_MAX_AGE_MS = 10 * 60 * 1000; // 10 min to complete the round-trip

const isConfigured = () => Boolean(ENV.googleClientId && ENV.googleClientSecret);

// Fail closed if misconfigured. In production APP_ORIGIN is REQUIRED so the
// redirect_uri / cookie scope never derives from the attacker-controlled Host
// header; in dev we may fall back to the request host.
function notReady(res: Response): boolean {
  if (!isConfigured()) {
    res.status(503).json({ error: "Google sign-in is not configured" });
    return true;
  }
  if (ENV.isProduction && !ENV.appOrigin) {
    res.status(503).json({ error: "APP_ORIGIN must be set in production" });
    return true;
  }
  return false;
}

function redirectUri(req: Request): string {
  // notReady() guarantees appOrigin is set in production before this runs.
  const origin = ENV.appOrigin || `${req.protocol}://${req.get("host")}`;
  return `${origin.replace(/\/$/, "")}/api/auth/google/callback`;
}

const googleClient = (req: Request) =>
  new Google(ENV.googleClientId, ENV.googleClientSecret, redirectUri(req));

function clearTempCookies(res: Response) {
  res.clearCookie(STATE_COOKIE, { path: "/" });
  res.clearCookie(VERIFIER_COOKIE, { path: "/" });
}

export function registerGoogleAuthRoutes(app: Express) {
  // Step 1 — start the flow: stash state + PKCE verifier, redirect to Google.
  app.get("/api/auth/google/login", (req: Request, res: Response) => {
    if (notReady(res)) return;
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = googleClient(req).createAuthorizationURL(state, codeVerifier, SCOPES);

    const secure = getSessionCookieOptions(req).secure;
    const tempOpts = { httpOnly: true, path: "/", maxAge: TEMP_MAX_AGE_MS, sameSite: "lax" as const, secure };
    res.cookie(STATE_COOKIE, state, tempOpts);
    res.cookie(VERIFIER_COOKIE, codeVerifier, tempOpts);
    res.redirect(302, url.toString());
  });

  // Step 2 — Google redirects back: verify state, exchange code, issue session.
  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    if (notReady(res)) return;
    const code = req.query.code;
    const stateParam = req.query.state;
    const cookies = parseCookie(req.headers.cookie ?? "");
    const storedState = cookies[STATE_COOKIE];
    const codeVerifier = cookies[VERIFIER_COOKIE];

    // CSRF: the returned state must match the one we set on this browser.
    if (
      typeof code !== "string" ||
      typeof stateParam !== "string" ||
      !storedState ||
      !codeVerifier ||
      stateParam !== storedState
    ) {
      clearTempCookies(res);
      res.status(400).json({ error: "Invalid OAuth state" });
      return;
    }

    try {
      const tokens = await googleClient(req).validateAuthorizationCode(code, codeVerifier);
      const claims = decodeJwt(tokens.idToken()) as Record<string, unknown>;
      const user = mapGoogleClaims(claims, ENV.googleClientId, Math.floor(Date.now() / 1000));

      await db.upsertUser({
        openId: user.openId,
        name: user.name,
        email: user.email,
        loginMethod: "google",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      clearTempCookies(res);
      res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      clearTempCookies(res);
      console.error("[GoogleAuth] callback failed:", error instanceof Error ? error.message : "unknown error");
      res.status(500).json({ error: "Sign-in failed" });
    }
  });
}
