# Theme proposal — "Warm Appetite", light + dark (toggle)

Chosen direction (2026-06-16, revised): **A · Warm Appetite**, **both light & dark with
a user toggle**. (Supersedes the earlier Refined Editorial/Light spec.) Guest spins are
client-side; discovery is popularity-ranked. Brand is **not finalized** — redline freely.

## Intent

Friendly, food-forward, appetizing. Warm tones instead of cold blue-black. The wheel and
the result are the joyful hero moments; glow/saturation is reserved for them and the
SPIN. Everything else is calm and warm. Feels like a delightful consumer food app.

## Two token sets

Tailwind v4 `@theme` already drives the color utilities. We add a **light** set (new
default) and a **dark** set under a `.dark` class on `<html>`. Toggle flips the class and
persists to `localStorage`; first visit follows `prefers-color-scheme`.

### Light — "warm cream"
| Token | oklch | Use |
|---|---|---|
| background | `0.97 0.015 80` | warm cream paper |
| card | `0.995 0.008 80` | surfaces |
| foreground | `0.26 0.03 50` | warm near-black |
| muted | `0.95 0.012 80` | subtle fills |
| muted-foreground | `0.50 0.03 60` | secondary text |
| border | `0.90 0.02 75` | hairlines |
| primary (accent) | `0.64 0.19 38` | tomato/ember — buttons, active |
| primary-foreground | `0.99 0.01 80` | text on accent |
| destructive / veto | `0.57 0.20 28` | |
| success / accept | `0.58 0.13 145` | |

### Dark — "warm charcoal" (not the current cold blue)
| Token | oklch | |
|---|---|---|
| background | `0.16 0.02 50` | warm charcoal/ember |
| card | `0.20 0.022 50` | |
| foreground | `0.95 0.01 80` | warm off-white |
| muted-foreground | `0.62 0.02 70` | |
| border | `0.30 0.022 55` | |
| primary | `0.70 0.19 40` | warmer tomato |

- **One accent (tomato/ember).** Retire the everyday orange→purple gradient; keep it
  only (optionally) on the result hero.
- **Wheel segments** keep the muted "designed spectrum" already shipped — appetizing in
  both modes.

## Type

- **Display:** a rounded, friendly face — **Fredoka** (or Baloo 2 / Quicksand) for the
  logo, section labels, result, big numerals. Adds warmth/playfulness.
- **Body:** keep **DM Sans**.

## Glow / motion policy

- Reserve glow for the **wheel, SPIN, and result** only. Remove ambient neon elsewhere
  (`.glow-*`, `cta-pulse`, `glow-text` become subtle/none, especially in light).
- Replace incidental glows with soft warm shadows.
- Keep tasteful motion (spin, result pop, tab-enter); honor `prefers-reduced-motion`.

## Chrome & identity

- **glass-nav** gets light + dark variants (frosted cream / frosted charcoal).
- **Theme toggle** in the header (sun/moon), persisted; respects system on first load.
- More whitespace; let rows and the wheel breathe.
- **Logo:** retire the conic rainbow orb → a warm mark (plate/bowl + fork or chopsticks)
  in the tomato accent. TBD with you.

## Migration plan — status

1. ✅ `index.css` restructured: `@theme` resolves via intermediate vars; `:root`
   warm-cream light (default) + `.dark` warm charcoal; `color-scheme` per mode.
2. ✅ Theme toggle (Home, WheelApp header, GuestWheel) + `localStorage` + system
   default following `prefers-color-scheme`; `.dark` set on `<html>`.
3. ✅ Glow utilities + `cta-pulse` follow `--brand-glow` (calm in light, punchy in
   dark); retired the everyday orange→purple gradient (warm tomato→amber now).
4. ✅ Swept ~260 hardcoded `oklch` across 12 files → tokens (alpha via relative
   color syntax). SpinWheel canvas resolves tokens via `getComputedStyle`; both
   WebGL shaders take a `u_dark` uniform and a warm, cream-in-light palette.
5. ✅ Fredoka loaded in `index.html`; `--font-display` points at it.
6. ◑ Contrast: added mode-aware `--ok`/`--info` for legible chip text; honored
   `prefers-reduced-transparency` + reduced-motion. Full AA audit still wants a
   real visual pass in a browser (the web sandbox has no display).
7. ☐ Logo mark — interim: warmed the rainbow conic orb to ember→amber. Final
   plate/bowl mark still TBD with you.

**Risk:** touches every screen; both modes need a real visual check.
Reversible (presentation only).
