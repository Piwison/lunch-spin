import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatWalk, DEFAULT_RADIUS_M } from "@shared/nearby";
import { Navigation, Footprints, Loader2, Check, Plus, AlertTriangle, MapPin, Search } from "lucide-react";
import { toast } from "sonner";
import { providerAlert } from "@/lib/placesError";
import { GeoError, cachedCoords, requestCoords, type Coords } from "@/lib/geo";

interface NearbyDialogProps {
  wheelId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a place is added so the parent can refresh its list. */
  onAdded: () => void;
}

// A place row as returned by places.searchNearby.
type NearbyResult = {
  placeId: string;
  name: string;
  walkMinutes: number;
  /** "route" = real Distance Matrix walking time; "estimate" = haversine. */
  walkSource: "route" | "estimate";
  distanceMeters: number | null;
  cuisine: string | null;
  priceLevel: number | null;
  open: boolean | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  alreadyAdded: boolean;
};

// A deep-link the post-spin "DIRECTIONS" button can open for a provider place.
function placeMapUrl(placeId: string, name: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${placeId}`;
}

export default function NearbyDialog({ wheelId, open, onOpenChange, onAdded }: NearbyDialogProps) {
  const [coords, setCoords] = useState<Coords | null>(cachedCoords());
  const [geoError, setGeoError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [radius, setRadius] = useState<number>(DEFAULT_RADIUS_M);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const search = trpc.places.searchNearby.useMutation();
  const addNearby = trpc.places.addNearbyBulk.useMutation();

  const runSearch = (at: Coords, r: number) => {
    search.mutate(
      { wheelId, lat: at.lat, lng: at.lng, radius: r, keyword: keyword.trim() || undefined },
      { onError: (e) => toast.error(e.message) },
    );
  };

  const locateAndSearch = async () => {
    setGeoError(null);
    setLocating(true);
    try {
      // Shared across the app for this session (lib/geo) — the add-restaurant
      // name search reuses the same fix instead of prompting again.
      const at = await requestCoords();
      setCoords(at);
      runSearch(at, radius);
    } catch (err) {
      const kind = err instanceof GeoError ? err.kind : "failed";
      setGeoError(
        kind === "unsupported"
          ? "This device can't share its location."
          : kind === "denied"
            ? "Location permission was denied. Enable it to find nearby spots."
            : "Couldn't get your location. Try again.",
      );
    } finally {
      setLocating(false);
    }
  };

  const widen = () => {
    if (!coords) return;
    const next = Math.min(5000, radius * 2);
    setRadius(next);
    runSearch(coords, next);
  };

  const toggle = (placeId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });

  /**
   * Add every ticked place in ONE request. This used to be a mutation per row,
   * so filling a wheel from a nearby search cost a cold round trip for each
   * restaurant — the worst possible shape on this app's serverless + TiDB path.
   */
  const handleAddSelected = () => {
    const places = results
      .filter((p) => selected.has(p.placeId))
      .map((p) => ({
        placeId: p.placeId,
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        address: p.address,
        priceLevel: p.priceLevel,
        cuisine: p.cuisine,
        mapUrl: placeMapUrl(p.placeId, p.name),
      }));
    if (places.length === 0) return;
    addNearby.mutate(
      { wheelId, places },
      {
        onSuccess: (res) => {
          setAdded((prev) => {
            const next = new Set(prev);
            for (const p of places) next.add(p.placeId);
            return next;
          });
          setSelected(new Set());
          onAdded();
          toast.success(
            res.added === 0
              ? "Those are already on the wheel"
              : `Added ${res.added} ${res.added === 1 ? "place" : "places"}` +
                  (res.duplicates > 0 ? ` · ${res.duplicates} already there` : ""),
          );
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const reset = () => {
    setGeoError(null);
    setKeyword("");
    setRadius(DEFAULT_RADIUS_M);
    setAdded(new Set());
    setSelected(new Set());
    search.reset();
    // `coords` deliberately survives — lib/geo caches this session's fix, so
    // re-opening the dialog shouldn't re-prompt for a location we already have.
  };

  const results = (search.data?.places ?? []) as NearbyResult[];
  const alert = providerAlert(search.error);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="glass-sheet max-w-md max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="type-section flex items-center gap-2" style={{ color: "var(--ink-warm)" }}>
            <Navigation size={18} style={{ color: "var(--brand)" }} /> Add nearby
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 pt-2">
          <p className="text-xs text-muted-foreground">
            Find restaurants near you and drop them straight onto the wheel — ordered by walking time.
          </p>

          {/* Keyword + locate */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Craving something? (optional)"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") (coords ? runSearch(coords, radius) : locateAndSearch()); }}
                className="bg-secondary/50 border-border/50 pl-9"
              />
            </div>
            <Button
              onClick={() => (coords ? runSearch(coords, radius) : locateAndSearch())}
              disabled={locating || search.isPending}
              className="flex-shrink-0 transition-colors active:scale-[var(--press-scale)]"
              style={{ background: "var(--brand)", color: "var(--on-accent)", borderRadius: "var(--radius-chip)" }}
            >
              {locating || search.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : coords ? (
                <Search size={16} />
              ) : (
                <Navigation size={16} />
              )}
            </Button>
          </div>

          {/* Geolocation error */}
          {geoError && (
            <div
              className="flex items-center gap-2.5 px-3.5 py-2.5 type-meta"
              style={{
                borderRadius: "var(--radius-chip)",
                background: "oklch(from var(--destructive) l c h / 0.10)",
                border: "1px solid oklch(from var(--destructive) l c h / 0.25)",
                color: "var(--destructive)",
              }}
            >
              <AlertTriangle size={13} className="flex-shrink-0" /> {geoError}
            </div>
          )}

          {/* Provider errors. A spent map quota gets calmer, brand-toned styling
              and no retry nudge — it's a limit, not a crash, and retrying just
              spends another call to be told the same thing. */}
          {alert && (
            <div
              className="flex items-start gap-2.5 px-3.5 py-2.5 type-meta"
              style={{
                borderRadius: "var(--radius-chip)",
                background: `oklch(from var(${alert.quota ? "--brand" : "--destructive"}) l c h / 0.10)`,
                border: `1px solid oklch(from var(${alert.quota ? "--brand" : "--destructive"}) l c h / 0.25)`,
                color: `var(${alert.quota ? "--brand" : "--destructive"})`,
              }}
            >
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
              <span className="leading-relaxed">
                {alert.message}
                {alert.config && <> Use ADD to enter a restaurant by name instead.</>}
              </span>
            </div>
          )}

          {/* Idle prompt */}
          {!coords && !locating && !geoError && !search.isPending && (
            <button
              onClick={locateAndSearch}
              className="flex flex-col items-center justify-center gap-2 py-8 text-center transition-colors hover:bg-white/3"
              style={{ borderRadius: "var(--radius-card)", background: "var(--paper)", border: "1px dashed var(--border)" }}
            >
              <div
                className="w-12 h-12 flex items-center justify-center"
                style={{ borderRadius: "var(--radius-chip)", background: "oklch(from var(--brand) l c h / 0.12)" }}
              >
                <MapPin size={22} style={{ color: "var(--brand)" }} />
              </div>
              <span style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-warm)" }}>Use my location</span>
              <span className="text-xs text-muted-foreground px-6">We only use your location for this search — it's never stored.</span>
            </button>
          )}

          {/* Loading skeletons */}
          {search.isPending && (
            <div className="flex flex-col gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[68px] animate-pulse" style={{ borderRadius: "var(--radius-card)", background: "var(--muted)", animationDelay: `${i * 80}ms` }} />
              ))}
            </div>
          )}

          {/* Grouped-chains + low-density notes */}
          {search.data && (search.data.chainsGrouped > 0 || search.data.lowDensity) && (
            <div className="flex flex-col gap-2">
              {search.data.chainsGrouped > 0 && (
                <p className="text-[11px] text-muted-foreground px-1">
                  {search.data.chainsGrouped} chain duplicate{search.data.chainsGrouped > 1 ? "s" : ""} grouped to the nearest location.
                </p>
              )}
              {search.data.lowDensity && (
                <div
                  className="flex items-center justify-between gap-2 px-3.5 py-2.5 type-meta"
                  style={{ borderRadius: "var(--radius-chip)", background: "oklch(from var(--info) l c h / 0.08)", border: "1px solid oklch(from var(--info) l c h / 0.20)", color: "var(--info)" }}
                >
                  <span className="flex items-center gap-2"><AlertTriangle size={13} /> Not many spots within reach.</span>
                  {radius < 5000 && (
                    <button onClick={widen} className="font-semibold underline underline-offset-2 hover:opacity-80" disabled={search.isPending}>
                      Widen search
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Empty result */}
          {search.data && results.length === 0 && (
            <div
              className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground"
              style={{ borderRadius: "var(--radius-card)", background: "var(--paper)", border: "1px solid var(--border)" }}
            >
              No restaurants found nearby.
              {radius < 5000 && (
                <button onClick={widen} className="text-xs font-semibold text-foreground underline underline-offset-2">Widen the search</button>
              )}
            </div>
          )}

          {/* Results — tick as many as you want, then add them in one go. */}
          {results.length > 0 && (
            <div className="flex flex-col gap-2">
              {results.map((p) => {
                const isAdded = p.alreadyAdded || added.has(p.placeId);
                const on = selected.has(p.placeId);
                return (
                  <button
                    key={p.placeId}
                    onClick={() => !isAdded && toggle(p.placeId)}
                    disabled={isAdded}
                    aria-pressed={on}
                    className="flex items-center gap-3 px-4 text-left transition-colors active:scale-[var(--press-scale)] disabled:active:scale-100"
                    style={{
                      minHeight: 56,
                      paddingTop: 12,
                      paddingBottom: 12,
                      borderRadius: "var(--radius-card)",
                      background: on ? "oklch(from var(--brand) l c h / 0.08)" : "var(--paper)",
                      border: on
                        ? "1px solid oklch(from var(--brand) l c h / 0.45)"
                        : "1px solid var(--border)",
                      opacity: isAdded ? 0.6 : 1,
                    }}
                  >
                    <span
                      aria-hidden
                      className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                      style={
                        isAdded
                          ? { background: "oklch(from var(--ok) l c h / 0.2)", color: "var(--ok)" }
                          : on
                            ? { background: "var(--brand)", color: "var(--on-accent)" }
                            : { border: "1.5px solid var(--border)" }
                      }
                    >
                      {(isAdded || on) && <Check size={13} strokeWidth={3} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-sm truncate">{p.name}</span>
                      <span className="flex items-center gap-2 flex-wrap mt-1 text-[11px] text-muted-foreground">
                        <span
                          className="flex items-center gap-1"
                          title={p.walkSource === "route" ? "Walking route time" : "Straight-line estimate"}
                        >
                          <Footprints size={11} /> {formatWalk(p.walkMinutes, p.walkSource !== "route")}
                        </span>
                        {p.priceLevel != null && <span style={{ color: "var(--brand)" }}>{"$".repeat(p.priceLevel)}</span>}
                        {p.cuisine && <span>{p.cuisine}</span>}
                        {p.open === true && <span style={{ color: "var(--ok)" }}>Open now</span>}
                        {p.open === false && <span className="opacity-70">Closed</span>}
                        {isAdded && <span style={{ color: "var(--ok)" }}>On the wheel</span>}
                      </span>
                      {p.address && (
                        <span className="block text-[11px] text-muted-foreground/70 truncate mt-0.5">{p.address}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* One request for the whole selection. */}
        {results.length > 0 && (
          <div className="sticky bottom-0 -mx-6 -mb-6 px-6 pt-3 pb-5 mt-1" style={{ background: "var(--popover)" }}>
            <Button
              onClick={handleAddSelected}
              disabled={selected.size === 0 || addNearby.isPending}
              className="w-full transition-colors active:scale-[var(--press-scale)]"
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
              {addNearby.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Adding…
                </span>
              ) : selected.size === 0 ? (
                "Select places to add"
              ) : (
                <span className="flex items-center gap-2">
                  <Plus size={14} /> Add {selected.size} {selected.size === 1 ? "place" : "places"}
                </span>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
