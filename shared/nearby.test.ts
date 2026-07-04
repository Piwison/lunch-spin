import { describe, expect, it } from "vitest";
import {
  CHAIN_DEMOTION,
  CLOSED_FAIL,
  MAX_SEGMENTS,
  SOFT_FAIL,
  dedupeChains,
  estimateWalkMinutes,
  filterWeight,
  formatWalk,
  isLowDensity,
  type NearbyPlace,
  rankNearby,
  spinWeight,
} from "./nearby";

const p = (o: Partial<NearbyPlace> & { id: number | string; name: string; walkMinutes: number }): NearbyPlace => o;

const SET: NearbyPlace[] = [
  { id: 1, name: "Rintaro", walkMinutes: 6, priceLevel: 3, open: true },
  { id: 2, name: "El Metate", walkMinutes: 4, priceLevel: 1, open: true },
  { id: 8, name: "Starbucks", walkMinutes: 6, priceLevel: 1, open: true, chain: "Starbucks" },
  { id: 9, name: "Starbucks", walkMinutes: 2, priceLevel: 1, open: true, chain: "Starbucks" },
  { id: 5, name: "Ayola", walkMinutes: 8, priceLevel: 2, open: false },
];

describe("estimateWalkMinutes / formatWalk", () => {
  it("converts meters to walking minutes, min 1", () => {
    expect(estimateWalkMinutes(800)).toBe(10);
    expect(estimateWalkMinutes(30)).toBe(1);
    expect(estimateWalkMinutes(0)).toBe(0);
  });
  it("formats a label", () => {
    expect(formatWalk(6)).toBe("6 min walk");
    expect(formatWalk(0)).toBe("1 min walk");
  });
});

describe("dedupeChains", () => {
  it("keeps one entry per chain (nearest wins) and all independents", () => {
    const out = dedupeChains(SET);
    const starbucks = out.filter((x) => x.chain === "Starbucks");
    expect(starbucks).toHaveLength(1);
    expect(starbucks[0]!.id).toBe(9); // the 2-min one, not the 6-min one
    expect(out.filter((x) => !x.chain)).toHaveLength(3); // Rintaro, El Metate, Ayola
  });
  it("returns nearest-first", () => {
    const out = dedupeChains(SET);
    const walks = out.map((x) => x.walkMinutes);
    expect(walks).toEqual([...walks].sort((a, b) => a - b));
  });
});

describe("filterWeight (soft, never zero)", () => {
  it("is 1 with no filters", () => {
    expect(filterWeight(p({ id: 1, name: "A", walkMinutes: 5 }))).toBe(1);
  });
  it("demotes but never removes an over-walk place", () => {
    const w = filterWeight(p({ id: 1, name: "A", walkMinutes: 12 }), { maxWalk: 7 });
    expect(w).toBeCloseTo(SOFT_FAIL);
    expect(w).toBeGreaterThan(0);
  });
  it("stacks penalties (over-price + closed) and stays > 0", () => {
    const w = filterWeight(
      p({ id: 1, name: "A", walkMinutes: 5, priceLevel: 4, open: false }),
      { maxPrice: 2, openNow: true },
    );
    expect(w).toBeCloseTo(SOFT_FAIL * CLOSED_FAIL);
    expect(w).toBeGreaterThan(0);
  });
  it("does not penalize a place missing price data", () => {
    expect(filterWeight(p({ id: 1, name: "A", walkMinutes: 5 }), { maxPrice: 2 })).toBe(1);
  });
});

describe("spinWeight (folds in chain demotion)", () => {
  it("demotes chains relative to independents", () => {
    const indie = spinWeight(p({ id: 1, name: "A", walkMinutes: 5 }));
    const chain = spinWeight(p({ id: 2, name: "B", walkMinutes: 5, chain: "Sub" }));
    expect(chain).toBeCloseTo(indie * CHAIN_DEMOTION);
    expect(chain).toBeLessThan(indie);
  });
});

describe("isLowDensity", () => {
  it("flags thin sets", () => {
    expect(isLowDensity(4)).toBe(true);
    expect(isLowDensity(6)).toBe(false);
    expect(isLowDensity(9)).toBe(false);
  });
});

describe("rankNearby", () => {
  it("counts grouped chains and never empties the wheel", () => {
    const r = rankNearby(SET);
    expect(r.chainsGrouped).toBe(1); // one duplicate Starbucks folded
    expect(r.segments.length).toBe(4);
    expect(r.weights.every((w) => w > 0)).toBe(true);
  });
  it("keeps the wheel full even when every filter is on", () => {
    const r = rankNearby(SET, { maxWalk: 3, maxPrice: 1, openNow: true });
    expect(r.segments.length).toBeGreaterThanOrEqual(1);
    expect(r.weights.every((w) => w > 0)).toBe(true); // re-rank, not exclude
  });
  it("caps to a spinnable count and stays nearest-first", () => {
    const many: NearbyPlace[] = Array.from({ length: 20 }, (_, i) => ({ id: i, name: `P${i}`, walkMinutes: i + 1 }));
    const r = rankNearby(many);
    expect(r.segments).toHaveLength(MAX_SEGMENTS);
    expect(r.segments[0]!.walkMinutes).toBe(1);
  });
  it("flags low density on a thin area", () => {
    const r = rankNearby(SET.slice(0, 2));
    expect(r.lowDensity).toBe(true);
  });
});
