import { describe, expect, it } from "vitest";
import { diagnoseSpinBlock, type SpinBlockInput } from "./spinBlock";

type R = SpinBlockInput["restaurants"][number];

const place = (id: number, over: Partial<R> = {}): R => ({
  id,
  isExcluded: false,
  openStatus: "open",
  walkSeconds: 300,
  tags: [],
  ...over,
});

const base: SpinBlockInput = {
  restaurants: [place(1), place(2)],
  selectedTagIds: [],
  maxWalkMinutes: null,
  vetoedIds: [],
  dietaryTagIds: [],
};

describe("diagnoseSpinBlock", () => {
  it("reports nothing to fix while places remain on the wheel", () => {
    expect(diagnoseSpinBlock(base).reason).toBe("none");
  });

  it("calls an empty wheel empty, not excluded", () => {
    expect(diagnoseSpinBlock({ ...base, restaurants: [] }).reason).toBe("empty");
  });

  it("names exclusion when every place was recently spun", () => {
    const d = diagnoseSpinBlock({
      ...base,
      restaurants: [place(1, { isExcluded: true }), place(2, { isExcluded: true })],
    });
    expect(d.reason).toBe("excluded");
    expect(d.counts.excluded).toBe(2);
  });

  it("names the tag filter rather than exclusion", () => {
    const d = diagnoseSpinBlock({ ...base, selectedTagIds: [99] });
    expect(d.reason).toBe("filters");
    expect(d.counts.filtered).toBe(2);
  });

  // The reported case: only a distance limit is set, and the old copy still
  // read "every restaurant is excluded or vetoed" — three things that were all
  // false. A walk limit is a filter and has to be named as one.
  it("names the distance limit as a filter", () => {
    const d = diagnoseSpinBlock({ ...base, maxWalkMinutes: 2 });
    expect(d.reason).toBe("filters");
    expect(d.counts.filtered).toBe(2);
  });

  it("names a place with no walk time as filtered, not excluded", () => {
    const d = diagnoseSpinBlock({
      ...base,
      restaurants: [place(1, { walkSeconds: null })],
      maxWalkMinutes: 10,
    });
    expect(d.reason).toBe("filters");
  });

  it("names closing hours when everything is shut", () => {
    const d = diagnoseSpinBlock({
      ...base,
      restaurants: [place(1, { openStatus: "closed" }), place(2, { openStatus: "closed" })],
    });
    expect(d.reason).toBe("closed");
    expect(d.counts.closed).toBe(2);
  });

  it("treats unknown hours as spinnable, matching the server", () => {
    const d = diagnoseSpinBlock({ ...base, restaurants: [place(1, { openStatus: "unknown" })] });
    expect(d.reason).toBe("none");
  });

  it("names this round's vetoes", () => {
    const d = diagnoseSpinBlock({ ...base, vetoedIds: [1, 2] });
    expect(d.reason).toBe("round");
    expect(d.counts.round).toBe(2);
  });

  it("names a dietary avoid as a round mark", () => {
    const d = diagnoseSpinBlock({
      ...base,
      restaurants: [place(1, { tags: [{ id: 7 }] }), place(2, { tags: [{ id: 7 }] })],
      dietaryTagIds: [7],
    });
    expect(d.reason).toBe("round");
  });

  // Several constraints can be true at once. The wheel is unblocked by lifting
  // ONE of them, so the copy has to name the one the user can undo in a tap —
  // clearing the round beats hunting for a re-enable.
  it("prefers the cheapest constraint to undo when several apply", () => {
    const d = diagnoseSpinBlock({
      ...base,
      restaurants: [place(1, { isExcluded: true }), place(2)],
      vetoedIds: [2],
    });
    expect(d.reason).toBe("round");
  });

  it("falls back to filters when the round is clear but a tag is set", () => {
    const d = diagnoseSpinBlock({
      ...base,
      restaurants: [place(1, { isExcluded: true }), place(2, { tags: [{ id: 1 }] })],
      selectedTagIds: [99],
    });
    expect(d.reason).toBe("filters");
  });

  it("counts only what each stage actually removed", () => {
    const d = diagnoseSpinBlock({
      ...base,
      restaurants: [
        place(1, { isExcluded: true }),
        place(2, { openStatus: "closed" }),
        place(3),
      ],
      vetoedIds: [3],
    });
    expect(d.counts).toEqual({ excluded: 1, filtered: 0, closed: 1, round: 1 });
  });
});
