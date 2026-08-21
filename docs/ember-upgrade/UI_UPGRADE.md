# Lunch Spin — Ember UI upgrade: implementation handoff

Everything Claude Code needs to build the upgrade without going back to the design tool.
Design work is complete (Phases 1–4). This document is the source of truth for values;
where it disagrees with a screenshot, this document wins.

**Repo:** Piwison/lunch-spin · branch `main`
**Scope:** visual and motion only. No schema, route, API, or spin-fairness changes.
**Branches:** one per item, `claude/ember-NN-slug`. One PR, one revert, no bundling.

---

## 1. The direction

"Ember" — Liquid Glass at full strength on a warm paper ground.

- Asymmetric layout. The wheel is oversized and deliberately breaks one edge of its container.
- Persimmon is the only saturated colour in the app: primary action, eyebrow labels, icons.
- Glass is for floating chrome and overlays only — tab dock, filter chips, sheets, hub, result card.
  The ground stays flat paper and never blurs.
- Mobile first, light mode default, dark mode supported.
- A circle breaking one edge of its container is the signature motif — in the **zoomed spin**, the Places map, and the History ring. The labelled resting wheel is the exception and sits fully on-screen; a circle that breaks an edge cannot carry readable labels on the part that is off-screen.
- Minimum control height 56px. Toasts are full-width bars at the thumb, never floating pills.

## 2. Tokens

Rewrite the existing token values in place. Do not introduce new names except the glass set.

### Colour — light

| Token | Value | Use |
|---|---|---|
| `--accent` | `#DE5C1F` | primary action, eyebrows, icons, pointer |
| `--accent-ink` | `#B0431A` | accent text on light glass (winner label) |
| `--ink` | `#14161C` | headings, primary text |
| `--ink-strong` | `#0D0F14` | display type only |
| `--body` | `#5A626D` | body copy |
| `--muted` | `#868D97` | labels, meta |
| `--faint` | `#9AA1AA` | placeholder, disabled |
| `--hairline` | `#C7CBD1` | rules, dividers |
| `--ground` | `linear-gradient(160deg, #F6F2EC 0%, #EFE8DF 55%, #E7DED2 100%)` | app background |
| `--paper` | `#FBF7F2` | text on accent, solid cards |

### Colour — dark

Same system at inverted value. Persimmon is lifted so it holds its weight against charcoal.

| Token | Value |
|---|---|
| `--accent` | `#F2703A` |
| `--ink` | `#F6F3EE` |
| `--body` | `#E6E2DB` |
| `--muted` | `#9BA0A8` |
| `--ground` | `linear-gradient(160deg, #191B20 0%, #15171C 55%, #101216 100%)` |
| `--on-accent` | `#16120F` |

### Glass recipes

Named tokens so no component hand-rolls a `backdrop-filter`. Four surfaces only.

| Surface | Light | Dark |
|---|---|---|
| Floating bar / dock | `rgba(255,255,255,.55)`, `blur(28px) saturate(1.4)`, border `rgba(255,255,255,.9)` | `rgba(255,255,255,.08)`, `blur(28px)`, border `rgba(255,255,255,.12)` |
| Sheet | `rgba(255,255,255,.72)`, `blur(34px) saturate(1.4)`, border `rgba(255,255,255,.95)` | `rgba(255,255,255,.10)`, `blur(34px)`, border `rgba(255,255,255,.14)` |
| Card | `rgba(255,255,255,.62)`, `blur(28px)`, border `rgba(255,255,255,.95)`, shadow `0 18px 40px rgba(20,22,28,.14)` | `rgba(255,255,255,.08)`, `blur(28px)`, border `rgba(255,255,255,.12)` |
| Chip | `rgba(255,255,255,.62)`, `blur(24px)`, border `rgba(255,255,255,.95)` | `rgba(255,255,255,.08)`, border `rgba(255,255,255,.12)` |

Two rules enforced in code: never more than two blurred layers stacked, and the ground never blurs.

### Type

**Bricolage Grotesque**, self-hosted, `font-display: swap`, preload weights 500 and 600 only.

| Role | Size / line-height | Weight | Tracking |
|---|---|---|---|
| Display (winner) | 68 / .90 | 600 | -0.05em |
| Screen title | 34 / 1.0 | 600 | -0.035em |
| Section title | 28 / 1.0 | 600 | -0.03em |
| Wheel label (resting) | 15 | 700 | -0.02em |
| Wheel label (zoomed) | 28 | 700 | -0.02em |
| Body | 17 / 1.45 | 400 | — |
| Meta | 15 | 400/500 | — |
| Eyebrow | 11, uppercase | 700 | 0.20em |

Radii: chip 19, control 20–22, card 28, sheet 34, hub and wheel 999.

## 3. Motion

Transform and opacity only. No animated width, height, or shadow. Blur animates in exactly
one place — the spin zoom's per-label blur — and is capped there.

### Durations

```
--dur-tap        120ms
--dur-toggle     160ms
--dur-view       200ms
--dur-toast-in   260ms
--dur-sheet-in   320ms
--dur-sheet-out  240ms
```

### Easing — four curves, no more

```
--ease-standard  cubic-bezier(.2,.9,.1,1)
--ease-exit      cubic-bezier(.4,0,1,1)
--ease-settle    cubic-bezier(.34,1.26,.64,1)   /* overshoot: settle only, nothing else bounces */
--ease-decay     cubic-bezier(.08,.82,.17,1)
```

Other: `--move-enter 18px`, `--press-scale 0.97`, `--stagger 60ms`.

### The spin, end to end (3.62s total)

| Phase | Duration | Notes |
|---|---|---|
| Wind-up | 180ms | disc counter-rotates slightly, `--ease-exit` |
| Travel | 2600ms | constant fast phase into the long tail, `--ease-decay` |
| Settle | 220ms | lands **on** the pane boundary, `--ease-settle` |
| Disc recedes | 320ms | drops back 52px, blurs to 14px at 50% opacity |
| Slice unrolls | 460ms | winning pane becomes full-bleed display type |

The winner is selected before the animation starts. Existing fairness logic is untouched;
the animation only has to land on the already-chosen index.

### Reduced motion

Under `prefers-reduced-motion` the spin resolves in 400ms with no zoom, no blur, and no unroll.
The result is identical.

## 4. The wheel

### Resting — geometry

Reference frame is 390px wide. Every number scales with the frame; **nothing scales with the place count.**

| Quantity | Value at 390px | Rule |
|---|---|---|
| Disc diameter | 358px | 92% of frame width, 16px margin each side |
| Disc radius R | 179px | — |
| Hub diameter | 100px | fixed; sits inside the band start limit |
| Band start r0 | 58px (68px for the 17+ index tier) | 8px clear of the hub; see the fit check below |
| Band end | 159px | R − 20px rim margin |
| Band length | 101px (91px at 17+) | band end − r0 |
| Inner text padding | 4px | at the hub end and the rim end |
| Pointer | 30 × 32px, apex right | bites into the rim from the left at disc centre height |

The disc is optically centred between the header and the pointer readout. The pointer overlapping
the rim is what frees the full width — it does not float outside the circle.

### Resting — fill

- N panes, colourless glass. Conic fill alternating `rgba(255,255,255,.78)` / `rgba(255,255,255,.40)`
  per pane (`360/n` degrees each).
- Warm highlight over it: `linear-gradient(135deg, rgba(255,255,255,.55), rgba(255,255,255,0) 42%, rgba(222,92,31,.07))`.
- Boundary ticks: 1px, `rgba(20,22,28,.09)` up to 16 panes, `rgba(20,22,28,.05)` above.
- Hub: glass circle, count + "in play" eyebrow in persimmon.
- Fixed sensing zone at the pointer.

### Resting — labels

This supersedes the earlier horizontal-label rule.

**Radial, not horizontal.** A horizontal name laid across a wedge that is not horizontal always ends up
crossing a boundary and reading as if it belongs to two places. Each label sits on its own pane's
**centre ray**, reading outward from the hub. Labels whose mid-angle is between 180° and 360° are
rotated a further 180° and right-aligned flipped, so no name is ever upside down.

**Clipped to the wedge.** Each label is wrapped in a container with `clip-path` set to its own pane's
wedge polygon (apex at centre, arc sampled every ~4° out to R+8). Crossing a boundary is then
impossible by construction, not by tuning.

**Wrap first, truncate last.** Three tiers:

| Places | Type | Band height | Behaviour |
|---|---|---|---|
| 2–8 | 15px / 17px line-height | 36px | **two lines**, `-webkit-line-clamp: 2`, `text-wrap: balance` — ordinary names fit whole |
| 9–16 | 13px / 22px | 22px | one line, ellipsis on the longest names |
| 17+ | 11px / 15px, `rgba(20,22,28,.5)` | 15px | **index number only**; names live in the readout |

Type size is fixed per tier and never interpolated. A 45° wedge has far more tangential room than one
line of type uses, which is what pays for the two-line band at low counts.

**The band width is the label's max-width.** Set `max-width: bandLength - 4px` on the text span, so a
long name always truncates with an ellipsis *before* the wedge clip could bisect a glyph. Never rely
on the clip to end a line.

**Band start is checked, not chosen.** A band of height h only fits inside a wedge beyond
`r = h / (2·tan(180/n))`. Assert this at render time:

```
bandStartFits(n, h) => h / (2 * Math.tan((180 / n) * Math.PI / 180)) <= r0
```

At r0 = 58 the two-line 36px band clears 8 panes. The 17+ index tier uses r0 = 68 so a 15° wedge has
real clearance rather than a fraction of a pixel. If a future tier fails the check, raise r0 or shorten
the band — do not shrink the type.

**Above 16 places the wheel stops labelling.** There is no font size past roughly sixteen panes that is
both legible and contained, so the disc carries indices and hands legibility to the readout. This is a
deliberate ceiling, not a fallback.

### Resting — pointer readout

Permanent, at every place count, directly above the Spin button. Glass card, eyebrow "At the pointer"
in persimmon, the pane's name at 21px, meta right-aligned (walk time, price, and `#index` at the 17+
tier). The wheel must never depend on disc labels to be usable — this card is why 24 places is fine.

At 17+ a single muted line sits above the readout: names arrive as the wheel passes the pointer, and in
full when it lands. Stack the note, the readout, and the Spin button in **one flex column** anchored to
the bottom inset with `gap: 20px` — do not position them independently.

### Zoomed (the spin camera) — new in Phase 4

On spin the camera pushes into the wheel rather than animating an object on screen.

- Disc scales to **1.9× the frame width**, transform origin **at the pointer**, 420ms, `cubic-bezier(.2,.8,.2,1)`.
  At 390px frame that is a 740px disc; it breaks both left and right edges.
- Pointer moves to top centre for the zoomed state.
- Header lifts 12px, blurs to 1.6px, drops to 50% opacity over the first 180ms. Only the group name survives.
- Hub stays pinned to the disc centre, which now sits at ~82% of frame height — it reads as the count sinking below the fold.
- **Four labels at a time**: the pair either side of the pointer at ±22.5° at full size, and two clipped
  fragments at ±60° at the frame edges. Label radius 250 on a 740px disc (centre at frame x = 195).
  Anything further round the arc is not rendered.
- Per-label blur by angular distance from the pointer: 0px at ±22.5°, 6px at ±60°, scaling down with speed
  as the wheel decelerates. Never blur the whole layer — the name under the pointer is always sharpest.
- **Rotated (tangential) labels are scoped to this state only.** The resting wheel uses the radial clipped labels above.
- The pane under the pointer must never be clipped by the frame at any supported width.
- On landing the camera holds the zoom: the winning pane takes the persimmon wash, its two edges light up,
  then the name resolves in the header. No zoom-out until Lock it in or Respin.

### Winner

The winning pane unrolls in place into full-bleed display type — **no card frame**. The disc drops
back and blurs behind it. Carries the shipped open-hours behaviour: closing-soon warning with minutes
remaining, closed places already dropped before the spin. Actions: Lock it in (accent), Respin, Directions.

## 5. Responsive

| Range | Layout |
|---|---|
| 320–767 | single column, floating tab dock at the bottom, disc fully on-screen at 92% of frame width |
| 768–1279 | two columns: wheel column holds its drawn size on the left, active tab content in a fixed 380px column on the right, tab dock moves to the top of that column. The zoom camera scales against the **wheel column width**, not the viewport |
| 1280+ | persistent rail, segmented tabs, wheel held at its drawn size rather than scaled up |

## 6. Performance budget

Measured on a mid-range Android at 4× CPU throttle. A red cell **blocks the merge** — it does not
become a follow-up ticket. If a cell cannot be met, the glass on that surface gets thinner.
The timings do not get shorter.

Known suspects: the zoom frame, and anywhere two glass layers ended up stacked.

## 7. Build order

Sixteen items, dependency order. Each is small enough to ship alone and revert alone.

| # | Item | Files | Merges when |
|---|---|---|---|
| 1 | Token layer: Ember light + dark | `index.css`, `lib/palette.ts` | no hardcoded hex left in the diff; dark pair matches spec |
| 2 | Type: Bricolage Grotesque + scale | `index.css`, `index.html` | CLS ≤ 0.02 on first load |
| 3 | Glass primitives (bar, sheet, card, chip) | `components/ui/glass.tsx` (new) | `backdrop-filter` appears in glass.tsx only |
| 4 | Motion tokens + reduced motion hook | `index.css`, `hooks/useReducedMotion.ts` (new) | reduced motion produces no scale or filter animation |
| 5 | SpinWheel: resting wheel + radial labels | `components/SpinWheel.tsx` | 2, 8, 9, 16, 17, 24 places at 320–430px: no label crosses a pane boundary, no glyph bisected by the clip, the fit check asserts at every count |
| 6 | SpinWheel: deceleration curve | `components/SpinWheel.tsx` | fairness tests unchanged; lands on selected index 100/100 |
| 7 | Spin zoom camera | `SpinWheel.tsx`, `pages/WheelApp.tsx` | in budget through the zoom; pointer pane never clipped |
| 8 | Winner state | `WheelApp.tsx`, `RoundPanel.tsx` | closing_soon + closed render from real `openStatus`; Respin leaves no transform |
| 9 | App chrome (dock, chips, switcher) | `FilterBar.tsx`, `WheelSelector.tsx`, `WheelMembers.tsx` | no control under 56px on any tab |
| 10 | Places + History re-skin | `RestaurantTab.tsx`, `Map.tsx`, `HistoryTab.tsx`, `RestaurantStats.tsx`, `TasteProfile.tsx` | sort/filter/rating behave identically to main |
| 11 | Entry screens | `Home.tsx`, `GuestWheel.tsx`, `JoinWheel.tsx`, `OnboardingFlow.tsx` | guest session cannot reach an edit control |
| 12 | Add-a-place + invite | `NearbyDialog.tsx`, `LocationPicker.tsx` | adding a place updates the wheel without a reload |
| 13 | Dark mode + desktop 1280 | `index.css`, `WheelApp.tsx`, `glass.tsx` | both themes pass contrast; nothing breaks 320–1440 |
| 14 | Tablet layout 768–1279 | `WheelApp.tsx`, `glass.tsx`, `index.css` | 768/834/1024/1279 all two-column; zoomed spin unclipped |
| 15 | AI sous-chef surface | `components/AIChatBox.tsx` | suggestion chip adds a place without reload; mid-stream dismissal cancels cleanly |
| 16 | Performance pass | wherever measurements point | every budget cell green twice in a row |

**Sequencing.** 1–4 in order, foundation. Then two threads: the wheel chain 5 → 6 → 7 → 8 stays serial
(each step re-tunes the one before it); the surface chain 9 → 10 → 11 → 12 runs in parallel. 13 and 14
need both threads. 15 needs only the foundation and can start early. 16 closes the release.

**Cut line.** If the release has to be short: 1–8 plus 16. The re-skinned tabs can ship a week later
without looking unfinished, because they inherit the token layer from item 1.

## 8. Risks

- **Glass is the expensive material.** Overlapping `backdrop-filter` is the main perf risk; item 3 exists to contain it.
- **Physicality rests entirely on timing.** 3D was explored and cut, so the spin has to feel right from its curve alone.
- **Label legibility on glass.** Ink labels on translucent panes over a light ground is the hardest contrast case in the app.
- **The label geometry is load-bearing.** The clip, the max-width, and the band-start check work as a set.
  Removing any one of them brings back names crossing pane boundaries, which was the defect that forced
  this redesign. Item 5 should carry a test for the fit check.
- **Token sweep regressions.** The repo already swept ~260 hardcoded colour values into tokens. Item 1 touches
  every screen at once, so it merges alone with nothing else in flight.

## 9. Already shipped, keep it

Behaviour that exists in code and must survive the re-skin:

- Open-hours status: `openStatus` = open / closing_soon / closed, `minutesUntilClose`,
  "Closing in ~N min — hurry!" on the result, closed places auto-dropped before a spin.
- Restaurant tab controls: per-row `★ avg` chip and the "Top rated first" sort.
- Guest wheel: read-only affordances, vote-once rule.
- Spin fairness: winner chosen before the animation; do not touch.

## 10. Open design questions

Both Phase 4 questions are closed: the sous-chef ships (item 15), tablet gets a real layout (item 14).

Remaining, small:

- Add-a-place keyboard entry and the share-sheet interaction are drawn as states, not full flows.
  Item 12 can resolve the details in code review.
- The sous-chef surface has one design, not a variation set. If the chip-to-wheel interaction feels
  wrong in the build, raise it as a design question rather than solving it in the PR.
