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
