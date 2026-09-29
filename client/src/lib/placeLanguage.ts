import { placeLanguage, type PlaceLanguage } from "@shared/placeLanguage";

/** The language every Places request sends: the device's, not the UI's. */
export function devicePlaceLanguage(): PlaceLanguage {
  return placeLanguage(typeof navigator === "undefined" ? undefined : navigator.language);
}
