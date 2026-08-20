# Design working files — resting wheel

Source for the **Lunch Wheel — Resting Forms** canvas: four alternative resting-wheel
forms explored against the current build, after horizontal per-pane labels were rejected.

Read `docs/wheel-label-legibility.md` first — it holds the problem and the geometric
constraints any of these has to satisfy. AGENTS.md failure mode 16 holds the lesson.

| File | What it is |
|---|---|
| `Main.dc.html` | The current build, for comparison — horizontal labels, staggered from 9 places up |
| `OptionA-Numbered.dc.html` | Numerals on the panes, names in a keyed legend |
| `OptionB-Pointer.dc.html` | Blank panes; only the pane at the pointer is named |
| `OptionC-Radial.dc.html` | Labels hub-to-rim along the bisector |
| `OptionD-ArcList.dc.html` | The list is the subject; the wheel is an arc breaking the right edge |
| `canvas.json` | Artboard layout, the sticky notes carrying each option's motivation and cost |
| `gen.py` | Generates the artboards — they share token and wheel-drawing code, so edit here, not in the `.dc.html` |

Every artboard carries `count` (8 / 12) and `dark` tweaks, so both dimensions flip live
rather than needing separate artboards.

Colours, type and geometry are lifted from the shipped tokens in `client/src/index.css`,
not approximated, so what the canvas shows is what is buildable.

## Re-seeding after an edit

```
python3 gen.py            # if you changed gen.py
node "<design skill dir>/seed-canvas.mjs" \
  --template "<design skill dir>/payload.template.html" \
  --out lunch-wheel-resting-forms.html \
  --title "Lunch Wheel — Resting Forms" \
  --artboard Main.dc.html --artboard OptionA-Numbered.dc.html \
  --artboard OptionB-Pointer.dc.html --artboard OptionC-Radial.dc.html \
  --artboard OptionD-ArcList.dc.html --canvas canvas.json
```

Then republish that file to the same artifact URL to keep the link. The seeded `.html`
is gitignored — it is generated, and large.

If the canvas has been edited in the browser since, extract it back to working files
first (`seed-canvas.mjs --extract`) so those edits are not discarded.
