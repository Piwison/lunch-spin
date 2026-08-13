import { describe, it, expect } from "vitest";
import {
  isOpenAt,
  minutesUntilClose,
  openState,
  parsePeriods,
  CLOSING_SOON_MINUTES,
  type OpenPeriod,
} from "./openHours";

// Google Places `periods`: day 0 = Sunday, time "HHMM" in the place's local time.
const mon9to5: OpenPeriod[] = [{ open: { day: 1, time: "0900" }, close: { day: 1, time: "1700" } }];
// Crosses midnight: Friday 18:00 → Saturday 02:00.
const friNight: OpenPeriod[] = [{ open: { day: 5, time: "1800" }, close: { day: 6, time: "0200" } }];
// Always open — Google signals this as a single open period with no close.
const always: OpenPeriod[] = [{ open: { day: 0, time: "0000" } }];

/** A UTC instant that reads as the given local wall-clock for offset 0. */
const at = (day: number, hh: number, mm = 0) =>
  // 2026-07-05 is a Sunday, so +day lands on the intended weekday.
  new Date(Date.UTC(2026, 6, 5 + day, hh, mm));

describe("parsePeriods", () => {
  it("returns null for missing/garbage payloads (unknown hours stay unknown)", () => {
    expect(parsePeriods(null)).toBeNull();
    expect(parsePeriods(undefined)).toBeNull();
    expect(parsePeriods("nonsense")).toBeNull();
    expect(parsePeriods({})).toBeNull();
    expect(parsePeriods([])).toBeNull();
  });
  it("accepts a raw Google periods array", () => {
    expect(parsePeriods(mon9to5)).toEqual(mon9to5);
  });
  it("accepts an opening_hours wrapper object", () => {
    expect(parsePeriods({ periods: mon9to5 })).toEqual(mon9to5);
  });
  it("drops entries without a valid open time", () => {
    expect(parsePeriods([{ close: { day: 1, time: "1700" } }])).toBeNull();
  });
});

describe("isOpenAt", () => {
  it("is null when hours are unknown — callers must keep those restaurants", () => {
    expect(isOpenAt(null, at(1, 12), 0)).toBeNull();
  });

  it("handles a simple same-day window", () => {
    expect(isOpenAt(mon9to5, at(1, 12), 0)).toBe(true); // Monday noon
    expect(isOpenAt(mon9to5, at(1, 8, 59), 0)).toBe(false); // just before open
    expect(isOpenAt(mon9to5, at(1, 17), 0)).toBe(false); // close is exclusive
    expect(isOpenAt(mon9to5, at(2, 12), 0)).toBe(false); // Tuesday: closed
  });

  it("handles a window that crosses midnight", () => {
    expect(isOpenAt(friNight, at(5, 23), 0)).toBe(true); // Friday 23:00
    expect(isOpenAt(friNight, at(6, 1), 0)).toBe(true); // Saturday 01:00 — still the Friday period
    expect(isOpenAt(friNight, at(6, 3), 0)).toBe(false); // after the 02:00 close
    expect(isOpenAt(friNight, at(5, 17), 0)).toBe(false); // before opening
  });

  it("treats a period with no close as always open", () => {
    expect(isOpenAt(always, at(3, 4), 0)).toBe(true);
  });

  it("applies the place's UTC offset, not the viewer's", () => {
    // 01:00 UTC Tuesday is 09:00 Tuesday in UTC+8 → open under mon9to5? No: it's
    // Tuesday there. Use Monday: 01:00 UTC Mon = 09:00 Mon in UTC+8 → open.
    expect(isOpenAt(mon9to5, new Date(Date.UTC(2026, 6, 6, 1, 0)), 480)).toBe(true);
    // 00:30 UTC Mon = 08:30 Mon in UTC+8 → not yet open.
    expect(isOpenAt(mon9to5, new Date(Date.UTC(2026, 6, 6, 0, 30)), 480)).toBe(false);
  });
});

describe("minutesUntilClose", () => {
  it("is null when unknown or closed or always-open", () => {
    expect(minutesUntilClose(null, at(1, 12), 0)).toBeNull();
    expect(minutesUntilClose(mon9to5, at(2, 12), 0)).toBeNull(); // closed
    expect(minutesUntilClose(always, at(2, 12), 0)).toBeNull(); // never closes
  });
  it("counts down to the close time", () => {
    expect(minutesUntilClose(mon9to5, at(1, 16, 30), 0)).toBe(30);
    expect(minutesUntilClose(mon9to5, at(1, 12), 0)).toBe(300);
  });
  it("counts across midnight", () => {
    expect(minutesUntilClose(friNight, at(6, 1, 30), 0)).toBe(30);
  });
});

describe("openState — what the UI and the spin filter consume", () => {
  it("unknown hours are their own state, never 'closed'", () => {
    expect(openState(null, at(1, 12), 0)).toEqual({ status: "unknown", minutesUntilClose: null });
  });
  it("reports open, closed, and closing-soon", () => {
    expect(openState(mon9to5, at(1, 12), 0).status).toBe("open");
    expect(openState(mon9to5, at(2, 12), 0).status).toBe("closed");
    const soon = openState(mon9to5, at(1, 16, 45), 0);
    expect(soon.status).toBe("closing_soon");
    expect(soon.minutesUntilClose).toBe(15);
  });
  it("closing_soon uses the shared threshold boundary", () => {
    // Exactly at the threshold still counts as closing soon.
    expect(openState(mon9to5, at(1, 17 - 1, 60 - CLOSING_SOON_MINUTES), 0).status).toBe("closing_soon");
    // One minute earlier is plain open.
    expect(openState(mon9to5, at(1, 16, 59 - CLOSING_SOON_MINUTES), 0).status).toBe("open");
  });
});
