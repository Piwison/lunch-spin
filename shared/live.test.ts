import { describe, expect, it } from "vitest";
import { detectIncomingSpin, type LatestSpin } from "./live";

const spin = (id: number, spunBy: number): LatestSpin => ({
  id,
  restaurantName: "Ramen House",
  spunBy,
  spunByName: "Alex",
});

describe("detectIncomingSpin", () => {
  it("returns null when there is no latest spin", () => {
    expect(detectIncomingSpin(null, null, 1)).toBeNull();
    expect(detectIncomingSpin(undefined, 5, 1)).toBeNull();
  });

  it("announces a new spin made by another member", () => {
    expect(detectIncomingSpin(spin(7, 2), 6, 1)).toEqual(spin(7, 2));
  });

  it("does not re-announce a spin already seen", () => {
    expect(detectIncomingSpin(spin(7, 2), 7, 1)).toBeNull();
  });

  it("ignores the current user's own spin", () => {
    expect(detectIncomingSpin(spin(7, 1), 6, 1)).toBeNull();
  });

  it("announces the very first observed spin from someone else", () => {
    expect(detectIncomingSpin(spin(1, 2), null, 1)).toEqual(spin(1, 2));
  });
});
