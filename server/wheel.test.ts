import { describe, expect, it } from "vitest";

// ─── Tag Intersection Filter Logic ────────────────────────────────────────────

type RestaurantWithTags = {
  id: number;
  name: string;
  isExcluded: boolean;
  tags: { id: number; name: string }[];
};

function filterRestaurants(restaurants: RestaurantWithTags[], selectedTagIds: number[]): RestaurantWithTags[] {
  let filtered = restaurants.filter((r) => !r.isExcluded);
  if (selectedTagIds.length > 0) {
    filtered = filtered.filter((r) =>
      selectedTagIds.every((tagId) => r.tags.some((t) => t.id === tagId))
    );
  }
  return filtered;
}

const sampleRestaurants: RestaurantWithTags[] = [
  { id: 1, name: "Ramen House", isExcluded: false, tags: [{ id: 1, name: "Japanese" }, { id: 9, name: "Noodle" }] },
  { id: 2, name: "Sushi Bar", isExcluded: false, tags: [{ id: 1, name: "Japanese" }] },
  { id: 3, name: "Pho Corner", isExcluded: false, tags: [{ id: 4, name: "Vietnamese" }, { id: 9, name: "Noodle" }] },
  { id: 4, name: "Pizza Palace", isExcluded: false, tags: [{ id: 7, name: "Italian" }, { id: 16, name: "Pizza" }] },
  { id: 5, name: "Excluded Place", isExcluded: true, tags: [{ id: 1, name: "Japanese" }] },
];

describe("Tag Intersection Filter (AND logic)", () => {
  it("returns all non-excluded restaurants when no tags selected", () => {
    const result = filterRestaurants(sampleRestaurants, []);
    expect(result).toHaveLength(4);
    expect(result.every((r) => !r.isExcluded)).toBe(true);
  });

  it("filters by single tag", () => {
    const result = filterRestaurants(sampleRestaurants, [1]); // Japanese
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.name)).toEqual(["Ramen House", "Sushi Bar"]);
  });

  it("enforces AND logic for multiple tags", () => {
    const result = filterRestaurants(sampleRestaurants, [1, 9]); // Japanese AND Noodle
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Ramen House");
  });

  it("returns empty array when no restaurants match all tags", () => {
    const result = filterRestaurants(sampleRestaurants, [1, 16]); // Japanese AND Pizza — no match
    expect(result).toHaveLength(0);
  });

  it("excludes restaurants marked as excluded regardless of tags", () => {
    const result = filterRestaurants(sampleRestaurants, [1]); // Japanese
    expect(result.find((r) => r.name === "Excluded Place")).toBeUndefined();
  });
});

// ─── 3-Day Exclusion Logic ────────────────────────────────────────────────────

function getExcludedIds(
  spins: { restaurantId: number; spunAt: Date; manuallyReenabled: boolean }[]
): number[] {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const recent = spins.filter((s) => s.spunAt > threeDaysAgo);
  const seen = new Set<number>();
  const excluded: number[] = [];
  for (const row of recent.sort((a, b) => b.spunAt.getTime() - a.spunAt.getTime())) {
    if (!seen.has(row.restaurantId)) {
      seen.add(row.restaurantId);
      if (!row.manuallyReenabled) excluded.push(row.restaurantId);
    }
  }
  return excluded;
}

describe("3-Day Smart Exclusion", () => {
  it("excludes a restaurant spun within 3 days", () => {
    const spins = [{ restaurantId: 1, spunAt: new Date(Date.now() - 1 * 60 * 60 * 1000), manuallyReenabled: false }];
    expect(getExcludedIds(spins)).toContain(1);
  });

  it("does not exclude a restaurant spun more than 3 days ago", () => {
    const spins = [{ restaurantId: 1, spunAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), manuallyReenabled: false }];
    expect(getExcludedIds(spins)).not.toContain(1);
  });

  it("does not exclude a manually re-enabled restaurant", () => {
    const spins = [{ restaurantId: 1, spunAt: new Date(Date.now() - 1 * 60 * 60 * 1000), manuallyReenabled: true }];
    expect(getExcludedIds(spins)).not.toContain(1);
  });

  it("uses the latest spin entry to determine exclusion status", () => {
    const spins = [
      { restaurantId: 1, spunAt: new Date(Date.now() - 2 * 60 * 60 * 1000), manuallyReenabled: true },  // latest: re-enabled
      { restaurantId: 1, spunAt: new Date(Date.now() - 5 * 60 * 60 * 1000), manuallyReenabled: false }, // older: excluded
    ];
    expect(getExcludedIds(spins)).not.toContain(1);
  });

  it("handles multiple restaurants independently", () => {
    const spins = [
      { restaurantId: 1, spunAt: new Date(Date.now() - 1 * 60 * 60 * 1000), manuallyReenabled: false },
      { restaurantId: 2, spunAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), manuallyReenabled: false },
      { restaurantId: 3, spunAt: new Date(Date.now() - 2 * 60 * 60 * 1000), manuallyReenabled: true },
    ];
    const excluded = getExcludedIds(spins);
    expect(excluded).toContain(1);
    expect(excluded).not.toContain(2);
    expect(excluded).not.toContain(3);
  });
});

// ─── Auth Logout ──────────────────────────────────────────────────────────────

import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type CookieCall = { name: string; options: Record<string, unknown> };
type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];
  const user: AuthenticatedUser = {
    id: 1, openId: "sample-user", email: "sample@example.com", name: "Sample User",
    loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
  };
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: (name: string, options: Record<string, unknown>) => { clearedCookies.push({ name, options }); } } as TrpcContext["res"],
  };
  return { ctx, clearedCookies };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({ maxAge: -1, httpOnly: true, path: "/" });
  });
});
