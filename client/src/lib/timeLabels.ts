import { exclusionTimeLeft } from "@shared/exclusion";
import { walkDisplayMinutes } from "@shared/nearby";
import type { Translate } from "@/i18n";

/**
 * The shared formatters (`formatWalk`, `formatExclusionTimeLeft`) print English;
 * these put the same numbers — computed by the same shared functions — into the
 * active language's sentence.
 */

/** "步行 6 分鐘" / "6 min walk"; "約" / "~" when the time is an estimate. */
export function walkLabel(t: Translate, minutes: number, approx = false): string {
  return t(approx ? "common.walkApprox" : "common.walk", { n: walkDisplayMinutes(minutes) });
}

/** "2 天 3 小時" / "2d 3h", "5 小時" / "5h", "12 分鐘" / "12m" — or null once
 *  the skip has run out, so the caller can say that in its own words. */
export function timeLeftLabel(t: Translate, excludedUntil: Date, now: Date = new Date()): string | null {
  const left = exclusionTimeLeft(excludedUntil, now);
  if (!left) return null;
  if (left.unit === "dh") return t("common.left.dh", { d: left.days, h: left.hours });
  if (left.unit === "h") return t("common.left.h", { h: left.hours });
  return t("common.left.m", { m: left.minutes });
}
