import { describe, expect, it } from "vitest";
import { contrastRatio, parseColor } from "./contrast";

describe("parseColor", () => {
  it("reads short and long hex", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor("#DE5C1F")).toEqual({ r: 222, g: 92, b: 31 });
  });

  it("reads both rgb() syntaxes, as getComputedStyle returns them", () => {
    expect(parseColor("rgb(222, 92, 31)")).toEqual({ r: 222, g: 92, b: 31 });
    expect(parseColor("rgb(222 92 31)")).toEqual({ r: 222, g: 92, b: 31 });
    expect(parseColor("rgba(222, 92, 31, 1)")).toEqual({ r: 222, g: 92, b: 31 });
  });

  it("refuses translucent colours — they have no contrast until composited", () => {
    expect(parseColor("rgb(255 255 255 / 0.5)")).toBeNull();
    expect(parseColor("rgba(0, 0, 0, 0.3)")).toBeNull();
  });

  it("refuses what it cannot resolve", () => {
    expect(parseColor("var(--brand)")).toBeNull();
    expect(parseColor("linear-gradient(red, blue)")).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("matches the WCAG reference points", () => {
    const black = parseColor("#000")!;
    const white = parseColor("#fff")!;
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    const a = parseColor("#de5c1f")!;
    const b = parseColor("#fbf7f2")!;
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });

  it("reproduces the 3.48:1 persimmon measurement from failure mode 17", () => {
    expect(contrastRatio(parseColor("#fbf7f2")!, parseColor("#de5c1f")!)).toBeCloseTo(3.48, 2);
  });
});
