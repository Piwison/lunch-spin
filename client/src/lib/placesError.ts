/**
 * How the UI should present a failed map-provider call.
 *
 * The server already classifies the provider's status (shared/placesError.ts)
 * and sends back a message worth showing. This is the client half: which of
 * those failures deserves a louder, non-retryable alert.
 *
 * Quota matters most. On a free Google Maps key the app WILL hit its ceiling,
 * and "the map search stopped working" must not read like a crash — it's a
 * temporary limit, everything else in the app still works, and offering a
 * "try again" button there just burns another call to be told the same thing.
 */

/** A tRPC error as the client sees it — only the bits we branch on. */
type ClientError = { message?: string; data?: { code?: string } | null } | null | undefined;

export interface ProviderAlert {
  message: string;
  /** Usage limit reached: no retry affordance, calmer wording. */
  quota: boolean;
  /** A server/key misconfiguration rather than anything the user did. */
  config: boolean;
  /** Whether to offer "try again". */
  retryable: boolean;
}

/** Null when there's no error to show. */
export function providerAlert(error: ClientError): ProviderAlert | null {
  if (!error) return null;
  const code = error.data?.code;
  const message = error.message || "Map search failed.";
  if (code === "TOO_MANY_REQUESTS") {
    return { message, quota: true, config: false, retryable: false };
  }
  if (code === "PRECONDITION_FAILED") {
    return { message, quota: false, config: true, retryable: false };
  }
  if (code === "BAD_REQUEST") {
    return { message, quota: false, config: false, retryable: false };
  }
  return { message, quota: false, config: false, retryable: true };
}
