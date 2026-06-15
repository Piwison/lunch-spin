import { describe, expect, it } from "vitest";
import { activePresence, buildSessionState, type RoundMarkRow } from "./realtimeState";

describe("buildSessionState", () => {
  it("groups veto/vote by restaurant and dietary by user", () => {
    const rows: RoundMarkRow[] = [
      { kind: "veto", refId: 10, userId: 1 },
      { kind: "veto", refId: 10, userId: 2 },
      { kind: "vote", refId: 11, userId: 1 },
      { kind: "dietary", refId: 99, userId: 2 }, // user 2 avoids tag 99
      { kind: "dietary", refId: 98, userId: 2 },
    ];
    expect(buildSessionState(rows)).toEqual({
      vetoes: [{ restaurantId: 10, userIds: [1, 2] }],
      votes: [{ restaurantId: 11, userIds: [1] }],
      dietary: [{ userId: 2, tagIds: [99, 98] }],
    });
  });

  it("returns empty arrays for no rows", () => {
    expect(buildSessionState([])).toEqual({ vetoes: [], votes: [], dietary: [] });
  });
});

describe("activePresence", () => {
  const NOW = 1_000_000;
  const TTL = 20_000;

  it("keeps heartbeats within the TTL and drops stale ones", () => {
    const rows = [
      { userId: 1, name: "Ann", lastSeen: NOW - 5_000 },
      { userId: 2, name: "Bob", lastSeen: NOW - 25_000 }, // stale
      { userId: 3, name: null, lastSeen: NOW },
    ];
    expect(activePresence(rows, NOW, TTL)).toEqual([
      { userId: 1, name: "Ann" },
      { userId: 3, name: null },
    ]);
  });

  it("accepts Date and ISO-string timestamps", () => {
    const rows = [
      { userId: 1, name: "Ann", lastSeen: new Date(NOW - 1_000) },
      { userId: 2, name: "Bob", lastSeen: new Date(NOW - 1_000).toISOString() },
    ];
    expect(activePresence(rows, NOW, TTL).map((u) => u.userId)).toEqual([1, 2]);
  });
});
