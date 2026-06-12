import { describe, expect, it } from "vitest";
import { parseWheelImport, serializeWheel, WHEEL_EXPORT_VERSION } from "./transfer";

describe("serializeWheel", () => {
  it("produces a portable bundle with no ids", () => {
    const out = serializeWheel(
      { name: "Office Lunch", exclusionDays: 7, fairnessMode: true, rotateCuisines: false },
      [{ name: "Ramen House", notes: "spicy", tags: [{ name: "Japanese", category: "cuisine" }] }],
    );
    expect(out).toEqual({
      version: WHEEL_EXPORT_VERSION,
      name: "Office Lunch",
      exclusionDays: 7,
      fairnessMode: true,
      rotateCuisines: false,
      restaurants: [{ name: "Ramen House", notes: "spicy", tags: [{ name: "Japanese", category: "cuisine" }] }],
    });
  });
});

describe("parseWheelImport", () => {
  it("round-trips a serialized wheel", () => {
    const bundle = serializeWheel(
      { name: "Team", exclusionDays: 3, fairnessMode: false, rotateCuisines: true },
      [{ name: "Sushi Bar", notes: null, tags: [] }],
    );
    expect(parseWheelImport(JSON.stringify(bundle))).toEqual(bundle);
  });

  it("applies defaults for a minimal bundle", () => {
    const out = parseWheelImport(JSON.stringify({ name: "Minimal" }));
    expect(out).toEqual({
      version: WHEEL_EXPORT_VERSION,
      name: "Minimal",
      exclusionDays: 3,
      fairnessMode: false,
      rotateCuisines: false,
      restaurants: [],
    });
  });

  it("rejects non-JSON", () => {
    expect(() => parseWheelImport("not json {")).toThrow(/valid JSON/);
  });

  it("rejects a bundle with no name", () => {
    expect(() => parseWheelImport(JSON.stringify({ restaurants: [] }))).toThrow(/valid wheel export/);
  });

  it("rejects an invalid tag category", () => {
    const bad = { name: "X", restaurants: [{ name: "Y", tags: [{ name: "Z", category: "bogus" }] }] };
    expect(() => parseWheelImport(JSON.stringify(bad))).toThrow(/valid wheel export/);
  });
});
