import { describe, expect, it } from "vitest";
import { parseMapLink } from "./mapLink";

describe("parseMapLink", () => {
  it("flags short links for server-side expansion", () => {
    expect(parseMapLink("https://maps.app.goo.gl/abc123")).toEqual({
      kind: "short",
      url: "https://maps.app.goo.gl/abc123",
    });
    expect(parseMapLink("https://goo.gl/maps/xyz")?.kind).toBe("short");
  });

  it("pulls a place id from query_place_id (with name + coords)", () => {
    const r = parseMapLink(
      "https://www.google.com/maps/search/?api=1&query=Rintaro&query_place_id=ChIJ123abc",
    );
    expect(r).toMatchObject({ kind: "placeId", placeId: "ChIJ123abc" });
  });

  it("pulls a place id from q=place_id:…", () => {
    expect(parseMapLink("https://maps.google.com/?q=place_id:ChIJ_ZZ")).toMatchObject({
      kind: "placeId",
      placeId: "ChIJ_ZZ",
    });
  });

  it("extracts name from a /maps/place/ path and coords from @", () => {
    const r = parseMapLink(
      "https://www.google.com/maps/place/Blue+Bottle+Coffee/@37.7765,-122.4232,17z/data=!3m1",
    );
    expect(r).toMatchObject({ kind: "text", query: "Blue Bottle Coffee", lat: 37.7765, lng: -122.4232 });
  });

  it("prefers place id over the /place/ name when both are present", () => {
    const r = parseMapLink(
      "https://www.google.com/maps/place/Joe's/@1,2,17z/data=x!1s0x0:0x0!8m2!3d1!4d2?query_place_id=ChIJok",
    );
    expect(r).toMatchObject({ kind: "placeId", placeId: "ChIJok", name: "Joe's" });
  });

  it("reads coords from the !3d..!4d.. data blob", () => {
    const r = parseMapLink("https://www.google.com/maps/place/X/data=!8m2!3d40.5!4d-73.9?query_place_id=ChIJa");
    expect(r).toMatchObject({ kind: "placeId", lat: 40.5, lng: -73.9 });
  });

  it("treats ?q=<text> as a text query", () => {
    expect(parseMapLink("https://maps.google.com/?q=Best%20Ramen%20Shop")).toMatchObject({
      kind: "text",
      query: "Best Ramen Shop",
    });
  });

  it("treats a bare ?q=lat,lng as coords (a dropped pin), not text", () => {
    expect(parseMapLink("https://maps.google.com/?q=37.77,-122.41")).toEqual({
      kind: "coords",
      lat: 37.77,
      lng: -122.41,
    });
  });

  it("rejects non-Google and non-URL input", () => {
    expect(parseMapLink("https://example.com/maps/place/X")).toBeNull();
    expect(parseMapLink("not a url")).toBeNull();
    expect(parseMapLink("ftp://google.com/maps")).toBeNull();
    expect(parseMapLink("")).toBeNull();
  });

  it("returns null for a Google maps URL carrying no usable signal", () => {
    expect(parseMapLink("https://www.google.com/maps")).toBeNull();
  });
});
