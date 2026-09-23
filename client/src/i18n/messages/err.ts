/**
 * `err.*` — user-facing error text, keyed by tRPC error CODE (not by the server's English message) — see ./README.md.
 *
 * Empty on purpose: registered in ../dict.ts up front so whoever translates this
 * area only ever edits THIS file, never the shared combiner. See ./README.md.
 */

export const zh = {} as const satisfies Record<`err.${string}`, string>;

export const en: Record<keyof typeof zh, string> = {};
