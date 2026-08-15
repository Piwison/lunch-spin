/**
 * Turn a Google Places / Distance Matrix status into something a person can act
 * on — and, specifically, make "we've run out of API quota" impossible to
 * mistake for "there are no restaurants near you".
 *
 * Google answers HTTP 200 for all of these; the real outcome is in the `status`
 * field. Without this mapping a spent quota surfaced as a generic "Place
 * provider error: OVER_QUERY_LIMIT", which reads to a user like a bug and to an
 * operator like nothing at all.
 *
 * Pure + unit-tested (repo TDD seam in shared/*). Server maps `code` onto a
 * TRPCError; the client keys its alert off `quota`.
 */

/** Shown verbatim when the key's quota is spent. Kept here so server and client
 *  can't drift on the wording, and so the test can assert it exactly. */
export const PLACES_QUOTA_MESSAGE =
  "Map search has hit its usage limit for now. Existing wheels and spins still work — you can add restaurants by name in the meantime.";

export interface PlacesFailure {
  /** tRPC error code for the router to throw. */
  code: "TOO_MANY_REQUESTS" | "PRECONDITION_FAILED" | "BAD_GATEWAY" | "BAD_REQUEST";
  /** Safe to show a user as-is. */
  message: string;
  /** A quota/billing wall rather than a transient blip — the client says so
   *  plainly instead of offering a retry that would just burn another call. */
  quota: boolean;
  /** Whether trying again in a moment could plausibly work. */
  retryable: boolean;
}

/**
 * Provider messages are echoed to users, so scrub anything key-shaped first.
 * Google shouldn't include the key, but an error string we forward blindly is
 * exactly the kind of place a credential leaks from.
 */
function scrub(message: string): string {
  return message.replace(/\b(?:key=)?AIza[0-9A-Za-z_-]{10,}/g, "[redacted]");
}

/**
 * Classify a provider status. Returns null when nothing went wrong —
 * `ZERO_RESULTS` included, since "no restaurants here" is a real answer the
 * caller handles with its own empty state.
 */
export function classifyPlacesStatus(
  status: string | null | undefined,
  errorMessage?: string | null,
): PlacesFailure | null {
  if (!status || status === "OK" || status === "ZERO_RESULTS") return null;

  const detail = errorMessage ? scrub(errorMessage) : null;

  switch (status) {
    // The key's quota (or its billing cap) is spent. Not retryable: another
    // request just spends another call to be told the same thing.
    case "OVER_QUERY_LIMIT":
    case "OVER_DAILY_LIMIT":
      return { code: "TOO_MANY_REQUESTS", message: PLACES_QUOTA_MESSAGE, quota: true, retryable: false };

    // Key invalid, API not enabled on it, referrer/IP restriction, or billing
    // not set up. An operator problem — Google's own text is the useful part.
    case "REQUEST_DENIED":
      return {
        code: "PRECONDITION_FAILED",
        message: detail
          ? `Map search is misconfigured on this server: ${detail}`
          : "Map search is misconfigured on this server.",
        quota: false,
        retryable: false,
      };

    // We sent something malformed — our bug, not the provider's.
    case "INVALID_REQUEST":
    case "MAX_ELEMENTS_EXCEEDED":
    case "MAX_DIMENSIONS_EXCEEDED":
      return {
        code: "BAD_REQUEST",
        message: detail ? `Map search rejected that request: ${detail}` : "Map search rejected that request.",
        quota: false,
        retryable: false,
      };

    // Google's own transient failure, and anything we don't recognise.
    default:
      return {
        code: "BAD_GATEWAY",
        message: detail
          ? `Map search is having trouble: ${detail}`
          : "Map search is having trouble right now. Try again in a moment.",
        quota: false,
        retryable: true,
      };
  }
}
