/**
 * Which language to ask Google Places for, from the device's own locale.
 *
 * Place names follow the PHONE, not the interface language. Someone on a
 * Chinese phone who switched the app to English still walks past "鵝肉担", not
 * "Goose Meat Dan" — and many small shops have no English name at all, so an
 * English request gets a romanisation nobody recognises (2026-09-24 walkthrough
 * P1-H). The server already accepts either.
 */
export type PlaceLanguage = "zh-TW" | "en";

export function placeLanguage(locale: string | null | undefined): PlaceLanguage {
  return /^zh(-|$)/i.test(locale ?? "") ? "zh-TW" : "en";
}
