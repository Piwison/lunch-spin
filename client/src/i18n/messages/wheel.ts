/**
 * `wheel.*` — the Wheel tab: SpinWheel hub, spin button, result surface (WinnerSurface), filters (FilterBar), round panel (votes, vetoes, dietary).
 *
 * Empty on purpose: registered in ../dict.ts up front so whoever translates this
 * area only ever edits THIS file, never the shared combiner. See ./README.md.
 */

export const zh = {} as const satisfies Record<`wheel.${string}`, string>;

export const en: Record<keyof typeof zh, string> = {};
