import { describe, expect, it } from "vitest";
import {
  applyDietary,
  applyVetoes,
  applyVoteWeights,
  dietaryForPresent,
  excludedDietaryTagIds,
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
  dietary: [
    { userId: 10, tagIds: [100, 101] },
    { userId: 20, tagIds: [101] },
  ],
};

describe("dietaryForPresent", () => {
  // Amy (1) doesn't eat beef (100); Ben (2) doesn't eat Korean (200) or lamb (201);
  // Chloe (3) doesn't eat pork (300).
  const prefs = [
    { userId: 1, tagId: 100 },
    { userId: 2, tagId: 200 },
    { userId: 2, tagId: 201 },
    { userId: 3, tagId: 300 },
  ];

  it("applies only the people who opened the wheel today", () => {
    expect(dietaryForPresent(prefs, [2], null)).toEqual([{ userId: 2, tagIds: [200, 201] }]);
  });

  it("leaves out someone who isn't here today — their setting doesn't shrink the wheel", () => {
    expect(dietaryForPresent(prefs, [1, 3], null).map((m) => m.userId)).toEqual([1, 3]);
  });

  it("always applies the person spinning, present row or not", () => {
    expect(dietaryForPresent(prefs, [2], 1)).toEqual([
      { userId: 1, tagIds: [100] },
      { userId: 2, tagIds: [200, 201] },
    ]);
  });

  it("is empty when nobody present has a setting", () => {
    expect(dietaryForPresent(prefs, [9], null)).toEqual([]);
    expect(dietaryForPresent([], [1, 2], 1)).toEqual([]);
  });

  it("feeds applyDietary through the same union as before", () => {
    const rests = [
      { id: 1, tags: [{ id: 200 }] }, // Korean
      { id: 2, tags: [{ id: 100 }] }, // beef
      { id: 3, tags: [] },
    ];
    const marks = dietaryForPresent(prefs, [2], null);
    const off = excludedDietaryTagIds({ vetoes: [], votes: [], dietary: marks });
    expect(applyDietary(rests, off).map((r) => r.id)).toEqual([2, 3]);
  });
});

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

describe("excludedDietaryTagIds", () => {
  it("unions every member's avoided tags", () => {
    expect(excludedDietaryTagIds(state).sort()).toEqual([100, 101]);
  });
  it("is empty when nobody set a constraint", () => {
    expect(excludedDietaryTagIds({ vetoes: [], votes: [], dietary: [] })).toEqual([]);
  });
});

describe("applyDietary", () => {
  const rests = [
    { id: 1, tags: [{ id: 100 }] }, // has avoided tag
    { id: 2, tags: [{ id: 200 }, { id: 101 }] }, // has avoided tag
    { id: 3, tags: [{ id: 300 }] }, // safe
  ];
  it("drops restaurants carrying any avoided tag", () => {
    expect(applyDietary(rests, [100, 101]).map((r) => r.id)).toEqual([3]);
  });
  it("returns everything when no tags are avoided", () => {
    expect(applyDietary(rests, []).map((r) => r.id)).toEqual([1, 2, 3]);
  });
});
