/**
 * Pure restaurant-stats shaping. Shared by the stats UI and its tests.
 */

import type { LunchStats } from "./lunch";

/** One place on the wheel. Counts lunches (shared/lunch.ts), never raw spins:
 *  a respun or skipped spin is not a visit. */
export interface RestaurantStat {
  id: number;
  name: string;
  pickCount: number;
  lastPickedAt: Date | null;
}

/** Every place on the wheel, eaten at or not, with its lunch count. */
export function statsFromLunches(rests: { id: number; name: string }[], lunches: LunchStats): RestaurantStat[] {
  return rests.map((r) => {
    const l = lunches.byRestaurant.get(r.id);
    return { id: r.id, name: r.name, pickCount: l?.lunchCount ?? 0, lastPickedAt: l?.lastLunchAt ?? null };
  });
}

/** Whole days since a restaurant was last picked; null if it never has been.
 *  Never negative: a viewer whose clock runs a little behind the server's would
 *  otherwise see "-1d". */
export function daysSinceLastPick(lastPickedAt: Date | null, now: Date = new Date()): number | null {
  if (!lastPickedAt) return null;
  return Math.max(0, Math.floor((now.getTime() - lastPickedAt.getTime()) / 86400000));
}

export interface OverdueEntry {
  stat: RestaurantStat;
  daysSince: number | null; // null = never picked (a blind spot)
}

/**
 * Decision-grade view: restaurants the group is neglecting. A restaurant is
 * "overdue" if it has never been picked (a blind spot) or wasn't picked within
 * `thresholdDays`. Never-picked come first, then the longest-overdue.
 */
export function overdueRestaurants(
  stats: RestaurantStat[],
  opts: { now?: Date; thresholdDays?: number } = {},
): OverdueEntry[] {
  const now = opts.now ?? new Date();
  const thresholdDays = opts.thresholdDays ?? 14;
  const entries: OverdueEntry[] = [];
  for (const stat of stats) {
    const daysSince = daysSinceLastPick(stat.lastPickedAt, now);
    if (daysSince === null || daysSince >= thresholdDays) {
      entries.push({ stat, daysSince });
    }
  }
  return entries.sort((a, b) => {
    if (a.daysSince === null && b.daysSince === null) return 0;
    if (a.daysSince === null) return -1; // never-picked first
    if (b.daysSince === null) return 1;
    return b.daysSince - a.daysSince; // longest-overdue first
  });
}
