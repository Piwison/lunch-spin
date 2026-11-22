import { describe, expect, it } from "vitest";
import { placeLanguage } from "./placeLanguage";

describe("placeLanguage — place names follow the phone, not the interface", () => {
  it("any Chinese locale asks Google for Traditional Chinese names", () => {
    expect(placeLanguage("zh-TW")).toBe("zh-TW");
    expect(placeLanguage("zh-Hant-TW")).toBe("zh-TW");
    expect(placeLanguage("zh-CN")).toBe("zh-TW");
    expect(placeLanguage("ZH")).toBe("zh-TW");
  });
  it("everything else asks for English", () => {
    expect(placeLanguage("en-US")).toBe("en");
    expect(placeLanguage("ja-JP")).toBe("en");
    expect(placeLanguage("")).toBe("en");
    expect(placeLanguage(undefined)).toBe("en");
  });
  it("does not mistake a language that merely starts with 'zh' letters", () => {
    expect(placeLanguage("zha")).toBe("en");
  });
});
