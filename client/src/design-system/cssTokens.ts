/**
 * A deliberately small reader for the token blocks in client/src/index.css.
 *
 * index.css is the design system's source of truth — its comments carry the
 * reasoning behind every value, which a generated file would lose — so the
 * guards read it as text rather than moving the tokens somewhere a parser
 * would find more convenient. This understands exactly what that file uses:
 * `--name: value;` declarations inside `:root`, `.dark` and `@theme` blocks,
 * and `var(--x)` references between them. It is not a CSS parser and is only
 * imported by the design-system tests.
 */

export type TokenMap = Map<string, string>;
export type Theme = "light" | "dark";

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Declarations inside every block whose selector matches exactly. */
function blocks(css: string, selector: RegExp): TokenMap {
  const out: TokenMap = new Map();
  const re = new RegExp(`(?:^|[\\s}])${selector.source}\\s*\\{([^{}]*)\\}`, "g");
  for (const m of Array.from(stripComments(css).matchAll(re))) {
    for (const decl of m[1]!.split(";")) {
      const d = /^\s*(--[a-z0-9-]+)\s*:\s*([\s\S]+?)\s*$/i.exec(decl);
      if (d) out.set(d[1]!, d[2]!.replace(/\s+/g, " "));
    }
  }
  return out;
}

/** The tokens each theme resolves to: `:root` for light, `:root` + `.dark`
 *  for dark — the same cascade the browser applies. */
export function readThemes(css: string): Record<Theme, TokenMap> {
  const light = blocks(css, /:root/);
  const dark = new Map(light);
  blocks(css, /\.dark/).forEach((v, k) => dark.set(k, v));
  return { light, dark };
}

/** Every custom property the file declares anywhere, @theme included. */
export function declaredProperties(css: string): Set<string> {
  const out = new Set<string>();
  for (const m of Array.from(stripComments(css).matchAll(/(--[a-z0-9-]+)\s*:/gi))) out.add(m[1]!);
  return out;
}

/** Follow `var(--x)` until a literal value, or null if it never gets there. */
export function resolveToken(tokens: TokenMap, name: string, depth = 0): string | null {
  const raw = tokens.get(name);
  if (raw == null || depth > 8) return null;
  const ref = /^var\((--[a-z0-9-]+)\)$/i.exec(raw);
  return ref ? resolveToken(tokens, ref[1]!, depth + 1) : raw;
}
