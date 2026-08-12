/**
 * Restaurant ratings — a 1–5 star verdict per member per place (Google-style).
 * A place's team rating is the average of its members' stars; that average both
 * shows in the UI and biases future spins (loved places ride higher, disliked
 * ones sink hard but never disappear — the wheel never empties, the same
 * invariant as exclusion / soft-filters).
 *
 * This supersedes the old per-spin loved/ok/never enum (shared/rating.ts): the
 * star weight is anchored to the *same* multipliers at 1★ / 3★ / 5★, so moving
 * the spin-weighting source from the enum to star averages does not change the
 * fair-spin behaviour at the endpoints.
 *
 * Pure + tested; `applyStarWeights` composes into the server's weighting chain
 * exactly like applyVoteWeights / applyCuisineRotation (shared/weight.ts).
 */

import type { Weighted } from "./weight";

export const MIN_STARS = 1;
export const MAX_STARS = 5;
export type Stars = 1 | 2 | 3 | 4 | 5;

/** Round + clamp any number to a whole 1..5 star value. */
export function clampStars(n: number): Stars {
  const r = Math.round(n);
  if (r < MIN_STARS) return MIN_STARS;
  if (r > MAX_STARS) return MAX_STARS;
  return r as Stars;
}

/** Type guard: a whole 1..5 star value. */
export function isStars(v: unknown): v is Stars {
  return typeof v === "number" && Number.isInteger(v) && v >= MIN_STARS && v <= MAX_STARS;
}

/** Mean of the given stars, or null when there are none (unrated ≠ zero). */
export function averageStars(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Display form of an average: one decimal, or an en-dash when unrated. */
export function formatAverage(avg: number | null): string {
  return avg == null ? "–" : avg.toFixed(1);
}

// Legacy anchors preserved from shared/rating.ts so switching the spin-weight
// source (enum → star average) doesn't move fairness at the endpoints:
//   1★ = "never" damp (0.15), 3★ = "ok" neutral (1.0), 5★ = "loved" boost (1.6).
const NEVER_W = 0.15;
const OK_W = 1.0;
const LOVED_W = 1.6;

/**
 * Spin-weight multiplier for a restaurant's average stars (1 when unrated).
 * Piecewise-linear through the three legacy anchors; always > 0.
 */
export function starWeight(avg: number | null | undefined): number {
  if (avg == null) return 1;
  const a = Math.min(MAX_STARS, Math.max(MIN_STARS, avg));
  if (a <= 3) return NEVER_W + ((a - 1) / 2) * (OK_W - NEVER_W);
  return OK_W + ((a - 3) / 2) * (LOVED_W - OK_W);
}

/**
 * Scale each restaurant's weight by its average-star weight. Same contract as
 * applyVoteWeights / the old applyRatingWeights: order- and length-preserving,
 * always > 0, and a no-op when nothing is rated.
 */
export function applyStarWeights(base: Weighted[], avgById: Map<number, number>): Weighted[] {
  if (avgById.size === 0) return base;
  return base.map((w) => ({
    restaurantId: w.restaurantId,
    weight: w.weight * starWeight(avgById.get(w.restaurantId) ?? null),
  }));
}

/** One member's star for one restaurant (a row of the restaurant_ratings table). */
export type RatingRow = { restaurantId: number; userId: number; stars: number };

/** Per-restaurant rollup: the team average + how many rated it + the viewer's own star. */
export type RatingSummary = {
  restaurantId: number;
  average: number;
  count: number;
  myStars: number | null;
};

/**
 * Group per-member star rows into a per-restaurant summary (team average, count,
 * and the viewer's own star). Pure; order follows first appearance so callers get
 * a stable result. `myStars` is null when the viewer hasn't rated that place.
 */
export function summarizeRatings(rows: RatingRow[], viewerId: number): RatingSummary[] {
  const byRestaurant = new Map<number, { sum: number; count: number; mine: number | null }>();
  for (const row of rows) {
    let e = byRestaurant.get(row.restaurantId);
    if (!e) {
      e = { sum: 0, count: 0, mine: null };
      byRestaurant.set(row.restaurantId, e);
    }
    e.sum += row.stars;
    e.count += 1;
    if (row.userId === viewerId) e.mine = row.stars;
  }
  return Array.from(byRestaurant.entries()).map(([restaurantId, e]) => ({
    restaurantId,
    average: e.sum / e.count,
    count: e.count,
    myStars: e.mine,
  }));
}

/** Build the restaurantId → average-stars map that feeds applyStarWeights. */
export function averageMapFromRows(rows: RatingRow[]): Map<number, number> {
  const summaries = summarizeRatings(rows, -1);
  return new Map(summaries.map((s) => [s.restaurantId, s.average]));
}
