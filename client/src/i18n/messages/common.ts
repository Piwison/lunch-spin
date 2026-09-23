/**
 * Chrome shared by every surface: the language switch, plus the few labels more
 * than one area renders (walk time, time left, star ratings, a sheet's close
 * button). Keep this file small — a string belongs here only when more than one
 * area renders it.
 *
 * See ./README.md for how the namespaces fit together.
 */

export const zh = {
  // ── Chrome ──────────────────────────────────────────────────────────────
  "lang.switch": "English",
  "lang.label": "切換語言",
  "common.close": "關閉",
  "common.office": "公司",

  // ── Walk time (client/src/lib/timeLabels.ts) ────────────────────────────
  "common.walk": "步行 {n} 分鐘",
  "common.walkApprox": "步行約 {n} 分鐘",

  // ── Time left on a "picked recently" skip ───────────────────────────────
  "common.left.dh": "{d} 天 {h} 小時",
  "common.left.h": "{h} 小時",
  "common.left.m": "{m} 分鐘",
  "common.left.none": "0 分鐘",

  // ── Team star rating (StarRating) ───────────────────────────────────────
  "common.rating.label": "你的評分",
  "common.rating.star.one": "{n} 顆星",
  "common.rating.star.other": "{n} 顆星",
  "common.rating.none": "未評分",
} as const satisfies Record<`lang.${string}` | `common.${string}`, string>;

export const en: Record<keyof typeof zh, string> = {
  "lang.switch": "中文",
  "lang.label": "Switch language",
  "common.close": "Close",
  "common.office": "Office",
  "common.walk": "{n} min walk",
  "common.walkApprox": "~{n} min walk",
  "common.left.dh": "{d}d {h}h",
  "common.left.h": "{h}h",
  "common.left.m": "{m}m",
  "common.left.none": "0m",
  "common.rating.label": "Your rating",
  "common.rating.star.one": "{n} star",
  "common.rating.star.other": "{n} stars",
  "common.rating.none": "New",
};
