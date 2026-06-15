// Pure validation + mapping of a Google OIDC id_token's claims into our user
// shape. The id_token is fetched server-side directly from Google's token
// endpoint over TLS, so we validate claims (iss/aud/exp/email_verified) rather
// than re-verifying the signature. Kept pure so it lives in the TDD seam.

export type GoogleUser = {
  /** Namespaced so Google subjects never collide with other providers. */
  openId: string;
  email: string | null;
  name: string | null;
};

const VALID_ISS = new Set(["https://accounts.google.com", "accounts.google.com"]);

/**
 * Validate Google id_token claims against the expected audience (our client id)
 * and current time (seconds), returning the mapped user. Throws on any invalid
 * claim so callers fail closed.
 */
export function mapGoogleClaims(
  claims: Record<string, unknown>,
  expectedAud: string,
  nowSeconds: number,
): GoogleUser {
  const { iss, aud, exp, sub, email_verified: emailVerified } = claims;

  if (typeof iss !== "string" || !VALID_ISS.has(iss)) {
    throw new Error("Invalid token issuer");
  }
  const audOk = aud === expectedAud || (Array.isArray(aud) && aud.includes(expectedAud));
  if (!expectedAud || !audOk) {
    throw new Error("Token audience mismatch");
  }
  if (typeof exp !== "number" || exp <= nowSeconds) {
    throw new Error("Token expired");
  }
  if (typeof sub !== "string" || sub.length === 0) {
    throw new Error("Token missing subject");
  }
  if (emailVerified !== true) {
    throw new Error("Email not verified");
  }

  const email = typeof claims.email === "string" ? claims.email : null;
  const rawName = typeof claims.name === "string" ? claims.name.trim() : "";
  return { openId: `google:${sub}`, email, name: rawName || null };
}
