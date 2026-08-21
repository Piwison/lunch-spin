# The resting wheel's labels — open design problem

**Status: RESOLVED.** Radial labels shipped — see §4 of `docs/ember-upgrade/UI_UPGRADE.md`,
which supersedes everything below. This file is kept for the reasoning, because the
constraint list is what the replacement had to satisfy and the lesson is worth not
relearning.

The answer was the one direction that broke a stated rule: labels run RADIALLY along their
own pane's centre ray, each clipped to its own wedge, wrapping to two lines up to 8 places.
"Labels horizontal, never rotated" was the constraint doing the damage, and no amount of
width tuning inside it was ever going to work.

The Ember resting wheel puts a horizontal label in every pane. At eight places that mostly
works. Past ten it does not, and two rounds of geometry work did not save it.

## What was tried, and what it bought

Every number below is the worst case measured across 320/360/390/412/430px frames.

| Layout | Worst label |
|---|---|
| Centred box, one ring — the first build | 40px |
| Staggered onto two rings, still centred | 49px |
| One ring, box grows into the room it has | 48px |
| Staggered **and** inward-growing — current `main` of `claude/ember-label-stagger` | 59px |

By pane count, first build → current:

| Places | Before | After |
|---|---|---|
| 8 | 81px | 113px |
| 10 | 63px | 95px |
| 12 | 42px | 66px |
| 14 | 40px | 60px |

## Why it still isn't good

Rejected on sight, and correctly:

1. **Staggering trades one legibility problem for another.** Near 12 and 6 o'clock an outer
   and an inner label sit directly above each other. The hairline between their panes is
   subtle, so they read as two lines of a single name rather than two different restaurants.
2. **Width is not legibility.** 66px at 12 places is still ~8 characters. "Nonna's Trattoria"
   becomes "Nonna's Tratto…". Making the truncation shorter is not the same as fixing it.
3. The optimisation was sound and the outcome was still wrong, which means the constraint set
   itself is the problem — not the values inside it.

## The constraints any replacement must satisfy

These are geometric facts, not preferences. A design that ignores them cannot be built.

- **Pane count is user data.** Teams have 5 to 16+ restaurants. It is not fixed at eight, and
  the design must degrade honestly as the count rises rather than assuming the drawn case.
- **Names are user data too**, and long ("Nonna's Trattoria", "Smokehouse Six", "Phở 88").
  Latin-ext and Vietnamese glyphs must render — the font subsets are already wired for it.
- **Horizontal labels on one ring cannot beat `2·r·sin(π/count)`** near 12 and 6 o'clock,
  because adjacent labels are level there and the neighbour binds before the rim does.
- **The disc breaks the right edge of its frame** — the signature motif. That costs label room
  on the right unless boxes grow inward, which the current build already does.
- **The hub is 26% of the disc** and labels may not cross it.
- **The pane under the pointer must never be clipped** at any width from 320px up.
- **Rotation is scoped to the zoomed spin state.** The resting wheel keeps horizontal labels —
  this is the rule the current design is fighting, and the one most worth questioning.
- **Perf budget is already green and must stay green**: ≥55fps sustained at 4× CPU throttle
  (currently 58.4), 0 idle frames, CSS ≤ +4kB gz. The disc is a CSS `conic-gradient` on
  promoted layers; per-label CSS filters are affordable, per-frame canvas repaints are not.

## Directions not yet tried

- Drop per-pane labels at rest entirely; let the wheel be a composition and put the names in a
  list beside or beneath it, with the pointer pane called out.
- Name only the pane at the pointer, the way the zoomed state already does.
- Radial labels above a threshold — solves it outright, but breaks "horizontal, never rotated".
- A different resting form altogether that is not a labelled pie.

## Where the code is

- Geometry, with tests: `shared/wheelGeometry.ts` + `.test.ts` (`restingLabelLayout`)
- Render: `client/src/components/SpinWheel.tsx`
- Design source of truth: the Ember handoff, §4 "The wheel"

Related: AGENTS.md known failure mode 16.
