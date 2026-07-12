import { describe, expect, it } from "vitest";
import {
  RATINGS,
  applyRatingWeights,
  isRating,
  ratingLabel,
  ratingWeight,
  type Rating,
} from "./rating";

describe("rating constants", () => {
  it("exposes the three ratings, best → worst", () => {
    expect(RATINGS).toEqual(["loved", "ok", "never"]);
  });

  it("labels each rating", () => {
    expect(ratingLabel("loved")).toMatch(/love/i);
    expect(ratingLabel("ok")).toBeTruthy();
    expect(ratingLabel("never")).toMatch(/again|never/i);
  });

  it("validates rating strings", () => {
    expect(isRating("loved")).toBe(true);
    expect(isRating("never")).toBe(true);
    expect(isRating("meh")).toBe(false);
    expect(isRating(null)).toBe(false);
    expect(isRating(undefined)).toBe(false);
  });
});

describe("ratingWeight", () => {
  it("boosts loved, leaves ok neutral, strongly suppresses never — but never to zero", () => {
    expect(ratingWeight("loved")).toBeGreaterThan(1);
    expect(ratingWeight("ok")).toBe(1);
    expect(ratingWeight("never")).toBeLessThan(1);
    expect(ratingWeight("never")).toBeGreaterThan(0); // still spinnable — wheel never empties
  });

  it("treats no rating as neutral", () => {
    expect(ratingWeight(null)).toBe(1);
    expect(ratingWeight(undefined)).toBe(1);
  });
});

describe("applyRatingWeights", () => {
  const base = [
    { restaurantId: 1, weight: 1 },
    { restaurantId: 2, weight: 1 },
    { restaurantId: 3, weight: 2 },
  ];

  it("multiplies each weight by its restaurant's latest rating", () => {
    const ratings = new Map<number, Rating>([
      [1, "loved"],
      [3, "never"],
    ]);
    const out = applyRatingWeights(base, ratings);
    expect(out[0]).toEqual({ restaurantId: 1, weight: ratingWeight("loved") });
    expect(out[1]).toEqual({ restaurantId: 2, weight: 1 }); // unrated → unchanged
    expect(out[2]).toEqual({ restaurantId: 3, weight: 2 * ratingWeight("never") });
  });

  it("preserves order and length, leaves weights positive", () => {
    const ratings = new Map<number, Rating>([[1, "never"], [2, "never"], [3, "never"]]);
    const out = applyRatingWeights(base, ratings);
    expect(out.map((w) => w.restaurantId)).toEqual([1, 2, 3]);
    expect(out.every((w) => w.weight > 0)).toBe(true);
  });

  it("is a no-op with an empty rating map", () => {
    expect(applyRatingWeights(base, new Map())).toEqual(base);
  });
});
