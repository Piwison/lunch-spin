import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePlaceLink, searchNearbyRestaurants, searchPlacesByText } from "./places";

// Every Places request names a language. Without it Google answers this
// US-hosted server in English — the 2026-09-23 user test saw "Pepper Lunch
// Express" and "McDonald's - New Taipei 101 Store" for a Taipei first run.

function stubFetch(body: unknown) {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "OK", json: async () => body });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const langOf = (fn: ReturnType<typeof vi.fn>, i = 0) =>
  new URL(fn.mock.calls[i]![0] as string).searchParams.get("language");

describe("Places requests carry a language", () => {
  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    vi.unstubAllGlobals();
  });

  it("text search defaults to Traditional Chinese and honours English", async () => {
    const fn = stubFetch({ status: "OK", results: [] });
    await searchPlacesByText("台北101");
    await searchPlacesByText("Taipei 101", null, "en");
    expect(langOf(fn, 0)).toBe("zh-TW");
    expect(langOf(fn, 1)).toBe("en");
  });

  it("nearby search defaults to Traditional Chinese", async () => {
    const fn = stubFetch({ status: "OK", results: [] });
    await searchNearbyRestaurants({ lat: 25.03, lng: 121.56, rankBy: "distance" });
    expect(langOf(fn)).toBe("zh-TW");
  });

  it("resolving a link asks Place Details in the requested language", async () => {
    const fn = stubFetch({ status: "OK", result: { place_id: "ChIJ1", name: "鼎泰豐", geometry: { location: { lat: 1, lng: 2 } } } });
    await resolvePlaceLink("https://www.google.com/maps/search/?api=1&query=x&query_place_id=ChIJ1", "en");
    expect(langOf(fn)).toBe("en");
  });

  it("resolving a text link asks Find Place in Traditional Chinese by default", async () => {
    const fn = stubFetch({ status: "OK", candidates: [{ place_id: "p", name: "n", geometry: { location: { lat: 1, lng: 2 } } }] });
    await resolvePlaceLink("https://maps.google.com/?q=%E9%BC%8E%E6%B3%B0%E8%B1%90");
    expect(langOf(fn)).toBe("zh-TW");
  });
});
