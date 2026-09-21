import { describe, expect, it } from "vitest";
import { COPY_INTENT_PARAM, copyIntentUrl, readCopyIntent } from "./copyIntent";

describe("copyIntentUrl", () => {
  it("points at the app and names the source wheel", () => {
    expect(copyIntentUrl(42)).toBe(`/app?${COPY_INTENT_PARAM}=42`);
  });
});

describe("readCopyIntent", () => {
  it("reads the wheel id out of a query string", () => {
    expect(readCopyIntent("?copyFrom=42")).toBe(42);
    expect(readCopyIntent("copyFrom=42")).toBe(42);
  });

  it("is null when there is no intent", () => {
    expect(readCopyIntent("")).toBeNull();
    expect(readCopyIntent("?tab=wheel")).toBeNull();
  });

  // The value is whatever a stranger put in the address bar, and it is about to
  // be handed to a mutation — so anything that is not a real row id is nothing.
  it("rejects values that cannot be a wheel id", () => {
    for (const junk of ["abc", "", "0", "-3", "1.5", "1e3", "9007199254740993", "42abc"]) {
      expect(readCopyIntent(`?copyFrom=${junk}`)).toBeNull();
    }
  });

  it("round-trips what copyIntentUrl builds", () => {
    expect(readCopyIntent(copyIntentUrl(7).split("?")[1])).toBe(7);
  });
});
