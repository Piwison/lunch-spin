import { describe, expect, it } from "vitest";
import {
  DEMO_DRAFT_TTL_MS,
  MAX_DEMO_NAME,
  isDuplicateName,
  mergeExtraNames,
  normalizePlaceName,
  parseDemoDraft,
  serializeDemoDraft,
  userAddedNames,
} from "./demoDraft";
import { MAX_SEGMENTS } from "./nearby";

const SEED = ["巷口牛肉麵", "樓下便當", "日式咖哩"] as const;
const NOW = 1_790_000_000_000;

describe("normalizePlaceName / isDuplicateName", () => {
  it("treats spacing, case and full-width variants as the same place", () => {
    // 2026-09-23 test: typing 巷口牛肉麵 twice gave three identical wedges and
    // silently tripled its odds. A stray space or a full-width letter from a
    // Chinese IME must not be a way around that.
    expect(normalizePlaceName("  巷口  牛肉麵 ")).toBe(normalizePlaceName("巷口 牛肉麵"));
    expect(isDuplicateName("巷口牛肉麵", SEED)).toBe(true);
    expect(isDuplicateName(" 巷口牛肉麵 ", SEED)).toBe(true);
    expect(isDuplicateName("ＭＯＳ Burger", ["mos burger"])).toBe(true);
    expect(isDuplicateName("巷口牛肉湯", SEED)).toBe(false);
  });
});

describe("userAddedNames", () => {
  it("keeps only what the visitor typed, never the seeded examples", () => {
    // The seed is placeholder copy. Saving 巷口牛肉麵 as someone's real wheel
    // repeats the "Pizza Place" mistake OnboardingFlow was written to end.
    expect(userAddedNames(["巷口牛肉麵", "公司樓下雞肉飯", "樓下便當"], SEED)).toEqual(["公司樓下雞肉飯"]);
  });

  it("drops duplicates and blanks, keeping first-typed order", () => {
    expect(userAddedNames(["雞肉飯", " 雞肉飯", "", "  ", "麵線"], SEED)).toEqual(["雞肉飯", "麵線"]);
  });
});

describe("serializeDemoDraft / parseDemoDraft", () => {
  it("round-trips the names", () => {
    expect(parseDemoDraft(serializeDemoDraft(["雞肉飯", "麵線"], NOW), NOW)).toEqual(["雞肉飯", "麵線"]);
  });

  it("expires, so a draft from last week does not ambush a later first run", () => {
    const raw = serializeDemoDraft(["雞肉飯"], NOW);
    expect(parseDemoDraft(raw, NOW + DEMO_DRAFT_TTL_MS - 1)).toEqual(["雞肉飯"]);
    expect(parseDemoDraft(raw, NOW + DEMO_DRAFT_TTL_MS + 1)).toEqual([]);
  });

  it("survives anything localStorage can hand back", () => {
    for (const raw of [null, "", "not json", "[]", "{}", '{"names":"x","savedAt":1}', '{"names":[1,null],"savedAt":1}']) {
      expect(parseDemoDraft(raw, NOW)).toEqual([]);
    }
  });

  it("re-validates what it reads: trims, de-duplicates, caps length and count", () => {
    const long = "字".repeat(MAX_DEMO_NAME + 5);
    const many = Array.from({ length: 30 }, (_, i) => `店${i}`);
    const raw = JSON.stringify({ names: [" 雞肉飯 ", "雞肉飯", long, ...many], savedAt: NOW });
    const out = parseDemoDraft(raw, NOW);
    expect(out[0]).toBe("雞肉飯");
    expect(out[1]).toHaveLength(MAX_DEMO_NAME);
    expect(out.length).toBe(MAX_SEGMENTS);
  });
});

describe("mergeExtraNames", () => {
  it("adds typed names that are not already on the wheel from the nearby list", () => {
    expect(mergeExtraNames(["雞肉飯", "莫宰羊-內湖港墘店"], ["莫宰羊-內湖港墘店", "鵝肉担"])).toEqual(["雞肉飯"]);
  });

  it("de-duplicates the extras among themselves", () => {
    expect(mergeExtraNames(["雞肉飯", "雞肉飯 "], [])).toEqual(["雞肉飯"]);
  });
});
