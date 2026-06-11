/**
 * Pure "smart exclusion" logic.
 *
 * A restaurant spun within the exclusion window drops off the wheel so the
 * group doesn't repeat a recent meal — unless the latest spin for it was
 * manually re-enabled. Shared by the server query (server/db.ts) and its tests
 * so the production code and the tested code can never drift apart.
 */

export const DEFAULT_EXCLUSION_DAYS = 3;

export interface SpinRecord {
  restaurantId: number;
  spunAt: Date;
  manuallyReenabled: boolean;
}

export interface Exclusion {
  restaurantId: number;
  excludedUntil: Date;
}

/**
 * Restaurants that should be hidden from the wheel right now, along with the
 * timestamp at which each one becomes available again.
 *
 * For each restaurant only its most recent spin inside the window matters: if
 * that spin was manually re-enabled the restaurant stays available.
 */
export function computeExclusions(
  spins: SpinRecord[],
  opts: { now?: Date; windowDays?: number } = {},
): Exclusion[] {
  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays ?? DEFAULT_EXCLUSION_DAYS;
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const cutoff = new Date(now.getTime() - windowMs);

  const recent = spins
    .filter((s) => s.spunAt > cutoff)
    .sort((a, b) => b.spunAt.getTime() - a.spunAt.getTime());

  const seen = new Set<number>();
  const exclusions: Exclusion[] = [];
  for (const row of recent) {
    if (seen.has(row.restaurantId)) continue;
    seen.add(row.restaurantId);
    if (!row.manuallyReenabled) {
      exclusions.push({ restaurantId: row.restaurantId, excludedUntil: new Date(row.spunAt.getTime() + windowMs) });
    }
  }
  return exclusions;
}

/**
 * Restaurant ids that should be hidden from the wheel right now.
 */
export function computeExcludedIds(
  spins: SpinRecord[],
  opts: { now?: Date; windowDays?: number } = {},
): number[] {
  return computeExclusions(spins, opts).map((e) => e.restaurantId);
}

/**
 * Human-readable "time left" for an exclusion, e.g. "2d 3h", "5h", "12m".
 * Returns "expired" if `excludedUntil` is in the past.
 */
export function formatExclusionTimeLeft(excludedUntil: Date, now: Date = new Date()): string {
  const remaining = excludedUntil.getTime() - now.getTime();
  if (remaining <= 0) return "expired";

  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor(remaining / 3600000);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h`;

  const mins = Math.max(1, Math.floor(remaining / 60000));
  return `${mins}m`;
}
