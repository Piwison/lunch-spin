import { describe, it, expect } from "vitest";
import { buildTasteProfile, type TasteItem } from "./tasteProfile";

const item = (over: Partial<TasteItem> & { restaurantId: number }): TasteItem => ({
  name: `R${over.restaurantId}`,
  cuisine: null,
  average: 3,
  count: 1,
  ...over,
});

describe("buildTasteProfile", () => {
  it("is a teaser until there are 5+ ratings", () => {
    const p = buildTasteProfile([item({ restaurantId: 1, count: 4, average: 5 })]);
    expect(p.hasEnoughData).toBe(false);
    expect(p.totalRatings).toBe(4);
  });

  it("computes total + rating-weighted overall average", () => {
    const p = buildTasteProfile([
      item({ restaurantId: 1, average: 5, count: 2 }),
      item({ restaurantId: 2, average: 2, count: 2 }),
    ]);
    expect(p.totalRatings).toBe(4);
    expect(p.overallAverage).toBeCloseTo(3.5);
  });

  it("returns null overall average when nothing is rated", () => {
    expect(buildTasteProfile([]).overallAverage).toBeNull();
  });

  it("ranks top places by average, requiring 2+ ratings", () => {
    const p = buildTasteProfile([
      item({ restaurantId: 1, name: "Solo", average: 5, count: 1 }), // too few
      item({ restaurantId: 2, name: "Great", average: 4.5, count: 3 }),
      item({ restaurantId: 3, name: "Good", average: 4.0, count: 2 }),
    ]);
    expect(p.topPlaces.map((x) => x.name)).toEqual(["Great", "Good"]);
  });

  it("splits cuisines into leans (≥3.5) and cools (≤2.5), needing 3+ ratings", () => {
    const p = buildTasteProfile([
      item({ restaurantId: 1, cuisine: "Thai", average: 4.5, count: 2 }),
      item({ restaurantId: 2, cuisine: "Thai", average: 4.5, count: 2 }), // Thai total 4 ratings
      item({ restaurantId: 3, cuisine: "Salad", average: 2.0, count: 3 }),
      item({ restaurantId: 4, cuisine: "Sushi", average: 5.0, count: 1 }), // too few → excluded
    ]);
    expect(p.leans.map((c) => c.cuisine)).toEqual(["Thai"]);
    expect(p.cools.map((c) => c.cuisine)).toEqual(["Salad"]);
  });

  it("ignores restaurants with no cuisine in the cuisine roll-up", () => {
    const p = buildTasteProfile([
      item({ restaurantId: 1, cuisine: null, average: 5, count: 4 }),
    ]);
    expect(p.leans).toEqual([]);
    expect(p.cools).toEqual([]);
    expect(p.totalRatings).toBe(4); // still counts toward the headline
  });
});
