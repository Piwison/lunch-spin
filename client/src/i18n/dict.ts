/**
 * Every UI string the site ships, in Traditional Chinese (first) and English.
 *
 * This file only COMBINES namespaces; the strings live in ./messages/*.ts, one
 * file per area of the product, so two people (or agents) translating different
 * areas never edit the same file. Each namespace may only use its own key
 * prefixes — enforced by `satisfies Record<`prefix.${string}`, string>` in the
 * file itself — so two namespaces can never define the same key and silently
 * overwrite each other in the spread below.
 *
 * `en` is typed as Record<MessageKey, string> against the zh-TW keys, so adding a
 * string without translating it fails `pnpm check` rather than shipping a blank.
 *
 * What is translated so far: the landing page, first run and the location
 * picker. The rest of the signed-in app is still hardcoded English (BACKLOG.md
 * 3a); its namespaces are registered below, empty, waiting to be filled. The
 * workflow for that is docs/i18n/codex-flow.md.
 */

import * as app from "./messages/app";
import * as common from "./messages/common";
import * as err from "./messages/err";
import * as history from "./messages/history";
import * as landing from "./messages/landing";
import * as onboarding from "./messages/onboarding";
import * as places from "./messages/places";
import * as settings from "./messages/settings";
import * as wheel from "./messages/wheel";

export const zhTW = {
  ...common.zh,
  ...landing.zh,
  ...onboarding.zh,
  ...app.zh,
  ...wheel.zh,
  ...places.zh,
  ...history.zh,
  ...settings.zh,
  ...err.zh,
} as const;

export type MessageKey = keyof typeof zhTW;

export const en: Record<MessageKey, string> = {
  ...common.en,
  ...landing.en,
  ...onboarding.en,
  ...app.en,
  ...wheel.en,
  ...places.en,
  ...history.en,
  ...settings.en,
  ...err.en,
};

export { DEMO_PLACES } from "./messages/landing";
