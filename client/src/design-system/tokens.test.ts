import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, parseColor } from "./contrast";
import { declaredProperties, readThemes, resolveToken } from "./cssTokens";
import { catalogTokenNames } from "./catalog";
import { CONTRAST_PAIRS, type ThemeName } from "./pairs";

/**
 * The design system's guards. None of these render anything: they read
 * index.css and the client sources as text, which is enough to catch the three
 * ways this codebase has actually drifted before —
 *
 *   1. a palette change nobody measured (failure modes 17, 20, 26),
 *   2. a `var(--typo)` that silently resolves to nothing,
 *   3. a component recipe copied into one more call site instead of used.
 */

const SRC = path.resolve(import.meta.dirname, "..");
const css = readFileSync(path.join(SRC, "index.css"), "utf8");
const themes = readThemes(css);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}
const sources = walk(SRC).map((file) => ({
  file: path.relative(SRC, file).split(path.sep).join("/"),
  text: readFileSync(file, "utf8"),
}));

describe("contrast", () => {
  for (const theme of ["light", "dark"] as ThemeName[]) {
    for (const pair of CONTRAST_PAIRS) {
      const known = pair.known?.[theme];
      it(`${theme}: ${pair.fg} on ${pair.bg} — ${pair.role}`, () => {
        const fg = parseColor(resolveToken(themes[theme], pair.fg) ?? "");
        const bg = parseColor(resolveToken(themes[theme], pair.bg) ?? "");
        expect(fg, `${pair.fg} must resolve to an opaque colour`).not.toBeNull();
        expect(bg, `${pair.bg} must resolve to an opaque colour`).not.toBeNull();
        const ratio = Math.round(contrastRatio(fg!, bg!) * 100) / 100;

        if (!known) {
          expect(ratio, `${pair.fg} on ${pair.bg} (${theme}) owes ${pair.min}:1`).toBeGreaterThanOrEqual(pair.min);
          return;
        }
        // A recorded shortfall may improve but never worsen. If it now clears
        // the bar, delete the entry from pairs.ts — a stale exception is how
        // the next regression gets waved through.
        expect(ratio, `${pair.fg} on ${pair.bg} (${theme}) dropped below its recorded floor`).toBeGreaterThanOrEqual(
          known.floor,
        );
        expect(
          ratio,
          `${pair.fg} on ${pair.bg} (${theme}) now clears ${pair.min}:1 — remove its "known" entry from pairs.ts`,
        ).toBeLessThan(pair.min);
      });
    }
  }
});

describe("token references", () => {
  const declared = declaredProperties(css);

  // Custom properties the app sets at runtime rather than in index.css —
  // `el.style.setProperty("--rot", …)` and `style={{ ["--i" as string]: n }}`.
  const runtime = new Set<string>();
  for (const { text } of sources) {
    for (const m of text.matchAll(/setProperty\(\s*["'`](--[a-z0-9-]+)/gi)) runtime.add(m[1]!);
    for (const m of text.matchAll(/\[\s*["'](--[a-z0-9-]+)["'](?:\s+as\s+\w+)?\s*\]\s*:/gi)) runtime.add(m[1]!);
    for (const m of text.matchAll(/["'](--[a-z0-9-]+)["']\s*:/gi)) runtime.add(m[1]!);
  }

  it("every var() the client reads is declared somewhere", () => {
    const missing: string[] = [];
    for (const { file, text } of sources) {
      if (file.startsWith("design-system/")) continue; // talks ABOUT var(), in prose
      // A reference with a fallback — var(--x, 160ms) — is allowed to be unset.
      for (const m of text.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/gi)) {
        const name = m[1]!;
        if (declared.has(name) || runtime.has(name)) continue;
        if (/^--(radix|tw)-/.test(name)) continue; // set by Radix / Tailwind
        missing.push(`${file}: ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("every token the /design-system page shows exists", () => {
    expect(catalogTokenNames().filter((name) => !declared.has(name))).toEqual([]);
  });

  it("every Tailwind colour utility points at a real token", () => {
    const theme = /@theme\s+inline\s*\{([\s\S]*?)\n\}/.exec(css.replace(/\/\*[\s\S]*?\*\//g, ""))?.[1] ?? "";
    const broken = [...theme.matchAll(/(--color-[a-z0-9-]+)\s*:\s*var\((--[a-z0-9-]+)\)/g)]
      .filter((m) => !themes.light.has(m[2]!))
      .map((m) => `${m[1]} -> ${m[2]}`);
    expect(broken).toEqual([]);
  });
});

describe("recipes live in components, not call sites", () => {
  const outsidePrimitives = sources.filter(
    ({ file }) => file.endsWith(".tsx") && !file.startsWith("components/ui/") && !file.startsWith("design-system/"),
  );

  it("no call site hand-rolls a backdrop-filter", () => {
    const offenders = outsidePrimitives
      .filter(({ text }) => /backdropFilter\s*:|backdrop-blur/.test(text))
      .map(({ file }) => file);
    expect(offenders, "use a .glass-* surface class from index.css").toEqual([]);
  });

  /**
   * The persimmon gradient is a ratchet, not a ban. What is left below is
   * decoration that is not a control — the tab rail's sliding indicator, a
   * tile's ticked fill, a monogram — plus the bespoke surfaces listed in
   * docs/design-system/README.md for a later phase. Counts may only go DOWN:
   * a new persimmon action is `<Button>` (variant "primary"), a new count is
   * `<Badge>`, a new toggle is `<Chip>`.
   */
  const BRAND_GRAD_BASELINE: Record<string, number> = {
    "components/NearbyDialog.tsx": 1, // a ticked checkbox square
    "components/OnboardingFlow.tsx": 2, // the 64px commit bar; a typed card's ticked tile
    "components/TabRail.tsx": 1, // the sliding active-tab indicator
    "components/WheelMembers.tsx": 1, // "here now" monogram
    "components/onboarding/PlaceCard.tsx": 1, // a ticked tile
    "pages/Home.tsx": 1, // feature-card icon tile
    "pages/WheelApp.tsx": 1, // account monogram
  };

  it("no new hand-rolled persimmon fills", () => {
    const counts: Record<string, number> = {};
    for (const { file, text } of outsidePrimitives) {
      const n = (text.match(/var\(--brand-grad\)/g) ?? []).length;
      if (n > 0) counts[file] = n;
    }
    const grew = Object.entries(counts)
      .filter(([file, n]) => n > (BRAND_GRAD_BASELINE[file] ?? 0))
      .map(([file, n]) => `${file}: ${n} (baseline ${BRAND_GRAD_BASELINE[file] ?? 0})`);
    expect(grew, "use <Button>, <Badge> or <Chip> from components/ui instead").toEqual([]);
  });
});
