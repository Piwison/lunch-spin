import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MAX_SEGMENTS } from "@shared/nearby";
import { nextSelection } from "@shared/candidates";
import { Navigation, Loader2, Plus, MapPin } from "lucide-react";
import { toast } from "sonner";
import { providerAlert } from "@/lib/placesError";
import { GeoError, requestCoords } from "@/lib/geo";
import { useLang } from "@/i18n";
import { userError } from "@/lib/userError";
import NearbyPicker, { useNearbyPool } from "@/components/NearbyPicker";
import ErrorNote from "@/components/onboarding/ErrorNote";
import { placeMapUrl } from "@/components/onboarding/PlaceCard";

interface NearbyDialogProps {
  wheelId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a place is added so the parent can refresh its list. */
  onAdded: () => void;
}

/**
 * The Places tab's "Nearby": the same list first run uses (components/
 * NearbyPicker) — ratings, the under-3.0 cut, chips, "look farther" — with the
 * places already on this wheel marked and not offered again. Nothing arrives
 * ticked: this wheel already exists, so every addition is a choice.
 *
 * It used to be a second, poorer list: no ratings, no low-rating cut, a radius
 * you widened by hand, and an empty search box that took focus (and the phone
 * keyboard) the moment the dialog opened.
 */
export default function NearbyDialog({ wheelId, open, onOpenChange, onAdded }: NearbyDialogProps) {
  const { t } = useLang();
  const nearby = useNearbyPool(wheelId);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const selected = useMemo(() => new Set(selection), [selection]);
  // One request adds at most a wheel's worth.
  const atCap = selection.length >= MAX_SEGMENTS;

  const addNearby = trpc.places.addNearbyBulk.useMutation();

  const locateAndSearch = async () => {
    setGeoError(null);
    setLocating(true);
    try {
      // Shared across the app for this session (lib/geo) — a second open of
      // this dialog, or the add-restaurant name search, reuses the same fix.
      nearby.searchFrom(await requestCoords());
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

  /**
   * Add every ticked place in ONE request. This used to be a mutation per row,
   * so filling a wheel from a nearby search cost a cold round trip for each
   * restaurant — the worst possible shape on this app's serverless + TiDB path.
   */
  const handleAddSelected = () => {
    const places = selection
      .map((id) => nearby.known.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({
        placeId: p.placeId,
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        address: p.address,
        priceLevel: p.priceLevel,
        cuisine: p.cuisine,
        rating: p.rating,
        ratingCount: p.ratingCount,
        mapUrl: placeMapUrl(p.placeId, p.name),
      }));
    if (places.length === 0) return;
    addNearby.mutate(
      { wheelId, places },
      {
        onSuccess: (res) => {
          nearby.markOnWheel(places.map((p) => p.placeId));
          setSelection([]);
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
    setSelection([]);
    nearby.reset();
  };

  const searched = nearby.pool !== null;
  const baseAlert = !searched && nearby.pending === null ? providerAlert(nearby.search.error) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="glass-sheet max-w-md max-h-[88vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="type-section flex items-center gap-2" style={{ color: "var(--ink-warm)" }}>
            <Navigation size={18} style={{ color: "var(--brand-text)" }} /> {t("places.nearby.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 pt-2">
          {!searched ? (
            <>
              <p className="type-meta text-muted-foreground">{t("places.nearby.desc")}</p>
              {geoError && <ErrorNote>{geoError}</ErrorNote>}
              {/* A spent map quota is a limit, not a crash: calmer styling. */}
              {baseAlert && (
                <ErrorNote tone={baseAlert.quota ? "warn" : "error"}>
                  {t(baseAlert.messageKey)}
                  {baseAlert.config && <> {t("places.nearby.manualFallback")}</>}
                </ErrorNote>
              )}
              {locating || nearby.pending === "base" ? (
                <div className="flex flex-col gap-2" aria-busy>
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-[76px] animate-pulse"
                      style={{ borderRadius: "var(--radius-card)", background: "var(--muted)", animationDelay: `${i * 80}ms` }}
                    />
                  ))}
                </div>
              ) : (
                <button
                  type="button"
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
            </>
          ) : (
            <NearbyPicker
              nearby={nearby}
              selected={selected}
              atCap={atCap}
              onToggle={(id) => setSelection((prev) => nextSelection(prev, { type: "toggle", id, atCap }))}
              inputId="nearby-craving"
            />
          )}
        </div>

        {/* One request for the whole selection. */}
        {searched && (
          <div className="sticky bottom-0 -mx-6 -mb-6 px-6 pt-3 pb-5 mt-1" style={{ background: "var(--popover)" }}>
            <Button onClick={handleAddSelected} disabled={selection.length === 0 || addNearby.isPending} className="w-full">
              {addNearby.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> {t("places.nearby.adding")}
                </span>
              ) : selection.length === 0 ? (
                t("places.nearby.select")
              ) : (
                <span className="flex items-center gap-2">
                  <Plus size={14} />{" "}
                  {t(selection.length === 1 ? "places.nearby.addSelected.one" : "places.nearby.addSelected.other", {
                    n: selection.length,
                  })}
                </span>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
