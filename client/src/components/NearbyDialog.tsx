import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DEFAULT_RADIUS_M } from "@shared/nearby";
import { Navigation, Footprints, Loader2, Check, Plus, AlertTriangle, MapPin, Search } from "lucide-react";
import { toast } from "sonner";
import { providerAlert } from "@/lib/placesError";
import { GeoError, cachedCoords, requestCoords, type Coords } from "@/lib/geo";
import { useLang } from "@/i18n";
import { tagLabel } from "@/lib/tagLabel";
import { walkLabel } from "@/lib/timeLabels";
import { userError } from "@/lib/userError";

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
  const { t, lang } = useLang();
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
      { wheelId, lat: at.lat, lng: at.lng, radius: r, keyword: keyword.trim() || undefined, language: lang },
      { onError: (e) => toast.error(userError(e, t)) },
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
          ? t("places.nearby.geoUnsupported")
          : kind === "denied"
            ? t("places.nearby.geoDenied")
            : t("places.nearby.geoFailed"),
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
              ? t("places.nearby.duplicates")
              : res.duplicates > 0
                ? t("places.nearby.addedWithDuplicates", { added: res.added, duplicates: res.duplicates })
                : t(res.added === 1 ? "places.nearby.added.one" : "places.nearby.added.other", { n: res.added }),
          );
        },
        onError: (e) => toast.error(userError(e, t)),
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
            <Navigation size={18} style={{ color: "var(--brand-text)" }} /> {t("places.nearby.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 pt-2">
          <p className="type-meta text-muted-foreground">
            {t("places.nearby.desc")}
          </p>

          {/* Keyword + locate */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={t("places.nearby.keyword")}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") (coords ? runSearch(coords, radius) : locateAndSearch()); }}
                className="bg-secondary/50 pl-9"
              />
            </div>
            <Button
              onClick={() => (coords ? runSearch(coords, radius) : locateAndSearch())}
              disabled={locating || search.isPending}
              size="icon"
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
                {t(alert.messageKey)}
                {alert.config && <> {t("places.nearby.manualFallback")}</>}
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
                <MapPin size={22} style={{ color: "var(--brand-text)" }} />
              </div>
              <span style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-warm)" }}>{t("places.nearby.useLocation")}</span>
              <span className="type-meta text-muted-foreground px-6">{t("places.nearby.privacy")}</span>
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
                <p className="type-meta text-muted-foreground px-1">
                  {t(search.data.chainsGrouped === 1 ? "places.nearby.chains.one" : "places.nearby.chains.other", { n: search.data.chainsGrouped })}
                </p>
              )}
              {search.data.lowDensity && (
                <div
                  className="flex items-center justify-between gap-2 px-3.5 py-2.5 type-meta"
                  style={{ borderRadius: "var(--radius-chip)", background: "oklch(from var(--info) l c h / 0.08)", border: "1px solid oklch(from var(--info) l c h / 0.20)", color: "var(--info)" }}
                >
                  <span className="flex items-center gap-2"><AlertTriangle size={13} /> {t("places.nearby.lowDensity")}</span>
                  {radius < 5000 && (
                    <button onClick={widen} className="font-semibold underline underline-offset-2 hover:opacity-80" disabled={search.isPending}>
                      {t("places.nearby.widen")}
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
              {t("places.nearby.empty")}
              {radius < 5000 && (
                <button onClick={widen} className="type-meta font-semibold text-foreground underline underline-offset-2">{t("places.nearby.widen")}</button>
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
                            ? { background: "var(--brand-grad)", color: "var(--on-accent)" }
                            : { border: "1.5px solid var(--input)" }
                      }
                    >
                      {(isAdded || on) && <Check size={13} strokeWidth={3} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-sm truncate">{p.name}</span>
                      <span className="flex items-center gap-2 flex-wrap mt-1 type-meta text-muted-foreground">
                        <span
                          className="flex items-center gap-1"
                          title={p.walkSource === "route" ? t("places.nearby.route") : t("places.nearby.estimate")}
                        >
                          <Footprints size={11} /> {walkLabel(t, p.walkMinutes, p.walkSource !== "route")}
                        </span>
                        {p.priceLevel != null && <span style={{ color: "var(--brand-text)" }}>{"$".repeat(p.priceLevel)}</span>}
                        {p.cuisine && <span>{tagLabel(p.cuisine, t)}</span>}
                        {p.open === true && <span style={{ color: "var(--ok)" }}>{t("places.nearby.open")}</span>}
                        {p.open === false && <span className="opacity-70">{t("places.nearby.closed")}</span>}
                        {isAdded && <span style={{ color: "var(--ok)" }}>{t("places.nearby.onWheel")}</span>}
                      </span>
                      {p.address && (
                        <span className="block type-meta text-muted-foreground/70 truncate mt-0.5">{p.address}</span>
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
              className="w-full"
            >
              {addNearby.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> {t("places.nearby.adding")}
                </span>
              ) : selected.size === 0 ? (
                t("places.nearby.select")
              ) : (
                <span className="flex items-center gap-2">
                  <Plus size={14} /> {t(selected.size === 1 ? "places.nearby.addSelected.one" : "places.nearby.addSelected.other", { n: selected.size })}
                </span>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
