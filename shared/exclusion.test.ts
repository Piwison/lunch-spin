import { describe, expect, it } from "vitest";
import { computeExcludedIds, computeExclusions, formatExclusionTimeLeft, type SpinRecord } from "./exclusion";

// Noon in Taipei (UTC+8) on 2026-06-10 — a realistic "deciding lunch" moment.
// The Taipei calendar day 2026-06-10 spans UTC [2026-06-09T16:00Z, 2026-06-10T16:00Z).
const now = new Date("2026-06-10T04:00:00Z");
const TAIPEI_MIDNIGHT_AFTER = new Date("2026-06-10T16:00:00Z"); // next Taipei midnight
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

function spin(
  restaurantId: number,
  spunAt: Date,
  opts: { accepted?: boolean; reenabled?: boolean } = {},
): SpinRecord {
  return {
    restaurantId,
    spunAt,
    manuallyReenabled: opts.reenabled ?? false,
    accepted: opts.accepted ?? false,
  };
}

describe("computeExclusions — two-tier (accepted vs rejected)", () => {
  it("an ACCEPTED spin is excluded for the full window", () => {
    const at = hoursAgo(1);
    expect(computeExclusions([spin(1, at, { accepted: true })], { now, windowDays: 3 })).toEqual([
      { restaurantId: 1, excludedUntil: new Date(at.getTime() + 3 * 24 * 60 * 60 * 1000) },
    ]);
  });

  it("an ACCEPTED spin from days ago is still excluded while inside the window", () => {
    const at = daysAgo(2);
    expect(computeExcludedIds([spin(1, at, { accepted: true })], { now, windowDays: 3 })).toEqual([1]);
  });

  it("a non-accepted (rejected) spin from earlier the same Taipei day excludes only until the next Taipei midnight", () => {
    expect(computeExclusions([spin(1, hoursAgo(1))], { now, windowDays: 3 })).toEqual([
      { restaurantId: 1, excludedUntil: TAIPEI_MIDNIGHT_AFTER },
    ]);
  });

  it("a non-accepted spin from a PREVIOUS Taipei day is NOT excluded, even inside the window", () => {
    // 2026-06-09T12:00Z = 20:00 Taipei on 06-09 — yesterday in Taipei, ~16h ago.
    expect(computeExcludedIds([spin(1, new Date("2026-06-09T12:00:00Z"))], { now, windowDays: 3 })).toEqual([]);
  });

  it("treats a late-UTC-yesterday spin that is still 'today' in Taipei as today", () => {
    // 2026-06-09T20:00Z = 04:00 Taipei on 06-10 — same Taipei day as `now`.
    expect(computeExcludedIds([spin(1, new Date("2026-06-09T20:00:00Z"))], { now, windowDays: 3 })).toEqual([1]);
  });

  it("a manual re-enable overrides even an accepted spin", () => {
    expect(computeExclusions([spin(1, hoursAgo(1), { accepted: true, reenabled: true })], { now, windowDays: 3 })).toEqual([]);
  });

  it("uses only the latest spin per restaurant to decide", () => {
    const spins = [
      spin(1, hoursAgo(1), { reenabled: true }), // latest → re-enabled, available
      spin(1, hoursAgo(5), { accepted: true }), // older → would exclude, ignored
    ];
    expect(computeExcludedIds(spins, { now, windowDays: 3 })).toEqual([]);
  });

  it("excludes nothing when the window is off (0 days)", () => {
    expect(computeExcludedIds([spin(1, hoursAgo(1), { accepted: true })], { now, windowDays: 0 })).toEqual([]);
  });

  it("handles a mix of accepted, rejected-today, rejected-earlier-day independently", () => {
    const spins = [
      spin(1, hoursAgo(1), { accepted: true }), // long exclusion
      spin(2, hoursAgo(2)), // rejected today → excluded until Taipei midnight
      spin(3, new Date("2026-06-09T12:00:00Z")), // rejected yesterday (Taipei) → available
    ];
    const excluded = computeExcludedIds(spins, { now, windowDays: 3 });
    expect(excluded).toContain(1);
    expect(excluded).toContain(2);
    expect(excluded).not.toContain(3);
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
