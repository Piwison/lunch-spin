import { describe, expect, it } from "vitest";
import { emWidth, fitDisplayName, DISPLAY_SIZES } from "./displayFit";

describe("emWidth", () => {
  it("counts a CJK character as a full em", () => {
    expect(emWidth("壽")).toBe(1);
    expect(emWidth("千壽司旗艦店")).toBe(6);
  });

  it("counts Latin at roughly half", () => {
    expect(emWidth("Sushi")).toBeCloseTo(2.5, 5);
  });

  it("adds mixed runs", () => {
    // three full-width, then a space and three Latin letters at a half each
    expect(emWidth("鼎泰豐 Xin")).toBeCloseTo(3 + 4 * 0.5, 5);
  });

  it("treats full-width punctuation as full-width", () => {
    expect(emWidth("《》")).toBe(2);
  });

  it("is zero for an empty name", () => {
    expect(emWidth("")).toBe(0);
  });
});

describe("fitDisplayName", () => {
  const W = 342; // a 390px phone less the sheet's 24px gutters

  it("keeps the largest size for a short name on one line", () => {
    const fit = fitDisplayName("Sushi Spot", W);
    expect(fit.fontPx).toBe(DISPLAY_SIZES[0]);
    expect(fit.lines).toBe(1);
  });

  it("respects whole-character line capacity, not a fractional split", () => {
    // 13 full-width characters at 50px: a 342px line holds floor(342/50) = 6 of
    // them, so two lines hold 12 and the name is one character over. The
    // fractional model said 13 x 50 / 2 = 325px and called it a fit; the browser
    // ellipsised it.
    const fit = fitDisplayName("台北牛肉麵老店信義旗艦二館", W);
    expect(Math.floor(W / fit.fontPx) * fit.lines).toBeGreaterThanOrEqual(emWidth("台北牛肉麵老店信義旗艦二館"));
  });

  it("fits within its line budget for any name that can fit at all", () => {
    for (const name of [
      "千壽司旗艦店",
      "鼎泰豐 信義店",
      "高勁乾拌牛肉麵",
      "Sushi Spot",
      "奇味牛肉麵《總店》",
      "McDonald's Xinyi",
    ]) {
      const fit = fitDisplayName(name, W);
      expect(emWidth(name)).toBeLessThanOrEqual(fit.lines * Math.floor(W / fit.fontPx));
    }
  });

  it("takes the smallest size for a name too long to fit at any size", () => {
    // 48 half-width characters is 24em; at 30px a line holds floor(342/30) = 11
    // ems, so two lines hold 22 and the name is over at every size.
    const name = "The Very Long Sandwich Company of Xinyi District";
    const fit = fitDisplayName(name, W);
    expect(fit.fontPx).toBe(DISPLAY_SIZES[DISPLAY_SIZES.length - 1]);
    expect(fit.lines).toBe(2);
  });

  it("drops to two lines rather than shrinking further", () => {
    // Six full-width characters at 68px is 408px — wider than 342, but two
    // lines of three fit at full size.
    const fit = fitDisplayName("千壽司旗艦店", W);
    expect(fit.lines).toBe(2);
    expect(fit.fontPx).toBe(DISPLAY_SIZES[0]);
  });

  it("shrinks once two lines at the largest size no longer fit", () => {
    const fit = fitDisplayName("台北牛肉麵老店信義旗艦二館", W);
    expect(fit.fontPx).toBeLessThan(DISPLAY_SIZES[0]);
    expect(fit.lines).toBe(2);
  });

  it("keeps a six-character name at full size across two lines", () => {
    // floor(342 / 68) = 5 per line, so 6 characters need two lines but no shrink.
    expect(fitDisplayName("千壽司旗艦店", W)).toEqual({ fontPx: 68, lines: 2 });
  });

  it("bottoms out at the smallest size rather than returning nothing", () => {
    const fit = fitDisplayName("台".repeat(80), W);
    expect(fit.fontPx).toBe(DISPLAY_SIZES[DISPLAY_SIZES.length - 1]);
    expect(fit.lines).toBe(2);
  });

  it("never goes past two lines", () => {
    for (const n of [1, 5, 10, 20, 40, 80]) {
      expect(fitDisplayName("壽".repeat(n), W).lines).toBeLessThanOrEqual(2);
    }
  });

  it("holds the largest size on a wide container", () => {
    const fit = fitDisplayName("千壽司旗艦店", 900);
    expect(fit.fontPx).toBe(DISPLAY_SIZES[0]);
    expect(fit.lines).toBe(1);
  });

  it("is stable for an empty or whitespace name", () => {
    expect(fitDisplayName("", W)).toEqual({ fontPx: DISPLAY_SIZES[0], lines: 1 });
    expect(fitDisplayName("   ", W).lines).toBe(1);
  });

  it("falls back to the largest size when the container has not measured yet", () => {
    expect(fitDisplayName("千壽司旗艦店", 0).fontPx).toBe(DISPLAY_SIZES[0]);
  });
});
