import { describe, expect, it } from "vitest";
import { chunk, extractWalkSeconds, partitionForDistance } from "./wheelDistance";

describe("partitionForDistance", () => {
  it("routes a coord-bearing restaurant to ready", () => {
    const { ready, needsGeocode, unlocatable } = partitionForDistance([
      { id: 1, lat: 37.7749, lng: -122.4194, mapUrl: null },
    ]);
    expect(ready).toEqual([{ id: 1, lat: 37.7749, lng: -122.4194 }]);
    expect(needsGeocode).toEqual([]);
    expect(unlocatable).toEqual([]);
  });

  it("parses decimal-column string coords (mysql2/drizzle shape)", () => {
    const { ready } = partitionForDistance([{ id: 1, lat: "37.774900", lng: "-122.419400", mapUrl: null }]);
    expect(ready).toEqual([{ id: 1, lat: 37.7749, lng: -122.4194 }]);
  });

  it("routes a mapUrl-only restaurant to needsGeocode", () => {
    const { ready, needsGeocode, unlocatable } = partitionForDistance([
      { id: 2, lat: null, lng: null, mapUrl: "https://maps.google.com/?q=ramen" },
    ]);
    expect(ready).toEqual([]);
    expect(needsGeocode).toEqual([{ id: 2, mapUrl: "https://maps.google.com/?q=ramen" }]);
    expect(unlocatable).toEqual([]);
  });

  it("routes a name-only restaurant (no coords, no link) to unlocatable", () => {
    const { ready, needsGeocode, unlocatable } = partitionForDistance([{ id: 3, lat: null, lng: null, mapUrl: null }]);
    expect(ready).toEqual([]);
    expect(needsGeocode).toEqual([]);
    expect(unlocatable).toEqual([3]);
  });

  it("treats a half-set coordinate pair (one null) as not ready", () => {
    const { ready, unlocatable } = partitionForDistance([{ id: 4, lat: 1, lng: null, mapUrl: null }]);
    expect(ready).toEqual([]);
    expect(unlocatable).toEqual([4]);
  });

  it("partitions a mixed batch, preserving each bucket's order", () => {
    const result = partitionForDistance([
      { id: 1, lat: 1, lng: 2, mapUrl: null },
      { id: 2, lat: null, lng: null, mapUrl: "link" },
      { id: 3, lat: null, lng: null, mapUrl: null },
      { id: 4, lat: 3, lng: 4, mapUrl: null },
    ]);
    expect(result.ready.map((r) => r.id)).toEqual([1, 4]);
    expect(result.needsGeocode.map((r) => r.id)).toEqual([2]);
    expect(result.unlocatable).toEqual([3]);
  });
});

describe("chunk", () => {
  it("splits evenly", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it("leaves a shorter final group", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("one group when size >= length", () => {
    expect(chunk([1, 2], 25)).toEqual([[1, 2]]);
  });

  it("empty input → no groups", () => {
    expect(chunk([], 5)).toEqual([]);
  });
});

describe("extractWalkSeconds", () => {
  it("reads seconds from an OK element", () => {
    expect(extractWalkSeconds([{ status: "OK", duration: { value: 300 } }])).toEqual([300]);
  });

  it("null for a non-OK status", () => {
    expect(extractWalkSeconds([{ status: "ZERO_RESULTS" }])).toEqual([null]);
  });

  it("null when duration is missing despite OK status", () => {
    expect(extractWalkSeconds([{ status: "OK" }])).toEqual([null]);
  });

  it("preserves element order across a mixed batch", () => {
    expect(
      extractWalkSeconds([
        { status: "OK", duration: { value: 120 } },
        { status: "NOT_FOUND" },
        { status: "OK", duration: { value: 600 } },
      ]),
    ).toEqual([120, null, 600]);
  });
});
