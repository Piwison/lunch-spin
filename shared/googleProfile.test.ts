import { describe, expect, it } from "vitest";
import { mapGoogleClaims } from "./googleProfile";

const NOW = 1_700_000_000;
const AUD = "client-123.apps.googleusercontent.com";

const valid = {
  iss: "https://accounts.google.com",
  aud: AUD,
  exp: NOW + 3600,
  sub: "10987654321",
  email: "diner@example.com",
  email_verified: true,
  name: "Hungry Diner",
};

describe("mapGoogleClaims", () => {
  it("maps a valid id_token to a namespaced user", () => {
    expect(mapGoogleClaims(valid, AUD, NOW)).toEqual({
      openId: "google:10987654321",
      email: "diner@example.com",
      name: "Hungry Diner",
    });
  });

  it("accepts the bare issuer host", () => {
    expect(mapGoogleClaims({ ...valid, iss: "accounts.google.com" }, AUD, NOW).openId).toBe("google:10987654321");
  });

  it("accepts aud as an array containing the client id", () => {
    expect(mapGoogleClaims({ ...valid, aud: ["other", AUD] }, AUD, NOW).openId).toBe("google:10987654321");
  });

  it("treats missing email/name as null", () => {
    const out = mapGoogleClaims({ ...valid, email: undefined, name: "  " }, AUD, NOW);
    expect(out.email).toBeNull();
    expect(out.name).toBeNull();
  });

  it("rejects a wrong issuer", () => {
    expect(() => mapGoogleClaims({ ...valid, iss: "https://evil.com" }, AUD, NOW)).toThrow(/issuer/i);
  });

  it("rejects an audience mismatch", () => {
    expect(() => mapGoogleClaims({ ...valid, aud: "someone-else" }, AUD, NOW)).toThrow(/audience/i);
    expect(() => mapGoogleClaims(valid, "", NOW)).toThrow(/audience/i);
  });

  it("rejects an expired token", () => {
    expect(() => mapGoogleClaims({ ...valid, exp: NOW - 1 }, AUD, NOW)).toThrow(/expired/i);
    expect(() => mapGoogleClaims({ ...valid, exp: "soon" }, AUD, NOW)).toThrow(/expired/i);
  });

  it("rejects a missing subject", () => {
    expect(() => mapGoogleClaims({ ...valid, sub: "" }, AUD, NOW)).toThrow(/subject/i);
    expect(() => mapGoogleClaims({ ...valid, sub: 123 }, AUD, NOW)).toThrow(/subject/i);
  });

  it("rejects an unverified email", () => {
    expect(() => mapGoogleClaims({ ...valid, email_verified: false }, AUD, NOW)).toThrow(/verified/i);
    expect(() => mapGoogleClaims({ ...valid, email_verified: "true" }, AUD, NOW)).toThrow(/verified/i);
  });
});
