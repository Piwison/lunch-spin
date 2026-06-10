import { describe, expect, it } from "vitest";
import { computeExcludedIds, type SpinRecord } from "./exclusion";

const now = new Date("2026-06-10T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

function spin(restaurantId: number, spunAt: Date, manuallyReenabled = false): SpinRecord {
  return { restaurantId, spunAt, manuallyReenabled };
}

describe("computeExcludedIds", () => {
  it("excludes a restaurant spun within the window", () => {
    expect(computeExcludedIds([spin(1, hoursAgo(1))], { now })).toEqual([1]);
  });

  it("does not exclude a restaurant spun before the window", () => {
    expect(computeExcludedIds([spin(1, daysAgo(4))], { now })).toEqual([]);
  });

  it("respects a manual re-enable on the latest spin", () => {
    expect(computeExcludedIds([spin(1, hoursAgo(1), true)], { now })).toEqual([]);
  });

  it("uses only the latest spin per restaurant to decide", () => {
    const spins = [
      spin(1, hoursAgo(2), true), // latest → re-enabled, stays available
      spin(1, hoursAgo(5), false), // older → would exclude, but ignored
    ];
    expect(computeExcludedIds(spins, { now })).toEqual([]);
  });

  it("handles multiple restaurants independently", () => {
    const spins = [
      spin(1, hoursAgo(1)),
      spin(2, daysAgo(5)),
      spin(3, hoursAgo(2), true),
    ];
    const excluded = computeExcludedIds(spins, { now });
    expect(excluded).toContain(1);
    expect(excluded).not.toContain(2);
    expect(excluded).not.toContain(3);
  });

  it("honors a custom window length", () => {
    expect(computeExcludedIds([spin(1, daysAgo(5))], { now, windowDays: 7 })).toEqual([1]);
    expect(computeExcludedIds([spin(1, daysAgo(5))], { now, windowDays: 3 })).toEqual([]);
  });
});
