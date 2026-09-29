import { describe, expect, it } from "vitest";
import { classifySpins, endOfTaipeiDay, lunchStats, startOfTaipeiDay, taipeiClock, taipeiDayIndex, todaysLunches, type SpinFacts } from "./lunch";

const AMY = 1;
const BEN = 2;

// 2026-09-24 in Taipei spans UTC [2026-09-23T16:00Z, 2026-09-24T16:00Z).
const taipei = (hhmm: string, day = "2026-09-24") => {
  const [h, m] = hhmm.split(":").map(Number);
  const [y, mo, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h - 8, m));
};

let nextId = 1;
function spin(
  restaurantId: number,
  spunBy: number,
  spunAt: Date,
  opts: { accepted?: boolean; skipped?: boolean; id?: number } = {},
): SpinFacts {
  return {
    id: opts.id ?? nextId++,
    restaurantId,
    spunBy,
    spunAt,
    accepted: opts.accepted ?? false,
    skipped: opts.skipped ?? false,
  };
}

const kinds = (rows: SpinFacts[]) => {
  const byId = classifySpins(rows);
  return rows.map((r) => byId.get(r.id));
};

describe("Taipei calendar day", () => {
  it("is anchored to UTC+8", () => {
    expect(taipeiDayIndex(taipei("00:00"))).toBe(taipeiDayIndex(taipei("23:59")));
    expect(taipeiDayIndex(taipei("23:59"))).not.toBe(taipeiDayIndex(taipei("00:01", "2026-09-25")));
  });

  it("starts and ends at Taipei midnight", () => {
    expect(startOfTaipeiDay(taipei("12:10"))).toEqual(new Date("2026-09-23T16:00:00Z"));
    expect(endOfTaipeiDay(taipei("12:10"))).toEqual(new Date("2026-09-24T16:00:00Z"));
  });
});

describe("classifySpins — what counts as lunch (plan §1)", () => {
  it("Amy spins X and closes the result → X is lunch", () => {
    expect(kinds([spin(10, AMY, taipei("12:10"))])).toEqual(["lunch"]);
  });

  it("Amy spins X, respins, gets Y → X respun, Y lunch", () => {
    expect(kinds([spin(10, AMY, taipei("12:10")), spin(11, AMY, taipei("12:11"))])).toEqual(["respun", "lunch"]);
  });

  it("Amy spins Y, Ben spins Z → both lunches (two groups)", () => {
    expect(kinds([spin(11, AMY, taipei("12:10")), spin(12, BEN, taipei("12:22"))])).toEqual(["lunch", "lunch"]);
  });

  it("an accepted spin stays lunch even if the same person spins again", () => {
    expect(kinds([spin(10, AMY, taipei("12:10"), { accepted: true }), spin(13, AMY, taipei("12:30"))])).toEqual([
      "lunch",
      "lunch",
    ]);
  });

  it("yesterday's unaccepted spin with no respin is lunch", () => {
    expect(kinds([spin(10, AMY, taipei("12:10", "2026-09-23"))])).toEqual(["lunch"]);
  });

  it("a lunch later marked skipped is not lunch", () => {
    expect(kinds([spin(10, AMY, taipei("12:10"), { skipped: true })])).toEqual(["skipped"]);
  });

  it("skipped wins over accepted", () => {
    expect(kinds([spin(10, AMY, taipei("12:10"), { accepted: true, skipped: true })])).toEqual(["skipped"]);
  });

  it("a spin the next Taipei day does not override yesterday's", () => {
    expect(kinds([spin(10, AMY, taipei("12:10", "2026-09-23")), spin(11, AMY, taipei("12:10"))])).toEqual([
      "lunch",
      "lunch",
    ]);
  });

  it("Taipei midnight: 23:59 and 00:01 are two days, so both are lunch", () => {
    expect(kinds([spin(10, AMY, taipei("23:59", "2026-09-23")), spin(11, AMY, taipei("00:01"))])).toEqual([
      "lunch",
      "lunch",
    ]);
  });

  it("two spins in the same second are ordered by id", () => {
    const at = taipei("12:10");
    const rows = [spin(11, AMY, at, { id: 501 }), spin(10, AMY, at, { id: 500 })];
    expect(kinds(rows)).toEqual(["lunch", "respun"]);
  });

  it("does not depend on input order", () => {
    const a = spin(10, AMY, taipei("12:10"));
    const b = spin(11, AMY, taipei("12:11"));
    expect(classifySpins([b, a]).get(a.id)).toBe("respun");
    expect(classifySpins([b, a]).get(b.id)).toBe("lunch");
  });

  it("a later skipped spin still means the earlier one was respun", () => {
    expect(kinds([spin(10, AMY, taipei("12:10")), spin(11, AMY, taipei("12:11"), { skipped: true })])).toEqual([
      "respun",
      "skipped",
    ]);
  });
});

describe("lunchStats — R3 seed data (three weeks, 20 spins)", () => {
  // scripts/replica/seed.mjs, dumped from the replica: [restaurantId, spunBy, spunAt, accepted].
  // Restaurant ids 1–12 in menu order; 11 = Bafang Dumpling Neihu. 1 = Amy, 2 = Ben.
  const R3: [number, number, string, boolean][] = [
    [9, 2, "2026-09-03T03:48:10Z", false], [6, 2, "2026-09-03T03:49:05Z", true],
    [7, 2, "2026-09-04T03:54:30Z", false], [3, 2, "2026-09-07T03:54:30Z", true],
    [1, 2, "2026-09-08T03:53:30Z", false], [10, 1, "2026-09-09T03:56:30Z", true],
    [8, 1, "2026-09-10T03:56:10Z", false], [6, 1, "2026-09-10T03:56:30Z", false],
    [12, 1, "2026-09-10T03:57:05Z", true], [9, 1, "2026-09-11T03:49:30Z", true],
    [5, 1, "2026-09-14T03:48:30Z", false], [11, 2, "2026-09-15T03:51:10Z", false],
    [1, 2, "2026-09-15T03:51:30Z", false], [4, 2, "2026-09-15T03:52:05Z", true],
    [3, 1, "2026-09-16T03:50:30Z", true], [6, 1, "2026-09-17T03:49:30Z", true],
    [2, 2, "2026-09-18T03:51:30Z", true], [7, 1, "2026-09-21T03:49:30Z", false],
    [4, 1, "2026-09-22T03:52:30Z", false], [8, 1, "2026-09-23T03:55:30Z", true],
  ];
  const rows: SpinFacts[] = R3.map(([restaurantId, spunBy, at, accepted], i) => ({
    id: i + 1,
    restaurantId,
    spunBy,
    spunAt: new Date(at),
    accepted,
    skipped: false,
  }));

  it("counts 15 days with a lunch and 11 of 12 places eaten", () => {
    const s = lunchStats(rows);
    expect(s.lunchDays).toBe(15);
    expect(s.placesEaten).toBe(11);
  });

  it("a place that was only ever respun has no lunch", () => {
    expect(lunchStats(rows).byRestaurant.has(11)).toBe(false);
  });

  it("counts lunches, not spins, per place", () => {
    // 首爾韓式小館 (6): lunch 9/03 and 9/17, respun 9/10.
    expect(lunchStats(rows).byRestaurant.get(6)).toEqual({ lunchCount: 2, lastLunchAt: new Date("2026-09-17T03:49:30Z") });
    // Goose Meat Dan (1): lunch 9/08, respun 9/15.
    expect(lunchStats(rows).byRestaurant.get(1)).toEqual({ lunchCount: 1, lastLunchAt: new Date("2026-09-08T03:53:30Z") });
  });

  it("skipped spins drop out of every figure", () => {
    const skipped = rows.map((r) => (r.id === 17 ? { ...r, skipped: true } : r)); // 9/18 Shian Ming Tea
    const s = lunchStats(skipped);
    expect(s.lunchDays).toBe(14);
    expect(s.placesEaten).toBe(10);
    expect(s.byRestaurant.has(2)).toBe(false);
  });
});

describe("todaysLunches — the rows on the today card", () => {
  const now = taipei("12:30");

  it("lists today's lunches oldest first, one row per decision", () => {
    const a = spin(10, AMY, taipei("12:10"));
    const b = spin(12, BEN, taipei("12:22"));
    expect(todaysLunches([b, a], now).map((r) => r.id)).toEqual([a.id, b.id]);
  });

  it("keeps only the last of one person's respins", () => {
    const x = spin(10, AMY, taipei("12:10"));
    const y = spin(11, AMY, taipei("12:11"));
    expect(todaysLunches([x, y], now).map((r) => r.id)).toEqual([y.id]);
  });

  it("does not show yesterday's lunch, even one minute before midnight", () => {
    expect(todaysLunches([spin(10, AMY, taipei("23:59", "2026-09-23"))], now)).toEqual([]);
  });

  it("leaves out a skipped spin", () => {
    expect(todaysLunches([spin(10, AMY, taipei("12:10"), { skipped: true })], now)).toEqual([]);
  });

  it("keeps an accepted lunch alongside the same person's later one", () => {
    const x = spin(10, AMY, taipei("12:10"), { accepted: true });
    const w = spin(13, AMY, taipei("12:20"));
    expect(todaysLunches([x, w], now).map((r) => r.id)).toEqual([x.id, w.id]);
  });
});

describe("taipeiClock", () => {
  it("prints the Taipei wall clock whatever the runtime's zone", () => {
    expect(taipeiClock(taipei("12:10"))).toBe("12:10");
    expect(taipeiClock(taipei("00:05"))).toBe("00:05");
  });
});
