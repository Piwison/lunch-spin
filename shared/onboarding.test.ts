import { describe, expect, it } from "vitest";
import {
  FIRST_SPIN_CTA_THRESHOLD,
  canStartSpinning,
  isFirstRun,
  preselectPlaceIds,
  shouldPromptSignup,
} from "./onboarding";

describe("shouldPromptSignup (guest conversion, decision 1b)", () => {
  it("does NOT prompt before the first spin", () => {
    expect(shouldPromptSignup(0)).toBe(false);
  });

  it("prompts from the first completed spin onward", () => {
    expect(shouldPromptSignup(1)).toBe(true);
    expect(shouldPromptSignup(2)).toBe(true);
    expect(shouldPromptSignup(50)).toBe(true);
  });

  it("uses the documented threshold (earned, not nagged)", () => {
    expect(FIRST_SPIN_CTA_THRESHOLD).toBe(1);
    expect(shouldPromptSignup(FIRST_SPIN_CTA_THRESHOLD)).toBe(true);
    expect(shouldPromptSignup(FIRST_SPIN_CTA_THRESHOLD - 1)).toBe(false);
  });

  it("treats negative/garbage counts as 'not yet spun'", () => {
    expect(shouldPromptSignup(-1)).toBe(false);
    expect(shouldPromptSignup(Number.NaN)).toBe(false);
  });
});

describe("isFirstRun (signed-in zero-wheel detection, decision 2b)", () => {
  it("is a first run only when the user has zero wheels", () => {
    expect(isFirstRun(0)).toBe(true);
    expect(isFirstRun(1)).toBe(false);
    expect(isFirstRun(7)).toBe(false);
  });

  it("does not treat 'has wheels but none selected' as a first run", () => {
    // The component passes the wheel COUNT, not the selection state — a returning
    // user who simply hasn't picked a wheel still has wheels.length > 0.
    expect(isFirstRun(3)).toBe(false);
  });

  it("treats negative/garbage counts as not-first-run (fail safe, don't nag)", () => {
    expect(isFirstRun(-1)).toBe(false);
    expect(isFirstRun(Number.NaN)).toBe(false);
  });
});

describe("preselectPlaceIds (which nearby results arrive already ticked)", () => {
  const p = (placeId: string, open: boolean | null = true) => ({ placeId, open });

  it("pre-selects the first N, so progress is the default and not the task", () => {
    const places = [p("a"), p("b"), p("c"), p("d")];
    expect(preselectPlaceIds(places, 3)).toEqual(["a", "b", "c"]);
  });

  it("takes everything when there are fewer results than the target", () => {
    expect(preselectPlaceIds([p("a"), p("b")], 8)).toEqual(["a", "b"]);
  });

  it("prefers open places, because the point is to spin RIGHT NOW", () => {
    // Results arrive walk-time sorted, so "b" is nearer than "d" — but a place
    // that's shut can't be lunch today.
    const places = [p("a", false), p("b", false), p("c", true), p("d", true)];
    expect(preselectPlaceIds(places, 2)).toEqual(["c", "d"]);
  });

  it("keeps walk-time order among the places it picks", () => {
    const places = [p("a", true), p("b", false), p("c", true)];
    expect(preselectPlaceIds(places, 2)).toEqual(["a", "c"]);
  });

  it("tops up with closed places rather than under-filling the wheel", () => {
    const places = [p("a", false), p("b", true), p("c", false)];
    expect(preselectPlaceIds(places, 3)).toEqual(["a", "b", "c"]);
  });

  it("treats unknown open-state as open (the provider often omits it)", () => {
    const places = [p("a", null), p("b", false)];
    expect(preselectPlaceIds(places, 1)).toEqual(["a"]);
  });

  it("handles an empty result set", () => {
    expect(preselectPlaceIds([], 8)).toEqual([]);
  });
});

describe("canStartSpinning", () => {
  it("needs at least two places — a one-segment wheel isn't a decision", () => {
    expect(canStartSpinning(0)).toBe(false);
    expect(canStartSpinning(1)).toBe(false);
    expect(canStartSpinning(2)).toBe(true);
    expect(canStartSpinning(12)).toBe(true);
  });

  it("fails safe on garbage", () => {
    expect(canStartSpinning(Number.NaN)).toBe(false);
    expect(canStartSpinning(-3)).toBe(false);
  });
});
