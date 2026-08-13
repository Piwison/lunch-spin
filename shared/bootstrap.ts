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
