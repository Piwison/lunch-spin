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
