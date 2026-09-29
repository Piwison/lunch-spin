import { describe, expect, it } from "vitest";
import { bestNameMatch, namesMatch, normalizeName } from "./nameMatch";

describe("namesMatch — is a typed name the same shop as a Google place?", () => {
  it("a name that is the start of the listing", () => {
    expect(namesMatch("這家炒飯", "這家炒飯J+")).toBe(true);
  });
  it("a branch suffix after a space", () => {
    expect(namesMatch("八方雲集", "八方雲集 內湖店")).toBe(true);
    expect(namesMatch("麥當勞", "麥當勞 內湖科技園區店")).toBe(true);
  });
  it("width, case and punctuation do not matter", () => {
    expect(namesMatch("ＳＵＢＷＡＹ", "Subway 瑞光店")).toBe(true);
    expect(namesMatch("mos burger", "MOS Burger")).toBe(true);
  });
  it("different scripts never match — that is what B4's language fix is for", () => {
    expect(namesMatch("鵝肉担", "Goose Meat Dan")).toBe(false);
  });
  it("too short to be sure: one CJK character, or under four Latin letters", () => {
    expect(namesMatch("麵", "台記家傳手勁麵")).toBe(false);
    expect(namesMatch("Pho", "Pho Hoa")).toBe(false);
  });
  it("unrelated names", () => {
    expect(namesMatch("鼎泰豐", "八方雲集")).toBe(false);
  });
});

describe("normalizeName", () => {
  it("drops a spaced branch suffix but not a name that ends in 店", () => {
    expect(normalizeName("八方雲集 內湖店")).toBe("八方雲集");
    expect(normalizeName("阿婆麵店")).toBe("阿婆麵店");
  });
});

describe("bestNameMatch", () => {
  it("prefers an exact match over a longer listing that contains the name", () => {
    const places = [{ name: "八方雲集 內湖店" }, { name: "八方雲集" }];
    expect(bestNameMatch("八方雲集", places)?.name).toBe("八方雲集");
  });
  it("is null when nothing matches", () => {
    expect(bestNameMatch("鵝肉担", [{ name: "Goose Meat Dan" }])).toBeNull();
  });
});
