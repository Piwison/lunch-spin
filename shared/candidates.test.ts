import { describe, expect, it } from "vitest";
import {
  CANDIDATE_POOL,
  LOW_RATING_THRESHOLD,
  MIN_REVIEWS_TO_JUDGE,
  arrivalTicks,
  filterCandidates,
  isCandidate,
  isLowRated,
  mergeCandidatePages,
  onWheel,
  ratingStanding,
  relaxations,
  walkBand,
  type Candidate,
} from "./candidates";
import { MAX_SEGMENTS } from "./nearby";

const place = (id: string, over: Partial<Candidate> = {}): Candidate => ({
  placeId: id,
  walkMinutes: 3,
  priceLevel: 2,
  open: true,
  rating: 4.2,
  ratingCount: 120,
  permanentlyClosed: false,
  ...over,
});

describe("tunables", () => {
  it("keeps the candidate pool and the wheel cap as two different numbers", () => {
    // 1b: the pool is what one Nearby Search page returns (20); the wheel is
    // what a person can read on a disc (12). Sharing one constant is how the
    // server ended up throwing away 8 places before the client could filter.
    expect(CANDIDATE_POOL).toBe(20);
    expect(MAX_SEGMENTS).toBe(12);
    expect(CANDIDATE_POOL).toBeGreaterThan(MAX_SEGMENTS);
  });

  it("fits the whole pool in one Distance Matrix request", () => {
    // Every candidate gets a routed walk time from ONE matrix call; the API
    // takes at most 25 destinations per request.
    expect(CANDIDATE_POOL).toBeLessThanOrEqual(25);
  });

  it("uses a 3.0 cut judged only over at least 5 reviews", () => {
    expect(LOW_RATING_THRESHOLD).toBe(3);
    expect(MIN_REVIEWS_TO_JUDGE).toBe(5);
  });
});

describe("isCandidate", () => {
  it("drops a permanently closed place and keeps a temporarily closed one", () => {
    expect(isCandidate(place("a", { permanentlyClosed: true }))).toBe(false);
    // Closed now is a soft signal (the open-only chip), not a reason to vanish.
    expect(isCandidate(place("b", { open: false }))).toBe(true);
    expect(isCandidate(place("c", { permanentlyClosed: undefined }))).toBe(true);
  });
});

describe("ratingStanding", () => {
  it("is unrated when Google has no average", () => {
    expect(ratingStanding(place("a", { rating: null, ratingCount: null }))).toBe("unrated");
    expect(ratingStanding(place("a", { rating: undefined }))).toBe("unrated");
  });

  it("is few-reviews under the minimum, including a missing count", () => {
    // Measured 2026-09-22: Gigi ★5.0 over ONE review. A single review means
    // nothing in either direction, so it can never be judged low.
    expect(ratingStanding(place("a", { rating: 5, ratingCount: 1 }))).toBe("few-reviews");
    expect(ratingStanding(place("a", { rating: 2, ratingCount: 4 }))).toBe("few-reviews");
    expect(ratingStanding(place("a", { rating: 2, ratingCount: null }))).toBe("few-reviews");
  });

  it("is rated at exactly the minimum", () => {
    expect(ratingStanding(place("a", { rating: 2, ratingCount: 5 }))).toBe("rated");
  });
});

describe("isLowRated", () => {
  it("flags a judged rating strictly under the threshold", () => {
    expect(isLowRated(place("a", { rating: 2.9, ratingCount: 40 }))).toBe(true);
    // 3.0 itself stays — MOS Burger was the lowest of 40 measured places at
    // exactly 3.0, and it is somebody's perfectly good lunch.
    expect(isLowRated(place("a", { rating: 3, ratingCount: 40 }))).toBe(false);
  });

  it("never flags a place that has too few reviews or none", () => {
    // The rule this protects is the reverse case: a new shop given 2 stars by
    // one person must not be hidden by a 3.0 cut.
    expect(isLowRated(place("a", { rating: 2, ratingCount: 1 }))).toBe(false);
    expect(isLowRated(place("a", { rating: null, ratingCount: null }))).toBe(false);
  });
});

describe("filterCandidates", () => {
  const all = [
    place("near", { walkMinutes: 2, priceLevel: 1 }),
    place("mid", { walkMinutes: 6, priceLevel: 2 }),
    place("far", { walkMinutes: 11, priceLevel: 3 }),
    place("closed", { walkMinutes: 4, open: false }),
    place("unknownOpen", { walkMinutes: 4, open: undefined }),
    place("unknownPrice", { walkMinutes: 5, priceLevel: null }),
    place("bad", { walkMinutes: 3, rating: 2.4, ratingCount: 60 }),
  ];
  const ids = (ps: Candidate[]) => ps.map((p) => p.placeId);

  it("hides low-rated places by default and nothing else", () => {
    const v = filterCandidates(all, {});
    expect(ids(v.visible)).toEqual(["near", "mid", "far", "closed", "unknownOpen", "unknownPrice"]);
    expect(ids(v.lowRated)).toEqual(["bad"]);
  });

  it("restores low-rated places in their original position when asked", () => {
    const v = filterCandidates(all, { showLowRated: true });
    expect(ids(v.visible)).toEqual(ids(all));
    // Still reported, so the notice can offer to hide them again.
    expect(ids(v.lowRated)).toEqual(["bad"]);
  });

  it("caps walk time inclusively", () => {
    expect(ids(filterCandidates(all, { walkCap: 5 }).visible)).toEqual([
      "near",
      "closed",
      "unknownOpen",
      "unknownPrice",
    ]);
  });

  it("caps price inclusively and lets an unknown price through", () => {
    // Same rule `shared/nearby.ts` applies: missing metadata is not a failure.
    expect(ids(filterCandidates(all, { priceCap: 1 }).visible)).toEqual([
      "near",
      "unknownPrice",
    ]);
  });

  it("drops only places reported closed when open-only is on", () => {
    const v = filterCandidates(all, { openOnly: true });
    expect(ids(v.visible)).not.toContain("closed");
    expect(ids(v.visible)).toContain("unknownOpen");
  });

  it("counts a low-rated place only when it would pass every other filter", () => {
    // The notice says "N hidden for rating"; a place the walk cap would hide
    // anyway must not be counted, or tapping 顯示 would bring back fewer than N.
    const farBad = [...all, place("farBad", { walkMinutes: 12, rating: 2, ratingCount: 30 })];
    expect(ids(filterCandidates(farBad, { walkCap: 5 }).lowRated)).toEqual(["bad"]);
  });

  it("does not reorder", () => {
    const shuffled = [all[2], all[0], all[1]];
    expect(ids(filterCandidates(shuffled, {}).visible)).toEqual(["far", "near", "mid"]);
  });
});

describe("relaxations", () => {
  const all = [
    place("a", { walkMinutes: 2, priceLevel: 1 }),
    place("b", { walkMinutes: 8, priceLevel: 1 }),
    place("c", { walkMinutes: 9, priceLevel: 3 }),
    place("d", { walkMinutes: 2, priceLevel: 3 }),
    place("e", { walkMinutes: 2, open: false, priceLevel: 1 }),
    place("f", { walkMinutes: 2, priceLevel: 1, rating: 2, ratingCount: 50 }),
  ];

  it("is empty when no filter is set and nothing is hidden", () => {
    expect(relaxations([place("a")], {})).toEqual([]);
  });

  it("reports how many places lifting each active filter would bring back, biggest first", () => {
    const r = relaxations(all, { walkCap: 5, priceCap: 1, openOnly: true });
    // walk cap alone hides b and c, but c is also over the price cap: gain 1.
    // price cap alone hides c and d, but c is also over the walk cap: gain 1.
    // open-only hides e: gain 1. Low rating hides f: gain 1.
    expect(r).toEqual([
      { kind: "openOnly", gain: 1 },
      { kind: "priceCap", gain: 1 },
      { kind: "walkCap", gain: 1 },
      { kind: "lowRated", gain: 1 },
    ]);
  });

  it("sorts by gain before the tie order", () => {
    const wide = [...all, place("g", { walkMinutes: 9, priceLevel: 1 })];
    expect(relaxations(wide, { walkCap: 5, priceCap: 1 })[0]).toEqual({ kind: "walkCap", gain: 2 });
  });

  it("omits a filter whose lifting brings nothing back", () => {
    const r = relaxations([place("a", { walkMinutes: 2 })], { walkCap: 5 });
    expect(r).toEqual([]);
  });

  it("does not offer the low-rated lift once they are already shown", () => {
    expect(relaxations(all, { showLowRated: true }).map((x) => x.kind)).not.toContain("lowRated");
  });
});

describe("walkBand", () => {
  it("buckets walk minutes under the smallest band edge that holds them", () => {
    expect(walkBand(0)).toBe(3);
    expect(walkBand(3)).toBe(3);
    expect(walkBand(4)).toBe(5);
    expect(walkBand(5)).toBe(5);
    expect(walkBand(9)).toBe(10);
    expect(walkBand(15)).toBe(15);
  });

  it("returns null past the last band", () => {
    expect(walkBand(16)).toBeNull();
    expect(walkBand(60)).toBeNull();
  });

  it("aligns band edges with the walk chips, so a chip removes whole sections", () => {
    // The chips are 5 and 10 minutes. If a band straddled a chip, applying it
    // would cut a section in half and leave a header over a partial list.
    expect(walkBand(5)).not.toBe(walkBand(6));
    expect(walkBand(10)).not.toBe(walkBand(11));
  });
});

describe("mergeCandidatePages", () => {
  it("appends only places not already held, keeping the first page's order", () => {
    const first = [place("a"), place("b")];
    const next = [place("b", { walkMinutes: 99 }), place("c"), place("d")];
    const merged = mergeCandidatePages(first, next);
    expect(merged.map((p) => p.placeId)).toEqual(["a", "b", "c", "d"]);
    // The copy already held wins — a later page must not rewrite a card
    // someone is looking at.
    expect(merged[1].walkMinutes).toBe(3);
  });

  it("slots a nearer later arrival into walk order without reordering what is held", () => {
    // Pages are ranked by straight-line distance and then re-sorted by ROUTED
    // walk time, so page two can hold a place nearer than the end of page one.
    // The list is sectioned by walk band; an unsorted append would put a
    // 4-minute card under the 10-minute header.
    const first = [place("a", { walkMinutes: 2 }), place("b", { walkMinutes: 4 }), place("c", { walkMinutes: 9 })];
    const next = [place("d", { walkMinutes: 4 }), place("e", { walkMinutes: 11 })];
    expect(mergeCandidatePages(first, next).map((p) => p.placeId)).toEqual(["a", "b", "d", "c", "e"]);
  });
});

describe("onWheel", () => {
  it("is the ticked places that are visible, in visible order", () => {
    // What you see is what you spin: a tick hidden behind a chip must not
    // silently ride onto the wheel, or the count on the button and the list
    // on screen disagree (failure modes 38/54).
    const visible = [place("a"), place("b"), place("c")];
    expect(onWheel(visible, new Set(["c", "a", "hidden"])).map((p) => p.placeId)).toEqual([
      "a",
      "c",
    ]);
  });
});

describe("arrivalTicks", () => {
  const arrivals = [place("x"), place("y", { open: false }), place("z"), place("w")];

  it("tops the wheel up to the target, open places first", () => {
    expect(arrivalTicks(arrivals, 6, 8)).toEqual(["x", "z"]);
  });

  it("ticks nothing when the wheel is already at the target", () => {
    // More places were asked for to CHOOSE from; they arrive unticked.
    expect(arrivalTicks(arrivals, 8, 8)).toEqual([]);
    expect(arrivalTicks(arrivals, 10, 8)).toEqual([]);
  });

  it("does not tick a closed arrival onto a wheel that can already spin", () => {
    const closed = [place("c1", { open: false }), place("c2", { open: false })];
    expect(arrivalTicks(closed, 3, 8)).toEqual([]);
    expect(arrivalTicks(closed, 1, 8)).toEqual(["c1"]);
  });

  it("never pushes the wheel past its cap", () => {
    expect(arrivalTicks(arrivals, MAX_SEGMENTS - 1, 20)).toEqual(["x"]);
  });
});
