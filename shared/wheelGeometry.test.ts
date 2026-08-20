import { describe, expect, it } from "vitest";
import {
  EASE_DECAY,
  EASE_EXIT,
  EASE_SETTLE,
  EASE_STANDARD,
  SPIN_TIMELINE,
  SPIN_TOTAL_MS,
  labelBlurPx,
  labelFrameWidthPx,
  labelMaxWidthPx,
  landingRotationDeg,
  normalizeDeg,
  paneCenterDeg,
  paneSweepDeg,
  panes,
  restingLabelRadiusPx,
  signedAngleDeg,
  visibleLabels,
  cubicBezier,
} from "./wheelGeometry";

const POINTER = 180; // resting pointer sits on the left of the disc

describe("timeline", () => {
  it("sums to the 3.62s the spec quotes, which only works if recede and unroll overlap", () => {
    const { windupMs, travelMs, settleMs, recedeMs, unrollDelayMs, unrollMs } = SPIN_TIMELINE;
    // Phases listed end to end come to 3780ms, not 3620ms. They reconcile when
    // the unroll starts 160ms into the 320ms recede.
    expect(windupMs + travelMs + settleMs + recedeMs + unrollMs).toBe(3780);
    expect(windupMs + travelMs + settleMs + unrollDelayMs + unrollMs).toBe(SPIN_TOTAL_MS);
    expect(SPIN_TOTAL_MS).toBe(3620);
  });

  it("finishes the recede before the unroll finishes, so the disc is behind the type", () => {
    const { windupMs, travelMs, settleMs, recedeMs, unrollDelayMs, unrollMs } = SPIN_TIMELINE;
    const landed = windupMs + travelMs + settleMs;
    expect(landed + recedeMs).toBeLessThanOrEqual(landed + unrollDelayMs + unrollMs);
  });

  it("resolves in 400ms under reduced motion", () => {
    expect(SPIN_TIMELINE.reducedMs).toBe(400);
    expect(SPIN_TIMELINE.reducedMs).toBeLessThan(SPIN_TOTAL_MS);
  });
});

describe("panes", () => {
  it("splits the disc evenly and closes the circle", () => {
    for (const count of [3, 8, 12]) {
      const p = panes(count);
      expect(p).toHaveLength(count);
      expect(p[0]!.startDeg).toBe(0);
      expect(p[count - 1]!.endDeg).toBeCloseTo(360, 6);
      expect(paneSweepDeg(count)).toBeCloseTo(360 / count, 6);
    }
  });

  it("alternates the two colourless glass fills so neighbours separate", () => {
    const p = panes(8);
    expect(p[0]!.heavy).toBe(true);
    expect(p[1]!.heavy).toBe(false);
    expect(p[2]!.heavy).toBe(true);
  });

  it("never leaves two identical fills adjacent across the 0/360 seam", () => {
    // An odd count makes the last pane meet the first; both must not be the
    // heavy fill or the wheel shows a visible double-width pane at the seam.
    for (const count of [7, 9, 11]) {
      const p = panes(count);
      expect(p[count - 1]!.heavy).not.toBe(p[0]!.heavy);
    }
  });

  it("puts pane centres half a sweep in from the start", () => {
    expect(paneCenterDeg(0, 8)).toBeCloseTo(22.5, 6);
    expect(paneCenterDeg(1, 8)).toBeCloseTo(67.5, 6);
    expect(paneCenterDeg(7, 8)).toBeCloseTo(337.5, 6);
  });
});

describe("angles", () => {
  it("normalises into [0, 360)", () => {
    expect(normalizeDeg(0)).toBe(0);
    expect(normalizeDeg(360)).toBe(0);
    expect(normalizeDeg(-90)).toBe(270);
    expect(normalizeDeg(725)).toBeCloseTo(5, 6);
  });

  it("returns the shortest signed delta, never the long way round", () => {
    expect(signedAngleDeg(350, 10)).toBeCloseTo(20, 6);
    expect(signedAngleDeg(10, 350)).toBeCloseTo(-20, 6);
    expect(signedAngleDeg(0, 180)).toBeCloseTo(180, 6);
    expect(Math.abs(signedAngleDeg(0, 181))).toBeLessThanOrEqual(180);
  });
});

describe("label blur", () => {
  it("keeps the name under the pointer perfectly sharp", () => {
    expect(labelBlurPx(0)).toBe(0);
    expect(labelBlurPx(22.5)).toBe(0);
    expect(labelBlurPx(-22.5)).toBe(0);
  });

  it("reaches 6px at the frame edge and never exceeds it", () => {
    expect(labelBlurPx(60)).toBeCloseTo(6, 6);
    expect(labelBlurPx(-60)).toBeCloseTo(6, 6);
    expect(labelBlurPx(90)).toBeLessThanOrEqual(6);
  });

  it("ramps monotonically between the two anchors", () => {
    let prev = -1;
    for (let d = 22.5; d <= 60; d += 2.5) {
      const b = labelBlurPx(d);
      expect(b).toBeGreaterThanOrEqual(prev);
      prev = b;
    }
  });

  it("scales down with speed, so a stopped wheel has no motion blur at all", () => {
    expect(labelBlurPx(60, 1)).toBeCloseTo(6, 6);
    expect(labelBlurPx(60, 0.5)).toBeCloseTo(3, 6);
    expect(labelBlurPx(60, 0)).toBe(0);
  });
});

describe("visibleLabels", () => {
  it("renders at most four labels — anything further round the arc is dropped", () => {
    for (let rot = 0; rot < 360; rot += 7) {
      const v = visibleLabels(12, rot, POINTER);
      expect(v.length).toBeLessThanOrEqual(4);
    }
  });

  it("culls beyond ±60° of the pointer", () => {
    for (let rot = 0; rot < 360; rot += 11) {
      for (const l of visibleLabels(8, rot, POINTER)) {
        expect(Math.abs(l.distanceDeg)).toBeLessThanOrEqual(60);
      }
    }
  });

  it("always keeps the pane under the pointer, at zero blur", () => {
    for (let rot = 0; rot < 360; rot += 3) {
      const v = visibleLabels(8, rot, POINTER);
      const nearest = [...v].sort((a, b) => Math.abs(a.distanceDeg) - Math.abs(b.distanceDeg))[0];
      expect(nearest).toBeDefined();
      expect(Math.abs(nearest!.distanceDeg)).toBeLessThanOrEqual(paneSweepDeg(8) / 2);
      expect(nearest!.blurPx).toBe(0);
    }
  });

  it("reports indices that exist on the wheel", () => {
    for (const l of visibleLabels(5, 123, POINTER)) {
      expect(l.index).toBeGreaterThanOrEqual(0);
      expect(l.index).toBeLessThan(5);
    }
  });
});

describe("landingRotationDeg", () => {
  const counts = [2, 3, 5, 8, 12, 17];

  it("lands the chosen pane centred on the pointer, from any start, every time", () => {
    for (const count of counts) {
      for (let targetIndex = 0; targetIndex < count; targetIndex++) {
        for (const fromDeg of [0, 37, 180, 359.4, -220, 1234.5]) {
          const to = landingRotationDeg({ fromDeg, targetIndex, count, pointerDeg: POINTER });
          const landed = normalizeDeg(paneCenterDeg(targetIndex, count) + to);
          expect(Math.abs(signedAngleDeg(landed, POINTER))).toBeLessThan(1e-6);
        }
      }
    }
  });

  it("always turns forwards, and by at least the minimum number of whole turns", () => {
    for (const count of counts) {
      for (let targetIndex = 0; targetIndex < count; targetIndex++) {
        const fromDeg = 42;
        const to = landingRotationDeg({ fromDeg, targetIndex, count, pointerDeg: POINTER, minTurns: 2 });
        expect(to - fromDeg).toBeGreaterThanOrEqual(2 * 360);
        expect(to - fromDeg).toBeLessThan(3 * 360);
      }
    }
  });

  it("is deterministic — the same request gives the same angle", () => {
    const args = { fromDeg: 12.3, targetIndex: 4, count: 9, pointerDeg: POINTER };
    expect(landingRotationDeg(args)).toBe(landingRotationDeg(args));
  });
});

describe("resting labels", () => {
  const widths = [320, 360, 390, 412, 430];
  const counts = [6, 8, 10, 12];

  it("never lets a horizontal label cross the rim, at any supported size", () => {
    for (const disc of widths) {
      for (const count of counts) {
        const r = restingLabelRadiusPx(disc, count);
        for (let i = 0; i < count; i++) {
          const center = paneCenterDeg(i, count);
          const w = labelMaxWidthPx(center, r, disc, count);
          const rad = (center * Math.PI) / 180;
          // Worst corner of the horizontal box measured from the disc centre.
          const x = Math.abs(r * Math.cos(rad)) + w / 2;
          const y = Math.abs(r * Math.sin(rad));
          expect(Math.hypot(x, y)).toBeLessThanOrEqual(disc / 2);
        }
      }
    }
  });

  it("leaves every label wide enough to say something", () => {
    for (const disc of widths) {
      for (const count of counts) {
        const r = restingLabelRadiusPx(disc, count);
        for (let i = 0; i < count; i++) {
          expect(labelMaxWidthPx(paneCenterDeg(i, count), r, disc, count)).toBeGreaterThanOrEqual(40);
        }
      }
    }
  });

  it("leaves a visible gutter between level neighbours, not a hairline", () => {
    // Touching at the top and bottom of the disc reads as one run-on label.
    for (const disc of widths) {
      for (const count of counts) {
        const r = restingLabelRadiusPx(disc, count);
        const box = (i: number) => {
          const c = paneCenterDeg(i, count);
          const rad = (c * Math.PI) / 180;
          return {
            x: r * Math.cos(rad),
            y: r * Math.sin(rad),
            w: labelMaxWidthPx(c, r, disc, count),
          };
        };
        for (let i = 0; i < count; i++) {
          const a = box(i);
          const b = box((i + 1) % count);
          if (Math.abs(a.y - b.y) < 18) {
            expect(Math.abs(a.x - b.x) - (a.w + b.w) / 2).toBeGreaterThanOrEqual(10);
          }
        }
      }
    }
  });

  it("keeps horizontally-adjacent labels from overlapping near the top and bottom", () => {
    // Panes near 90° and 270° sit almost level with each other, so the rim is
    // not the binding constraint there — the neighbour is.
    for (const disc of widths) {
      for (const count of counts) {
        const r = restingLabelRadiusPx(disc, count);
        const box = (i: number) => {
          const c = paneCenterDeg(i, count);
          const rad = (c * Math.PI) / 180;
          const w = labelMaxWidthPx(c, r, disc, count);
          return { x: r * Math.cos(rad), y: r * Math.sin(rad), w };
        };
        for (let i = 0; i < count; i++) {
          const a = box(i);
          const b = box((i + 1) % count);
          const lineHeight = 18;
          if (Math.abs(a.y - b.y) < lineHeight) {
            expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual((a.w + b.w) / 2 - 1e-6);
          }
        }
      }
    }
  });
});

describe("labelFrameWidthPx", () => {
  // The disc deliberately breaks the right edge of its frame, but item 5's gate
  // is "no clipped label" -- so a label's budget is bounded by the visible frame
  // as well as by the disc it sits on.
  const frames = [320, 360, 390, 412, 430];
  const counts = [6, 8, 10, 12];
  const DISC_TO_FRAME = 1.06;
  const DISC_CENTER_X = 0.54;

  it("keeps every resting label inside the frame at every supported width", () => {
    for (const frameW of frames) {
      for (const count of counts) {
        const disc = frameW * DISC_TO_FRAME;
        const cx = frameW * DISC_CENTER_X;
        const r = restingLabelRadiusPx(disc, count);
        for (let i = 0; i < count; i++) {
          const center = paneCenterDeg(i, count);
          const w = Math.min(
            labelMaxWidthPx(center, r, disc, count),
            labelFrameWidthPx(center, r, cx, frameW)
          );
          const x = cx + r * Math.cos((center * Math.PI) / 180);
          expect(x - w / 2).toBeGreaterThanOrEqual(0);
          expect(x + w / 2).toBeLessThanOrEqual(frameW);
        }
      }
    }
  });

  it("still gives the tightest label something to work with", () => {
    for (const frameW of frames) {
      for (const count of counts) {
        const disc = frameW * DISC_TO_FRAME;
        const cx = frameW * DISC_CENTER_X;
        const r = restingLabelRadiusPx(disc, count);
        const widths = Array.from({ length: count }, (_, i) =>
          Math.min(
            labelMaxWidthPx(paneCenterDeg(i, count), r, disc, count),
            labelFrameWidthPx(paneCenterDeg(i, count), r, cx, frameW)
          )
        );
        expect(Math.min(...widths)).toBeGreaterThanOrEqual(40);
      }
    }
  });

  it("is symmetric about the disc centre", () => {
    const w = (deg: number) => labelFrameWidthPx(deg, 100, 200, 400);
    expect(w(0)).toBeCloseTo(w(180), 6);
  });
});

describe("cubicBezier", () => {
  const curves = [EASE_STANDARD, EASE_EXIT, EASE_SETTLE, EASE_DECAY];

  it("is pinned at both ends", () => {
    for (const e of curves) {
      expect(e(0)).toBe(0);
      expect(e(1)).toBe(1);
      expect(e(-0.5)).toBe(0);
      expect(e(1.5)).toBe(1);
    }
  });

  it("matches linear when the control points are linear", () => {
    const linear = cubicBezier(1 / 3, 1 / 3, 2 / 3, 2 / 3);
    for (const p of [0.1, 0.25, 0.5, 0.75, 0.9]) expect(linear(p)).toBeCloseTo(p, 4);
  });

  it("makes settle the only curve that overshoots", () => {
    let peak = 0;
    for (let p = 0; p <= 1; p += 0.005) peak = Math.max(peak, EASE_SETTLE(p));
    expect(peak).toBeGreaterThan(1);

    for (const e of [EASE_STANDARD, EASE_EXIT, EASE_DECAY]) {
      for (let p = 0; p <= 1; p += 0.005) expect(e(p)).toBeLessThanOrEqual(1.0001);
    }
  });

  it("decays: most of the distance is covered early, then a long tail", () => {
    expect(EASE_DECAY(0.5)).toBeGreaterThan(0.85);
    expect(EASE_DECAY(0.25)).toBeGreaterThan(0.55);
  });

  it("exits: slow to start, so the wind-up reads as loading up", () => {
    expect(EASE_EXIT(0.25)).toBeLessThan(0.2);
  });
});
