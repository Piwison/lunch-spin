/**
 * Why the wheel has nothing on it — and which single constraint to lift.
 *
 * Eight independent things can empty the wheel: the wheel is genuinely empty,
 * everything was recently spun (excluded), a tag filter, a walk-time limit,
 * closing hours, closing before you could get there, today's vetoes, or the
 * "I don't eat" of someone here today. The Wheel tab used
 * to answer with one fixed sentence — "every restaurant is excluded or vetoed",
 * with "filtered out or" spliced in only when a TAG was set — so a user who had
 * merely set a 5-minute walk limit was told their places were excluded and
 * vetoed, went looking for something to re-enable, and found nothing. The
 * server already distinguishes the closed case ("Every restaurant on this wheel
 * is closed right now"), and the client threw that distinction away.
 *
 * The question a stuck user is actually asking is not "which filters ran" but
 * "what do I undo to spin?", so that is what this answers: run the pipeline,
 * and if it comes out empty, re-run it with each stage lifted in turn. The
 * first lift that puts a place back on the wheel is the one worth offering.
 *
 * Order is cheapest-to-undo first, not pipeline order — clearing today's votes
 * is one tap, and re-enabling an excluded place is a hunt through a collapsed
 * list. Vetoes and "I don't eat" are separate stages because only the first is
 * cleared by Clear: a person's "I don't eat" is theirs, and a Clear button
 * offered for it would do nothing.
 */

export interface SpinBlockRestaurant {
  id: number;
  isExcluded: boolean;
  /** Server-computed. Only "closed" comes off the wheel — unknown hours spin
   *  (most wheels are hand-typed places with no provider hours), which is the
   *  same rule `isSpinnableNow` applies server-side. */
  openStatus: string | null;
  /** Server-computed (`tooLateToGo`): open, but closes within the walk plus a
   *  buffer. Off the wheel like a closed place, reported separately. */
  tooLate?: boolean;
  walkSeconds: number | null;
  tags: { id: number }[];
}

export interface SpinBlockInput {
  restaurants: SpinBlockRestaurant[];
  selectedTagIds: number[];
  /** null = the walk-time limit is off. */
  maxWalkMinutes: number | null;
  vetoedIds: number[];
  /** Tags someone here today doesn't eat (shared/session `dietaryForPresent`). */
  dietaryTagIds: number[];
}

export type SpinBlockReason =
  | "none"
  | "empty"
  | "round"
  | "filters"
  | "diet"
  | "closed"
  | "closingSoon"
  | "excluded";

export interface SpinBlock {
  reason: SpinBlockReason;
  /** How many places each stage removed, for copy that can quote a number. */
  counts: { excluded: number; filtered: number; closed: number; closingSoon: number; round: number; diet: number };
}

interface Stages {
  excluded: boolean;
  filters: boolean;
  closed: boolean;
  closingSoon: boolean;
  round: boolean;
  diet: boolean;
}

const ALL: Stages = { excluded: true, filters: true, closed: true, closingSoon: true, round: true, diet: true };

/** The wheel's own pipeline, with any stage switched off. */
function survivors(input: SpinBlockInput, on: Stages): SpinBlockRestaurant[] {
  const vetoed = new Set(input.vetoedIds);
  const avoided = new Set(input.dietaryTagIds);
  const maxSeconds = input.maxWalkMinutes == null ? null : input.maxWalkMinutes * 60;

  return input.restaurants.filter((r) => {
    if (on.excluded && r.isExcluded) return false;
    if (on.filters) {
      if (!input.selectedTagIds.every((id) => r.tags.some((t) => t.id === id))) return false;
      // A place with no computed walk time cannot be shown to qualify, so a set
      // limit drops it — same rule `filterRestaurantsByDistance` applies.
      if (maxSeconds != null && (r.walkSeconds == null || r.walkSeconds > maxSeconds)) return false;
    }
    if (on.closed && r.openStatus === "closed") return false;
    if (on.closingSoon && r.tooLate) return false;
    if (on.round && vetoed.has(r.id)) return false;
    if (on.diet && avoided.size > 0 && r.tags.some((t) => avoided.has(t.id))) return false;
    return true;
  });
}

export function diagnoseSpinBlock(input: SpinBlockInput): SpinBlock {
  const counts = {
    excluded: input.restaurants.filter((r) => r.isExcluded).length,
    // What the filters alone remove, counted on the places they could apply to,
    // so a tag filter and a walk limit don't double-count the same place.
    filtered:
      survivors(input, { ...ALL, filters: false, closed: false, closingSoon: false, round: false, diet: false }).length -
      survivors(input, { ...ALL, closed: false, closingSoon: false, round: false, diet: false }).length,
    closed: input.restaurants.filter((r) => r.openStatus === "closed").length,
    closingSoon: input.restaurants.filter((r) => r.openStatus !== "closed" && r.tooLate).length,
    round: survivors(input, { ...ALL, round: false }).length - survivors(input, ALL).length,
    diet: survivors(input, { ...ALL, diet: false }).length - survivors(input, ALL).length,
  };

  if (survivors(input, ALL).length > 0) return { reason: "none", counts };
  if (input.restaurants.length === 0) return { reason: "empty", counts };

  // Which single lift unblocks the wheel, cheapest first.
  const lifts: [SpinBlockReason, Stages][] = [
    ["round", { ...ALL, round: false }],
    ["filters", { ...ALL, filters: false }],
    ["diet", { ...ALL, diet: false }],
    ["closed", { ...ALL, closed: false }],
    ["closingSoon", { ...ALL, closingSoon: false }],
    ["excluded", { ...ALL, excluded: false }],
  ];
  for (const [reason, on] of lifts) {
    if (survivors(input, on).length > 0) return { reason, counts };
  }
  // Nothing on its own is enough — several constraints overlap, so no single
  // lift unblocks the wheel. Name the one that removed the most, so the advice
  // is at least the largest true thing.
  const byReason: [SpinBlockReason, number][] = [
    ["round", counts.round],
    ["filters", counts.filtered],
    ["diet", counts.diet],
    ["closed", counts.closed],
    ["closingSoon", counts.closingSoon],
    ["excluded", counts.excluded],
  ];
  const worst = byReason.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  return { reason: worst, counts };
}
