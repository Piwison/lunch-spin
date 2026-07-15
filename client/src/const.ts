export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Self-hosted Google sign-in: the server starts the OAuth flow and sets our
// session cookie on callback. Relative path keeps it origin-correct everywhere.
// `redirectTo` (a same-origin path, e.g. "/join/abc123") carries the caller's
// intended destination through the OAuth round-trip — see server/googleAuth.ts's
// g_oauth_redirect cookie. Omit it to land on "/" after sign-in, as before.
export const getLoginUrl = (redirectTo?: string) =>
  redirectTo ? `/api/auth/google/login?redirect=${encodeURIComponent(redirectTo)}` : "/api/auth/google/login";
