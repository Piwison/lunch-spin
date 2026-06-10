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
