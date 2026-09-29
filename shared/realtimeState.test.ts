import { describe, expect, it } from "vitest";
import { activePresence, buildSessionState, isActiveMark, type RoundMarkRow } from "./realtimeState";

// 2026-09-24 12:05 Taipei (04:05 UTC).
const NOW = new Date("2026-09-24T04:05:00Z");
const TODAY = new Date("2026-09-24T03:50:00Z"); // 11:50 Taipei, same day
const YESTERDAY = new Date("2026-09-23T15:59:00Z"); // 23:59 Taipei the day before

describe("isActiveMark", () => {
  it("counts a mark made earlier the same Taipei day", () => {
    expect(isActiveMark({ createdAt: TODAY }, NOW)).toBe(true);
  });

  it("drops a mark from 23:59 the day before", () => {
    expect(isActiveMark({ createdAt: YESTERDAY }, NOW)).toBe(false);
  });

  it("turns over at Taipei midnight, not UTC midnight", () => {
    const midnight = new Date("2026-09-23T16:00:00Z"); // 00:00 Taipei on the 24th
    expect(isActiveMark({ createdAt: midnight }, NOW)).toBe(true);
    expect(isActiveMark({ createdAt: new Date(midnight.getTime() - 1) }, NOW)).toBe(false);
    // 07:59 Taipei is still the 24th even though UTC says the 23rd.
    expect(isActiveMark({ createdAt: new Date("2026-09-23T23:59:00Z") }, NOW)).toBe(true);
  });

  it("accepts the ISO strings and epoch numbers a driver may hand back", () => {
    expect(isActiveMark({ createdAt: TODAY.toISOString() }, NOW)).toBe(true);
    expect(isActiveMark({ createdAt: YESTERDAY.getTime() }, NOW)).toBe(false);
  });
});

describe("buildSessionState", () => {
  it("groups today's vetoes and votes by restaurant", () => {
    const rows: RoundMarkRow[] = [
      { kind: "veto", refId: 10, userId: 1, createdAt: TODAY },
      { kind: "veto", refId: 10, userId: 2, createdAt: TODAY },
      { kind: "vote", refId: 11, userId: 1, createdAt: TODAY },
    ];
    expect(buildSessionState(rows, NOW)).toEqual({
      vetoes: [{ restaurantId: 10, userIds: [1, 2] }],
      votes: [{ restaurantId: 11, userIds: [1] }],
      dietary: [],
    });
  });

  it("leaves out yesterday's veto and vote — 'not today' means today", () => {
    const rows: RoundMarkRow[] = [
      { kind: "veto", refId: 10, userId: 2, createdAt: YESTERDAY },
      { kind: "vote", refId: 11, userId: 2, createdAt: YESTERDAY },
      { kind: "veto", refId: 12, userId: 1, createdAt: TODAY },
    ];
    expect(buildSessionState(rows, NOW)).toEqual({
      vetoes: [{ restaurantId: 12, userIds: [1] }],
      votes: [],
      dietary: [],
    });
  });

  it("ignores legacy dietary rows: 'I don't eat' is a personal setting now (user_dietary)", () => {
    const rows: RoundMarkRow[] = [{ kind: "dietary", refId: 99, userId: 2, createdAt: TODAY }];
    expect(buildSessionState(rows, NOW).dietary).toEqual([]);
  });

  it("returns empty arrays for no rows", () => {
    expect(buildSessionState([], NOW)).toEqual({ vetoes: [], votes: [], dietary: [] });
  });
});

describe("activePresence", () => {
  const NOW_MS = 1_000_000;
  const TTL = 20_000;

  it("keeps heartbeats within the TTL and drops stale ones", () => {
    const rows = [
      { userId: 1, name: "Ann", lastSeen: NOW_MS - 5_000 },
      { userId: 2, name: "Bob", lastSeen: NOW_MS - 25_000 }, // stale
      { userId: 3, name: null, lastSeen: NOW_MS },
    ];
    expect(activePresence(rows, NOW_MS, TTL)).toEqual([
      { userId: 1, name: "Ann" },
      { userId: 3, name: null },
    ]);
  });

  it("accepts Date and ISO-string timestamps", () => {
    const rows = [
      { userId: 1, name: "Ann", lastSeen: new Date(NOW_MS - 1_000) },
      { userId: 2, name: "Bob", lastSeen: new Date(NOW_MS - 1_000).toISOString() },
    ];
    expect(activePresence(rows, NOW_MS, TTL).map((u) => u.userId)).toEqual([1, 2]);
  });
});
