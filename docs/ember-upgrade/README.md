# Lunch Spin — Ember UI upgrade handoff

Drop this folder into the repo (suggested: `docs/ember-upgrade/`) and work from it.

## Start here

**`UI_UPGRADE.md`** is the source of truth. Every value needed to build the upgrade is in it:
tokens (light and dark), glass recipes, type scale, motion durations and curves, the wheel
geometry and the spin zoom camera, the responsive table, the sixteen build items with the
files each touches and the condition each merges on, sequencing, the cut line, risks, and the
shipped behaviour that must survive the re-skin.

If a screen and this document disagree, the document wins.

## Visual reference

`screens/` holds the design documents as standalone HTML. Open any file in a browser
(keep `support.js` and `doc-page.js` alongside them — they are the runtime those files load).

| File | What it is |
|---|---|
| `Liquid Glass Proposal.dc.html` | Every screen. Newest work at the top: the radial label system at three place counts (7a–7c), the zoomed spin (6a–6d), then the twelve Ember screens, then the original three directions. Pan and zoom to navigate. |
| `Wheel A Hairline.dc.html`, `Wheel B Petals.dc.html`, `Wheel C Live Slice.dc.html` | Three explorations of the resting wheel treatment, kept as a record. |
| `Design System.dc.html` | Components in their real states — rest, press, focus, loading, empty, error — next to the written spec and the CSS diff. |
| `Motion Spec.dc.html` | The spin timeline, playable. Durations, easing curves, and a per-element table. |
| `Build Order.dc.html` | The sixteen items as a printable document. Same content as section 7 of `UI_UPGRADE.md`. |
| `Upgrade Roadmap.dc.html` | The five phases, the performance budget table, and the risk list. |

These are design references, not application code. Nothing in `screens/` is meant to be
imported or copied into the app — the values live in `UI_UPGRADE.md` and the implementation
is ordinary React and CSS in the existing repo structure.

## The wheel is the detailed part

Section 4 of `UI_UPGRADE.md` is longer than the rest for a reason: the resting wheel went through
several rounds and the geometry is exact. Read it before touching `SpinWheel.tsx`. The short version —
labels run radially along their own pane's centre ray, each clipped to its own wedge, wrapping to two
lines up to 8 places, one line to 16, index-only above that; the disc is 92% of the frame width and
does not shrink as places are added.

## Working rules

- One branch per item, `claude/ember-NN-slug`. One PR, one revert. Never bundle two items.
- Visual and motion only. If an item appears to need a schema, route, or fairness change,
  stop and raise it rather than widening the PR.
- Every PR runs the existing suite plus the performance budget on a 4× throttled mid-range
  Android. A red budget cell blocks the merge.
- Items 1 and 2 touch every screen at once. They merge alone, with nothing else in flight.
