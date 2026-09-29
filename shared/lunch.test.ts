import { describe, expect, it } from "vitest";
import { classifySpins, endOfTaipeiDay, startOfTaipeiDay, taipeiDayIndex, type SpinFacts } from "./lunch";

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
