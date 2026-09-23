/**
 * Chrome shared by every surface: the language switch. Keep this file small —
 * a string belongs here only when more than one area renders it.
 *
 * See ./README.md for how the namespaces fit together.
 */

export const zh = {
  // ── Chrome ──────────────────────────────────────────────────────────────
  "lang.switch": "English",
  "lang.label": "切換語言",
} as const satisfies Record<`lang.${string}`, string>;

export const en: Record<keyof typeof zh, string> = {
  "lang.switch": "中文",
  "lang.label": "Switch language",
};
