import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatWalk, DEFAULT_RADIUS_M } from "@shared/nearby";
import { Navigation, Footprints, Loader2, Check, Plus, AlertTriangle, MapPin, Search } from "lucide-react";
import { toast } from "sonner";

interface NearbyDialogProps {
  wheelId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a place is added so the parent can refresh its list. */
  onAdded: () => void;
}

type Coords = { lat: number; lng: number };

// A place row as returned by places.searchNearby.
type NearbyResult = {
  placeId: string;
  name: string;
  walkMinutes: number;
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
  const [coords, setCoords] = useState<Coords | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [radius, setRadius] = useState<number>(DEFAULT_RADIUS_M);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const search = trpc.places.searchNearby.useMutation();
  const addNearby = trpc.places.addNearby.useMutation();

  const runSearch = (at: Coords, r: number) => {
    search.mutate(
      { wheelId, lat: at.lat, lng: at.lng, radius: r, keyword: keyword.trim() || undefined },
      { onError: (e) => toast.error(e.message) },
    );
  };

  const locateAndSearch = () => {
    setGeoError(null);
    if (!("geolocation" in navigator)) {
      setGeoError("This device can't share its location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const at = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(at);
        runSearch(at, radius);
      },
      (err) => {
        setLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. Enable it to find nearby spots."
            : "Couldn't get your location. Try again.",
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const widen = () => {
    if (!coords) return;
    const next = Math.min(5000, radius * 2);
    setRadius(next);
    runSearch(coords, next);
  };

  const handleAdd = (p: NearbyResult) => {
    addNearby.mutate(
      {
        wheelId,
        place: {
          placeId: p.placeId,
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          address: p.address,
          priceLevel: p.priceLevel,
          cuisine: p.cuisine,
          mapUrl: placeMapUrl(p.placeId, p.name),
        },
      },
      {
        onSuccess: (res) => {
          setAdded((prev) => new Set(prev).add(p.placeId));
          onAdded();
          toast.success(res.duplicate ? `${p.name} is already on the wheel` : `Added ${p.name}`);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const reset = () => {
    setCoords(null);
    setGeoError(null);
    setKeyword("");
    setRadius(DEFAULT_RADIUS_M);
    setAdded(new Set());
    search.reset();
  };

  const results = (search.data?.places ?? []) as NearbyResult[];
  const notConfigured = search.error?.data?.code === "PRECONDITION_FAILED";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="glass border-border/50 max-w-md max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ fontFamily: "var(--font-display)" }}>
            <Navigation size={16} style={{ color: "var(--brand)" }} /> ADD NEARBY
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
              className="flex-shrink-0 transition-all active:scale-95"
              style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-2))", color: "white" }}
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
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs"
              style={{
                background: "oklch(from var(--destructive) l c h / 0.10)",
                border: "1px solid oklch(from var(--destructive) l c h / 0.25)",
                color: "var(--destructive)",
              }}
            >
              <AlertTriangle size={13} className="flex-shrink-0" /> {geoError}
            </div>
          )}

          {/* Provider/config errors */}
          {search.error && (
            <div
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs"
              style={{
                background: "oklch(from var(--destructive) l c h / 0.10)",
                border: "1px solid oklch(from var(--destructive) l c h / 0.25)",
                color: "var(--destructive)",
              }}
            >
              <AlertTriangle size={13} className="flex-shrink-0" />
              {notConfigured ? "Nearby search isn't available on this server yet." : search.error.message}
            </div>
          )}

          {/* Idle prompt */}
          {!coords && !locating && !geoError && !search.isPending && (
            <button
              onClick={locateAndSearch}
              className="flex flex-col items-center justify-center gap-2 py-8 rounded-2xl text-center transition-all hover:bg-white/3"
              style={{ background: "var(--card)", border: "1px dashed var(--border)" }}
            >
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: "oklch(from var(--brand) l c h / 0.12)" }}
              >
                <MapPin size={22} style={{ color: "var(--brand)" }} />
              </div>
              <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>USE MY LOCATION</span>
              <span className="text-xs text-muted-foreground px-6">We only use your location for this search — it's never stored.</span>
            </button>
          )}

          {/* Loading skeletons */}
          {search.isPending && (
            <div className="flex flex-col gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[68px] rounded-2xl animate-pulse" style={{ background: "var(--card)", animationDelay: `${i * 80}ms` }} />
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
                  className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs"
                  style={{ background: "oklch(from var(--info) l c h / 0.08)", border: "1px solid oklch(from var(--info) l c h / 0.20)", color: "var(--info)" }}
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
              className="flex flex-col items-center gap-2 py-8 rounded-2xl text-center text-sm text-muted-foreground"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              No restaurants found nearby.
              {radius < 5000 && (
                <button onClick={widen} className="text-xs font-semibold text-foreground underline underline-offset-2">Widen the search</button>
              )}
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="flex flex-col gap-2">
              {results.map((p) => {
                const isAdded = p.alreadyAdded || added.has(p.placeId);
                return (
                  <div
                    key={p.placeId}
                    className="flex items-start gap-3 px-3.5 py-3 rounded-2xl"
                    style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{p.name}</p>
                      <div className="flex items-center gap-2 flex-wrap mt-1 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Footprints size={11} /> {formatWalk(p.walkMinutes)}</span>
                        {p.priceLevel != null && <span style={{ color: "var(--brand)" }}>{"$".repeat(p.priceLevel)}</span>}
                        {p.cuisine && <span>{p.cuisine}</span>}
                        {p.open === true && <span style={{ color: "var(--success, #4ade80)" }}>Open now</span>}
                        {p.open === false && <span className="opacity-70">Closed</span>}
                      </div>
                      {p.address && <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">{p.address}</p>}
                    </div>
                    <button
                      onClick={() => handleAdd(p)}
                      disabled={isAdded || addNearby.isPending}
                      className="flex items-center justify-center gap-1 h-9 px-3 rounded-full text-xs font-semibold flex-shrink-0 transition-all active:scale-95 disabled:opacity-100"
                      style={
                        isAdded
                          ? { background: "oklch(from var(--success, #4ade80) l c h / 0.15)", color: "var(--success, #4ade80)", border: "1px solid oklch(from var(--success, #4ade80) l c h / 0.3)" }
                          : { background: "linear-gradient(135deg, var(--brand), var(--brand-2))", color: "white" }
                      }
                    >
                      {isAdded ? <><Check size={13} /> Added</> : <><Plus size={13} /> Add</>}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
