import { describe, expect, it } from "vitest";
import {
  applyVetoes,
  applyVoteWeights,
  vetoedIds,
  voteCounts,
  VOTE_WEIGHT,
  type SessionState,
} from "./session";
import type { Weighted } from "./weight";

const state: SessionState = {
  vetoes: [
    { restaurantId: 1, userIds: [10] },
    { restaurantId: 2, userIds: [] }, // un-vetoed (everyone took it back)
  ],
  votes: [
    { restaurantId: 3, userIds: [10, 20] },
    { restaurantId: 4, userIds: [] },
  ],
};

describe("vetoedIds", () => {
  it("returns only restaurants with at least one veto", () => {
    expect(vetoedIds(state)).toEqual([1]);
  });
});

describe("voteCounts", () => {
  it("counts votes per restaurant, ignoring empty entries", () => {
    const counts = voteCounts(state);
    expect(counts.get(3)).toBe(2);
    expect(counts.has(4)).toBe(false);
  });
});

describe("applyVetoes", () => {
  it("drops vetoed candidates", () => {
    expect(applyVetoes([1, 2, 3], [1])).toEqual([2, 3]);
  });
  it("returns all candidates when nothing is vetoed", () => {
    expect(applyVetoes([1, 2, 3], [])).toEqual([1, 2, 3]);
  });
});

describe("applyVoteWeights", () => {
  const base: Weighted[] = [
    { restaurantId: 1, weight: 1 },
    { restaurantId: 3, weight: 2 },
  ];
  it("adds VOTE_WEIGHT per vote to the base weight", () => {
    const out = applyVoteWeights(base, new Map([[3, 2]]));
    expect(out).toEqual([
      { restaurantId: 1, weight: 1 },
      { restaurantId: 3, weight: 2 + 2 * VOTE_WEIGHT },
    ]);
  });
  it("leaves base weights untouched when there are no votes", () => {
    expect(applyVoteWeights(base, new Map())).toEqual(base);
  });
});
