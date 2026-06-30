import { describe, expect, it } from "vitest";
import {
  FIRST_SPIN_CTA_THRESHOLD,
  isFirstRun,
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
