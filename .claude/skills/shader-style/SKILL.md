---
name: shader-style
description: GLSL / WebGL conventions for Lunch Wheel's cinematic shader backgrounds. Use when editing or adding WebGL shaders or canvas render loops so naming, structure, and cleanup stay consistent and leak-free.
---

# Lunch Wheel — shader & canvas conventions

Inline GLSL lives in `client/src/components/SpinWheel.tsx` (the wheel glow) and
`client/src/pages/Home.tsx` (the landing background). Follow the existing style.

## Naming (match exactly)

- **Uniforms:** `u_`-prefixed snake_case — `u_time`, `u_res`, `u_spin`.
- **Attributes:** `a_`-prefixed — `a_pos` (a single full-screen `TRIANGLE_STRIP`
  quad: `[-1,-1, 1,-1, -1,1, 1,1]`).
- **Helpers:** `hash(vec2)` and `noise(vec2)` (value noise via sine-hash). Reuse
  the existing implementations rather than inventing new ones.
- `precision mediump float;` at the top of fragment shaders.

## Structure (the pattern)

1. Get `canvas.getContext("webgl")`; bail (`return`) if null.
2. `compile(type, src)` → `createShader/shaderSource/compileShader`.
3. `createProgram` → attach vert+frag → `linkProgram` → `useProgram`.
4. Bind the quad buffer, `getAttribLocation("a_pos")`, enable + point.
5. `getUniformLocation` for each uniform; set per-frame in the render loop.
6. `requestAnimationFrame` loop driving `u_time = (performance.now()-start)/1000`.

## Cleanup — REQUIRED (or you leak)

Every shader/canvas effect MUST clean up in its `useEffect` return:

- `cancelAnimationFrame(rafRef.current)` for every RAF loop.
- `resizeObserver.disconnect()` when a `ResizeObserver` is used to size the canvas.

Use refs (`bgRafRef`, `rafRef`) to hold RAF handles. Size canvases from
`canvas.parentElement?.clientWidth` clamped to a max (≤500 for the wheel).

## Motion & accessibility

CSS-driven motion lives in `client/src/index.css` (`reveal`, `orb-spin`,
`cta-pulse`, `shine`, etc.) and is gated behind a `prefers-reduced-motion`
media query — keep new animations inside that guard. Brand palette: dark base
(`oklch(0.09 0.02 260)`), orange→purple accents, Syne display / DM Sans body.
