import { describe, expect, it } from "vitest";
import { mergeWalkTimes, routableCoords, type MatrixElement } from "./walkTime";

type P = {
  id: string;
  name: string;
  walkMinutes: number;
  distanceMeters: number | null;
  lat: number | null;
  lng: number | null;
};

const p = (id: string, walkMinutes: number, lat: number | null = 1, lng: number | null = 2): P => ({
  id,
  name: id,
  walkMinutes,
  distanceMeters: walkMinutes * 80,
  lat,
  lng,
});

const ok = (seconds: number, meters: number): MatrixElement => ({
  status: "OK",
  duration: { value: seconds },
  distance: { value: meters },
});

describe("routableCoords", () => {
  it("returns lat,lng strings for coord-bearing places only, in order", () => {
    const places = [p("a", 5), p("b", 6, null, null), p("c", 7, 3, 4)];
    expect(routableCoords(places)).toEqual(["1,2", "3,4"]);
  });
});

describe("mergeWalkTimes", () => {
  it("overwrites estimates with route times, aligned to the routable subset", () => {
    const places = [p("a", 5), p("noCoords", 6, null, null), p("c", 20)];
    const merged = mergeWalkTimes(places, [ok(540, 700), ok(240, 300)]);

    const byId = new Map(merged.map((m) => [m.id, m]));
    expect(byId.get("a")).toMatchObject({ walkMinutes: 9, distanceMeters: 700, walkSource: "route" });
    // Coordless place keeps its estimate and is not consumed from the matrix.
    expect(byId.get("noCoords")).toMatchObject({ walkMinutes: 6, walkSource: "estimate" });
    expect(byId.get("c")).toMatchObject({ walkMinutes: 4, distanceMeters: 300, walkSource: "route" });
    // And the result is re-sorted by the refined times.
    expect(merged.map((m) => m.id)).toEqual(["c", "noCoords", "a"]);
  });

  it("keeps the estimate when an element fails or is missing", () => {
    const places = [p("a", 5), p("b", 8)];
    const merged = mergeWalkTimes(places, [{ status: "ZERO_RESULTS" }]);
    expect(merged[0]).toMatchObject({ id: "a", walkMinutes: 5, walkSource: "estimate" });
    expect(merged[1]).toMatchObject({ id: "b", walkMinutes: 8, walkSource: "estimate" });
  });

  it("clamps route times to at least 1 minute", () => {
    const merged = mergeWalkTimes([p("a", 1)], [ok(10, 15)]);
    expect(merged[0]!.walkMinutes).toBe(1);
    expect(merged[0]!.walkSource).toBe("route");
  });

  it("no elements at all → everything stays an estimate", () => {
    const merged = mergeWalkTimes([p("a", 5), p("b", 6)], []);
    expect(merged.every((m) => m.walkSource === "estimate")).toBe(true);
    expect(merged.map((m) => m.walkMinutes)).toEqual([5, 6]);
  });

  it("re-sorts by refined walk time, name-stable", () => {
    const places = [p("far", 5), p("near", 6)];
    // "far" gets a real 12-min route; "near" gets a real 3-min route.
    const merged = mergeWalkTimes(places, [ok(720, 950), ok(180, 220)]);
    expect(merged.map((m) => m.id)).toEqual(["near", "far"]);
  });
});
