import { AA_LARGE, AA_NON_TEXT, AA_TEXT } from "./contrast";

export type ThemeName = "light" | "dark";

/**
 * A pair that measures BELOW its bar and is kept that way on purpose, or is
 * waiting for someone to decide. Either way `floor` is a ratchet: the pair may
 * improve freely, but the token test fails the moment it gets worse than this.
 *
 *   accepted — the owner has looked at the alternative and chosen this value
 *              (failure modes 17/20: a measurement is a fact, not a decision).
 *   open     — measured during the design-system audit, not yet decided. Listed
 *              under "Open decisions" in docs/design-system/README.md.
 */
export type KnownShortfall = {
  floor: number;
  status: "accepted" | "open";
  why: string;
};

export type ContrastPair = {
  /** The token painted on top — text, icon or edge. */
  fg: string;
  /** The opaque surface under it. */
  bg: string;
  /** WCAG bar this pair owes: 4.5 body text, 3 large text / UI edges. */
  min: number;
  /** What the pair is for, in a few words. */
  role: string;
  known?: Partial<Record<ThemeName, KnownShortfall>>;
};

const FM20 =
  "Failure mode 20: the deepened persimmon that cleared AA was shown and rejected; primary labels ship at 3.48:1 knowingly.";

/**
 * Every opaque token pair the app actually paints. Glass pairs are absent on
 * purpose: a translucent fill has no contrast until composited, so those are
 * measured in the browser on /design-system, not here.
 *
 * `--paper` and `--background` both appear because text sits on both — solid
 * cards and the bare ground — and a token has to clear the WORSE of the two
 * (that is the rule `--body-warm` was already darkened against).
 */
export const CONTRAST_PAIRS: ContrastPair[] = [
  // ── Ink on the two opaque surfaces ──
  ...(["--paper", "--background"] as const).flatMap((bg): ContrastPair[] => [
    { fg: "--foreground", bg, min: AA_TEXT, role: "headings, primary text" },
    { fg: "--body", bg, min: AA_TEXT, role: "body copy" },
    { fg: "--ink-warm", bg, min: AA_TEXT, role: "Ember-drawn screens' text" },
    { fg: "--body-warm", bg, min: AA_TEXT, role: "Ember-drawn screens' meta" },
    { fg: "--destructive", bg, min: AA_TEXT, role: "error text" },
    { fg: "--ok", bg, min: AA_TEXT, role: "success text" },
    { fg: "--info", bg, min: AA_TEXT, role: "notice text" },
  ]),
  {
    fg: "--muted-foreground",
    bg: "--paper",
    min: AA_TEXT,
    role: "meta on cards",
  },
  {
    // Was 4.30 on the ground while it was a cool #666D77; aliasing it to
    // --body-warm under the one-ink decision (2026-09-23) cleared it.
    fg: "--muted-foreground",
    bg: "--background",
    min: AA_TEXT,
    role: "meta on the bare ground",
  },

  // ── Persimmon ──
  {
    fg: "--brand-text",
    bg: "--paper",
    min: AA_TEXT,
    role: "persimmon text on cards",
    known: { light: { floor: 3.48, status: "accepted", why: FM20 } },
  },
  {
    fg: "--brand-text",
    bg: "--background",
    min: AA_TEXT,
    role: "persimmon text on the ground",
    known: { light: { floor: 3.05, status: "accepted", why: FM20 } },
  },
  {
    fg: "--accent-ink",
    bg: "--paper",
    min: AA_LARGE,
    role: "winner display type (34px+)",
  },
  {
    fg: "--accent-ink",
    bg: "--background",
    min: AA_LARGE,
    role: "winner display type (34px+)",
  },
  {
    fg: "--on-accent",
    bg: "--brand",
    min: AA_TEXT,
    role: "primary label, dark end of --brand-grad",
    known: { light: { floor: 3.48, status: "accepted", why: FM20 } },
  },
  {
    fg: "--on-accent",
    bg: "--brand-2",
    min: AA_TEXT,
    role: "primary label, light end of --brand-grad",
    known: {
      light: {
        floor: 2.35,
        status: "accepted",
        why: "Owner decision 2026-09-23: the gradient stays as it is. Reaching 3:1 at the light end needs #E26A2F, which all but flattens the gradient FM26 brought back.",
      },
    },
  },

  // ── Semantic fills ──
  {
    fg: "--destructive-foreground",
    bg: "--destructive",
    min: AA_TEXT,
    role: "destructive button label",
  },

  // ── Graphics and edges (3:1, WCAG 1.4.11) ──
  {
    fg: "--star-edge",
    bg: "--background",
    min: AA_NON_TEXT,
    role: "rating star outline",
  },
  {
    fg: "--star",
    bg: "--paper",
    min: AA_NON_TEXT,
    role: "rating star fill",
    known: {
      light: {
        floor: 1.53,
        status: "accepted",
        why: "The ordinary star yellow, asked for by name; --star-edge carries the contrast instead (see the token's comment).",
      },
    },
  },
  // The control edge (owner decision 2026-09-23). --border stays the light
  // hairline for dividers and cards, which are decorative; --input is the edge
  // of a field, an outlined button, a chip, a checkbox — where the edge is what
  // says a control is there.
  ...(["--paper", "--background"] as const).map(
    (bg): ContrastPair => ({ fg: "--input", bg, min: AA_NON_TEXT, role: "control edge: field, outline, chip, checkbox" }),
  ),
];
