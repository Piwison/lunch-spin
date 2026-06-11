import { describe, expect, it } from "vitest";
import { computeSpin, normalizeAngle, segmentUnderPointer, TAU } from "./wheel";

// Deterministic RNG: replays a fixed sequence, looping.
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe("segmentUnderPointer", () => {
  it("is the exact inverse of the landing target for every segment", () => {
    for (const count of [1, 2, 3, 5, 8, 13, 20]) {
      for (let idx = 0; idx < count; idx++) {
        const { targetAngle } = computeSpin({
          count,
          currentAngle: 0,
          minRotations: 6,
          rng: seqRng([idx / count, 0]),
        });
        expect(segmentUnderPointer(targetAngle, count)).toBe(idx);
      }
    }
  });
});

describe("computeSpin", () => {
  it("lands on the chosen segment regardless of the current resting angle", () => {
    // This is the regression guard for the v1.1 desync bug: the wheel must stop
    // on segments[targetIdx] no matter where it was resting beforehand.
    const count = 7;
    const startAngles = [0, 1.2, -3.4, TAU * 2.5, 17.9, -42.1];
    for (const currentAngle of startAngles) {
      for (let idx = 0; idx < count; idx++) {
        const { targetIdx, targetAngle } = computeSpin({
          count,
          currentAngle,
          minRotations: 6,
          rng: seqRng([idx / count, 0.5]),
        });
        expect(targetIdx).toBe(idx);
        expect(segmentUnderPointer(targetAngle, count)).toBe(idx);
      }
    }
  });

  it("always rotates forward by at least minRotations full turns", () => {
    const { targetAngle } = computeSpin({
      count: 5,
      currentAngle: 10,
      minRotations: 6,
      rng: seqRng([0.3, 0]),
    });
    expect(targetAngle - 10).toBeGreaterThanOrEqual(6 * TAU);
  });

  it("clamps an rng value of 1 to the last segment", () => {
    const { targetIdx } = computeSpin({
      count: 4,
      currentAngle: 0,
      minRotations: 1,
      rng: seqRng([1, 0]),
    });
    expect(targetIdx).toBe(3);
  });

  it("animates to a forced targetIdx (server-authoritative winner)", () => {
    const count = 9;
    for (let idx = 0; idx < count; idx++) {
      const { targetIdx, targetAngle } = computeSpin({
        count,
        currentAngle: 3.7,
        minRotations: 6,
        targetIdx: idx,
        // rng would pick segment 0; the forced index must win instead.
        rng: seqRng([0, 0.5]),
      });
      expect(targetIdx).toBe(idx);
      expect(segmentUnderPointer(targetAngle, count)).toBe(idx);
    }
  });

  it("clamps an out-of-range forced targetIdx into bounds", () => {
    expect(computeSpin({ count: 4, currentAngle: 0, minRotations: 1, targetIdx: 99 }).targetIdx).toBe(3);
    expect(computeSpin({ count: 4, currentAngle: 0, minRotations: 1, targetIdx: -5 }).targetIdx).toBe(0);
  });

  it("throws when there are no segments", () => {
    expect(() => computeSpin({ count: 0, currentAngle: 0, minRotations: 1 })).toThrow();
  });
});

describe("normalizeAngle", () => {
  it("maps any angle into [0, 2π)", () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(TAU)).toBeCloseTo(0);
    expect(normalizeAngle(-0.1)).toBeCloseTo(TAU - 0.1);
    expect(normalizeAngle(TAU * 3 + 1)).toBeCloseTo(1);
  });
});
