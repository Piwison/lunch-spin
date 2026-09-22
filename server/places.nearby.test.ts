import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchNearbyRestaurants } from "./places";

const AT = { lat: 25.0797, lng: 121.575 };

function stubFetchSequence(bodies: unknown[]) {
  const fn = vi.fn();
  for (const body of bodies) {
    fn.mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => body });
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

const urlOf = (fn: ReturnType<typeof vi.fn>, i = 0) => new URL(fn.mock.calls[i]![0] as string);

describe("searchNearbyRestaurants", () => {
  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    vi.unstubAllGlobals();
  });

  it("sends a distance-ranked query without a radius", async () => {
    const fn = stubFetchSequence([{ status: "OK", results: [] }]);
    await searchNearbyRestaurants({ ...AT, rankBy: "distance", radius: 900 });
    const url = urlOf(fn);
    expect(url.searchParams.get("rankby")).toBe("distance");
    expect(url.searchParams.has("radius")).toBe(false);
    expect(url.searchParams.get("key")).toBe("test-key");
  });

  it("hands back Google's next_page_token", async () => {
    stubFetchSequence([{ status: "OK", results: [], next_page_token: "NEXT" }]);
    const res = await searchNearbyRestaurants({ ...AT, rankBy: "distance" });
    expect(res.next_page_token).toBe("NEXT");
  });

  it("retries a page token Google has not activated yet", async () => {
    // Google issues next_page_token before it is valid (~2 s) and answers
    // INVALID_REQUEST until then. A tap on "search farther" inside that window
    // must not surface as an error.
    const fn = stubFetchSequence([
      { status: "INVALID_REQUEST" },
      { status: "OK", results: [{ place_id: "p" }] },
    ]);
    const res = await searchNearbyRestaurants({ ...AT, pageToken: "TOK" }, { retryDelayMs: 0 });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(res.status).toBe("OK");
    expect(urlOf(fn, 1).searchParams.get("pagetoken")).toBe("TOK");
  });

  it("gives up on a page token after a bounded number of retries", async () => {
    const fn = stubFetchSequence([
      { status: "INVALID_REQUEST" },
      { status: "INVALID_REQUEST" },
      { status: "INVALID_REQUEST" },
      { status: "OK", results: [] },
    ]);
    const res = await searchNearbyRestaurants({ ...AT, pageToken: "TOK" }, { retryDelayMs: 0 });
    expect(fn).toHaveBeenCalledTimes(3);
    expect(res.status).toBe("INVALID_REQUEST");
  });

  it("never retries a first-page INVALID_REQUEST — that is a real bad query", async () => {
    const fn = stubFetchSequence([{ status: "INVALID_REQUEST" }, { status: "OK" }]);
    const res = await searchNearbyRestaurants({ ...AT, rankBy: "distance" }, { retryDelayMs: 0 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(res.status).toBe("INVALID_REQUEST");
  });
});
