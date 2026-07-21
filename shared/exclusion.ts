/**
 * Pure "smart exclusion" logic.
 *
 * A restaurant spun within the exclusion window drops off the wheel so the
 * group doesn't repeat a recent meal — unless the latest spin for it was
 * manually re-enabled. Shared by the server query (server/db.ts) and its tests
 * so the production code and the tested code can never drift apart.
 */

export const DEFAULT_EXCLUSION_DAYS = 3;

// The team's calendar day is anchored to Taipei (UTC+8, no DST) so "won't be
// re-picked today" has a stable, timezone-correct meaning regardless of the
// server's UTC clock. A rejected result stops excluding once Taipei crosses
// midnight; an accepted result excludes for the full multi-day window.
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Which Taipei calendar day a timestamp falls on (integer day number). */
function taipeiDayIndex(t: Date): number {
  return Math.floor((t.getTime() + TAIPEI_OFFSET_MS) / DAY_MS);
}

/** The UTC instant of the next Taipei midnight after `t` (when its day ends). */
function endOfTaipeiDay(t: Date): Date {
  return new Date((taipeiDayIndex(t) + 1) * DAY_MS - TAIPEI_OFFSET_MS);
}

export interface SpinRecord {
  restaurantId: number;
  spunAt: Date;
  manuallyReenabled: boolean;
  // True once someone pressed ACCEPT on this spin ("we're eating here"). Drives
  // the two-tier exclusion: accepted → full window; rejected → today only.
  accepted: boolean;
}

export interface Exclusion {
  restaurantId: number;
  excludedUntil: Date;
}

/**
 * Restaurants that should be hidden from the wheel right now, along with the
 * timestamp at which each one becomes available again.
 *
 * For each restaurant only its most recent spin inside the window matters:
 *  - manually re-enabled → available now;
 *  - accepted → excluded until `spunAt + windowDays`;
 *  - rejected (not accepted) → excluded only until the end of the Taipei day it
 *    was spun on, so tomorrow it's fair game again;
 *  - rejected on an earlier Taipei day → already available.
 */
export function computeExclusions(
  spins: SpinRecord[],
  opts: { now?: Date; windowDays?: number } = {},
): Exclusion[] {
  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays ?? DEFAULT_EXCLUSION_DAYS;
  if (windowDays <= 0) return [];
  const windowMs = windowDays * DAY_MS;
  const cutoff = new Date(now.getTime() - windowMs);
  const nowDay = taipeiDayIndex(now);

  const recent = spins
    .filter((s) => s.spunAt > cutoff)
    .sort((a, b) => b.spunAt.getTime() - a.spunAt.getTime());

  const seen = new Set<number>();
  const exclusions: Exclusion[] = [];
  for (const row of recent) {
    if (seen.has(row.restaurantId)) continue;
    seen.add(row.restaurantId);
    if (row.manuallyReenabled) continue; // explicitly re-enabled → available
    if (row.accepted) {
      exclusions.push({ restaurantId: row.restaurantId, excludedUntil: new Date(row.spunAt.getTime() + windowMs) });
    } else if (taipeiDayIndex(row.spunAt) === nowDay) {
      exclusions.push({ restaurantId: row.restaurantId, excludedUntil: endOfTaipeiDay(row.spunAt) });
    }
    // rejected on an earlier Taipei day → not excluded
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
