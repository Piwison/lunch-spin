/**
 * Pure logic for per-session group decisions: vetoes ("not today") and votes
 * ("I want this"). The session is the current decision moment for a shared
 * wheel; marks are ephemeral and live in server memory (see server/realtime.ts),
 * but the shaping here is pure so it can be unit-tested and shared client/server.
 */

import type { Weighted } from "./weight";

export interface SessionMarks {
  restaurantId: number;
  userIds: number[];
}

export interface DietaryMarks {
  userId: number;
  tagIds: number[];
}

export interface SessionState {
  vetoes: SessionMarks[];
  votes: SessionMarks[];
  // Per-member "avoid today" tag exclusions (dietary constraints). The group
  // respects the union: a restaurant carrying anyone's avoided tag is out.
  dietary: DietaryMarks[];
}

export const EMPTY_SESSION: SessionState = { vetoes: [], votes: [], dietary: [] };

/** Restaurant ids vetoed by at least one person. */
export function vetoedIds(state: SessionState): number[] {
  return state.vetoes.filter((m) => m.userIds.length > 0).map((m) => m.restaurantId);
}

/** restaurantId -> number of votes. */
export function voteCounts(state: SessionState): Map<number, number> {
  return new Map(state.votes.filter((m) => m.userIds.length > 0).map((m) => [m.restaurantId, m.userIds.length]));
}

/** Drop vetoed restaurants from a candidate list. */
export function applyVetoes(candidateIds: number[], vetoed: Iterable<number>): number[] {
  const set = new Set(vetoed);
  return candidateIds.filter((id) => !set.has(id));
}

/** Union of every member's avoided tags for the round. */
export function excludedDietaryTagIds(state: SessionState): number[] {
  const set = new Set<number>();
  for (const m of state.dietary) for (const t of m.tagIds) set.add(t);
  return Array.from(set);
}

export interface DietaryFilterable {
  tags: { id: number }[];
}

/** Drop restaurants that carry any avoided (dietary) tag. */
export function applyDietary<T extends DietaryFilterable>(restaurants: T[], excludedTagIds: Iterable<number>): T[] {
  const set = new Set(excludedTagIds);
  if (set.size === 0) return restaurants;
  return restaurants.filter((r) => !r.tags.some((t) => set.has(t.id)));
}

// How much each vote adds to a restaurant's spin weight.
export const VOTE_WEIGHT = 3;

/**
 * Fold votes into base spin weights (uniform or fairness-derived): each vote
 * adds `voteWeight` to that restaurant's slice, so a popular pick is favoured
 * without guaranteeing it.
 */
export function applyVoteWeights(base: Weighted[], votes: Map<number, number>, voteWeight = VOTE_WEIGHT): Weighted[] {
  return base.map((w) => ({
    restaurantId: w.restaurantId,
    weight: w.weight + (votes.get(w.restaurantId) ?? 0) * voteWeight,
  }));
}
