/**
 * Fitting a restaurant name into the winner sheet's display type.
 *
 * `.type-display` is a flat 68px with `word-break: keep-all`, which is right for
 * "Sushi Spot" and wrong for "千壽司旗艦店": six full-width characters at 68px is
 * 408px, a 390px phone offers 342px, and `keep-all` means there is nowhere to
 * break — so the name ran off the side of the screen.
 *
 * Two levers, in that order: wrap to a second line first, and only shrink when
 * two lines at full size still do not fit. Shrinking first would make short
 * names smaller for no reason, and the display size is most of what makes the
 * result feel like an announcement.
 *
 * The width estimate is deliberate rather than measured. Measuring means a
 * layout pass per render on a surface that animates in, and the estimate only
 * has to be good enough to pick between six sizes: CJK and other full-width
 * characters occupy one em by definition, and Latin at this weight averages
 * close to half. It errs slightly wide on lowercase-heavy Latin, which fails in
 * the safe direction — a size smaller than strictly necessary, never a
 * name over the edge.
 */

/** The display sizes, largest first. */
export const DISPLAY_SIZES = [68, 58, 50, 42, 36, 30] as const;

/** The most lines a name may occupy before it has to shrink instead. */
export const DISPLAY_MAX_LINES = 2;

/**
 * Ranges that render at one full em: CJK ideographs and kana, Hangul, and the
 * full-width forms — including the punctuation that comes with a Chinese
 * restaurant name (《》「」（）).
 */
function isFullWidth(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) || // Hangul jamo
    (code >= 0x2e80 && code <= 0x303e) || // CJK radicals, punctuation
    (code >= 0x3041 && code <= 0x33ff) || // kana, CJK compatibility
    (code >= 0x3400 && code <= 0x4dbf) || // extension A
    (code >= 0x4e00 && code <= 0x9fff) || // unified ideographs
    (code >= 0xa000 && code <= 0xa4cf) || // Yi
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul syllables
    (code >= 0xf900 && code <= 0xfaff) || // compatibility ideographs
    (code >= 0xfe30 && code <= 0xfe6f) || // compatibility forms
    (code >= 0xff00 && code <= 0xff60) || // full-width forms
    (code >= 0xffe0 && code <= 0xffe6)
  );
}

/** A name's width in ems: full-width characters count 1, everything else 0.5. */
export function emWidth(name: string): number {
  let total = 0;
  for (const ch of name) {
    const code = ch.codePointAt(0) ?? 0;
    total += isFullWidth(code) ? 1 : 0.5;
  }
  return total;
}

export type DisplayFit = {
  /** Font size in px, from `DISPLAY_SIZES`. */
  fontPx: number;
  /** How many lines the name is expected to take, 1 or 2. */
  lines: number;
};

/**
 * The largest size at which `name` fits `containerPx` in at most two lines.
 *
 * Falls back to the largest size when the container has not been measured yet
 * (width 0), so the first paint is the intended one rather than the smallest.
 */
export function fitDisplayName(name: string, containerPx: number): DisplayFit {
  const largest = DISPLAY_SIZES[0];
  const width = emWidth(name);
  if (containerPx <= 0 || width === 0) return { fontPx: largest, lines: 1 };

  for (const fontPx of DISPLAY_SIZES) {
    // Capacity is WHOLE characters per line, not a fractional split. CJK breaks
    // between any two characters, so a line holds floor(container / font) ems
    // and the remainder is wasted — thirteen characters at 50px in a 342px box
    // divide to 325px a line on paper and ellipsise in a browser, because six
    // fit per line and two lines is twelve.
    const perLine = Math.floor(containerPx / fontPx);
    if (perLine < 1) continue;
    const lines = Math.ceil(width / perLine);
    if (lines <= DISPLAY_MAX_LINES) return { fontPx, lines: Math.max(1, lines) };
  }
  // Longer than two lines at every size: take the smallest and let the element's
  // own line clamp end it.
  return { fontPx: DISPLAY_SIZES[DISPLAY_SIZES.length - 1], lines: DISPLAY_MAX_LINES };
}
