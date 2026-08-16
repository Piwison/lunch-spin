import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePlaceLink } from "./places";

const DETAILS = {
  status: "OK",
  result: {
    place_id: "ChIJ123",
    name: "Rintaro",
    formatted_address: "82 14th St, San Francisco",
    types: ["japanese_restaurant", "restaurant"],
    price_level: 3,
    geometry: { location: { lat: 37.769, lng: -122.414 } },
  },
};
const CANDIDATE = {
  status: "OK",
  candidates: [
    { place_id: "ChIJ_txt", name: "Blue Bottle Coffee", types: ["cafe"], geometry: { location: { lat: 1, lng: 2 } } },
  ],
};

// Route the global fetch by URL substring so one stub covers every hop.
function routeFetch(overrides: Record<string, unknown> = {}) {
  const fn = vi.fn(async (input: string) => {
    const url = String(input);
    if (url.includes("maps.app.goo.gl")) {
      // short link → redirected to a canonical /place link carrying a place id
      return { ok: true, url: "https://www.google.com/maps/place/Rintaro/@37.7,-122.4,17z/data=x?query_place_id=ChIJ123", json: async () => ({}) };
    }
    if (url.includes("/place/details/json")) return { ok: true, url, json: async () => overrides.details ?? DETAILS };
    if (url.includes("/findplacefromtext/json")) return { ok: true, url, json: async () => overrides.find ?? CANDIDATE };
    throw new Error("unexpected fetch: " + url);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("resolvePlaceLink", () => {
  beforeEach(() => { process.env.GOOGLE_MAPS_API_KEY = "test-key"; });
  afterEach(() => { delete process.env.GOOGLE_MAPS_API_KEY; vi.unstubAllGlobals(); });

  it("resolves a place-id link via Place Details", async () => {
    routeFetch();
    const p = await resolvePlaceLink("https://www.google.com/maps/search/?api=1&query=Rintaro&query_place_id=ChIJ123");
    expect(p).toMatchObject({ placeId: "ChIJ123", name: "Rintaro", cuisine: "Japanese", lat: 37.769 });
  });

  // Cost guard, not a style preference. The legacy Places API bills a Details
  // call at the tier of the most expensive field requested, and price_level is
  // Atmosphere — the priciest. It was in the field list while nothing read it,
  // so every link resolve was billed at Atmosphere rates for a discarded value.
  // If someone re-adds a Contact/Atmosphere field here, this fails first.
  it("only ever asks Google for Basic-tier fields", async () => {
    const fn = routeFetch();
    await resolvePlaceLink("https://www.google.com/maps/search/?api=1&query=Rintaro&query_place_id=ChIJ123");
    const detailsCall = fn.mock.calls.map((c) => String(c[0])).find((u) => u.includes("/place/details/json"));
    expect(detailsCall).toBeDefined();
    const fields = new URL(detailsCall!).searchParams.get("fields")!.split(",");
    // Contact + Atmosphere field names that would re-tier this call.
    const billable = ["price_level", "rating", "user_ratings_total", "reviews", "opening_hours", "formatted_phone_number", "website"];
    expect(fields.filter((f) => billable.includes(f))).toEqual([]);
  });

  it("resolves a text link via Find Place", async () => {
    routeFetch();
    const p = await resolvePlaceLink("https://maps.google.com/?q=Blue%20Bottle%20Coffee");
    expect(p).toMatchObject({ placeId: "ChIJ_txt", name: "Blue Bottle Coffee", cuisine: "Cafe" });
  });

  it("expands a short link, then resolves the canonical place", async () => {
    routeFetch();
    const p = await resolvePlaceLink("https://maps.app.goo.gl/abc123");
    expect(p).toMatchObject({ placeId: "ChIJ123", name: "Rintaro" });
  });

  it("falls back to Find Place when Details misses but the link had a name", async () => {
    const fn = routeFetch({ details: { status: "NOT_FOUND" } });
    const p = await resolvePlaceLink("https://www.google.com/maps/place/Blue+Bottle+Coffee/@1,2,17z?query_place_id=ChIJstale");
    expect(p).toMatchObject({ name: "Blue Bottle Coffee" });
    expect(fn.mock.calls.some(([u]) => String(u).includes("findplacefromtext"))).toBe(true);
  });

  it("returns null for a link with no usable signal", async () => {
    routeFetch();
    expect(await resolvePlaceLink("https://www.google.com/maps")).toBeNull();
  });

  it("returns null for a coords-only dropped pin (no name to search)", async () => {
    routeFetch();
    expect(await resolvePlaceLink("https://maps.google.com/?q=37.77,-122.41")).toBeNull();
  });

  it("throws when the key is missing", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    routeFetch();
    await expect(resolvePlaceLink("https://maps.google.com/?q=Ramen")).rejects.toThrow(/not configured/);
  });
});
