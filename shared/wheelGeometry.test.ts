import { describe, expect, it } from "vitest";
import {
  EASE_DECAY,
  EASE_EXIT,
  EASE_SETTLE,
  EASE_STANDARD,
  SPIN_TIMELINE,
  SPIN_TOTAL_MS,
  labelBlurPx,
  landingRotationDeg,
  normalizeDeg,
  paneCenterDeg,
  paneSweepDeg,
  panes,
  signedAngleDeg,
  visibleLabels,
  cubicBezier,
  bandStartFits,
  labelRay,
  labelTier,
  restingWheelMetrics,
  wedgeClipPolygon,
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

describe("resting wheel metrics", () => {
  const frames = [320, 360, 390, 412, 430];
  const counts = [2, 3, 8, 9, 12, 16, 17, 24, 40];

  it("matches the spec's reference numbers exactly at 390px", () => {
    const m = restingWheelMetrics(390, 8);
    expect(m.discPx).toBeCloseTo(358.8, 1); // 92% of the frame
    expect(m.radiusPx).toBeCloseTo(179.4, 1);
    expect(m.hubPx).toBeCloseTo(100, 6);
    expect(m.bandStartPx).toBeCloseTo(58, 6);
    expect(m.bandEndPx).toBeCloseTo(159.4, 1); // R - 20
    expect(m.maxTextWidthPx).toBeCloseTo(m.bandEndPx - m.bandStartPx - 4, 6);
  });

  it("scales every number with the frame and NOTHING with the place count", () => {
    for (const frameW of frames) {
      const ref = restingWheelMetrics(frameW, 8);
      expect(ref.discPx).toBeCloseTo(frameW * 0.92, 6);
      for (const count of counts) {
        const m = restingWheelMetrics(frameW, count);
        // The disc, its radius and the hub never move for the place count.
        expect(m.discPx).toBeCloseTo(ref.discPx, 6);
        expect(m.radiusPx).toBeCloseTo(ref.radiusPx, 6);
        expect(m.hubPx).toBeCloseTo(ref.hubPx, 6);
        expect(m.bandEndPx).toBeCloseTo(ref.bandEndPx, 6);
      }
    }
  });

  it("keeps the band clear of the hub at every count", () => {
    for (const frameW of frames) {
      for (const count of counts) {
        const m = restingWheelMetrics(frameW, count);
        expect(m.bandStartPx).toBeGreaterThanOrEqual(m.hubPx / 2 + 8 * (frameW / 390) - 1e-6);
        expect(m.bandStartPx).toBeLessThan(m.bandEndPx);
      }
    }
  });
});

describe("label tiers", () => {
  it("keeps every dense tier inside the 11-12.5px CJK range", () => {
    // Chinese strokes fill their em box, so the sizes that read for Latin are
    // too big and too tight for CJK. Sparse wheels keep a larger size because
    // a 45-degree wedge has the room for it.
    for (const n of [9, 12, 16, 17, 24, 25, 40]) {
      const t = labelTier(n);
      expect(t.fontPx).toBeGreaterThanOrEqual(11);
      expect(t.fontPx).toBeLessThanOrEqual(12.5);
    }
  });

  it("wraps to two lines up to 8 places, one line to 16, index only above", () => {
    for (const n of [2, 5, 8]) {
      const t = labelTier(n);
      expect(t.lines).toBe(2);
      expect(t.fontPx).toBe(14);
      expect(t.indexOnly).toBe(false);
    }
    for (const n of [9, 12, 16]) {
      const t = labelTier(n);
      expect(t.lines).toBe(1);
      expect(t.fontPx).toBe(12.5);
      expect(t.indexOnly).toBe(false);
    }
    // 17-24 still carries NAMES. The 16-place ceiling was reasoned about long
    // Latin names; CJK names are few characters but full-width, and the shipped
    // app displays 21 of them legibly. Names hold to 24, indices start after.
    for (const n of [17, 21, 24]) {
      const t = labelTier(n);
      expect(t.lines).toBe(1);
      expect(t.fontPx).toBe(12);
      expect(t.indexOnly).toBe(false);
    }
    for (const n of [25, 32, 40]) {
      const t = labelTier(n);
      expect(t.fontPx).toBe(11);
      expect(t.bandHeightPx).toBe(15);
      expect(t.indexOnly).toBe(true);
    }
  });

  it("fits about seven CJK characters on a name label at 17-24 places", () => {
    // The real test of the ceiling: a full-width character is as wide as the
    // font size, so this is a direct character count.
    for (const n of [17, 21, 24]) {
      const m = restingWheelMetrics(390, n);
      expect(m.maxTextWidthPx / m.tier.fontPx).toBeGreaterThanOrEqual(7);
    }
  });

  it("never interpolates type size — it is fixed per tier", () => {
    const sizes = new Set([2, 3, 8, 9, 12, 16, 17, 24, 25, 40].map((n) => labelTier(n).fontPx));
    expect([...sizes].sort((a, b) => b - a)).toEqual([14, 12.5, 12, 11]);
  });
});

describe("bandStartFits", () => {
  it("is the spec's formula", () => {
    // h / (2 * tan(180/n)) <= r0
    expect(bandStartFits(8, 36, 58)).toBe(true);
    expect(bandStartFits(16, 22, 58)).toBe(true);
    expect(bandStartFits(24, 15, 68)).toBe(true);
    // A two-line band cannot fit a 16-way wedge that close to the hub.
    expect(bandStartFits(16, 36, 58)).toBe(false);
  });

  it("never renders CJK below 11px, however small the frame", () => {
    // Type scales with the frame like everything else, and on a 320px phone that
    // took the dense tiers to 8-9px — small enough that a Chinese character is a
    // smudge. Geometry still scales; type has a floor.
    for (const frameW of [288, 320, 328, 358, 390, 398, 430]) {
      for (let n = 2; n <= 40; n++) {
        const m = restingWheelMetrics(frameW, n);
        expect(m.tier.fontPx * m.typeScale).toBeGreaterThanOrEqual(11 - 1e-9);
      }
    }
  });

  it("keeps the fit check honest against the floored type, not the scaled type", () => {
    // The band has to be checked at the size actually drawn. Checking the
    // scaled-down size would pass while the real type overflowed its wedge.
    for (const frameW of [288, 320, 358, 390, 430]) {
      for (let n = 2; n <= 40; n++) {
        const m = restingWheelMetrics(frameW, n);
        expect(bandStartFits(n, m.tier.bandHeightPx * m.typeScale, m.bandStartPx)).toBe(true);
      }
    }
  });

  it("holds for the band start the metrics actually choose, at every count", () => {
    // The load-bearing assertion: whatever tier and count, the band the wheel
    // draws fits inside its own wedge.
    for (const frameW of [320, 360, 390, 412, 430]) {
      for (let n = 2; n <= 60; n++) {
        const m = restingWheelMetrics(frameW, n);
        expect(bandStartFits(n, m.tier.bandHeightPx * m.typeScale, m.bandStartPx)).toBe(true);
      }
    }
  });

  it("raises the band start rather than shrinking the type when a wedge is too tight", () => {
    // Past ~28 places even the 15px index band no longer clears r0 = 68, and the
    // spec's instruction is to raise r0, never to shrink the type.
    // Both inside the index tier, so any difference is the band start moving,
    // not the tier changing underneath the comparison.
    const wide = restingWheelMetrics(390, 25);
    const tight = restingWheelMetrics(390, 40);
    expect(tight.tier.fontPx).toBe(wide.tier.fontPx);
    expect(tight.bandStartPx).toBeGreaterThan(wide.bandStartPx);
    expect(tight.maxTextWidthPx).toBeLessThan(wide.maxTextWidthPx);
  });

  it("either leaves room to draw an index, or stops drawing labels entirely", () => {
    // Raising the band start eats the band. Past a point even a two-digit index
    // has nowhere to sit, and the honest answer is a bare disc plus the pointer
    // readout — which is what the readout is for.
    for (let n = 2; n <= 80; n++) {
      const m = restingWheelMetrics(390, n);
      if (m.drawLabels) expect(m.maxTextWidthPx).toBeGreaterThanOrEqual(18);
      else expect(n).toBeGreaterThan(24); // never gives up at a plausible team size
    }
  });
});

describe("labelRay", () => {
  it("puts every label on its own pane's centre ray", () => {
    for (const count of [2, 8, 9, 17]) {
      for (let i = 0; i < count; i++) {
        expect(labelRay(i, count, 0).deg).toBeCloseTo(paneCenterDeg(i, count), 6);
      }
    }
  });

  it("decides the flip from the ON-SCREEN angle, not the pane's angle on the disc", () => {
    // The disc carries a rotation. Deciding the flip from the pane's own angle
    // leaves labels upside down as soon as the disc is turned at all — which is
    // always, because the wheel opens with pane 0 seated at the pointer.
    for (const count of [8, 12, 24]) {
      for (const discRotation of [0, 37, 172.5, 250, -95]) {
        for (let i = 0; i < count; i++) {
          const r = labelRay(i, count, discRotation);
          const onScreen = normalizeDeg(paneCenterDeg(i, count) + discRotation);
          expect(r.flipped).toBe(onScreen > 90 && onScreen < 270);
          // Whatever the disc rotation, no label ever renders inverted.
          const applied = normalizeDeg(onScreen + (r.flipped ? 180 : 0));
          expect(applied <= 90 + 1e-9 || applied >= 270 - 1e-9).toBe(true);
        }
      }
    }
  });
});

describe("wedgeClipPolygon", () => {
  const parse = (poly: string) =>
    poly
      .slice(poly.indexOf("(") + 1, poly.lastIndexOf(")"))
      .split(",")
      .map((pair) => pair.trim().split(/\s+/).map((v) => parseFloat(v)) as [number, number]);

  it("starts at the disc centre — the wedge apex", () => {
    const pts = parse(wedgeClipPolygon(0, 8, 358));
    expect(pts[0]![0]).toBeCloseTo(179, 6);
    expect(pts[0]![1]).toBeCloseTo(179, 6);
  });

  it("stays inside the disc plus the 8px overshoot, and samples the arc finely", () => {
    for (const count of [2, 8, 16, 24]) {
      const pts = parse(wedgeClipPolygon(1 % count, count, 358));
      expect(pts.length).toBeGreaterThanOrEqual(3);
      for (const [x, y] of pts) {
        // 0.01 covers the polygon's deliberate 2-decimal rounding, not slop.
        expect(Math.hypot(x - 179, y - 179)).toBeLessThanOrEqual(179 + 8 + 0.01);
      }
      // ~4 degree sampling, so a 45 degree wedge gets at least a dozen arc points.
      const expected = Math.ceil(360 / count / 4) + 1;
      expect(pts.length).toBeGreaterThanOrEqual(expected);
    }
  });

  it("covers exactly its own pane's angular range and no neighbour's", () => {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const pts = parse(wedgeClipPolygon(i, count, 358)).slice(1);
      const sweep = paneSweepDeg(count);
      for (const [x, y] of pts) {
        const deg = normalizeDeg((Math.atan2(y - 179, x - 179) * 180) / Math.PI);
        const rel = normalizeDeg(deg - i * sweep);
        expect(rel <= sweep + 1e-6 || rel >= 360 - 1e-6).toBe(true);
      }
    }
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
