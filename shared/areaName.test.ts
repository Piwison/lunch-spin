import { describe, it, expect } from "vitest";
import { deriveAreaName, wheelNameForArea } from "./areaName";

describe("deriveAreaName", () => {
  it("returns null with nothing to go on", () => {
    expect(deriveAreaName([])).toBeNull();
    expect(deriveAreaName([null, undefined, ""])).toBeNull();
  });

  // ── CJK addresses (the app's home turf) ───────────────────────────────────
  it("picks the district out of Taiwanese addresses", () => {
    expect(
      deriveAreaName([
        "110台北市信義區松高路11號",
        "110台北市信義區忠孝東路五段68號",
        "110台北市信義區基隆路一段333號",
      ]),
    ).toBe("信義區");
  });

  it("prefers the district over the city when both are present", () => {
    // 台北市 is in every one of these, but 大安區 is the useful half.
    expect(
      deriveAreaName(["台北市大安區復興南路一段", "台北市大安區敦化南路二段"]),
    ).toBe("大安區");
  });

  it("handles a three-character district", () => {
    expect(deriveAreaName(["台東縣太麻里鄉大王村", "台東縣太麻里鄉金崙村"])).toBe("太麻里鄉");
  });

  it("falls back to the city when no district appears", () => {
    expect(deriveAreaName(["台北市中山北路二段", "台北市南京東路三段"])).toBe("台北市");
  });

  // ── Latin addresses ───────────────────────────────────────────────────────
  it("picks the locality out of comma-separated addresses", () => {
    expect(
      deriveAreaName([
        "123 Main St, Brooklyn, NY 11201",
        "88 Front St, Brooklyn, NY 11201",
        "5 Water St, Brooklyn, NY 11205",
      ]),
    ).toBe("Brooklyn");
  });

  it("strips a trailing postcode off the locality", () => {
    expect(
      deriveAreaName(["1 Raffles Place, Singapore 048616", "9 Battery Rd, Singapore 049910"]),
    ).toBe("Singapore");
  });

  // ── Consensus ─────────────────────────────────────────────────────────────
  it("returns null when the places do not agree on an area", () => {
    // A search straddling several districts shouldn't name the wheel after
    // whichever one happened to come back first.
    expect(
      deriveAreaName([
        "台北市信義區松高路",
        "台北市大安區復興南路",
        "新北市板橋區文化路",
        "桃園市中壢區中大路",
      ]),
    ).toBeNull();
  });

  it("needs a majority, not just a plurality of one", () => {
    expect(deriveAreaName(["台北市信義區A路", "台北市信義區B路", "台北市大安區C路"])).toBe("信義區");
  });

  it("ignores unusable rows when counting consensus", () => {
    expect(deriveAreaName(["台北市信義區松高路", null, "", "台北市信義區忠孝東路"])).toBe("信義區");
  });
});

describe("wheelNameForArea", () => {
  it("names the wheel after the area when we have one", () => {
    expect(wheelNameForArea("信義區")).toBe("Lunch near 信義區");
    expect(wheelNameForArea("Brooklyn")).toBe("Lunch near Brooklyn");
  });

  it("falls back to something honest when we don't", () => {
    expect(wheelNameForArea(null)).toBe("Lunch near me");
  });

  it("never exceeds the wheels.name column limit", () => {
    // varchar(128) — a pathological provider string must not blow the insert.
    const name = wheelNameForArea("x".repeat(400));
    expect(name.length).toBeLessThanOrEqual(128);
  });
});
