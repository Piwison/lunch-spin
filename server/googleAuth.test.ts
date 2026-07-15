import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./googleAuth";

// Post-login redirect target, carried through the OAuth round-trip via a
// cookie (see g_oauth_redirect in registerGoogleAuthRoutes). This is the only
// guard between an attacker-supplied `?redirect=` and res.redirect(), so it
// needs to reject anything that isn't a same-origin relative path.
describe("safeRedirectPath", () => {
  it("passes through an ordinary same-origin path", () => {
    expect(safeRedirectPath("/join/abc123")).toBe("/join/abc123");
  });

  it("passes through a path with a query string", () => {
    expect(safeRedirectPath("/app/42?tab=history")).toBe("/app/42?tab=history");
  });

  it("defaults to / when missing", () => {
    expect(safeRedirectPath(undefined)).toBe("/");
  });

  it("defaults to / for an empty string", () => {
    expect(safeRedirectPath("")).toBe("/");
  });

  it("rejects a protocol-relative URL (//evil.com)", () => {
    expect(safeRedirectPath("//evil.com")).toBe("/");
  });

  it("rejects a backslash-leading path some browsers normalize to //", () => {
    expect(safeRedirectPath("/\\evil.com")).toBe("/");
  });

  it("rejects an absolute URL with a scheme", () => {
    expect(safeRedirectPath("https://evil.com")).toBe("/");
  });

  it("rejects a path with no leading slash", () => {
    expect(safeRedirectPath("join/abc123")).toBe("/");
  });

  it("rejects a javascript: URL", () => {
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/");
  });
});
