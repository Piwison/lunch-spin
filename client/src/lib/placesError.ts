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

import type { MessageKey } from "@/i18n/dict";

/** A tRPC error as the client sees it — only the bits we branch on. */
type ClientError = { data?: { code?: string } | null } | null | undefined;

export interface ProviderAlert {
  /** What to show, in the active language: `t(alert.messageKey)`. The server's
   *  own message is English, so it is never shown directly. */
  messageKey: MessageKey;
  /** Usage limit reached: no retry affordance, calmer wording. */
  quota: boolean;
  /** A server/key misconfiguration rather than anything the user did. */
  config: boolean;
  /** Whether to offer "try again". */
  retryable: boolean;
}

/**
 * Null when there's no error to show. `source: "link"` is for resolveLink, whose
 * NOT_FOUND means "no place in that link" — on a search the same code can only
 * mean the wheel itself is gone, which the wheel's own access handling covers.
 */
export function providerAlert(error: ClientError, source: "search" | "link" = "search"): ProviderAlert | null {
  if (!error) return null;
  const code = error.data?.code;
  if (code === "TOO_MANY_REQUESTS") {
    return { messageKey: "places.provider.quota", quota: true, config: false, retryable: false };
  }
  if (code === "PRECONDITION_FAILED") {
    return { messageKey: "places.provider.config", quota: false, config: true, retryable: false };
  }
  if (code === "NOT_FOUND" && source === "link") {
    return { messageKey: "places.provider.linkNotFound", quota: false, config: false, retryable: false };
  }
  if (code === "BAD_REQUEST") {
    return { messageKey: "places.provider.request", quota: false, config: false, retryable: false };
  }
  return { messageKey: "places.provider.transient", quota: false, config: false, retryable: true };
}
