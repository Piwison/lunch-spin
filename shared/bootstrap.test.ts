import { describe, it, expect } from "vitest";
import { resolveBootstrapWheelId } from "./bootstrap";

const ids = [7, 3, 9];

describe("resolveBootstrapWheelId", () => {
  it("returns null when the user has no wheels", () => {
    expect(resolveBootstrapWheelId([], 5, 3)).toBeNull();
  });

  it("prefers an explicitly requested wheel the user can see", () => {
    expect(resolveBootstrapWheelId(ids, 9, 3)).toBe(9);
  });

  it("ignores a requested wheel the user is not a member of", () => {
    // A stale or shared-out link: fall back rather than leaking/So the caller's
    // own wheels.get still produces the "not available anymore" eject.
    expect(resolveBootstrapWheelId(ids, 999, 3)).toBe(3);
  });

  it("falls back to the starred default wheel", () => {
    expect(resolveBootstrapWheelId(ids, null, 3)).toBe(3);
  });

  it("ignores a default wheel that is no longer accessible (e.g. deleted)", () => {
    expect(resolveBootstrapWheelId(ids, null, 404)).toBe(7);
  });

  it("falls back to the first wheel when no default is set", () => {
    expect(resolveBootstrapWheelId(ids, null, null)).toBe(7);
  });

  it("treats an undefined request the same as null", () => {
    expect(resolveBootstrapWheelId(ids, undefined, undefined)).toBe(7);
  });
});
