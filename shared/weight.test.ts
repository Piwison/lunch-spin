import { describe, expect, it } from "vitest";
import {
  applyCuisineRotation,
  computeWeights,
  CUISINE_FACTOR_MAX,
  CUISINE_FACTOR_MIN,
  pickWeighted,
  WEIGHT_CAP_DAYS,
  type Weighted,
} from "./weight";

const now = new Date("2026-06-11T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);

describe("computeWeights", () => {
  it("gives a never-picked restaurant the maximum boost", () => {
    expect(computeWeights([{ restaurantId: 1, lastPickedAt: null }], { now })).toEqual([
      { restaurantId: 1, weight: 1 + WEIGHT_CAP_DAYS },
    ]);
  });

  it("weights a just-picked restaurant near the floor", () => {
    const [w] = computeWeights([{ restaurantId: 1, lastPickedAt: now }], { now });
    expect(w!.weight).toBeCloseTo(1);
  });

  it("grows weight with days since last pick", () => {
    const [w] = computeWeights([{ restaurantId: 1, lastPickedAt: daysAgo(5) }], { now });
    expect(w!.weight).toBeCloseTo(6);
  });

  it("caps the overdue boost", () => {
    const [w] = computeWeights([{ restaurantId: 1, lastPickedAt: daysAgo(365) }], { now });
    expect(w!.weight).toBe(1 + WEIGHT_CAP_DAYS);
  });
});

describe("pickWeighted", () => {
  const weights: Weighted[] = [
    { restaurantId: 10, weight: 1 },
    { restaurantId: 20, weight: 3 },
    { restaurantId: 30, weight: 6 },
  ];

  it("throws when there are no candidates", () => {
    expect(() => pickWeighted([])).toThrow();
  });

  it("selects by cumulative weight bands", () => {
    // total = 10. bands: [0,1)->10, [1,4)->20, [4,10)->30
    expect(pickWeighted(weights, () => 0)).toBe(10);
    expect(pickWeighted(weights, () => 0.05)).toBe(10);
    expect(pickWeighted(weights, () => 0.2)).toBe(20);
    expect(pickWeighted(weights, () => 0.5)).toBe(30);
    expect(pickWeighted(weights, () => 0.999)).toBe(30);
  });

  it("favours the heavier candidate over many draws", () => {
    let heavy = 0;
    for (let i = 0; i < 1000; i++) {
      if (pickWeighted(weights) === 30) heavy++;
    }
    // ~60% expected; assert a comfortable margin to stay deterministic-ish.
    expect(heavy).toBeGreaterThan(450);
  });

  it("falls back to uniform when all weights are zero", () => {
    const z: Weighted[] = [{ restaurantId: 1, weight: 0 }, { restaurantId: 2, weight: 0 }];
    expect([1, 2]).toContain(pickWeighted(z, () => 0.7));
  });
});

describe("applyCuisineRotation", () => {
  const base: Weighted[] = [
    { restaurantId: 1, weight: 2 }, // cuisine A, picked today → damped
    { restaurantId: 2, weight: 2 }, // cuisine B, never picked → boosted
    { restaurantId: 3, weight: 2 }, // no cuisine → neutral
  ];
  const items = [
    { restaurantId: 1, cuisineId: 100 },
    { restaurantId: 2, cuisineId: 200 },
    { restaurantId: 3, cuisineId: null },
  ];
  const lastPicked = new Map([[100, now]]); // cuisine 100 picked "now"

  it("damps a just-picked cuisine and boosts a neglected one", () => {
    const out = applyCuisineRotation(base, items, lastPicked, { now });
    expect(out[0]!.weight).toBeCloseTo(2 * CUISINE_FACTOR_MIN); // picked today
    expect(out[1]!.weight).toBeCloseTo(2 * CUISINE_FACTOR_MAX); // never picked
    expect(out[2]!.weight).toBe(2); // no cuisine → unchanged
  });
});
