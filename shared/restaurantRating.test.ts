import { describe, it, expect } from "vitest";
import {
  clampStars,
  isStars,
  averageStars,
  formatAverage,
  starWeight,
  applyStarWeights,
  summarizeRatings,
  averageMapFromRows,
  MIN_STARS,
  MAX_STARS,
} from "./restaurantRating";

describe("clampStars", () => {
  it("rounds to the nearest whole star within 1..5", () => {
    expect(clampStars(3)).toBe(3);
    expect(clampStars(3.4)).toBe(3);
    expect(clampStars(3.6)).toBe(4);
  });
  it("clamps out-of-range values to the ends", () => {
    expect(clampStars(0)).toBe(MIN_STARS);
    expect(clampStars(-2)).toBe(MIN_STARS);
    expect(clampStars(9)).toBe(MAX_STARS);
  });
});

describe("isStars", () => {
  it("accepts whole 1..5 only", () => {
    expect(isStars(1)).toBe(true);
    expect(isStars(5)).toBe(true);
    expect(isStars(0)).toBe(false);
    expect(isStars(6)).toBe(false);
    expect(isStars(3.5)).toBe(false);
    expect(isStars("4")).toBe(false);
  });
});

describe("averageStars", () => {
  it("returns null with no ratings (so unrated is distinguishable from 0)", () => {
    expect(averageStars([])).toBeNull();
  });
  it("averages the ratings", () => {
    expect(averageStars([5, 4, 3])).toBeCloseTo(4);
    expect(averageStars([5, 4, 4, 1])).toBeCloseTo(3.5);
  });
});

describe("formatAverage", () => {
  it("shows one decimal", () => {
    expect(formatAverage(4)).toBe("4.0");
    expect(formatAverage(4.25)).toBe("4.3");
  });
  it("passes through null as a dash", () => {
    expect(formatAverage(null)).toBe("–");
  });
});

describe("starWeight — behavior-preserving spin multiplier", () => {
  it("keeps the legacy anchors (never/ok/loved → 1/3/5 stars)", () => {
    expect(starWeight(1)).toBeCloseTo(0.15); // was "never"
    expect(starWeight(3)).toBeCloseTo(1.0); //  was "ok"
    expect(starWeight(5)).toBeCloseTo(1.6); //  was "loved"
  });
  it("treats unrated as neutral", () => {
    expect(starWeight(null)).toBe(1);
  });
  it("is monotonic increasing and always > 0 (the wheel never empties)", () => {
    let prev = -1;
    for (let s = 1; s <= 5; s += 0.5) {
      const w = starWeight(s);
      expect(w).toBeGreaterThan(0);
      expect(w).toBeGreaterThan(prev);
      prev = w;
    }
  });
});

describe("applyStarWeights", () => {
  const base = [
    { restaurantId: 1, weight: 1 },
    { restaurantId: 2, weight: 2 },
    { restaurantId: 3, weight: 1 },
  ];
  it("returns the base unchanged when there are no ratings", () => {
    expect(applyStarWeights(base, new Map())).toEqual(base);
  });
  it("scales each weight by its restaurant's star weight, preserving order and length", () => {
    const out = applyStarWeights(base, new Map([
      [1, 5], // loved → 1.6x
      [3, 1], // hated → 0.15x
    ]));
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ restaurantId: 1, weight: 1.6 });
    expect(out[1]).toEqual({ restaurantId: 2, weight: 2 }); // unrated: unchanged
    expect(out[2].restaurantId).toBe(3);
    expect(out[2].weight).toBeCloseTo(0.15);
  });
  it("never drives a weight to zero", () => {
    const out = applyStarWeights([{ restaurantId: 9, weight: 1 }], new Map([[9, 1]]));
    expect(out[0].weight).toBeGreaterThan(0);
  });
});

describe("summarizeRatings", () => {
  const rows = [
    { restaurantId: 1, userId: 10, stars: 5 },
    { restaurantId: 1, userId: 11, stars: 4 },
    { restaurantId: 1, userId: 12, stars: 3 },
    { restaurantId: 2, userId: 10, stars: 2 },
  ];
  it("returns [] for no rows", () => {
    expect(summarizeRatings([], 10)).toEqual([]);
  });
  it("computes team average + count per restaurant", () => {
    const out = summarizeRatings(rows, 99);
    const r1 = out.find((s) => s.restaurantId === 1)!;
    expect(r1.average).toBeCloseTo(4);
    expect(r1.count).toBe(3);
    const r2 = out.find((s) => s.restaurantId === 2)!;
    expect(r2.average).toBeCloseTo(2);
    expect(r2.count).toBe(1);
  });
  it("surfaces the viewer's own star, null when they haven't rated it", () => {
    const out = summarizeRatings(rows, 10);
    expect(out.find((s) => s.restaurantId === 1)!.myStars).toBe(5);
    expect(out.find((s) => s.restaurantId === 2)!.myStars).toBe(2);
    const other = summarizeRatings(rows, 11);
    expect(other.find((s) => s.restaurantId === 2)!.myStars).toBeNull();
  });
  it("keeps first-appearance order", () => {
    expect(summarizeRatings(rows, 10).map((s) => s.restaurantId)).toEqual([1, 2]);
  });
});

describe("averageMapFromRows", () => {
  it("maps restaurantId → team average for the weighting chain", () => {
    const map = averageMapFromRows([
      { restaurantId: 1, userId: 10, stars: 5 },
      { restaurantId: 1, userId: 11, stars: 3 },
      { restaurantId: 2, userId: 10, stars: 1 },
    ]);
    expect(map.get(1)).toBeCloseTo(4);
    expect(map.get(2)).toBeCloseTo(1);
    expect(map.has(3)).toBe(false);
  });
});
