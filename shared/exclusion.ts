/**
 * Pure "smart exclusion" logic.
 *
 * A restaurant the team ate at within the exclusion window drops off the wheel
 * so the group doesn't repeat a recent meal — unless the latest spin for it was
 * manually re-enabled. What counts as eating there is shared/lunch.ts. Shared by
 * the server query (server/db.ts) and its tests so the production code and the
 * tested code can never drift apart.
 */

import { classifySpins, DAY_MS, endOfTaipeiDay, taipeiDayIndex, type SpinFacts } from "./lunch";

export const DEFAULT_EXCLUSION_DAYS = 3;

export interface SpinRecord extends SpinFacts {
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
 * For each restaurant only its most recent spin inside the window matters:
 *  - manually re-enabled → available now;
 *  - skipped ("we didn't go") → available now;
 *  - lunch → excluded until `spunAt + windowDays`;
 *  - respun (the same person spun again that Taipei day) → excluded only until
 *    the end of that day, so tomorrow it's fair game again;
 *  - respun on an earlier Taipei day → already available.
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

  // Classify before the window cut: whether a spin was replaced depends on the
  // spins after it, which are always inside the window if it is.
  const kinds = classifySpins(spins);
  const recent = spins
    .filter((s) => s.spunAt > cutoff)
    .sort((a, b) => b.spunAt.getTime() - a.spunAt.getTime() || b.id - a.id);

  const seen = new Set<number>();
  const exclusions: Exclusion[] = [];
  for (const row of recent) {
    if (seen.has(row.restaurantId)) continue;
    seen.add(row.restaurantId);
    if (row.manuallyReenabled) continue; // explicitly re-enabled → available
    const kind = kinds.get(row.id);
    if (kind === "lunch") {
      exclusions.push({ restaurantId: row.restaurantId, excludedUntil: new Date(row.spunAt.getTime() + windowMs) });
    } else if (kind === "respun" && taipeiDayIndex(row.spunAt) === nowDay) {
      exclusions.push({ restaurantId: row.restaurantId, excludedUntil: endOfTaipeiDay(row.spunAt) });
    }
    // skipped, or respun on an earlier Taipei day → not excluded
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

/** Time left on an exclusion, in the units the UI prints: days + hours, whole
 *  hours, or minutes (at least 1). Null once it has run out. */
export type ExclusionTimeLeft =
  | { unit: "dh"; days: number; hours: number }
  | { unit: "h"; hours: number }
  | { unit: "m"; minutes: number };

export function exclusionTimeLeft(excludedUntil: Date, now: Date = new Date()): ExclusionTimeLeft | null {
  const remaining = excludedUntil.getTime() - now.getTime();
  if (remaining <= 0) return null;

  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor(remaining / 3600000);
  if (days > 0) return { unit: "dh", days, hours: hours % 24 };
  if (hours > 0) return { unit: "h", hours };
  return { unit: "m", minutes: Math.max(1, Math.floor(remaining / 60000)) };
}

/**
 * Human-readable "time left" for an exclusion, e.g. "2d 3h", "5h", "12m".
 * Returns "expired" if `excludedUntil` is in the past. English; the app renders
 * `exclusionTimeLeft` through its dictionary instead.
 */
export function formatExclusionTimeLeft(excludedUntil: Date, now: Date = new Date()): string {
  const left = exclusionTimeLeft(excludedUntil, now);
  if (!left) return "expired";
  if (left.unit === "dh") return `${left.days}d ${left.hours}h`;
  if (left.unit === "h") return `${left.hours}h`;
  return `${left.minutes}m`;
}
