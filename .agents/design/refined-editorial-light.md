# Theme proposal — "Refined Editorial", Light

Chosen direction (2026-06-16): **B · Refined Editorial**, **Light only**, client-side
guest spins, auto-by-popularity discovery. This doc specs the *visual system* so we
agree on tokens before the refactor. Brand is **not finalized** — react/redline freely.

## Intent

Premium, calm, high-contrast, lots of whitespace, **one confident accent**. The wheel
is the single colorful hero; everything else is quiet editorial chrome. Removes the
"AI dashboard" neon-on-black look. Feels like a premium dining product.

## Palette (light)

Warm-paper neutrals (not cold blue), near-black warm ink, ONE accent (terracotta).

| Token | Value (oklch) | Use |
|---|---|---|
| `--color-background` | `0.985 0.006 70` | warm paper |
| `--color-card` | `1 0 0` | surfaces (white) |
| `--color-foreground` | `0.24 0.02 60` | warm near-black ink |
| `--color-muted` | `0.96 0.006 70` | subtle fills |
| `--color-muted-foreground` | `0.50 0.02 60` | secondary text |
| `--color-border` | `0.90 0.008 70` | hairlines |
| `--color-primary` (accent) | `0.58 0.17 32` | terracotta — buttons, active, links |
| `--color-primary-foreground` | `1 0 0` | text on accent |
| `--color-destructive` / veto | `0.55 0.19 25` | veto / delete |
| success / accept | `0.52 0.11 150` | accept / present |
| `--radius` | `0.625rem` | crisper corners than today's 0.75 |

- **Single accent.** Drop the orange→purple *gradient* as the everyday brand mark;
  use solid terracotta. Gradient may survive only on the result hero, if at all.
- **Wheel segments** keep the muted "designed spectrum" (already shipped) — in light
  mode they read as confident editorial color, not neon.

## Type

- Pair a **serif display** for hero moments with a clean grotesk for UI:
  - Display / result / big numerals: **Fraunces** (or Instrument Serif) — editorial warmth.
  - UI labels / nav: **Space Grotesk** (keep) or Inter.
  - Body: **DM Sans** (keep) or Inter.
- Tighten tracking on the all-caps labels; rely on weight + size for hierarchy.

## Glow / motion policy (the big behavior change)

- **Remove neon globally.** `.glow-*`, `cta-pulse`, `glow-text` become near-no-ops in
  light. Replace with soft, low-contrast shadows (`0 1px 2px / 0 8px 24px rgba(0,0,0,.06)`).
- Glow is **reserved** for: the result card (subtle colored shadow) and a gentle
  emphasis on SPIN. Nothing else glows.
- Keep tasteful motion (tab-enter, result pop, wheel spin); kill the ambient pulsing.

## Chrome

- **Glass-nav → light glass**: `oklch(1 0 0 / 0.7)` + blur, hairline border, soft float
  shadow. Reads as frosted white, not dark.
- More whitespace: bump container/section padding; let rows breathe.
- **Logo**: retire the conic rainbow orb. Proposal: a crisp plate/disc mark with a
  single terracotta pointer (the wheel + arrow as a monogram). TBD with you.

## Migration plan (when approved)

1. Rewrite `@theme` tokens → light; `color-scheme: light`; body bg; scrollbar.
2. Neutralize glow utilities + `cta-pulse` for light.
3. Sweep the 10 files with hardcoded dark `oklch` (≈39 base hits + accents):
   `WheelApp.tsx` (14), `RestaurantTab` (6), `Home` (6), `RoundPanel` (4),
   `HistoryTab` (3), `RestaurantStats` (2), `SpinWheel`/`WheelMembers`/`JoinWheel`/
   `App` (1 each) — map inline darks to tokens (`bg-card`, `bg-muted`, `border-border`,
   `text-muted-foreground`) or light values. SpinWheel canvas center/empty colors too.
4. Add fonts (Fraunces) in `index.html`; update `--font-display` usage where serif fits.
5. Re-check contrast (WCAG AA), `prefers-reduced-transparency`, `prefers-reduced-motion`.
6. Logo mark.

**Risk:** touches every screen; do it on this branch behind review, screenshot before/after.
**Effort:** ~1–2 focused passes. Reversible (it's all presentation).
