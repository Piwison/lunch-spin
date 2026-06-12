/**
 * Pure "fairness mode" weighting.
 *
 * Instead of a uniform spin, favour restaurants the group has neglected: the
 * longer since a restaurant was last picked (and never-picked most of all), the
 * heavier its slice. Shared by the server-authoritative spin and its tests.
 */

export interface WeightInput {
  restaurantId: number;
  lastPickedAt: Date | null; // null = never picked
}

export interface Weighted {
  restaurantId: number;
  weight: number;
}

// Days of "overdue" boost we cap at, so one ancient pick doesn't dominate the
// wheel forever. A never-picked restaurant is treated as maximally overdue.
export const WEIGHT_CAP_DAYS = 30;

export function computeWeights(items: WeightInput[], opts: { now?: Date } = {}): Weighted[] {
  const now = opts.now ?? new Date();
  return items.map((it) => {
    if (!it.lastPickedAt) {
      return { restaurantId: it.restaurantId, weight: 1 + WEIGHT_CAP_DAYS };
    }
    const days = (now.getTime() - it.lastPickedAt.getTime()) / 86400000;
    const clamped = Math.max(0, Math.min(WEIGHT_CAP_DAYS, days));
    return { restaurantId: it.restaurantId, weight: 1 + clamped };
  });
}

// Cuisine-rotation multipliers. A cuisine picked very recently is damped toward
// MIN; one not picked in a while (or never) is boosted toward MAX. A cuisine
// picked `NEUTRAL_DAYS` ago is left unchanged (factor 1).
export const CUISINE_FACTOR_MIN = 0.25;
export const CUISINE_FACTOR_MAX = 3;
export const CUISINE_NEUTRAL_DAYS = 3;

export interface CuisineItem {
  restaurantId: number;
  cuisineId: number | null; // null = no cuisine tag
}

function cuisineFactor(cuisineId: number | null, lastPicked: Map<number, Date>, now: Date): number {
  if (cuisineId == null) return 1;
  const last = lastPicked.get(cuisineId);
  if (!last) return CUISINE_FACTOR_MAX; // never picked → strongly favour
  const days = (now.getTime() - last.getTime()) / 86400000;
  return Math.max(CUISINE_FACTOR_MIN, Math.min(CUISINE_FACTOR_MAX, days / CUISINE_NEUTRAL_DAYS));
}

/**
 * Scale base weights to rotate cuisines: restaurants whose cuisine was just
 * picked are damped, neglected cuisines are boosted. Composes with any base
 * weighting (uniform, fairness, votes).
 */
export function applyCuisineRotation(
  base: Weighted[],
  items: CuisineItem[],
  cuisineLastPicked: Map<number, Date>,
  opts: { now?: Date } = {},
): Weighted[] {
  const now = opts.now ?? new Date();
  const cuisineOf = new Map(items.map((i) => [i.restaurantId, i.cuisineId]));
  return base.map((w) => ({
    restaurantId: w.restaurantId,
    weight: w.weight * cuisineFactor(cuisineOf.get(w.restaurantId) ?? null, cuisineLastPicked, now),
  }));
}

/**
 * Weighted random pick. `rng` is injectable so the choice is deterministic
 * under test. Falls back to a uniform pick if all weights are non-positive.
 */
export function pickWeighted(weights: Weighted[], rng: () => number = Math.random): number {
  if (weights.length === 0) throw new Error("pickWeighted requires at least one candidate");
  const total = weights.reduce((sum, w) => sum + Math.max(0, w.weight), 0);
  if (total <= 0) {
    return weights[Math.min(weights.length - 1, Math.floor(rng() * weights.length))]!.restaurantId;
  }
  let threshold = rng() * total;
  for (const w of weights) {
    threshold -= Math.max(0, w.weight);
    if (threshold < 0) return w.restaurantId;
  }
  return weights[weights.length - 1]!.restaurantId; // float-rounding fallback
}
