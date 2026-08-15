/**
 * Onboarding / activation rules (Milestone 4). Pure, framework-free, unit-tested.
 *
 * The UI (GuestWheel, WheelApp) imports these so the "when do we nudge / what does
 * a starter wheel contain" decisions live in exactly one tested place rather than
 * sprinkled through components. No server/auth/DB coupling.
 */

/** Show the guest "make your own wheel" conversion CTA from this spin onward. */
export const FIRST_SPIN_CTA_THRESHOLD = 1;

/**
 * Decision 1b: earn the ask, don't nag. A guest sees the conversion CTA in the
 * result overlay only after they've completed at least one spin. Guards against
 * negative/NaN so a bad counter never flips the prompt on prematurely.
 */
export function shouldPromptSignup(guestSpinCount: number): boolean {
  if (!Number.isFinite(guestSpinCount)) return false;
  return guestSpinCount >= FIRST_SPIN_CTA_THRESHOLD;
}

/**
 * Decision 2b: a signed-in user with zero wheels gets the guided first-run card.
 * Takes the wheel COUNT (not selection state) so a returning user who simply
 * hasn't selected a wheel still gets the normal empty state. Fail-safe on
 * negative/NaN → not a first run (never block a real user behind onboarding).
 */
export function isFirstRun(wheelCount: number): boolean {
  if (!Number.isFinite(wheelCount)) return false;
  return wheelCount === 0;
}

// Note: the "start from a sample" contents reuse the existing, tested
// `STARTER_RESTAURANTS` (shared/starter.ts) via the create dialog's starter-pack
// option — we do NOT define a second sample list here.

// ── First-run wheel building (Locate → Pick → Spin) ─────────────────────────

/**
 * How many nearby results arrive already ticked on the "pick your spots" step.
 * Sized to land inside `shared/nearby`'s spinnable range (MIN_SEGMENTS 6 …
 * MAX_SEGMENTS 12) so the first wheel is neither thin nor unreadable.
 */
export const DEFAULT_PICK_COUNT = 8;

/** A one-segment wheel isn't a decision. */
export const MIN_SPINNABLE = 2;

/** Just enough of a nearby result for the pre-selection rule to judge it. */
export interface PreselectablePlace {
  placeId: string;
  /** Provider open-now hint; null/undefined when it didn't say. */
  open?: boolean | null;
}

/**
 * Which places arrive pre-ticked on the picking step.
 *
 * The design rule is that progress is the default and de-selecting is the
 * user's only job — a first-run screen that starts empty asks someone who has
 * never seen the product to do data entry. Results arrive walk-time sorted, so
 * "the first N" is already the right shortlist; the one adjustment is to prefer
 * places that are actually open, since the whole point is to spin right now.
 * Closed places top the list up rather than being discarded, so the wheel still
 * reaches a spinnable size in a quiet area (and they're fine tomorrow).
 *
 * Walk-time order is preserved within the result.
 */
export function preselectPlaceIds(
  places: PreselectablePlace[],
  count = DEFAULT_PICK_COUNT,
): string[] {
  if (count <= 0) return [];
  // `open == null` means the provider didn't say — treat as open rather than
  // punishing a place for missing metadata.
  const openNow = places.filter((p) => p.open !== false);
  const closed = places.filter((p) => p.open === false);
  const chosen = new Set(openNow.slice(0, count).map((p) => p.placeId));
  for (const p of closed) {
    if (chosen.size >= count) break;
    chosen.add(p.placeId);
  }
  // Re-walk the original list so the caller gets walk-time order, not
  // open-then-closed order.
  return places.filter((p) => chosen.has(p.placeId)).map((p) => p.placeId);
}

/** Whether the picked set is enough to build a wheel out of. */
export function canStartSpinning(selectedCount: number): boolean {
  if (!Number.isFinite(selectedCount)) return false;
  return selectedCount >= MIN_SPINNABLE;
}
