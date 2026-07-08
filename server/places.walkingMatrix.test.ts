import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { walkingMatrix } from "./places";

const ORIGIN = { lat: 37.7749, lng: -122.4194 };

function stubFetch(body: unknown, ok = true) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "ERR",
    json: async () => body,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("walkingMatrix", () => {
  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    vi.unstubAllGlobals();
  });

  it("builds a single walking-mode request with pipe-joined destinations", async () => {
    const fn = stubFetch({ status: "OK", rows: [{ elements: [{ status: "OK" }] }] });
    await walkingMatrix(ORIGIN, ["1,2", "3,4"]);
    const url = new URL(fn.mock.calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe("https://maps.googleapis.com/maps/api/distancematrix/json");
    expect(url.searchParams.get("origins")).toBe("37.7749,-122.4194");
    expect(url.searchParams.get("destinations")).toBe("1,2|3,4");
    expect(url.searchParams.get("mode")).toBe("walking");
    expect(url.searchParams.get("key")).toBe("test-key");
  });

  it("returns the first row's elements", async () => {
    const elements = [
      { status: "OK", duration: { value: 300 }, distance: { value: 380 } },
      { status: "ZERO_RESULTS" },
    ];
    stubFetch({ status: "OK", rows: [{ elements }] });
    expect(await walkingMatrix(ORIGIN, ["1,2", "3,4"])).toEqual(elements);
  });

  it("skips the network entirely for an empty destination list", async () => {
    const fn = stubFetch({ status: "OK", rows: [] });
    expect(await walkingMatrix(ORIGIN, [])).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("throws on a non-OK API status (e.g. Distance Matrix API not enabled)", async () => {
    stubFetch({ status: "REQUEST_DENIED" });
    await expect(walkingMatrix(ORIGIN, ["1,2"])).rejects.toThrow(/REQUEST_DENIED/);
  });

  it("throws when the key is missing", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    stubFetch({});
    await expect(walkingMatrix(ORIGIN, ["1,2"])).rejects.toThrow(/not configured/);
  });
});
