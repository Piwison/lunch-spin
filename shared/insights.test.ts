import { describe, it, expect } from "vitest";
import {
  withinDays,
  cuisineMix,
  varietyScore,
  currentRut,
  type SpinEvent,
} from "./insights";

const NOW = new Date("2026-07-04T12:00:00Z");
const at = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86400000);

function ev(
  restaurantId: number,
  cuisine: string | null,
  daysAgo: number,
  name = `R${restaurantId}`,
): SpinEvent {
  return { restaurantId, restaurantName: name, cuisine, spunAt: at(daysAgo) };
}

describe("withinDays", () => {
  it("keeps events inside the window and drops older ones", () => {
    const events = [ev(1, "Italian", 0), ev(2, "Thai", 10), ev(3, "Thai", 40)];
    const out = withinDays(events, 30, NOW);
    expect(out.map((e) => e.restaurantId)).toEqual([1, 2]);
  });

  it("treats the boundary (exactly N days ago) as inside", () => {
    const events = [ev(1, "Italian", 30)];
    expect(withinDays(events, 30, NOW)).toHaveLength(1);
  });

  it("returns empty for empty input", () => {
    expect(withinDays([], 30, NOW)).toEqual([]);
  });
});

describe("cuisineMix", () => {
  it("counts, ranks desc, and computes rounded percentages", () => {
    const events = [
      ev(1, "Italian", 0),
      ev(2, "Italian", 1),
      ev(3, "Thai", 2),
      ev(4, "Mexican", 3),
    ];
    const mix = cuisineMix(events);
    expect(mix).toEqual([
      { cuisine: "Italian", count: 2, pct: 50 },
      { cuisine: "Mexican", count: 1, pct: 25 },
      { cuisine: "Thai", count: 1, pct: 25 },
    ]);
  });

  it("groups untagged (null) cuisines under 'Other'", () => {
    const mix = cuisineMix([ev(1, null, 0), ev(2, null, 1), ev(3, "Thai", 2)]);
    expect(mix[0]).toEqual({ cuisine: "Other", count: 2, pct: 67 });
    expect(mix[1]).toEqual({ cuisine: "Thai", count: 1, pct: 33 });
  });

  it("breaks count ties by cuisine name for stable ordering", () => {
    const mix = cuisineMix([ev(1, "Thai", 0), ev(2, "Italian", 1)]);
    expect(mix.map((m) => m.cuisine)).toEqual(["Italian", "Thai"]);
  });

  it("returns empty for no events", () => {
    expect(cuisineMix([])).toEqual([]);
  });

  it("uses largest-remainder rounding so percentages sum to exactly 100", () => {
    const mix = cuisineMix([ev(1, "Italian", 0), ev(2, "Thai", 1), ev(3, "Mexican", 2)]);
    expect(mix.reduce((sum, m) => sum + m.pct, 0)).toBe(100);
    // 33.33 each → floors 33/33/33 = 99, the leftover point goes to the first
    // slice in sort order (Italian, alphabetically first among equal counts).
    expect(mix).toEqual([
      { cuisine: "Italian", count: 1, pct: 34 },
      { cuisine: "Mexican", count: 1, pct: 33 },
      { cuisine: "Thai", count: 1, pct: 33 },
    ]);
  });
});

describe("varietyScore", () => {
  it("reports 'none' band and zero score with no spins", () => {
    const v = varietyScore([]);
    expect(v.score).toBe(0);
    expect(v.band).toBe("none");
    expect(v.totalSpins).toBe(0);
  });

  it("reports 'none' band below the minimum sample (1–2 spins is noise)", () => {
    // A single spin would score 100 by the raw formula; the floor suppresses that
    // misleading "great variety" read until there are enough spins to mean it.
    expect(varietyScore([ev(1, "Italian", 0)]).band).toBe("none");
    expect(varietyScore([ev(1, "Italian", 0), ev(2, "Thai", 1)]).band).toBe("none");
  });

  it("scores 100 / high when every spin is a different place", () => {
    const events = [ev(1, "Italian", 0), ev(2, "Thai", 1), ev(3, "Mexican", 2)];
    const v = varietyScore(events);
    expect(v.score).toBe(100);
    expect(v.band).toBe("high");
    expect(v.distinctRestaurants).toBe(3);
    expect(v.distinctCuisines).toBe(3);
    expect(v.totalSpins).toBe(3);
  });

  it("scores low when the group keeps hitting one place", () => {
    // 1 distinct restaurant out of 5 spins → score 20 → low
    const events = [
      ev(1, "Italian", 0),
      ev(1, "Italian", 1),
      ev(1, "Italian", 2),
      ev(1, "Italian", 3),
      ev(1, "Italian", 4),
    ];
    const v = varietyScore(events);
    expect(v.score).toBe(20);
    expect(v.band).toBe("low");
    expect(v.distinctRestaurants).toBe(1);
    expect(v.distinctCuisines).toBe(1);
  });

  it("lands in the medium band for a partial mix", () => {
    // 2 distinct of 4 → 50 → medium
    const events = [ev(1, "Italian", 0), ev(1, "Italian", 1), ev(2, "Thai", 2), ev(2, "Thai", 3)];
    const v = varietyScore(events);
    expect(v.score).toBe(50);
    expect(v.band).toBe("medium");
  });

  it("counts distinct cuisines ignoring untagged", () => {
    const v = varietyScore([ev(1, null, 0), ev(2, "Thai", 1)]);
    expect(v.distinctCuisines).toBe(1);
    expect(v.distinctRestaurants).toBe(2);
  });
});

describe("currentRut", () => {
  it("flags a restaurant rut when one place dominates recent spins", () => {
    const events = [
      ev(1, "Italian", 0, "Pizza Place"),
      ev(1, "Italian", 1, "Pizza Place"),
      ev(1, "Italian", 2, "Pizza Place"),
      ev(2, "Thai", 3, "Thai Basil"),
      ev(3, "Mexican", 4, "Taco Co"),
    ];
    const rut = currentRut(events);
    expect(rut).toEqual({ kind: "restaurant", label: "Pizza Place", count: 3, window: 5 });
  });

  it("prefers a restaurant rut over a cuisine rut when both qualify", () => {
    // 3x Pizza Place (restaurant) which is also 3x Italian — restaurant wins
    const events = [
      ev(1, "Italian", 0, "Pizza Place"),
      ev(1, "Italian", 1, "Pizza Place"),
      ev(1, "Italian", 2, "Pizza Place"),
      ev(2, "Thai", 3),
      ev(3, "Thai", 4),
    ];
    const rut = currentRut(events);
    expect(rut?.kind).toBe("restaurant");
    expect(rut?.label).toBe("Pizza Place");
  });

  it("flags a cuisine rut when different places share one cuisine", () => {
    const events = [
      ev(1, "Italian", 0, "Pizza Place"),
      ev(2, "Italian", 1, "Pasta Bar"),
      ev(3, "Italian", 2, "Trattoria"),
      ev(4, "Thai", 3),
      ev(5, "Mexican", 4),
    ];
    const rut = currentRut(events);
    expect(rut).toEqual({ kind: "cuisine", label: "Italian", count: 3, window: 5 });
  });

  it("returns null when recent spins are well spread", () => {
    const events = [
      ev(1, "Italian", 0),
      ev(2, "Thai", 1),
      ev(3, "Mexican", 2),
      ev(4, "Japanese", 3),
      ev(5, "Indian", 4),
    ];
    expect(currentRut(events)).toBeNull();
  });

  it("only considers the most recent `window` spins", () => {
    // Newest 5 are all distinct; an older cluster of Pizza Place must be ignored.
    const events = [
      ev(1, "Italian", 0),
      ev(2, "Thai", 1),
      ev(3, "Mexican", 2),
      ev(4, "Japanese", 3),
      ev(5, "Indian", 4),
      ev(9, "Italian", 5, "Pizza Place"),
      ev(9, "Italian", 6, "Pizza Place"),
      ev(9, "Italian", 7, "Pizza Place"),
    ];
    expect(currentRut(events, { window: 5 })).toBeNull();
  });

  it("sorts by recency internally, so input order doesn't matter", () => {
    const events = [
      ev(2, "Thai", 3),
      ev(1, "Italian", 0, "Pizza Place"),
      ev(1, "Italian", 2, "Pizza Place"),
      ev(1, "Italian", 1, "Pizza Place"),
    ];
    const rut = currentRut(events, { window: 5, threshold: 3 });
    expect(rut?.label).toBe("Pizza Place");
    expect(rut?.count).toBe(3);
  });

  it("returns null when there are fewer spins than the threshold", () => {
    expect(currentRut([ev(1, "Italian", 0), ev(1, "Italian", 1)])).toBeNull();
  });

  it("respects a custom threshold", () => {
    const events = [ev(1, "Italian", 0, "Pizza Place"), ev(1, "Italian", 1, "Pizza Place")];
    expect(currentRut(events, { threshold: 2 })?.count).toBe(2);
  });
});
