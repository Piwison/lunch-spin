/**
 * `settings.*` — WheelSelector: wheel switcher, create/settings/delete/leave dialogs, invite and sharing, account deletion.
 *
 * Empty on purpose: registered in ../dict.ts up front so whoever translates this
 * area only ever edits THIS file, never the shared combiner. See ./README.md.
 */

export const zh = {} as const satisfies Record<`settings.${string}`, string>;

export const en: Record<keyof typeof zh, string> = {};
