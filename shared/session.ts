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

export interface SessionState {
  vetoes: SessionMarks[];
  votes: SessionMarks[];
}

export const EMPTY_SESSION: SessionState = { vetoes: [], votes: [] };

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
