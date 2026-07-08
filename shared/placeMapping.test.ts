import { describe, expect, it } from "vitest";
import {
  cuisineFromTypes,
  haversineMeters,
  mapProviderResults,
  normalizePriceLevel,
  toNearbyPlace,
  type ProviderPlace,
} from "./placeMapping";

const ORIGIN = { lat: 37.7749, lng: -122.4194 }; // SF

describe("haversineMeters", () => {
  it("is ~0 for identical points", () => {
    expect(haversineMeters(ORIGIN, ORIGIN)).toBe(0);
  });

  it("approximates a known short distance (SF ↔ ~1.1km east)", () => {
    // ~0.0125° lng at this latitude ≈ 1.1 km.
    const d = haversineMeters(ORIGIN, { lat: 37.7749, lng: -122.4069 });
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1200);
  });

  it("is symmetric", () => {
    const a = { lat: 40.0, lng: -74.0 };
    const b = { lat: 41.0, lng: -73.0 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 5);
  });
});

describe("cuisineFromTypes", () => {
  it("maps the first recognised type", () => {
    expect(cuisineFromTypes(["restaurant", "ramen_restaurant", "food"])).toBe("Japanese");
    expect(cuisineFromTypes(["mexican_restaurant"])).toBe("Mexican");
  });

  it("returns null for generic-only or missing types", () => {
    expect(cuisineFromTypes(["restaurant", "food", "point_of_interest"])).toBeNull();
    expect(cuisineFromTypes([])).toBeNull();
    expect(cuisineFromTypes(undefined)).toBeNull();
    expect(cuisineFromTypes(null)).toBeNull();
  });
});

describe("normalizePriceLevel", () => {
  it("clamps 0..4 onto our 1..4 scale", () => {
    expect(normalizePriceLevel(0)).toBe(1);
    expect(normalizePriceLevel(1)).toBe(1);
    expect(normalizePriceLevel(3)).toBe(3);
    expect(normalizePriceLevel(4)).toBe(4);
    expect(normalizePriceLevel(9)).toBe(4);
  });

  it("returns null when absent", () => {
    expect(normalizePriceLevel(null)).toBeNull();
    expect(normalizePriceLevel(undefined)).toBeNull();
    expect(normalizePriceLevel(NaN)).toBeNull();
  });
});

describe("toNearbyPlace", () => {
  const raw: ProviderPlace = {
    place_id: "abc123",
    name: "Rintaro",
    vicinity: "82 14th St, San Francisco",
    price_level: 3,
    types: ["japanese_restaurant", "restaurant", "food"],
    business_status: "OPERATIONAL",
    opening_hours: { open_now: true },
    geometry: { location: { lat: 37.7695, lng: -122.4143 } },
  };

  it("maps every consumed field", () => {
    const p = toNearbyPlace(raw, ORIGIN);
    expect(p.id).toBe("abc123");
    expect(p.placeId).toBe("abc123");
    expect(p.name).toBe("Rintaro");
    expect(p.cuisine).toBe("Japanese");
    expect(p.priceLevel).toBe(3);
    expect(p.open).toBe(true);
    expect(p.address).toBe("82 14th St, San Francisco");
    expect(p.lat).toBe(37.7695);
    expect(p.lng).toBe(-122.4143);
    expect(p.chain).toBeNull();
  });

  it("derives walk-minutes from haversine distance (>= 1 min for a real gap)", () => {
    const p = toNearbyPlace(raw, ORIGIN);
    expect(p.distanceMeters).toBeGreaterThan(0);
    expect(p.walkMinutes).toBeGreaterThanOrEqual(1);
  });

  it("treats a non-operational business as closed regardless of open_now", () => {
    const closed = toNearbyPlace(
      { ...raw, business_status: "CLOSED_PERMANENTLY", opening_hours: { open_now: true } },
      ORIGIN,
    );
    expect(closed.open).toBe(false);
  });

  it("falls back gracefully when optional fields are missing", () => {
    const bare: ProviderPlace = { place_id: "x", geometry: { location: ORIGIN } };
    const p = toNearbyPlace(bare, ORIGIN);
    expect(p.name).toBe("Unnamed place");
    expect(p.cuisine).toBeNull();
    expect(p.priceLevel).toBeNull();
    expect(p.address).toBeNull();
    expect(p.open).toBeUndefined();
    expect(p.distanceMeters).toBe(0);
  });
});

describe("mapProviderResults", () => {
  it("maps rows and drops any without a place id", () => {
    const rows: ProviderPlace[] = [
      { place_id: "a", name: "A", geometry: { location: ORIGIN } },
      { name: "no id — dropped", geometry: { location: ORIGIN } },
      { place_id: "b", name: "B", geometry: { location: { lat: 37.78, lng: -122.42 } } },
    ];
    const mapped = mapProviderResults(rows, ORIGIN);
    expect(mapped.map((m) => m.placeId)).toEqual(["a", "b"]);
  });
});
