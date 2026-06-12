import { describe, expect, it } from "vitest";
import { computeExcludedIds, computeExclusions, formatExclusionTimeLeft, type SpinRecord } from "./exclusion";

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

  it("excludes nothing when the window is off (0 days)", () => {
    expect(computeExcludedIds([spin(1, hoursAgo(1))], { now, windowDays: 0 })).toEqual([]);
  });
});

describe("computeExclusions", () => {
  it("reports when an excluded restaurant becomes available again", () => {
    const exclusions = computeExclusions([spin(1, hoursAgo(1))], { now, windowDays: 3 });
    expect(exclusions).toEqual([
      { restaurantId: 1, excludedUntil: new Date(hoursAgo(1).getTime() + 3 * 24 * 60 * 60 * 1000) },
    ]);
  });

  it("omits manually re-enabled restaurants", () => {
    expect(computeExclusions([spin(1, hoursAgo(1), true)], { now })).toEqual([]);
  });
});

describe("formatExclusionTimeLeft", () => {
  it("formats days and hours", () => {
    expect(formatExclusionTimeLeft(new Date(now.getTime() + 50 * 60 * 60 * 1000), now)).toBe("2d 2h");
  });

  it("formats hours only", () => {
    expect(formatExclusionTimeLeft(new Date(now.getTime() + 5 * 60 * 60 * 1000), now)).toBe("5h");
  });

  it("formats minutes when under an hour", () => {
    expect(formatExclusionTimeLeft(new Date(now.getTime() + 12 * 60 * 1000), now)).toBe("12m");
  });

  it("returns expired for past timestamps", () => {
    expect(formatExclusionTimeLeft(new Date(now.getTime() - 1000), now)).toBe("expired");
  });
});
