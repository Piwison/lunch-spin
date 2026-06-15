export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Self-hosted Google sign-in: the server starts the OAuth flow and sets our
// session cookie on callback. Relative path keeps it origin-correct everywhere.
export const getLoginUrl = () => "/api/auth/google/login";
