import { describe, expect, it } from "vitest";
import { computeExcludedIds, computeExclusions, exclusionTimeLeft, formatExclusionTimeLeft, type SpinRecord } from "./exclusion";

// Noon in Taipei (UTC+8) on 2026-06-10 — a realistic "deciding lunch" moment.
// The Taipei calendar day 2026-06-10 spans UTC [2026-06-09T16:00Z, 2026-06-10T16:00Z).
const now = new Date("2026-06-10T04:00:00Z");
const TAIPEI_MIDNIGHT_AFTER = new Date("2026-06-10T16:00:00Z"); // next Taipei midnight
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

const AMY = 1;
const BEN = 2;
let nextId = 1;
function spin(
  restaurantId: number,
  spunAt: Date,
  opts: { accepted?: boolean; reenabled?: boolean; skipped?: boolean; by?: number } = {},
): SpinRecord {
  return {
    id: nextId++,
    restaurantId,
    spunBy: opts.by ?? AMY,
    spunAt,
    manuallyReenabled: opts.reenabled ?? false,
    accepted: opts.accepted ?? false,
    skipped: opts.skipped ?? false,
  };
}
// The same person spinning again later — what turns an earlier spin into a respin.
const respinAfter = (at: Date, by = AMY) => spin(99, new Date(at.getTime() + 60_000), { by });

describe("computeExclusions — lunch vs respun (shared/lunch.ts)", () => {
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

  it("an unaccepted spin nobody replaced is lunch: excluded for the full window", () => {
    const at = hoursAgo(1);
    expect(computeExclusions([spin(1, at)], { now, windowDays: 3 })).toEqual([
      { restaurantId: 1, excludedUntil: new Date(at.getTime() + 3 * 24 * 60 * 60 * 1000) },
    ]);
  });

  it("yesterday's unaccepted, unreplaced spin is still excluded (it was lunch)", () => {
    expect(computeExcludedIds([spin(1, new Date("2026-06-09T04:00:00Z"))], { now, windowDays: 3 })).toEqual([1]);
  });

  it("a spin the same person replaced today excludes only until the next Taipei midnight", () => {
    const at = hoursAgo(1);
    const excl = computeExclusions([spin(1, at), respinAfter(at)], { now, windowDays: 3 });
    expect(excl.find((e) => e.restaurantId === 1)).toEqual({ restaurantId: 1, excludedUntil: TAIPEI_MIDNIGHT_AFTER });
  });

  it("a spin replaced on a PREVIOUS Taipei day is NOT excluded, even inside the window", () => {
    // 2026-06-09T12:00Z = 20:00 Taipei on 06-09 — yesterday in Taipei, ~16h ago.
    const at = new Date("2026-06-09T12:00:00Z");
    expect(computeExcludedIds([spin(1, at), respinAfter(at)], { now, windowDays: 3 })).not.toContain(1);
  });

  it("treats a late-UTC-yesterday spin that is still 'today' in Taipei as today", () => {
    // 2026-06-09T20:00Z = 04:00 Taipei on 06-10 — same Taipei day as `now`.
    const at = new Date("2026-06-09T20:00:00Z");
    expect(computeExclusions([spin(1, at), respinAfter(at)], { now, windowDays: 3 }).find((e) => e.restaurantId === 1)).toEqual({
      restaurantId: 1,
      excludedUntil: TAIPEI_MIDNIGHT_AFTER,
    });
  });

  it("another person's spin does not replace mine (two groups)", () => {
    const at = hoursAgo(2);
    const excl = computeExclusions([spin(1, at, { by: AMY }), spin(2, hoursAgo(1), { by: BEN })], { now, windowDays: 3 });
    expect(excl.find((e) => e.restaurantId === 1)?.excludedUntil).toEqual(new Date(at.getTime() + 3 * 86400000));
  });

  it("a skipped spin excludes nothing", () => {
    expect(computeExcludedIds([spin(1, hoursAgo(1), { skipped: true })], { now, windowDays: 3 })).toEqual([]);
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

  it("handles a mix of lunch, respun-today and respun-earlier-day independently", () => {
    const spins = [
      spin(1, hoursAgo(1), { accepted: true }), // lunch → long exclusion
      spin(2, hoursAgo(2)), // replaced by the 1h-ago spin → excluded until Taipei midnight
      spin(3, new Date("2026-06-09T12:00:00Z")), // replaced yesterday (Taipei) → available
      spin(4, new Date("2026-06-09T12:05:00Z")),
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

describe("exclusionTimeLeft", () => {
  const at = (ms: number) => new Date(now.getTime() + ms);
  it("splits into days + hours, hours, or minutes — the same units formatExclusionTimeLeft prints", () => {
    expect(exclusionTimeLeft(at(50 * 3600_000), now)).toEqual({ unit: "dh", days: 2, hours: 2 });
    expect(exclusionTimeLeft(at(5 * 3600_000), now)).toEqual({ unit: "h", hours: 5 });
    expect(exclusionTimeLeft(at(12 * 60_000), now)).toEqual({ unit: "m", minutes: 12 });
    expect(exclusionTimeLeft(at(10_000), now)).toEqual({ unit: "m", minutes: 1 });
  });

  it("is null once the exclusion has run out", () => {
    expect(exclusionTimeLeft(at(-1000), now)).toBeNull();
    expect(exclusionTimeLeft(now, now)).toBeNull();
  });
});
