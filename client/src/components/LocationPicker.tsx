/**
 * "Where are you eating from?" — the one way the app asks for a location.
 *
 * Browser geolocation is refused, unavailable or silently broken often enough
 * that it cannot be the only answer: a user whose browser won't share a
 * position was previously locked out of nearby search entirely, with no way
 * back in. So this offers three routes to the same result, and the two manual
 * ones are always visible rather than hidden behind a failure:
 *
 *   - use my current location   (navigator.geolocation, cached per session)
 *   - search for a place        (places.searchPlaces — an office, a station)
 *   - paste a Google Maps link  (places.resolveLink)
 *
 * Shared by first-run, ADD NEARBY and the add-form's name search, so all three
 * behave identically and a fix lands in one place. Callers get
 * `{ lat, lng, label }`; `label` is the picked place's name when there is one
 * ("台北101") and null for a raw geolocation fix, which is what lets first-run
 * name the wheel's office after the place the user actually chose.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { providerAlert } from "@/lib/placesError";
import { GeoError, requestCoords } from "@/lib/geo";
import { AlertTriangle, Loader2, MapPin, Navigation, Search } from "lucide-react";

export interface PickedLocation {
  lat: number;
  lng: number;
  /** The chosen place's name, or null when this came from raw geolocation. */
  label: string | null;
}

/** Loose check: does this look like a Google Maps link worth resolving? */
const looksLikeMapLink = (s: string) =>
  /(google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/)/i.test(s.trim());

export default function LocationPicker({
  onPicked,
  compact = false,
  primaryLabel = "Use my location",
}: {
  onPicked: (location: PickedLocation) => void;
  /** Denser styling for use inside a dialog. */
  compact?: boolean;
  primaryLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [link, setLink] = useState("");
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);

  const searchPlaces = trpc.places.searchPlaces.useMutation();
  const resolveLink = trpc.places.resolveLink.useMutation({
    onSuccess: ({ place }) => {
      // A link that resolves without coordinates is useless here — say so
      // rather than handing the caller a location it can't search from.
      if (place?.lat == null || place?.lng == null) {
        setGeoError(`Found "${place?.name ?? "that place"}" but not its exact location. Try searching for it by name.`);
        return;
      }
      onPicked({ lat: place.lat, lng: place.lng, label: place.name ?? null });
      setLink("");
    },
  });

  const useMyLocation = async () => {
    setGeoError(null);
    setLocating(true);
    try {
      const at = await requestCoords();
      onPicked({ lat: at.lat, lng: at.lng, label: null });
    } catch (err) {
      const kind = err instanceof GeoError ? err.kind : "failed";
      setGeoError(
        kind === "unsupported"
          ? "This device can't share its location — search for a place instead."
          : kind === "denied"
            ? "Location permission was denied — search for a place instead."
            : "Couldn't get your location — search for a place instead.",
      );
      // Failure is exactly when the alternatives need to be in front of them.
      setShowManual(true);
    } finally {
      setLocating(false);
    }
  };

  const runSearch = () => {
    const q = query.trim();
    if (!q) return;
    setGeoError(null);
    searchPlaces.mutate({ query: q });
  };

  const results = searchPlaces.data?.places ?? [];
  const alert = providerAlert(searchPlaces.error ?? resolveLink.error);
  const busy = locating || searchPlaces.isPending || resolveLink.isPending;

  return (
    <div className="flex flex-col gap-2.5 w-full">
      <Button
        type="button"
        onClick={useMyLocation}
        disabled={busy}
        className="w-full gap-2 transition-colors active:scale-[var(--press-scale)]"
        style={{
          minHeight: 56,
          borderRadius: "var(--radius-control)",
          background: "var(--brand)",
          color: "var(--on-accent)",
          fontSize: 16,
          fontWeight: 500,
          letterSpacing: "0.05em",
        }}
      >
        {locating ? <Loader2 size={15} className="animate-spin" /> : <MapPin size={15} />}
        {locating ? "Finding you…" : primaryLabel}
      </Button>

      {!compact && (
        <p className="text-[11px] text-muted-foreground text-center px-4">
          Only used for this search — it's never stored.
        </p>
      )}

      {geoError && (
        <div
          className="flex items-start gap-2 px-3.5 py-2.5 type-meta"
          style={{
            borderRadius: "var(--radius-chip)",
            background: "oklch(from var(--destructive) l c h / 0.10)",
            border: "1px solid oklch(from var(--destructive) l c h / 0.25)",
            color: "var(--destructive)",
          }}
        >
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <span className="leading-relaxed">{geoError}</span>
        </div>
      )}

      {alert && (
        <div
          className="flex items-start gap-2 px-3.5 py-2.5 type-meta"
          style={{
            borderRadius: "var(--radius-chip)",
            background: `oklch(from var(${alert.quota ? "--brand" : "--destructive"}) l c h / 0.10)`,
            border: `1px solid oklch(from var(${alert.quota ? "--brand" : "--destructive"}) l c h / 0.25)`,
            color: `var(${alert.quota ? "--brand" : "--destructive"})`,
          }}
        >
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <span className="leading-relaxed">{alert.message}</span>
        </div>
      )}

      {!showManual ? (
        <button
          type="button"
          onClick={() => setShowManual(true)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          style={{ minHeight: 44, fontSize: 14, fontWeight: 500 }}
        >
          Or set it another way
        </button>
      ) : (
        <div className="flex flex-col gap-2.5">
          {/* Search by name — an office, a station, a landmark. */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted-foreground px-1">
              Search for your office or a nearby landmark
            </span>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  id="locpick-query"
                  aria-label="Search for your office or a nearby landmark"
                  placeholder="e.g. 台北101"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      runSearch();
                    }
                  }}
                  className="bg-secondary/50 border-border/50 pl-9"
                />
              </div>
              <Button
                type="button"
                onClick={runSearch}
                disabled={!query.trim() || busy}
                className="flex-shrink-0"
                style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)", borderRadius: "var(--radius-chip)" }}
              >
                {searchPlaces.isPending ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
              </Button>
            </div>
          </div>

          {searchPlaces.data && results.length === 0 && (
            <p className="text-[11px] text-muted-foreground px-1">
              No places matched that. Try a fuller name, or paste a Maps link below.
            </p>
          )}

          {results.length > 0 && (
            <div
              className="flex flex-col gap-1 max-h-52 overflow-y-auto p-1"
              style={{ borderRadius: "var(--radius-control)", background: "var(--paper)", border: "1px solid var(--border)" }}
            >
              {results.map((p) => (
                <button
                  key={p.placeId}
                  type="button"
                  onClick={() => onPicked({ lat: p.lat, lng: p.lng, label: p.name })}
                  className="flex items-center gap-2.5 px-3 rounded-xl text-left transition-colors hover:bg-white/5"
                  style={{ minHeight: 56 }}
                >
                  <MapPin size={13} className="flex-shrink-0" style={{ color: "var(--brand)" }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-semibold truncate">{p.name}</span>
                    {p.address && (
                      <span className="block text-[10px] text-muted-foreground truncate">{p.address}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Paste a Maps link. */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted-foreground px-1">Or paste a Google Maps link</span>
            <div className="flex gap-2">
              <Input
                id="locpick-link"
                aria-label="Google Maps link"
                type="url"
                inputMode="url"
                placeholder="https://maps.app.goo.gl/…"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                className="bg-secondary/50 border-border/50 flex-1"
              />
              <Button
                type="button"
                onClick={() => { setGeoError(null); resolveLink.mutate({ url: link.trim() }); }}
                disabled={!looksLikeMapLink(link) || busy}
                className="flex-shrink-0"
                style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)", borderRadius: "var(--radius-chip)" }}
              >
                {resolveLink.isPending
                  ? <Loader2 size={15} className="animate-spin" />
                  : <Navigation size={15} />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
