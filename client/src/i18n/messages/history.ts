/**
 * `history.*` — the History tab: spin history, stats, taste profile.
 *
 * Empty on purpose: registered in ../dict.ts up front so whoever translates this
 * area only ever edits THIS file, never the shared combiner. See ./README.md.
 */

export const zh = {} as const satisfies Record<`history.${string}`, string>;

export const en: Record<keyof typeof zh, string> = {};
