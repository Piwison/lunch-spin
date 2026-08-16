import { describe, it, expect } from "vitest";
import { nextWheelToOpen, resolveBootstrapWheelId, speculativeWheelId } from "./bootstrap";

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

describe("speculativeWheelId", () => {
  it("guesses the explicitly requested wheel", () => {
    expect(speculativeWheelId(9, 3)).toBe(9);
  });

  it("guesses the starred default when nothing was requested", () => {
    expect(speculativeWheelId(null, 3)).toBe(3);
  });

  it("has nothing to guess for a first-time user", () => {
    expect(speculativeWheelId(null, null)).toBeNull();
    expect(speculativeWheelId(undefined, undefined)).toBeNull();
  });

  it("keeps a requested wheel of 0 rather than treating it as absent", () => {
    // ?? not ||: id 0 is falsy but is still an explicit request.
    expect(speculativeWheelId(0, 3)).toBe(0);
  });

  // The guard that makes the speculative read safe: it is only ever a
  // prefetch, never an authorization decision. Whenever the guess names a
  // wheel the user cannot actually see, it disagrees with the real resolver —
  // so the caller's `guess === resolved` check discards it and re-reads.
  it("disagrees with the resolver whenever the guess is not accessible", () => {
    const guess = speculativeWheelId(999, 3);
    const resolved = resolveBootstrapWheelId(ids, 999, 3);
    expect(guess).toBe(999);
    expect(resolved).toBe(3);
    expect(guess).not.toBe(resolved);
  });

  it("agrees with the resolver on the paths worth prefetching", () => {
    // Requested + accessible, and default + accessible: the two entry shapes
    // that make up almost every real load.
    expect(speculativeWheelId(9, 3)).toBe(resolveBootstrapWheelId(ids, 9, 3));
    expect(speculativeWheelId(null, 3)).toBe(resolveBootstrapWheelId(ids, null, 3));
  });
});

describe("nextWheelToOpen", () => {
  it("opens the wheel the entry payload resolved", () => {
    expect(nextWheelToOpen(9, [])).toBe(9);
  });

  it("has nothing to open for a first-run user", () => {
    expect(nextWheelToOpen(null, [])).toBeNull();
    expect(nextWheelToOpen(undefined, [])).toBeNull();
  });

  it("refuses a wheel already proven gone this session", () => {
    // The regression this exists for: deleting the open wheel made wheels.get
    // 404, the app dropped the selection, and the still-cached entry payload —
    // resolved BEFORE the delete — immediately re-proposed the same dead id.
    // The two effects then ping-ponged until React threw #185 (Maximum update
    // depth exceeded) and the error boundary swallowed the whole app.
    expect(nextWheelToOpen(9, [9])).toBeNull();
  });

  it("still opens a surviving wheel once the payload refreshes", () => {
    expect(nextWheelToOpen(3, [9])).toBe(3);
  });

  it("accepts a Set, which is what the caller actually holds", () => {
    expect(nextWheelToOpen(9, new Set([7, 9]))).toBeNull();
    expect(nextWheelToOpen(9, new Set([7]))).toBe(9);
  });

  it("treats wheel id 0 as a real wheel, not as absent", () => {
    expect(nextWheelToOpen(0, [])).toBe(0);
    expect(nextWheelToOpen(0, [0])).toBeNull();
  });
});
