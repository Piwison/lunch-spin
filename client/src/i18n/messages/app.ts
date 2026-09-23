/**
 * `app.*` — the signed-in app shell: header, profile menu (incl. the in-app language switch), dock/tab names, toasts that are not tied to one tab.
 *
 * Empty on purpose: registered in ../dict.ts up front so whoever translates this
 * area only ever edits THIS file, never the shared combiner. See ./README.md.
 */

export const zh = {} as const satisfies Record<`app.${string}`, string>;

export const en: Record<keyof typeof zh, string> = {};
