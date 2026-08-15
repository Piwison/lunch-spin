/**
 * First run: Locate → Pick → Spin.
 *
 * Replaces the old first-run card, whose two buttons both opened the same
 * seven-field CREATE WHEEL dialog and whose "fast" path seeded eight fictional
 * restaurants ("Pizza Place", "Taco Truck") — so a new user's very first spin
 * landed on somewhere they can't eat, and everything it gave them had to be
 * thrown away. The product's most convincing move, nearby search, was two tabs
 * away behind a 40px ghost button.
 *
 * So the nearby search IS the onboarding. One tap gets real restaurants near
 * you, already ticked; the only job is un-ticking what you don't want; then the
 * wheel is built and spun. Zero typed characters — the wheel is named after the
 * neighbourhood (shared/areaName) and every setting the old dialog asked for is
 * a tuning knob that lives in wheel settings, where a user who has actually
 * spun a few times can answer it.
 *
 * Anyone who'd rather not share their location drops through to the ordinary
 * create dialog via `onManualCreate` — we don't build a second creation path.
 */

import { useCallback, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { providerAlert } from "@/lib/placesError";
import { formatWalk } from "@shared/nearby";
import {
  DEFAULT_PICK_COUNT,
  MIN_SPINNABLE,
  canStartSpinning,
  preselectPlaceIds,
} from "@shared/onboarding";
import {
  AlertTriangle,
  Check,
  Footprints,
  Loader2,
  MapPin,
  Navigation,
  RotateCw,
} from "lucide-react";

type Step = "locate" | "pick" | "building";
type Coords = { lat: number; lng: number };
type Filter = "all" | "walk" | "price" | "open";

/** A place row as returned by places.searchNearby. */
type NearbyResult = {
  placeId: string;
  name: string;
  walkMinutes: number;
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

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "walk", label: "< 10 min" },
  { id: "price", label: "$$ & under" },
  { id: "open", label: "Open now" },
];

/** Chips narrow what's *shown*; they never silently drop a place you ticked. */
function matchesFilter(p: NearbyResult, filter: Filter): boolean {
  if (filter === "walk") return p.walkMinutes <= 10;
  if (filter === "price") return p.priceLevel == null || p.priceLevel <= 2;
  if (filter === "open") return p.open !== false;
  return true;
}

function placeMapUrl(placeId: string, name: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${placeId}`;
}

export default function OnboardingFlow({
  onCreated,
  onManualCreate,
}: {
  /** A wheel now exists — hand control back to the app. */
  onCreated: (wheelId: number) => void;
  /** "I'll add places myself" — open the ordinary create dialog. */
  onManualCreate: () => void;
}) {
  const [step, setStep] = useState<Step>("locate");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [geoError, setGeoError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const search = trpc.places.searchNearby.useMutation({
    onSuccess: (data) => {
      const places = (data.places ?? []) as NearbyResult[];
      setSelected(new Set(preselectPlaceIds(places, DEFAULT_PICK_COUNT)));
      setStep("pick");
    },
  });

  const createWheel = trpc.wheels.createFromNearby.useMutation();

  const results = useMemo(() => (search.data?.places ?? []) as NearbyResult[], [search.data]);
  const visible = useMemo(() => results.filter((p) => matchesFilter(p, filter)), [results, filter]);
  const selectedCount = selected.size;

  const runSearch = useCallback(
    (at: Coords, radius?: number) => {
      search.mutate({ wheelId: null, lat: at.lat, lng: at.lng, radius });
    },
    [search],
  );

  const locate = useCallback(() => {
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
        runSearch(at);
      },
      (err) => {
        setLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "No problem — you can add places yourself instead."
            : "Couldn't get your location. Try again, or add places yourself.",
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }, [runSearch]);

  const toggle = (placeId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });

  const build = () => {
    // Selection is keyed by placeId, so read the payload back off the full
    // result list — not `visible`, which a filter chip may have narrowed.
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
    if (!canStartSpinning(places.length)) return;
    setStep("building");
    createWheel.mutate(
      { places },
      {
        onSuccess: (res) => {
          onCreated(res.id);
        },
        // Back to the picker with their choices intact rather than a dead end.
        onError: () => setStep("pick"),
      },
    );
  };

  const alert = providerAlert(search.error);

  // ── Building ──────────────────────────────────────────────────────────────
  if (step === "building") {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-5 text-center">
          <div
            className="orb-wheel animate-orb-spin"
            style={{ width: 84, height: 84, animationDuration: "1.4s", boxShadow: "0 0 40px oklch(from var(--brand) l c h / 0.4)" }}
          />
          <div className="flex flex-col gap-1.5">
            <p className="text-xl font-black" style={{ fontFamily: "var(--font-display)" }}>
              Building your wheel
            </p>
            <p className="text-sm text-muted-foreground">
              Adding {selectedCount} {selectedCount === 1 ? "place" : "places"} and checking their hours…
            </p>
          </div>
          {createWheel.isError && (
            <ErrorNote>{createWheel.error.message}</ErrorNote>
          )}
        </div>
      </Shell>
    );
  }

  // ── Pick your spots ───────────────────────────────────────────────────────
  if (step === "pick") {
    return (
      <Shell scroll>
        <div className="flex flex-col gap-4 w-full">
          <div className="flex flex-col gap-1">
            <p className="text-2xl font-black" style={{ fontFamily: "var(--font-display)" }}>
              Pick your spots
            </p>
            <p className="text-sm text-muted-foreground">
              {results.length} {results.length === 1 ? "place" : "places"} within walking distance.
              We've ticked the best {Math.min(DEFAULT_PICK_COUNT, results.length)} — untick anything you don't want.
            </p>
          </div>

          {/* Filters narrow the view only; ticks survive switching chips. */}
          <div className="flex gap-1.5 flex-wrap">
            {FILTERS.map((f) => {
              const on = filter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  aria-pressed={on}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95"
                  style={
                    on
                      ? { background: "var(--foreground)", color: "var(--background)" }
                      : { background: "var(--card)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }
                  }
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {search.data?.lowDensity && coords && (
            <div
              className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs"
              style={{ background: "oklch(from var(--info) l c h / 0.08)", border: "1px solid oklch(from var(--info) l c h / 0.20)", color: "var(--info)" }}
            >
              <span className="flex items-center gap-2">
                <AlertTriangle size={13} /> Not many spots within reach.
              </span>
              <button
                onClick={() => runSearch(coords, 2500)}
                disabled={search.isPending}
                className="font-semibold underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
              >
                Search wider
              </button>
            </div>
          )}

          {/* pb clears the fixed commit bar above, so the last place is always
              reachable rather than sitting under the button. */}
          <div className="flex flex-col gap-2 pb-28">
            {visible.map((p) => {
              const on = selected.has(p.placeId);
              return (
                <button
                  key={p.placeId}
                  onClick={() => toggle(p.placeId)}
                  aria-pressed={on}
                  className="flex items-center gap-3 px-3.5 py-3 rounded-2xl text-left transition-all active:scale-[0.99]"
                  style={{
                    background: on ? "oklch(from var(--brand) l c h / 0.08)" : "var(--card)",
                    border: on ? "1px solid oklch(from var(--brand) l c h / 0.45)" : "1px solid var(--border)",
                  }}
                >
                  <span
                    aria-hidden
                    className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors"
                    style={
                      on
                        ? { background: "var(--brand)", color: "white" }
                        : { border: "1.5px solid var(--border)" }
                    }
                  >
                    {on && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-sm truncate">{p.name}</span>
                    <span className="flex items-center gap-2 flex-wrap mt-0.5 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Footprints size={11} /> {formatWalk(p.walkMinutes, p.walkSource !== "route")}
                      </span>
                      {p.priceLevel != null && <span style={{ color: "var(--brand)" }}>{"$".repeat(p.priceLevel)}</span>}
                      {p.cuisine && <span>{p.cuisine}</span>}
                      {p.open === true && <span style={{ color: "var(--ok)" }}>Open now</span>}
                      {p.open === false && <span className="opacity-70">Closed</span>}
                    </span>
                  </span>
                </button>
              );
            })}
            {visible.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nothing matches that filter.{" "}
                <button onClick={() => setFilter("all")} className="underline underline-offset-2 font-semibold text-foreground">
                  Show all
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Commit bar. FIXED, not sticky: this app's shell grows with its
            content and the DOCUMENT scrolls (the tab wrapper's overflow-y-auto
            never engages), so a sticky bar just sits in flow at the end of the
            list and covers the last row. Fixed keeps the count in view the whole
            way down the list, and `bottom-28` clears the fixed mobile nav —
            which isn't there from md up, hence `md:bottom-6`. The list's own
            pb-28 (below) is what stops it hiding the final place. */}
        <div className="fixed left-0 right-0 bottom-28 md:bottom-6 px-5 z-20 pointer-events-none">
          <div className="max-w-lg mx-auto pointer-events-auto">
            <button
              onClick={build}
              disabled={!canStartSpinning(selectedCount) || createWheel.isPending}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-45"
              style={{
                fontFamily: "var(--font-display)",
                background: "linear-gradient(135deg, var(--brand), var(--brand-2))",
                boxShadow: "0 6px 28px oklch(from var(--brand) l c h / 0.45)",
                color: "white",
              }}
            >
              <RotateCw size={16} />
              {canStartSpinning(selectedCount)
                ? `Spin these ${selectedCount} →`
                : `Pick at least ${MIN_SPINNABLE}`}
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ── Locate ────────────────────────────────────────────────────────────────
  const busy = locating || search.isPending;
  return (
    <Shell>
      <div className="flex flex-col items-center gap-6 text-center w-full">
        <div
          className="w-20 h-20 orb-wheel animate-orb-spin"
          style={{ boxShadow: "0 0 40px oklch(from var(--brand) l c h / 0.4)" }}
        />
        <div className="flex flex-col gap-2">
          <p className="text-2xl font-black" style={{ fontFamily: "var(--font-display)" }}>
            Let's find lunch near you
          </p>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            We'll pull up real places within walking distance and put them straight on your wheel.
          </p>
        </div>

        {geoError && <ErrorNote>{geoError}</ErrorNote>}
        {alert && (
          // A spent map quota is a limit, not a crash: calmer styling, no retry
          // affordance, and a nudge to the path that still works.
          <ErrorNote tone={alert.quota ? "warn" : "error"}>
            {alert.message}
            {/* The quota copy already names the fallback; only the config case
                needs pointing at it. */}
            {alert.config && <> Pick “I'll add places myself” below.</>}
          </ErrorNote>
        )}

        <div className="flex flex-col gap-2.5 w-full max-w-xs">
          <button
            onClick={locate}
            disabled={busy}
            className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-sm font-bold transition-all active:scale-95 hover:-translate-y-0.5 disabled:opacity-60 disabled:translate-y-0"
            style={{
              fontFamily: "var(--font-display)",
              background: "linear-gradient(135deg, var(--brand), var(--brand-2))",
              boxShadow: "0 0 30px oklch(from var(--brand) l c h / 0.4)",
              color: "white",
            }}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
            {locating ? "Finding you…" : search.isPending ? "Looking around…" : "Use my location"}
          </button>
          <p className="text-[11px] text-muted-foreground px-4">
            Only used for this search — it's never stored.
          </p>
          <button
            onClick={onManualCreate}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-xs font-semibold text-muted-foreground transition-all active:scale-95 hover:text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <Navigation size={13} /> I'll add places myself
          </button>
        </div>
      </div>
    </Shell>
  );
}

/**
 * Container for the three steps.
 *
 * `scroll` matters: the picker is a list that routinely outgrows the viewport,
 * and vertically centring something taller than its scrollport puts the top of
 * it out of reach and stops `position: sticky` engaging on the commit bar. So
 * the list flows normally and only the short steps get centred.
 */
function Shell({ children, scroll = false }: { children: React.ReactNode; scroll?: boolean }) {
  if (scroll) {
    return <div className="w-full max-w-lg mx-auto px-5 py-6 flex flex-col">{children}</div>;
  }
  return (
    <div className="min-h-full flex flex-col items-center justify-center px-5 py-8 w-full">
      <div className="w-full max-w-md flex flex-col items-center">{children}</div>
    </div>
  );
}

function ErrorNote({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "warn" }) {
  const token = tone === "warn" ? "--brand" : "--destructive";
  return (
    <div
      className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-xs w-full max-w-xs"
      style={{
        background: `oklch(from var(${token}) l c h / 0.10)`,
        border: `1px solid oklch(from var(${token}) l c h / 0.25)`,
        color: `var(${token})`,
      }}
    >
      <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
      <span className="text-left leading-relaxed">{children}</span>
    </div>
  );
}
