/**
 * Taste Insights — pure shaping of a wheel's spin timeline into an at-a-glance
 * read of the group's eating habits. Shared by the Insights UI and its tests.
 *
 * A `SpinEvent` is assembled client-side from the existing `spins.history`
 * (timeline) and `restaurants.list` (each restaurant's tags) queries — a
 * restaurant's `cuisine` is its first `category:"cuisine"` tag, or null when it
 * has none (grouped as "Other" in the mix). No server/DB changes involved.
 */

export interface SpinEvent {
  restaurantId: number;
  restaurantName: string;
  cuisine: string | null;
  spunAt: Date;
}

/** Bucket for one cuisine's share of the window. */
export interface CuisineSlice {
  cuisine: string;
  count: number;
  pct: number; // rounded, 0..100
}

export type VarietyBand = "none" | "low" | "medium" | "high";

export interface VarietySummary {
  score: number; // 0..100 = distinct restaurants / total spins
  band: VarietyBand;
  distinctRestaurants: number;
  distinctCuisines: number; // ignores untagged
  totalSpins: number;
}

export interface RutCallout {
  kind: "restaurant" | "cuisine";
  label: string;
  count: number; // occurrences within the considered window
  window: number; // how many recent spins were considered
}

const DAY_MS = 86400000;
const OTHER = "Other";

/** Events whose spin is within the last `days` days (boundary inclusive). */
export function withinDays(events: SpinEvent[], days: number, now: Date = new Date()): SpinEvent[] {
  const cutoff = now.getTime() - days * DAY_MS;
  return events.filter((e) => e.spunAt.getTime() >= cutoff);
}

/**
 * Cuisine share, most-frequent first. Untagged spins group under "Other".
 * Count ties break by cuisine name (asc) so the order is stable across renders.
 */
export function cuisineMix(events: SpinEvent[]): CuisineSlice[] {
  const total = events.length;
  if (total === 0) return [];
  const counts = new Map<string, number>();
  for (const e of events) {
    const key = e.cuisine ?? OTHER;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([cuisine, count]) => ({ cuisine, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.cuisine.localeCompare(b.cuisine)));
}

function bandFor(score: number, totalSpins: number): VarietyBand {
  if (totalSpins === 0) return "none";
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

/**
 * Variety = how many *different* places the group visits per spin, as a 0..100
 * score with an explainable band. High = rarely repeats; low = stuck on a few
 * spots. Distinct-cuisine count is reported alongside (untagged excluded).
 */
export function varietyScore(events: SpinEvent[]): VarietySummary {
  const totalSpins = events.length;
  const distinctRestaurants = new Set(events.map((e) => e.restaurantId)).size;
  const distinctCuisines = new Set(
    events.filter((e) => e.cuisine != null).map((e) => e.cuisine as string),
  ).size;
  const score = totalSpins === 0 ? 0 : Math.round((distinctRestaurants / totalSpins) * 100);
  return {
    score,
    band: bandFor(score, totalSpins),
    distinctRestaurants,
    distinctCuisines,
    totalSpins,
  };
}

/**
 * Detect a recent rut: within the most recent `window` spins, if a single
 * restaurant (or, failing that, a single cuisine) accounts for >= `threshold`
 * of them, name it. A restaurant-level rut is preferred over a cuisine-level one.
 * Returns null when recent picks are well spread. Input order is irrelevant —
 * events are sorted by recency internally.
 */
export function currentRut(
  events: SpinEvent[],
  opts: { window?: number; threshold?: number } = {},
): RutCallout | null {
  const window = opts.window ?? 5;
  const threshold = opts.threshold ?? 3;
  const recent = [...events]
    .sort((a, b) => b.spunAt.getTime() - a.spunAt.getTime())
    .slice(0, window);
  if (recent.length < threshold) return null;

  const byRestaurant = new Map<number, { count: number; label: string }>();
  const byCuisine = new Map<string, number>();
  for (const e of recent) {
    const r = byRestaurant.get(e.restaurantId);
    if (r) r.count++;
    else byRestaurant.set(e.restaurantId, { count: 1, label: e.restaurantName });
    if (e.cuisine != null) byCuisine.set(e.cuisine, (byCuisine.get(e.cuisine) ?? 0) + 1);
  }

  let topR: { count: number; label: string } | null = null;
  for (const v of Array.from(byRestaurant.values())) if (!topR || v.count > topR.count) topR = v;
  if (topR && topR.count >= threshold) {
    return { kind: "restaurant", label: topR.label, count: topR.count, window: recent.length };
  }

  let topC: { count: number; label: string } | null = null;
  for (const [label, count] of Array.from(byCuisine.entries())) {
    if (!topC || count > topC.count) topC = { count, label };
  }
  if (topC && topC.count >= threshold) {
    return { kind: "cuisine", label: topC.label, count: topC.count, window: recent.length };
  }

  return null;
}
