import { describe, expect, it } from "vitest";
import { maybeComputeOneDistance, recomputeWheelDistances } from "./distance";

// The real chunking/geocoding/element-reading logic lives in the pure
// shared/wheelDistance.ts (see its .test.ts) and is exercised there. This
// module is the DB+fetch glue; without a DATABASE_URL (as in this test env,
// same as the rest of server/*.test.ts) getDb() returns undefined and every
// db.ts call degrades to an empty/undefined result — so both entry points
// here should no-op cleanly rather than throw.
describe("distance mode graceful degradation (no DB configured)", () => {
  it("recomputeWheelDistances no-ops when the wheel can't be loaded", async () => {
    await expect(recomputeWheelDistances(999)).resolves.toEqual({ computed: 0, unlocatable: 0, matrixFailed: false });
  });

  it("maybeComputeOneDistance resolves without throwing", async () => {
    await expect(maybeComputeOneDistance(999, 999)).resolves.toBeUndefined();
  });
});
