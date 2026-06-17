import { describe, expect, it } from "vitest";
import {
  rankPopularWheels,
  toPublicRestaurant,
  toPublicWheel,
} from "./publicWheel";

describe("toPublicWheel", () => {
  it("keeps only public-safe fields and drops PII", () => {
    const row = {
      id: 7,
      name: "Downtown Lunch",
      ownerId: 42,
      isShared: true,
      isPublic: true,
      inviteToken: "secret-token",
      exclusionDays: 3,
      fairnessMode: true,
      rotateCuisines: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const pub = toPublicWheel(row);
    expect(pub).toEqual({ id: 7, name: "Downtown Lunch", isPublic: true, exclusionDays: 3 });
    // Regression guard: a wider schema must not widen the public surface.
    expect(Object.keys(pub).sort()).toEqual(["exclusionDays", "id", "isPublic", "name"]);
    expect(pub as Record<string, unknown>).not.toHaveProperty("ownerId");
    expect(pub as Record<string, unknown>).not.toHaveProperty("inviteToken");
  });
});

describe("toPublicRestaurant", () => {
  it("exposes name/notes/mapUrl/tags but not addedBy or internal ids", () => {
    const row = {
      id: 3,
      wheelId: 7,
      name: "Ramen House",
      notes: "great tonkotsu",
      mapUrl: "https://maps.google.com/?q=ramen",
      addedBy: 99,
      primaryTagId: 1,
      createdAt: new Date(),
      tags: [{ id: 1, name: "Japanese", color: "#f43f5e", category: "cuisine", extra: "x" }],
    };
    const pub = toPublicRestaurant(row);
    expect(pub).toEqual({
      id: 3,
      name: "Ramen House",
      notes: "great tonkotsu",
      mapUrl: "https://maps.google.com/?q=ramen",
      tags: [{ id: 1, name: "Japanese", color: "#f43f5e", category: "cuisine" }],
    });
    expect(pub as Record<string, unknown>).not.toHaveProperty("addedBy");
    expect(pub as Record<string, unknown>).not.toHaveProperty("wheelId");
    expect(pub.tags[0] as Record<string, unknown>).not.toHaveProperty("extra");
  });

  it("passes through null notes/mapUrl and empty tags", () => {
    const pub = toPublicRestaurant({ id: 1, name: "Plain", notes: null, mapUrl: null, tags: [] });
    expect(pub).toEqual({ id: 1, name: "Plain", notes: null, mapUrl: null, tags: [] });
  });
});

describe("rankPopularWheels", () => {
  const wheels = [
    { id: 1, name: "A" },
    { id: 2, name: "B" },
    { id: 3, name: "C" },
  ];

  it("orders by spin count desc, then restaurant count, then id", () => {
    const spins = new Map([
      [1, 5],
      [2, 5],
      [3, 0],
    ]);
    const rests = new Map([
      [1, 4],
      [2, 9],
      [3, 12],
    ]);
    const ranked = rankPopularWheels(wheels, spins, rests, 10);
    expect(ranked.map((w) => w.id)).toEqual([2, 1, 3]);
    expect(ranked[0]).toEqual({ id: 2, name: "B", spinCount: 5, restaurantCount: 9 });
  });

  it("defaults missing counts to 0 and honors the limit", () => {
    const ranked = rankPopularWheels(wheels, new Map(), new Map(), 2);
    expect(ranked).toHaveLength(2);
    expect(ranked.every((w) => w.spinCount === 0 && w.restaurantCount === 0)).toBe(true);
    // all-zero falls back to id order
    expect(ranked.map((w) => w.id)).toEqual([1, 2]);
  });
});
