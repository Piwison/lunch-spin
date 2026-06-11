import { describe, expect, it } from "vitest";
import { pickWinner } from "./pick";

describe("pickWinner", () => {
  it("throws when there are no candidates", () => {
    expect(() => pickWinner([])).toThrow();
  });

  it("returns the only candidate", () => {
    expect(pickWinner([42], () => 0.99)).toBe(42);
  });

  it("maps rng=0 to the first candidate and rng→1 to the last", () => {
    const ids = [10, 20, 30, 40];
    expect(pickWinner(ids, () => 0)).toBe(10);
    expect(pickWinner(ids, () => 0.999999)).toBe(40);
  });

  it("selects the candidate for a mid-range rng", () => {
    const ids = [10, 20, 30, 40];
    expect(pickWinner(ids, () => 0.5)).toBe(30);
  });

  it("only ever returns a value from the candidate list", () => {
    const ids = [1, 2, 3];
    for (let i = 0; i < 50; i++) {
      expect(ids).toContain(pickWinner(ids));
    }
  });
});
