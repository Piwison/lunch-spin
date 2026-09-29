/**
 * Pure logic for a shared wheel's day of decisions: vetoes ("not today") and
 * votes ("want it"), which count only on the Taipei day they were made
 * (shared/realtimeState `isActiveMark`, rows in `round_marks`), and each
 * person's standing "I don't eat" (`user_dietary`), which applies on the days
 * that person is actually here (`dietaryForPresent`).
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
  // The "I don't eat" settings of everyone here today (dietaryForPresent). The
  // group respects the union: a restaurant carrying anyone's tag is out.
  dietary: DietaryMarks[];
}

/** One row of someone's standing "I don't eat" setting. */
export interface DietaryPref {
  userId: number;
  tagId: number;
}

/**
 * Whose "I don't eat" shapes the wheel: everyone who has opened it today, plus
 * the person spinning. A teammate who is not at lunch today does not shrink
 * everyone else's wheel — that was the trouble with a setting that lasts — and
 * the spinner always counts, present row or not, since they are here by
 * definition.
 */
export function dietaryForPresent(
  prefs: readonly DietaryPref[],
  presentUserIds: Iterable<number>,
  spinnerId: number | null,
): DietaryMarks[] {
  const here = new Set(presentUserIds);
  if (spinnerId != null) here.add(spinnerId);
  const byUser = new Map<number, number[]>();
  for (const p of prefs) {
    if (!here.has(p.userId)) continue;
    const list = byUser.get(p.userId);
    if (list) list.push(p.tagId);
    else byUser.set(p.userId, [p.tagId]);
  }
  return Array.from(byUser, ([userId, tagIds]) => ({ userId, tagIds })).sort((a, b) => a.userId - b.userId);
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
