# Navigation Redesign Spec — Mobile + Desktop (2026 Liquid Glass)

Status: **Phases 0–4 implemented** (Playwright QA deferred — no display in sandbox) · Branch: `claude/mobile-side-menu-design-4nz5go` · Date: 2026-06-16 (a11y pass 2026-06-17)

---

## 1. Problem & goals

**Reported:** On production mobile, the side menu layout is broken and you can't
tap the wheel.

**Root cause (confirmed in code):** `WheelApp.tsx:343-348` renders the
`WheelSelector` rail as a permanent flex sibling — `w-14` (56px) and **always
visible on mobile** (no drawer/sheet). Two concrete failures:

1. **Tap-hijack.** Per-wheel action buttons (`WheelSelector.tsx:190-229`) are
   `absolute right-3 top-1/2` with `opacity-100` on mobile. Inside a 56px rail
   those 1–4 icon buttons sit *on top of* the wheel's color dot and each calls
   `e.stopPropagation()`. Tapping a row hits export/settings/**delete** instead
   of selecting the wheel → the "broken menu."
2. **Squeezed canvas.** The 56px rail permanently steals horizontal space beside
   the `SpinWheel` canvas, pushing/clipping it on narrow screens and shrinking
   the spin hit-area — the "can't click the wheel."

**Goals:** (a) fix mobile so menu + wheel are usable one-handed; (b) modernize
both mobile and desktop nav to a 2026 Liquid Glass language that fits our
existing dark/gradient/orb aesthetic; (c) large, unambiguous tap targets, one
clear action per tap, clear separation of the two navigation axes.

**Non-goals:** changing spin/exclusion logic, the wheel canvas/shader, auth,
routing, or any `shared/*` business logic. Pure presentation + layout.

---

## 2. The core IA problem

The app has **two** navigation axes that currently compete on the left edge:

- **Axis A — which wheel** (Office Lunch / Date Night / …): today the left rail.
- **Axis B — which view** of a wheel (Wheel / Restaurants / History): top tabs.

A left rail is the wrong home for either axis on a phone. The redesign assigns
each axis a dedicated, breakpoint-appropriate home.

| Axis | Mobile (<768px) | Desktop (≥768px) |
|---|---|---|
| A — wheel switch | Top glass **picker pill** → bottom **sheet** | Persistent left glass **rail** |
| B — view switch | Bottom glass **tab bar** | Top glass **segmented tabs** |
| Spin (action) | Hero button on canvas (unchanged) | Hero button on canvas (unchanged) |

Per-wheel actions (share / export / settings / delete) move into a **`⋯` kebab
`DropdownMenu`** in both layouts — this kills the overlap bug at the source and
declutters the rail.

---

## 3. Design language — "Liquid Glass" mapped to our tokens

Grounded in 2026 guidance: glass is the *navigation layer* that floats above
content (inset capsules, content scrolls under); bottom nav for thumb reach;
glass should be *behavioral* (reacts on interaction); honor accessibility
fallbacks. We already have the raw materials in `index.css` (`.glass`,
`backdrop-blur`, oklch palette, Syne display font, glow utilities).

**New shared treatment (add to `index.css`):**

- `.glass-nav` — floating nav surface: `oklch(0.12 0.025 260 / 0.55)` +
  `backdrop-blur(20px)` + 1px inner top highlight (`white / 8%`) + soft outer
  shadow. Reads as a lens, not a flat panel.
- **Inset & float:** nav capsules sit ~16px from screen edges, large radius
  (`rounded-2xl`/`rounded-3xl`), respect `env(safe-area-inset-bottom)`.
- **Behavioral cues:** active item gets the existing orange→purple gradient glow
  + a subtle press scale (`active:scale-95`). Reuse `glow-orange`/`glow-purple`.
- **Legibility scrim:** a faint darkening layer behind labels so text stays
  AA-contrast over the bright orb/gradient background.

---

## 4. Mobile spec (<768px)

```
┌──────────────────────────────┐
│ 🌀 LUNCH WHEEL            👤  │  app header (existing, keep)
│ ┌──────────────────────┐     │  ← NEW top wheel-picker pill (glass)
│ │ 🔴 Office Lunch     ▾ │     │     tap → wheel sheet
│ └──────────────────────┘     │
│                              │
│          ╭───────╮           │
│         (  WHEEL  )          │  content scrolls UNDER the bars
│          ╰───────╯           │
│        ┌───────────┐         │
│        │   SPIN    │         │  ← hero CTA stays on canvas
│        └───────────┘         │
│                              │
│  ╭────────────────────────╮  │  ← NEW bottom glass tab bar
│  │  🎡      🍽️      🕐     │  │     inset ~16px, floating
│  │ Wheel  Places  History │  │     minimize-on-scroll-down
│  ╰────────────────────────╯  │
└──────────────────────────────┘
```

**Wheel-picker pill** (top, below header): shows selected wheel's color dot +
name + ▾. Full-width-ish, min 44px tall. Tapping opens the wheel sheet.

**Wheel sheet** (bottom `Sheet`/`Drawer`, already in `components/ui`):
```
╭──────────────────────────────╮
│  MY WHEELS              + New │
│ ──────────────────────────── │
│ 🔴 Office Lunch        ✓   ⋯ │  ← tap row = select; ⋯ = actions
│ ⚪ Date Night              ⋯ │
│ ⚪ Weekend Brunch          ⋯ │
│ ──────────────────────────── │
│ ↑ Import wheel               │
╰──────────────────────────────╯
```
Row tap selects + closes. `⋯` opens `DropdownMenu`: Share / Export / Settings /
Delete (gated by `isOwner`/`isShared` as today). Rows ≥ 56px tall.

**Bottom tab bar:** 3 destinations, icon + label, each ≥ 44×44px, active = gradient
glow. `tabBarMinimizeBehavior`-style shrink on scroll-down (optional, phase 2).

**Removed on mobile:** the permanent 56px `<aside>` rail — gone entirely.

---

## 5. Desktop spec (≥768px)

Desktop keeps a **persistent left rail** (correct pattern for a multi-wheel
switcher with room to spare) but upgraded to Liquid Glass and de-cluttered.

```
┌────────────┬──────────────────────────────────────┐
│ 🌀 LUNCH WHEEL                                  👤 │  header (keep)
├────────────┼──────────────────────────────────────┤
│ MY WHEELS  │  ╭ Wheel ─ Restaurants ─ History ╮    │ ← top glass segmented tabs
│            │  ╰────────────────────────────────╯    │
│ 🔴 Office ⋯│                                        │
│ ⚪ Date   ⋯│              ╭───────╮                 │
│ ⚪ Brunch ⋯│             (  WHEEL  )                │
│            │              ╰───────╯                 │
│ + New      │            ┌───────────┐               │
│ ↑ Import   │            │   SPIN    │               │
│            │            └───────────┘               │
└────────────┴──────────────────────────────────────┘
```

**Left rail changes:**
- `.glass-nav` surface, inset from edges, rounded; floats over the orb bg.
- Per-wheel actions → single **`⋯` kebab** revealed on hover/focus (replaces the
  4-icon cluster). Same `DropdownMenu` component as mobile → one code path.
- Selected row keeps the conic-gradient dot + orange tint border.
- Keyboard focusable; `⋯` reachable via keyboard (not hover-only).

**Top tabs:** restyle the current underline tabs as a **floating glass segmented
control** (pill container, active segment = filled gradient glow). Keeps Syne
caps styling. Behaviorally identical — still drives `activeTab` state.

**SPIN + result modal:** unchanged.

---

## 6. Shared components & file plan

Refactor `WheelSelector` into small pieces shared by both breakpoints so wheel
logic lives in exactly one place:

- `WheelRow` — one wheel (dot + name + selected check + `⋯` `DropdownMenu`).
  Used by both rail and sheet.
- `WheelActionsMenu` — the kebab dropdown (Share/Export/Settings/Delete), wraps
  existing mutations (`regenInvite`, `handleExport`, `setEditWheel`,
  `deleteWheel`). No business-logic change.
- `WheelRail` (desktop `<aside>`) — renders `WheelRow` list + New/Import.
- `WheelSwitcher` (mobile) — the picker pill + bottom `Sheet` of `WheelRow`s.
- `ViewTabs` — the 3-view switcher; renders top segmented tabs (desktop) or
  bottom tab bar (mobile) off `useIsMobile()`. Drives existing `activeTab`.

**Files touched:**
- `client/src/index.css` — add `.glass-nav`, scrim, segmented-tab styles, tab-bar
  minimize transition.
- `client/src/components/WheelSelector.tsx` — split as above (keep all dialogs +
  mutations intact).
- `client/src/pages/WheelApp.tsx` — branch shell on `useIsMobile()`: desktop =
  rail + top tabs; mobile = picker pill + bottom tab bar; remove the always-on
  rail on mobile. Tab `<button>`s (`:353-392`) extracted to `ViewTabs`.
- (new) `client/src/components/WheelRow.tsx`, `WheelActionsMenu.tsx`,
  `ViewTabs.tsx` — or co-locate; final split decided in build.

**Existing primitives reused:** `Sheet`/`Drawer`, `DropdownMenu`, `Dialog`,
`useIsMobile()` (768px), Sonner toasts. No new dependencies.

---

## 7. Accessibility

- Honor `prefers-reduced-transparency` → near-opaque nav fallback; keep existing
  `prefers-reduced-motion` gating for any new motion.
- All tap targets ≥ 44×44px; sheet rows ≥ 56px. Labels always shown under tab
  icons (no icon-only mystery-meat).
- Legibility scrim keeps nav text ≥ AA contrast over the orb.
- Kebab actions keyboard-reachable; focus-visible rings on nav controls.
- Destructive "Delete" stays behind confirm (today it's `confirm()`; keep).

---

## 8. Risks / watch-outs

- **Two layout systems:** `DashboardLayout`/`SidebarProvider` appears unused by
  `WheelApp`. Confirm before deleting anything; this redesign only touches the
  `WheelApp` → `WheelSelector` path.
- **PWA share banner** (`WheelApp.tsx:394+`) and result modal must still layer
  correctly above the new bottom bar (z-index audit).
- **iOS safe-area:** bottom tab bar must clear the home indicator
  (`env(safe-area-inset-bottom)`).
- **Vercel bundle:** pure client/CSS change — no `server/`/`shared/` edits, so no
  `api/index.js` rebuild needed (per mistake-log #8).

---

## 9. Phased plan (each phase = reviewable, `pnpm check && test && build` green)

- **Phase 0 — tokens:** add `.glass-nav` + scrim + segmented/tab-bar styles to
  `index.css`. No behavior change.
- **Phase 1 — fix the bug (mobile):** extract `WheelRow` + `WheelActionsMenu`
  (kebab); build mobile `WheelSwitcher` (pill + sheet); remove always-on rail on
  mobile. ⇒ Tap-hijack + squeezed canvas resolved.
- **Phase 2 — mobile bottom tab bar:** `ViewTabs` bottom variant + scroll-minimize.
- **Phase 3 — desktop polish:** glass rail + kebab + segmented top tabs.
- **Phase 4 — a11y + QA:** ✅ (2026-06-17) reduced-transparency + reduced-motion
  fallbacks (incl. the result pop); branded `:focus-visible` rings on the raw nav
  buttons; sheet rows ≥56px; result overlay given `role="dialog"`/`aria-modal`,
  Escape-to-close, and initial focus (WheelApp + GuestWheel). z-index/safe-area
  verified (mobile nav is in-flow; the `z-50` result modal layers above it).
  ⏳ **Playwright pass deferred** — needs a local display; the web sandbox has none.

## 10. Success criteria

- Mobile: selecting a wheel never triggers a wheel action; SPIN reliably tappable;
  wheel canvas uses full width.
- Both: per-wheel actions only via the kebab; nav reads as floating glass over
  the orb; no contrast/motion regressions.
- `pnpm check`, `pnpm test`, `pnpm build` all pass; no `shared/*` or auth changes.
