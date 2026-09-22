import { describe, expect, it } from "vitest";
import { locationEntryMode, type GeoPermission } from "./locationEntry";

describe("locationEntryMode", () => {
  it("leads with geolocation when the browser will grant it", () => {
    expect(locationEntryMode("granted")).toBe("geolocation-first");
  });

  it("leads with geolocation when the browser will ask", () => {
    expect(locationEntryMode("prompt")).toBe("geolocation-first");
  });

  it("leads with the manual routes once permission is denied", () => {
    // The whole point: a button that cannot work must not be the primary
    // action. Before this, someone who had permanently denied location saw
    // "Use my location" as the big persimmon button, tapped it, and watched it
    // fail — while the two routes that DO work sat behind a disclosure.
    expect(locationEntryMode("denied")).toBe("manual-first");
  });

  it("falls back to geolocation-first when the permission state is unknown", () => {
    // `navigator.permissions.query({ name: "geolocation" })` is not available
    // everywhere (older Safari), and it can reject. Unknown must never be
    // treated as denied: that would hide the primary path from everyone whose
    // browser simply cannot answer the question, which is a much larger group
    // than the people who actually said no.
    expect(locationEntryMode("unknown")).toBe("geolocation-first");
  });

  it("treats any unrecognised value as unknown rather than throwing", () => {
    // The value crosses a browser API boundary, so a future or vendor-specific
    // state must degrade to the safe default instead of taking the picker down.
    expect(locationEntryMode("something-else" as GeoPermission)).toBe("geolocation-first");
  });
});
