/**
 * Pure restaurant-stats shaping. Shared by the stats UI and its tests.
 */

export interface RestaurantStat {
  id: number;
  name: string;
  pickCount: number;
  lastPickedAt: Date | null;
}

/**
 * Coerce a raw stats row (MySQL returns COUNT as a string in some drivers) into
 * a well-typed stat.
 */
export function normalizeStatRow(row: {
  id: number;
  name: string;
  pickCount: unknown;
  lastPickedAt: unknown;
}): RestaurantStat {
  return {
    id: row.id,
    name: row.name,
    pickCount: Number(row.pickCount ?? 0) || 0,
    lastPickedAt: row.lastPickedAt ? new Date(row.lastPickedAt as string) : null,
  };
}

/** Most-picked first; ties broken by most-recently picked. */
export function rankStats(stats: RestaurantStat[]): RestaurantStat[] {
  return [...stats].sort((a, b) => {
    if (b.pickCount !== a.pickCount) return b.pickCount - a.pickCount;
    const at = a.lastPickedAt?.getTime() ?? 0;
    const bt = b.lastPickedAt?.getTime() ?? 0;
    return bt - at;
  });
}

export function topRestaurants(stats: RestaurantStat[], n = 5): RestaurantStat[] {
  return rankStats(stats).slice(0, n);
}

export function totalPicks(stats: RestaurantStat[]): number {
  return stats.reduce((sum, r) => sum + r.pickCount, 0);
}

export function averagePicks(stats: RestaurantStat[]): number {
  return stats.length > 0 ? totalPicks(stats) / stats.length : 0;
}

/** Whole days since a restaurant was last picked; null if it never has been. */
export function daysSinceLastPick(lastPickedAt: Date | null, now: Date = new Date()): number | null {
  if (!lastPickedAt) return null;
  return Math.floor((now.getTime() - lastPickedAt.getTime()) / 86400000);
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

export interface PersonPicks {
  userId: number;
  name: string | null;
  count: number;
}

/**
 * Group fairness: how many spins each member has driven. Most-active first.
 * A lopsided list is the signal that one person is always deciding.
 */
export function picksByPerson(history: { spunBy: number; spunByName: string | null }[]): PersonPicks[] {
  const byUser = new Map<number, PersonPicks>();
  for (const h of history) {
    const cur = byUser.get(h.spunBy);
    if (cur) cur.count++;
    else byUser.set(h.spunBy, { userId: h.spunBy, name: h.spunByName, count: 1 });
  }
  return Array.from(byUser.values()).sort((a, b) => b.count - a.count);
}
