import { describe, expect, it } from "vitest";
import {
  averagePicks,
  daysSinceLastPick,
  normalizeStatRow,
  overdueRestaurants,
  rankStats,
  type RestaurantStat,
  topRestaurants,
  totalPicks,
} from "./stats";

const d = (s: string) => new Date(s);

const sample: RestaurantStat[] = [
  { id: 1, name: "Ramen House", pickCount: 5, lastPickedAt: d("2026-06-01") },
  { id: 2, name: "Sushi Bar", pickCount: 9, lastPickedAt: d("2026-06-05") },
  { id: 3, name: "Pho Corner", pickCount: 9, lastPickedAt: d("2026-06-08") }, // tie on count, newer
  { id: 4, name: "Pizza Palace", pickCount: 0, lastPickedAt: null },
];

describe("normalizeStatRow", () => {
  it("coerces a string COUNT and date string into typed values", () => {
    const row = normalizeStatRow({ id: 1, name: "X", pickCount: "7", lastPickedAt: "2026-06-01" });
    expect(row.pickCount).toBe(7);
    expect(row.lastPickedAt).toBeInstanceOf(Date);
  });

  it("defaults a missing count to 0 and null date to null", () => {
    const row = normalizeStatRow({ id: 1, name: "X", pickCount: null, lastPickedAt: null });
    expect(row.pickCount).toBe(0);
    expect(row.lastPickedAt).toBeNull();
  });
});

describe("rankStats", () => {
  it("sorts by pick count desc, breaking ties by most recent pick", () => {
    const ranked = rankStats(sample).map((r) => r.id);
    expect(ranked).toEqual([3, 2, 1, 4]);
  });

  it("does not mutate the input", () => {
    const copy = [...sample];
    rankStats(sample);
    expect(sample).toEqual(copy);
  });
});

describe("topRestaurants", () => {
  it("returns the n highest-ranked", () => {
    expect(topRestaurants(sample, 2).map((r) => r.id)).toEqual([3, 2]);
  });
});

describe("aggregates", () => {
  it("totals and averages pick counts", () => {
    expect(totalPicks(sample)).toBe(23);
    expect(averagePicks(sample)).toBeCloseTo(5.75);
  });

  it("averages to 0 for an empty list", () => {
    expect(averagePicks([])).toBe(0);
  });
});

describe("daysSinceLastPick", () => {
  const now = d("2026-06-11T12:00:00Z");
  it("returns whole days since the last pick", () => {
    expect(daysSinceLastPick(d("2026-06-05T12:00:00Z"), now)).toBe(6);
  });
  it("returns null when never picked", () => {
    expect(daysSinceLastPick(null, now)).toBeNull();
  });
});

describe("overdueRestaurants", () => {
  const now = d("2026-06-20T00:00:00Z");
  const stats: RestaurantStat[] = [
    { id: 1, name: "Recent", pickCount: 3, lastPickedAt: d("2026-06-18") }, // 2d ago — not overdue
    { id: 2, name: "Old", pickCount: 1, lastPickedAt: d("2026-06-01") }, // 19d ago — overdue
    { id: 3, name: "Ancient", pickCount: 1, lastPickedAt: d("2026-05-10") }, // 41d ago — most overdue
    { id: 4, name: "BlindSpot", pickCount: 0, lastPickedAt: null }, // never — first
  ];

  it("lists never-picked first, then longest-overdue, excluding recent picks", () => {
    const ids = overdueRestaurants(stats, { now, thresholdDays: 14 }).map((e) => e.stat.id);
    expect(ids).toEqual([4, 3, 2]);
  });

  it("respects a custom threshold", () => {
    const ids = overdueRestaurants(stats, { now, thresholdDays: 40 }).map((e) => e.stat.id);
    expect(ids).toEqual([4, 3]); // only never-picked + the 41d one
  });

  it("reports daysSince (null for blind spots)", () => {
    const entries = overdueRestaurants(stats, { now, thresholdDays: 14 });
    expect(entries[0]).toEqual({ stat: stats[3], daysSince: null });
    expect(entries[1]!.daysSince).toBe(41);
  });
});
