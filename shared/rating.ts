/**
 * Post-spin "How was it?" ratings — the feedback loop that lets the wheel learn
 * from meals it picked. A rating is the diner's verdict on the restaurant, so
 * the *latest* rating per restaurant biases future spins: loved spots ride a
 * little higher, "never again" spots sink hard but never disappear (the wheel
 * never empties — same invariant as exclusion/soft-filters elsewhere).
 *
 * Pure + tested; composes into the server's weighting chain exactly like
 * applyVoteWeights / applyMoodBoost (shared/session.ts, shared/smartPick.ts).
 */

import type { Weighted } from "./weight";

export const RATINGS = ["loved", "ok", "never"] as const;
export type Rating = (typeof RATINGS)[number];

const LABELS: Record<Rating, string> = {
  loved: "Loved it",
  ok: "It was OK",
  never: "Never again",
};

/** Human label for a rating. */
export function ratingLabel(r: Rating): string {
  return LABELS[r];
}

/** Type guard: is this string one of the known ratings? */
export function isRating(v: unknown): v is Rating {
  return typeof v === "string" && (RATINGS as readonly string[]).includes(v);
}

const LOVED_BOOST = 1.6;
const NEVER_DAMP = 0.15; // strong suppression, still > 0 so it can be picked

/** Spin-weight multiplier for a restaurant's latest rating (1 when unrated). */
export function ratingWeight(r: Rating | null | undefined): number {
  if (r === "loved") return LOVED_BOOST;
  if (r === "never") return NEVER_DAMP;
  return 1; // "ok" or unrated
}

/**
 * Scale each restaurant's weight by its latest rating. Same shape as
 * applyVoteWeights/applyMoodBoost: order- and length-preserving, always > 0.
 */
export function applyRatingWeights(base: Weighted[], ratingById: Map<number, Rating>): Weighted[] {
  if (ratingById.size === 0) return base;
  return base.map((w) => ({
    restaurantId: w.restaurantId,
    weight: w.weight * ratingWeight(ratingById.get(w.restaurantId)),
  }));
}
