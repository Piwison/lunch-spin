import { describe, expect, it } from "vitest";
import { nearbySearchParams } from "./nearbyQuery";
import { DEFAULT_RADIUS_M } from "./nearby";

const AT = { lat: 25.0797, lng: 121.575 };
const asMap = (pairs: [string, string][]) => Object.fromEntries(pairs);

describe("nearbySearchParams", () => {
  it("defaults to prominence with the default radius — what ADD NEARBY has always sent", () => {
    // NearbyDialog widens by doubling a radius; distance ranking has no radius
    // to double, so the old behaviour stays the default and first-run opts in.
    expect(asMap(nearbySearchParams(AT))).toEqual({
      location: "25.0797,121.575",
      radius: String(DEFAULT_RADIUS_M),
      type: "restaurant",
    });
  });

  it("passes an explicit radius through for prominence", () => {
    expect(asMap(nearbySearchParams({ ...AT, radius: 2500 })).radius).toBe("2500");
  });

  it("sends rankby=distance WITHOUT a radius", () => {
    // Google rejects rankby=distance with a radius present (INVALID_REQUEST).
    // A stale radius from a caller must be dropped here, not forwarded.
    const p = asMap(nearbySearchParams({ ...AT, rankBy: "distance", radius: 900 }));
    expect(p.rankby).toBe("distance");
    expect(p).not.toHaveProperty("radius");
    // rankby=distance also requires one of keyword/name/type; type is always set.
    expect(p.type).toBe("restaurant");
  });

  it("adds a trimmed keyword and drops an empty one", () => {
    expect(asMap(nearbySearchParams({ ...AT, rankBy: "distance", keyword: " 拉麵 " })).keyword).toBe("拉麵");
    expect(asMap(nearbySearchParams({ ...AT, keyword: "   " }))).not.toHaveProperty("keyword");
  });

  it("sends ONLY the page token for a follow-up page", () => {
    // Google ignores every other parameter once pagetoken is set and repeats
    // the original search. Sending them anyway would only suggest to a reader
    // that a new radius or keyword could change the page — it cannot.
    expect(nearbySearchParams({ ...AT, rankBy: "distance", keyword: "麵", pageToken: "tok" })).toEqual([
      ["pagetoken", "tok"],
    ]);
  });
});
