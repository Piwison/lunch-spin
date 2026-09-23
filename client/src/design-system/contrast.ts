/**
 * WCAG 2.x contrast, for the design system's own guards and the style guide.
 *
 * Failure mode 17 is the reason this exists: the Ember palette went in with a
 * persimmon nobody had measured, and it took ~30 lines of hand-written
 * luminance math in a real browser, twelve build items later, to find out every
 * primary label was 3.48:1. The same math now runs in two places — the token
 * test (tokens.test.ts, against the literal values in index.css) and the
 * /design-system page (against whatever the browser actually resolved) — so a
 * palette change is measured the moment it lands instead of after it ships.
 *
 * Opaque colours only. A translucent token (every glass fill) has no contrast
 * of its own until it is composited over something, and pretending otherwise
 * would print a confident, meaningless number.
 */

export type Rgb = { r: number; g: number; b: number };

/** `#rgb`, `#rrggbb`, `rgb(r g b)` or `rgb(r, g, b)`; null for anything else,
 *  including any colour with an alpha below 1. */
export function parseColor(input: string): Rgb | null {
  const s = input.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (hex) {
    const h = hex[1]!.length === 3 ? hex[1]!.replace(/./g, (c) => c + c) : hex[1]!;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(s);
  if (fn) {
    const parts = fn[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return null;
    if (parts.length >= 4 && parts[3]! < 1) return null;
    return { r: parts[0]!, g: parts[1]!, b: parts[2]! };
  }
  return null;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two opaque colours, 1–21. Order does not matter. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The WCAG bars this app holds type and UI to. */
export const AA_TEXT = 4.5;
export const AA_LARGE = 3;
export const AA_NON_TEXT = 3;
