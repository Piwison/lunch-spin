/**
 * Pure helper for poll-based "live" shared wheels.
 *
 * While a shared wheel is open, every member polls for the latest spin. This
 * decides whether a freshly-seen spin should be announced to *this* member —
 * i.e. it's a new spin (id changed) made by *someone else*. A member's own
 * spins are surfaced by their local animation, not by the poll, so they're
 * never re-announced.
 */
export interface LatestSpin {
  id: number;
  restaurantName: string;
  spunBy: number;
  spunByName: string | null;
}

export function detectIncomingSpin(
  latest: LatestSpin | null | undefined,
  lastSeenId: number | null,
  currentUserId: number,
): LatestSpin | null {
  if (!latest) return null;
  if (latest.id === lastSeenId) return null; // already seen
  if (latest.spunBy === currentUserId) return null; // our own spin
  return latest;
}
