/**
 * Which wheel the app opens on entry.
 *
 * This lives here (rather than inline in the router) because it is the rule that
 * lets `wheels.bootstrap` answer in a single round trip: the server resolves the
 * target wheel itself instead of the client fetching the wheel list, deciding,
 * and then asking for that wheel's data.
 *
 * Priority: an explicitly requested wheel (only if the user can actually see it)
 * → their starred default → their first wheel → nothing (first-run).
 */
export function resolveBootstrapWheelId(
  accessibleWheelIds: number[],
  requestedWheelId: number | null | undefined,
  defaultWheelId: number | null | undefined,
): number | null {
  const accessible = new Set(accessibleWheelIds);
  if (requestedWheelId != null && accessible.has(requestedWheelId)) return requestedWheelId;
  if (defaultWheelId != null && accessible.has(defaultWheelId)) return defaultWheelId;
  return accessibleWheelIds[0] ?? null;
}

/**
 * Which wheel `bootstrap` can start reading *before* the wheel list comes back.
 *
 * `resolveBootstrapWheelId` needs the user's accessible ids, so the wheel read
 * used to wait for the membership query — two sequential round trips to a
 * cluster that may be cold. But the answer is already predictable from the
 * request alone: entry opens either the wheel named in the URL or the user's
 * starred default. Guessing lets the server issue both reads together.
 *
 * This is a PREFETCH HINT, never an authorization decision. The caller must
 * still run `resolveBootstrapWheelId` over the real list and use the
 * speculative row only when the two agree — a guess naming a wheel the user
 * can't see simply won't match, and is discarded. Returns null when there is
 * nothing to guess (first-time user, no default), where the caller falls back
 * to the ordinary sequential read.
 */
export function speculativeWheelId(
  requestedWheelId: number | null | undefined,
  defaultWheelId: number | null | undefined,
): number | null {
  return requestedWheelId ?? defaultWheelId ?? null;
}
