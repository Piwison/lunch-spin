/**
 * First run: Locate → Pick → Spin.
 *
 * The nearby search IS the onboarding. One tap finds real restaurants near you,
 * already ticked; the only job is adjusting the list; then the wheel is built
 * and spun. Zero typed characters — the wheel is named after the neighbourhood
 * (shared/areaName) — and anyone who would rather not share a location drops
 * through to the ordinary create dialog via `onManualCreate`.
 *
 * What the list holds and shows (BACKLOG.md 1a–1d, rules in shared/candidates):
 *
 *   - Ranked by DISTANCE, not Google's default prominence: measured at 內湖,
 *     the two shared 2 of 20 places and only distance found the neighbourhood
 *     lunch spots.
 *   - A whole page (20), not one wheel's worth (12), so the chips filter on the
 *     client instantly. Walk time, price and open-now never make a request;
 *     only a craving (keyword), "look farther" (the next page) or a list that
 *     has run dry goes back to Google. Each keyword's page is kept, so clearing
 *     it or typing it again costs nothing.
 *   - Judged Google ratings under 3.0 are hidden, and the screen says how many
 *     and brings them back in one tap.
 *   - The wheel is exactly the ticked places that are VISIBLE. A tick hidden
 *     behind a chip does not ride along, so the count on the button always
 *     matches what is on screen (failure modes 38/54).
 *   - Each craving is its own list with its OWN ticks. Ticks used to be one
 *     set across every query, so searching 麵 auto-ticked three noodle shops
 *     and "back to all" came back with 11 ticked where the person had left 8 —
 *     ticks nobody chose, leaking out of a search they had already abandoned.
 *
 * The motion follows the product's one rule — it answers the person, nothing
 * idles. See the "First run" block in index.css.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { providerAlert } from "@/lib/placesError";
import { useLang } from "@/i18n";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import LocationPicker, {
  type PickedLocation,
} from "@/components/LocationPicker";
import LocateRadar, {
  bearingDeg,
  type RadarDot,
} from "@/components/onboarding/LocateRadar";
import PaneWheel from "@/components/onboarding/PaneWheel";
import { Button } from "@/components/ui/button";
import { Chip as UiChip } from "@/components/ui/chip";
import PlaceCard, { placeMapUrl } from "@/components/onboarding/PlaceCard";
import { MAX_SEGMENTS, MIN_SEGMENTS } from "@shared/nearby";
import { MIN_SPINNABLE, canStartSpinning } from "@shared/onboarding";
import { DEMO_DRAFT_KEY, parseDemoDraft } from "@shared/demoDraft";
import {
  CANDIDATE_POOL,
  arrivalTicks,
  filterCandidates,
  mergeCandidatePages,
  onWheel,
  relaxations,
  walkBand,
  type CandidateFilters,
  type RelaxationKind,
} from "@shared/candidates";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
  MapPin,
  PenLine,
  Radar,
  Search,
  X,
} from "lucide-react";

type Step = "locate" | "pick" | "building";
type NearbyRow = RouterOutputs["places"]["searchNearby"]["places"][number];
type SearchResult = RouterOutputs["places"]["searchNearby"];

/** One query's candidates. Keyed by keyword; "" is the plain nearby search. */
interface Pool {
  rows: NearbyRow[];
  nextPageToken: string | null;
}

const WALK_CHIPS = [5, 10] as const;
const PRICE_CHIPS = [1, 2] as const;
/** How long the found places sit on the radar before the list takes over. */
const REVEAL_MS = 1100;
const CAP_FLASH_MS = 2600;

const toPool = (data: SearchResult): Pool => ({
  rows: data.places,
  nextPageToken: data.nextPageToken ?? null,
});

export default function OnboardingFlow({
  onCreated,
  onManualCreate,
}: {
  /** A wheel now exists — hand control back to the app. */
  onCreated: (wheelId: number) => void;
  /** "I'll add places myself" — open the ordinary create dialog. */
  onManualCreate: () => void;
}) {
  const { t, lang } = useLang();
  const reducedMotion = useReducedMotion();

  const [step, setStep] = useState<Step>("locate");
  // Where we searched from. `label` is set when the user picked a named place
  // (their office) rather than raw geolocation — that name becomes the wheel's
  // office label, so settings shows "台北101" and not a bare "Office".
  const [origin, setOrigin] = useState<PickedLocation | null>(null);
  const [pools, setPools] = useState<Record<string, Pool>>({});
  const [query, setQuery] = useState(""); // the keyword whose pool is showing
  const [draft, setDraft] = useState(""); // what is typed in the craving box
  const [filters, setFilters] = useState<CandidateFilters>({});
  // Ticks per query key, like `pools`: "" is the plain nearby list.
  const [ticks, setTicks] = useState<Record<string, Set<string>>>({});
  const [initialTicks, setInitialTicks] = useState(0);
  // How many of those arrival ticks are places reported closed. Non-zero only
  // in a quiet hour (see preselectPlaceIds), and then the copy has to say so.
  const [initialClosed, setInitialClosed] = useState(0);
  const [pending, setPending] = useState<null | "base" | "keyword" | "more">(
    null
  );
  const [locating, setLocating] = useState(false);
  const [revealDots, setRevealDots] = useState<RadarDot[] | null>(null);
  const [capAt, setCapAt] = useState<number | null>(null);
  const [building, setBuilding] = useState<{ key: string; name: string }[]>([]);
  const [growFrom, setGrowFrom] = useState<DOMRect | null>(null);
  // What the visitor typed into the landing-page demo before signing in
  // (shared/demoDraft). Read once; everything starts ticked, because they
  // already chose these. localStorage can throw — then there is simply no draft.
  const [typed] = useState<string[]>(() => {
    try {
      return parseDemoDraft(localStorage.getItem(DEMO_DRAFT_KEY), Date.now());
    } catch {
      return [];
    }
  });
  const [typedOn, setTypedOn] = useState<Set<string>>(() => new Set(typed));

  const miniWheelRef = useRef<HTMLDivElement>(null);
  const revealTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (revealTimer.current !== null)
        window.clearTimeout(revealTimer.current);
    },
    []
  );

  useEffect(() => {
    if (capAt === null) return;
    const id = window.setTimeout(() => setCapAt(null), CAP_FLASH_MS);
    return () => window.clearTimeout(id);
  }, [capAt]);

  const search = trpc.places.searchNearby.useMutation();
  const createWheel = trpc.wheels.createFromNearby.useMutation();

  const pool = pools[query] ?? null;
  const selected = useMemo(
    () => ticks[query] ?? new Set<string>(),
    [ticks, query]
  );
  const updateTicks = (key: string, fn: (prev: Set<string>) => Set<string>) =>
    setTicks(all => {
      const prev = all[key] ?? new Set<string>();
      const next = fn(prev);
      return next === prev ? all : { ...all, [key]: next };
    });
  const rows = useMemo(() => pool?.rows ?? [], [pool]);
  const view = useMemo(() => filterCandidates(rows, filters), [rows, filters]);
  const wheel = useMemo(
    () => onWheel(view.visible, selected),
    [view.visible, selected]
  );
  const lifts = useMemo(() => relaxations(rows, filters), [rows, filters]);
  const typedOnWheel = typed.filter(n => typedOn.has(n));
  // The wheel is the visible ticked nearby places PLUS the typed ones; every
  // count on screen (button, mini wheel, cap) is this one number.
  const total = wheel.length + typedOnWheel.length;
  const atCap = total >= MAX_SEGMENTS;
  const closedOnWheel = wheel.filter(p => p.open === false).length;
  const thin = view.visible.length < MIN_SEGMENTS;

  const baseInput = (at: PickedLocation) => ({
    wheelId: null,
    lat: at.lat,
    lng: at.lng,
    rankBy: "distance" as const,
    limit: CANDIDATE_POOL,
    language: lang,
  });

  // ── Requests: only these three ever reach Google ─────────────────────────

  const searchFrom = (at: PickedLocation) => {
    setOrigin(at);
    setPending("base");
    search.mutate(baseInput(at), {
      onSuccess: data => {
        const fresh = toPool(data);
        const preset = arrivalTicks(
          filterCandidates(fresh.rows, {}).visible,
          typedOnWheel.length
        );
        setPools({ "": fresh });
        setQuery("");
        setDraft("");
        setFilters({});
        setTicks({ "": new Set(preset) });
        setInitialTicks(preset.length);
        const presetIds = new Set(preset);
        setInitialClosed(
          fresh.rows.filter(r => presetIds.has(r.placeId) && r.open === false)
            .length
        );
        const plotted = fresh.rows.filter(r => r.lat != null && r.lng != null);
        if (reducedMotion || plotted.length === 0) {
          setStep("pick");
          return;
        }
        setRevealDots(
          plotted.map(r => ({
            id: r.placeId,
            bearing: bearingDeg(at, {
              lat: r.lat as number,
              lng: r.lng as number,
            }),
            walkMinutes: r.walkMinutes,
          }))
        );
        revealTimer.current = window.setTimeout(() => {
          setRevealDots(null);
          setStep("pick");
        }, REVEAL_MS);
      },
      onSettled: () => setPending(null),
    });
  };

  /** Tick newly arrived places in one query's list, up to the default size. */
  const tickArrivals = (
    key: string,
    arrivals: NearbyRow[],
    held: NearbyRow[]
  ) => {
    const visibleArrivals = filterCandidates(arrivals, filters).visible;
    updateTicks(key, prev => {
      const current =
        onWheel(filterCandidates(held, filters).visible, prev).length +
        typedOnWheel.length;
      const add = arrivalTicks(visibleArrivals, current);
      if (add.length === 0) return prev;
      const next = new Set(prev);
      for (const id of add) next.add(id);
      return next;
    });
  };

  const runCraving = () => {
    const q = draft.trim();
    if (q === query) return;
    // Clearing, or a craving already searched this session: no request.
    if (!q || pools[q]) {
      setQuery(q);
      return;
    }
    if (!origin) return;
    setPending("keyword");
    search.mutate(
      { ...baseInput(origin), keyword: q },
      {
        onSuccess: data => {
          const fresh = toPool(data);
          setPools(prev => ({ ...prev, [q]: fresh }));
          setQuery(q);
          tickArrivals(q, fresh.rows, []);
        },
        onSettled: () => setPending(null),
      }
    );
  };

  const lookFarther = () => {
    if (!origin || !pool?.nextPageToken) return;
    const key = query;
    const held = pool.rows;
    setPending("more");
    search.mutate(
      {
        ...baseInput(origin),
        keyword: key || undefined,
        pageToken: pool.nextPageToken,
      },
      {
        onSuccess: data => {
          const heldIds = new Set(held.map(r => r.placeId));
          const arrivals = data.places.filter(r => !heldIds.has(r.placeId));
          setPools(prev => ({
            ...prev,
            [key]: {
              rows: mergeCandidatePages(prev[key]?.rows ?? held, data.places),
              nextPageToken: data.nextPageToken ?? null,
            },
          }));
          tickArrivals(key, arrivals, held);
        },
        onSettled: () => setPending(null),
      }
    );
  };

  // ── Instant: never a request ─────────────────────────────────────────────

  const toggle = (placeId: string) => {
    if (selected.has(placeId)) {
      updateTicks(query, prev => {
        const next = new Set(prev);
        next.delete(placeId);
        return next;
      });
      return;
    }
    if (atCap) {
      setCapAt(Date.now());
      return;
    }
    updateTicks(query, prev => new Set(prev).add(placeId));
  };

  const lift = (kind: RelaxationKind) =>
    setFilters(f =>
      kind === "openOnly"
        ? { ...f, openOnly: false }
        : kind === "priceCap"
          ? { ...f, priceCap: null }
          : kind === "walkCap"
            ? { ...f, walkCap: null }
            : { ...f, showLowRated: true }
    );

  const build = () => {
    if (!canStartSpinning(total) || total > MAX_SEGMENTS) return;
    setGrowFrom(miniWheelRef.current?.getBoundingClientRect() ?? null);
    setBuilding([
      ...typedOnWheel.map(name => ({ key: `typed:${name}`, name })),
      ...wheel.map(p => ({ key: p.placeId, name: p.name })),
    ]);
    setStep("building");
    createWheel.mutate(
      {
        places: wheel.map(p => ({
          placeId: p.placeId,
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          address: p.address,
          priceLevel: p.priceLevel,
          cuisine: p.cuisine,
          mapUrl: placeMapUrl(p.placeId, p.name),
        })),
        // Only a *named* pick becomes the wheel's office. A raw geolocation fix
        // is where the user happened to be standing, not their office.
        extraNames: typedOnWheel,
        language: lang,
        origin: origin?.label
          ? { lat: origin.lat, lng: origin.lng, label: origin.label }
          : null,
      },
      {
        onSuccess: res => {
          // Used: a later first run (another account on this browser) must
          // not be offered these again.
          try {
            localStorage.removeItem(DEMO_DRAFT_KEY);
          } catch {
            /* nothing to clear */
          }
          onCreated(res.id);
        },
        // Back to the list with every choice intact; the error shows there.
        onError: () => setStep("pick"),
      }
    );
  };

  // ── Building ─────────────────────────────────────────────────────────────
  if (step === "building") {
    return <BuildingStep places={building} growFrom={growFrom} />;
  }

  // ── Pick ─────────────────────────────────────────────────────────────────
  if (step === "pick") {
    const alert = pending === null ? providerAlert(search.error) : null;
    const bands = groupByBand(view.visible);
    let cardIndex = 0;
    const ctaState =
      total > MAX_SEGMENTS
        ? "tooMany"
        : canStartSpinning(total)
          ? "ready"
          : "needMore";

    return (
      <>
        <div className="w-full max-w-lg mx-auto px-5 pt-6 onb-list-end flex flex-col gap-5">
          {/* Header */}
          <header className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <p
                className="type-eyebrow"
                style={{ color: "var(--ink-warm)", letterSpacing: "0.14em" }}
              >
                {t("onb.pick.count", { n: rows.length })}
              </p>
              <button
                type="button"
                onClick={() => {
                  search.reset();
                  setStep("locate");
                }}
                className="inline-flex items-center gap-1.5 min-w-0 px-3 text-left transition-colors hover:text-foreground"
                style={{
                  minHeight: 36,
                  borderRadius: "var(--radius-chip)",
                  border: "1px solid var(--border)",
                  color: "var(--body-warm)",
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                <MapPin
                  size={13}
                  className="flex-none"
                  style={{ color: "var(--brand-text)" }}
                />
                <span className="truncate max-w-[9.5rem]">
                  {origin?.label
                    ? t("onb.pick.fromPlace", { place: origin.label })
                    : t("onb.pick.fromHere")}
                </span>
                <span aria-hidden style={{ color: "var(--border)" }}>
                  ·
                </span>
                <span
                  className="flex-none"
                  style={{ color: "var(--ink-warm)", fontWeight: 600 }}
                >
                  {t("onb.pick.change")}
                </span>
              </button>
            </div>
            <h1 className="type-title" style={{ color: "var(--ink-warm)" }}>
              {t("onb.pick.title")}
            </h1>
            {/* Only the plain list: it describes the ticks WE made on arrival.
                A craving's list is explained by its own "results for" line. */}
            {!query && (
              <p className="type-meta" style={{ color: "var(--body-warm)" }}>
                {initialClosed > 0
                  ? t("onb.pick.descQuiet", {
                      n: initialTicks,
                      closed: initialClosed,
                    })
                  : initialTicks > 0
                    ? t("onb.pick.desc", { n: initialTicks })
                    : t("onb.pick.descNone")}
              </p>
            )}
          </header>

          {/* Craving: the one control here that asks Google a new question. */}
          <div className="flex flex-col gap-2">
            <form
              className="flex gap-2"
              onSubmit={e => {
                e.preventDefault();
                runCraving();
              }}
            >
              <label htmlFor="onb-craving" className="relative flex-1 min-w-0">
                <span className="sr-only">{t("onb.keyword.placeholder")}</span>
                <Search
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--muted-foreground)" }}
                />
                <input
                  id="onb-craving"
                  aria-label={t("onb.keyword.placeholder")}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  maxLength={120}
                  enterKeyHint="search"
                  placeholder={t("onb.keyword.placeholder")}
                  className="w-full outline-none focus-visible:ring-2 pl-11 pr-4"
                  style={{
                    minHeight: 48,
                    borderRadius: "var(--radius-control)",
                    background: "var(--paper)",
                    border: "1px solid var(--border)",
                    color: "var(--ink-warm)",
                    fontSize: 16,
                  }}
                />
              </label>
              <button
                type="submit"
                disabled={pending !== null || draft.trim() === query}
                className="flex-none inline-flex items-center justify-center gap-1.5 px-4 transition-opacity disabled:opacity-40"
                style={{
                  minHeight: 48,
                  borderRadius: "var(--radius-control)",
                  border: "1px solid var(--brand-solid)",
                  color: "var(--brand-text)",
                  fontWeight: 600,
                  fontSize: 15,
                }}
              >
                {pending === "keyword" ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : null}
                {t("onb.keyword.submit")}
              </button>
            </form>
            {query && (
              <p
                className="flex items-center gap-2 type-meta onb-flash"
                style={{ color: "var(--body-warm)" }}
              >
                <span className="truncate">
                  {t("onb.keyword.active", { q: query })}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDraft("");
                    setQuery("");
                  }}
                  className="flex-none inline-flex items-center gap-1 font-semibold underline underline-offset-4"
                  style={{ color: "var(--ink-warm)", minHeight: 32 }}
                >
                  <X size={13} /> {t("onb.keyword.clear")}
                </button>
              </p>
            )}
          </div>

          {/* Chips: instant, exclusive within a group, no apply button. */}
          <div
            role="group"
            aria-label={t("onb.chips")}
            className="onb-chips flex items-center gap-2 overflow-x-auto -mx-5 px-5 -my-1 py-1"
          >
            {WALK_CHIPS.map(n => (
              <Chip
                key={`w${n}`}
                on={filters.walkCap === n}
                onClick={() =>
                  setFilters(f => ({
                    ...f,
                    walkCap: f.walkCap === n ? null : n,
                  }))
                }
              >
                {t("onb.chip.walk", { n })}
              </Chip>
            ))}
            <ChipRule />
            {PRICE_CHIPS.map(n => (
              <Chip
                key={`p${n}`}
                on={filters.priceCap === n}
                onClick={() =>
                  setFilters(f => ({
                    ...f,
                    priceCap: f.priceCap === n ? null : n,
                  }))
                }
              >
                {t(n === 1 ? "onb.chip.price1" : "onb.chip.price2")}
              </Chip>
            ))}
            <ChipRule />
            <Chip
              on={!!filters.openOnly}
              onClick={() => setFilters(f => ({ ...f, openOnly: !f.openOnly }))}
            >
              {t("onb.chip.open")}
            </Chip>
          </div>

          {view.lowRated.length > 0 && (
            <p
              className="flex items-center gap-2 flex-wrap type-meta -mt-1"
              style={{ color: "var(--body-warm)" }}
            >
              <span>
                {filters.showLowRated
                  ? t("onb.lowRated.shown", { n: view.lowRated.length })
                  : t("onb.lowRated.hidden", { n: view.lowRated.length })}
              </span>
              <button
                type="button"
                onClick={() =>
                  setFilters(f => ({ ...f, showLowRated: !f.showLowRated }))
                }
                className="font-semibold underline underline-offset-4"
                style={{ color: "var(--ink-warm)", minHeight: 32 }}
              >
                {filters.showLowRated
                  ? t("onb.lowRated.hide")
                  : t("onb.lowRated.show")}
              </button>
            </p>
          )}

          {alert && (
            <ErrorNote tone={alert.quota ? "warn" : "error"}>
              {t(alert.messageKey)}
            </ErrorNote>
          )}
          {createWheel.isError && (
            <ErrorNote>{t("onb.err.create")}</ErrorNote>
          )}

          {/* The list, sectioned by walk band. */}
          <div
            className="flex flex-col gap-5"
            aria-busy={pending === "keyword"}
          >
            {typed.length > 0 && (
              <section className="flex flex-col gap-2.5">
                <div className="flex items-center gap-3 px-1">
                  <h2
                    style={{
                      fontSize: 13,
                      fontWeight: 650,
                      color: "var(--ink-warm)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {t("onb.typed.section")}
                  </h2>
                  <span
                    aria-hidden
                    className="flex-1 h-px"
                    style={{ background: "var(--border)" }}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--muted-foreground)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {t("onb.band.count", { n: typed.length })}
                  </span>
                </div>
                {typed.map((name, i) => {
                  const on = typedOn.has(name);
                  return (
                    <TypedCard
                      key={`typed:${name}`}
                      name={name}
                      on={on}
                      dimmed={atCap && !on}
                      index={i}
                      onToggle={() => {
                        if (!on && atCap) {
                          setCapAt(Date.now());
                          return;
                        }
                        setTypedOn(prev => {
                          const next = new Set(prev);
                          if (on) next.delete(name);
                          else next.add(name);
                          return next;
                        });
                      }}
                    />
                  );
                })}
              </section>
            )}

            {bands.map(({ band, places }) => (
              <section key={band ?? "far"} className="flex flex-col gap-2.5">
                <div className="flex items-center gap-3 px-1">
                  <h2
                    style={{
                      fontSize: 13,
                      fontWeight: 650,
                      color: "var(--ink-warm)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {band == null
                      ? t("onb.band.far")
                      : t("onb.band", { n: band })}
                  </h2>
                  <span
                    aria-hidden
                    className="flex-1 h-px"
                    style={{ background: "var(--border)" }}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--muted-foreground)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {t("onb.band.count", { n: places.length })}
                  </span>
                </div>
                {places.map(p => {
                  const on = selected.has(p.placeId);
                  return (
                    <PlaceCard
                      key={p.placeId}
                      place={p}
                      on={on}
                      dimmed={atCap && !on}
                      index={cardIndex++}
                      onToggle={() => toggle(p.placeId)}
                    />
                  );
                })}
              </section>
            ))}

            {thin ? (
              <ThinCard
                count={view.visible.length}
                lifts={lifts}
                canLookFarther={!!pool?.nextPageToken}
                looking={pending === "more"}
                onLift={lift}
                onLookFarther={lookFarther}
                onChangePlace={() => {
                  search.reset();
                  setStep("locate");
                }}
                onManualCreate={onManualCreate}
              />
            ) : (
              pool?.nextPageToken && (
                <button
                  type="button"
                  onClick={lookFarther}
                  disabled={pending !== null}
                  className="flex items-center justify-center gap-3 px-5 transition-colors disabled:opacity-60"
                  style={{
                    minHeight: 64,
                    borderRadius: "var(--radius-card)",
                    border: "1.5px dashed var(--border)",
                    color: "var(--ink-warm)",
                  }}
                >
                  {pending === "more" ? (
                    <Loader2
                      size={18}
                      className="animate-spin"
                      style={{ color: "var(--brand-text)" }}
                    />
                  ) : (
                    <Radar size={18} style={{ color: "var(--brand-text)" }} />
                  )}
                  <span className="flex flex-col items-start">
                    <span style={{ fontSize: 15, fontWeight: 600 }}>
                      {pending === "more"
                        ? t("onb.more.loading")
                        : t("onb.more")}
                    </span>
                    <span
                      style={{ fontSize: 12, color: "var(--muted-foreground)" }}
                    >
                      {t("onb.more.hint")}
                    </span>
                  </span>
                </button>
              )
            )}
          </div>
        </div>

        {/* Commit bar: the wheel being assembled, and the way to spin it. */}
        <div className="onb-commit pointer-events-none">
          <div className="max-w-lg mx-auto px-5 flex flex-col items-center gap-2">
            {capAt !== null && (
              <p
                key={capAt}
                role="status"
                className="onb-flash px-3.5 py-1.5 type-meta"
                style={{
                  borderRadius: "var(--radius-chip)",
                  background: "var(--ink-warm)",
                  color: "var(--paper)",
                  fontSize: 13,
                  fontWeight: 600,
                  boxShadow: "var(--glass-card-shadow)",
                }}
              >
                {t("onb.cap", { n: MAX_SEGMENTS })}
              </p>
            )}
            <button
              type="button"
              onClick={build}
              disabled={ctaState !== "ready" || createWheel.isPending}
              className="pointer-events-auto w-full flex items-center gap-3 pl-2.5 pr-5 transition-[opacity,transform] active:scale-[var(--press-scale)] disabled:opacity-55"
              style={{
                minHeight: 64,
                borderRadius: 999,
                background: "var(--brand-grad)",
                color: "var(--on-accent)",
                boxShadow:
                  "0 14px 32px -12px oklch(from var(--brand) l c h / 0.6), var(--glass-card-shadow)",
              }}
            >
              <PaneWheel
                ref={miniWheelRef}
                count={Math.min(total, MAX_SEGMENTS)}
                size={46}
                tone="accent"
              />
              <span
                className="flex-1 text-left flex flex-col"
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  letterSpacing: "0.02em",
                }}
              >
                {ctaState === "ready" ? (
                  <>
                    <span>
                      <CountCopy
                        text={t("onb.cta.spin", { n: "\u0000" })}
                        count={total}
                      />
                    </span>
                    {/* The server skips closed places when it spins, so a
                        closed tick is on the wheel but not in play today.
                        Saying so here is what stops "these 8" turning into
                        "6 in play" one screen later. */}
                    {closedOnWheel > 0 && (
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 500,
                          letterSpacing: 0,
                          opacity: 0.92,
                        }}
                      >
                        {t("onb.cta.closedNote", { n: closedOnWheel })}
                      </span>
                    )}
                  </>
                ) : ctaState === "needMore" ? (
                  t("onb.cta.needMore", { n: MIN_SPINNABLE })
                ) : (
                  t("onb.cta.tooMany", {
                    max: MAX_SEGMENTS,
                    n: total - MAX_SEGMENTS,
                  })
                )}
              </span>
              <ArrowRight size={20} className="flex-none" />
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── Locate ───────────────────────────────────────────────────────────────
  const alert = providerAlert(search.error);
  const busy = locating || pending === "base";

  return (
    <div className="grow flex flex-col items-center justify-center px-5 py-6 w-full">
      <div className="w-full max-w-sm flex flex-col items-center gap-4 text-center">
        <LocateRadar busy={busy} dots={revealDots} />

        <div className="flex flex-col gap-2" aria-live="polite">
          {revealDots ? (
            <h1
              className="type-title onb-flash"
              style={{ color: "var(--ink-warm)" }}
            >
              {t("onb.locate.found", { n: revealDots.length })}
            </h1>
          ) : (
            <h1 className="type-title" style={{ color: "var(--ink-warm)" }}>
              {t("onb.locate.titlePre")}
              <span style={{ color: "var(--brand-text)" }}>
                {t("onb.locate.titleAccent")}
              </span>
              {t("onb.locate.titlePost")}
            </h1>
          )}
          <p
            className="type-meta mx-auto max-w-[19rem] [@media(max-height:700px)]:hidden"
            style={{ color: "var(--body-warm)" }}
          >
            {busy && !revealDots
              ? t("onb.locate.searching")
              : t("onb.locate.desc")}
          </p>
          {/* Continuity with the landing page: what they typed there is not
              lost, and they can see that BEFORE choosing a location. */}
          {typed.length > 0 && (
            <p
              className="type-meta mx-auto max-w-[19rem] inline-flex items-start gap-1.5 text-left"
              style={{ color: "var(--ink-warm)" }}
            >
              <PenLine size={14} className="flex-none mt-[3px]" />
              <span>
                {typed.length === 1
                  ? t("onb.typed.carryOne", { name: typed[0] })
                  : t("onb.typed.carryMany", {
                      name: typed[0],
                      n: typed.length,
                    })}
              </span>
            </p>
          )}
        </div>

        {alert && (
          // A spent map quota is a limit, not a crash: calmer styling and a
          // nudge to the path that still works.
          <ErrorNote tone={alert.quota ? "warn" : "error"}>
            {t(alert.messageKey)}
          </ErrorNote>
        )}

        {/* Disabled natively while the search runs or the result is being
            shown: a second tap on "use my location" would fire a second
            search on top of the first. */}
        <fieldset
          disabled={pending === "base" || revealDots !== null}
          className={`flex flex-col gap-2 w-full min-w-0 border-0 p-0 m-0 transition-opacity${revealDots ? " opacity-0" : ""}`}
        >
          <LocationPicker
            onPicked={searchFrom}
            onLocatingChange={setLocating}
          />
          <button
            type="button"
            onClick={onManualCreate}
            className="inline-flex items-center justify-center gap-2 px-6 transition-colors hover:text-foreground"
            style={{
              minHeight: 48,
              color: "var(--body-warm)",
              fontSize: 15,
              fontWeight: 500,
            }}
          >
            <PenLine size={15} /> {t("onb.locate.manual")}
          </button>
        </fieldset>
      </div>
    </div>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function groupByBand<P extends { walkMinutes: number }>(places: P[]) {
  const out: { band: number | null; places: P[] }[] = [];
  for (const p of places) {
    const band = walkBand(p.walkMinutes);
    const last = out[out.length - 1];
    if (last && last.band === band) last.places.push(p);
    else out.push({ band, places: [p] });
  }
  return out;
}

/** The CTA copy with its number rolled in on every change, so the count reads
 *  as moving without the sentence around it jumping. `\u0000` marks where the
 *  number goes in the translated string. */
function CountCopy({ text, count }: { text: string; count: number }) {
  const [before, after = ""] = text.split("\u0000");
  return (
    <>
      {before}
      <span
        key={count}
        className="onb-roll"
        style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}
      >
        {count}
      </span>
      {after}
    </>
  );
}

/** A chip in the scrolling filter row — the design-system Chip, kept from
 *  shrinking or wrapping so the row scrolls instead. */
function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <UiChip pressed={on} onClick={onClick} className="flex-none whitespace-nowrap">
      {children}
    </UiChip>
  );
}

function ChipRule() {
  return (
    <span
      aria-hidden
      className="flex-none w-px h-6"
      style={{ background: "var(--border)" }}
    />
  );
}

/**
 * The list has run dry (fewer than a wheel's minimum). Offer the single lifts
 * that put places back, biggest first and all instant, then the one that goes
 * back to Google — labelled as a new search so nobody mistakes it for a filter.
 */
function ThinCard({
  count,
  lifts,
  canLookFarther,
  looking,
  onLift,
  onLookFarther,
  onChangePlace,
  onManualCreate,
}: {
  count: number;
  lifts: { kind: RelaxationKind; gain: number }[];
  canLookFarther: boolean;
  looking: boolean;
  onLift: (kind: RelaxationKind) => void;
  onLookFarther: () => void;
  onChangePlace: () => void;
  onManualCreate: () => void;
}) {
  const { t } = useLang();
  const labels: Record<RelaxationKind, Parameters<typeof t>[0]> = {
    openOnly: "onb.relax.openOnly",
    priceCap: "onb.relax.priceCap",
    walkCap: "onb.relax.walkCap",
    lowRated: "onb.relax.lowRated",
  };
  const exhausted = lifts.length === 0 && !canLookFarther;

  return (
    <div
      className="onb-arrive flex flex-col gap-3 p-5"
      style={{
        borderRadius: "var(--radius-card)",
        border: "1.5px dashed var(--border)",
        background: "var(--paper)",
      }}
    >
      <p style={{ fontSize: 17, fontWeight: 650, color: "var(--ink-warm)" }}>
        {count === 0
          ? t("onb.thin.titleNone")
          : t("onb.thin.title", { n: count })}
      </p>
      {exhausted ? (
        <>
          <p className="type-meta" style={{ color: "var(--body-warm)" }}>
            {t("onb.thin.exhausted")}
          </p>
          <div className="flex gap-2 flex-wrap">
            <OutlineButton onClick={onChangePlace}>
              <MapPin size={15} /> {t("onb.pick.change")}
            </OutlineButton>
            <OutlineButton onClick={onManualCreate}>
              <PenLine size={15} /> {t("onb.locate.manual")}
            </OutlineButton>
          </div>
        </>
      ) : (
        <>
          <p className="type-meta" style={{ color: "var(--body-warm)" }}>
            {t("onb.thin.desc")}
          </p>
          <div className="flex gap-2 flex-wrap">
            {lifts.map(l => (
              <OutlineButton key={l.kind} onClick={() => onLift(l.kind)}>
                {t(labels[l.kind])}
                <span style={{ color: "var(--brand-text)", fontWeight: 700 }}>
                  {t("onb.relax.gain", { n: l.gain })}
                </span>
              </OutlineButton>
            ))}
            {canLookFarther && (
              <OutlineButton onClick={onLookFarther} disabled={looking} accent>
                {looking ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Radar size={15} />
                )}
                {t("onb.more")}
                <span style={{ fontSize: 12, opacity: 0.8 }}>
                  · {t("onb.relax.research")}
                </span>
              </OutlineButton>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function OutlineButton({
  onClick,
  disabled,
  accent,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled}
      variant={accent ? "brand-outline" : "outline"}
      size="md"
      // 14px semibold: these sit three or four to a wrapping row at the end of
      // the list, one rung under the md label so the row stays one line longer.
      className="gap-1.5 text-sm font-semibold"
    >
      {children}
    </Button>
  );
}

/**
 * A place the visitor typed on the landing page. Same card and same tick as a
 * nearby place, so it reads as one list — but the tile shows a pen instead of
 * a walk time, because a typed name has no location to walk to.
 */
function TypedCard({
  name,
  on,
  dimmed,
  index,
  onToggle,
}: {
  name: string;
  on: boolean;
  dimmed: boolean;
  index: number;
  onToggle: () => void;
}) {
  const { t } = useLang();
  return (
    <div
      className="onb-arrive onb-card flex items-stretch"
      style={{
        ["--i" as string]: index,
        borderRadius: "var(--radius-card)",
        background: on
          ? "oklch(from var(--brand) l c h / 0.07)"
          : "var(--paper)",
        border: `1px solid ${on ? "oklch(from var(--brand) l c h / 0.5)" : "var(--border)"}`,
        opacity: dimmed ? 0.5 : 1,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        className="flex-1 min-w-0 flex items-center gap-3.5 pl-2.5 pr-4 py-2.5 text-left active:scale-[var(--press-scale)] transition-transform"
        style={{ borderRadius: "var(--radius-card)" }}
      >
        <span
          aria-hidden
          className="relative flex-none flex items-center justify-center"
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            background: "var(--muted)",
          }}
        >
          <span
            className="onb-tile-fill absolute inset-0"
            style={{ borderRadius: 18, background: "var(--brand-grad)" }}
          />
          <PenLine
            size={20}
            className="onb-tile-num relative"
            style={{ color: on ? "var(--on-accent)" : "var(--ink-warm)" }}
          />
          <span
            className="onb-check absolute flex items-center justify-center rounded-full"
            style={{
              top: -5,
              right: -5,
              width: 20,
              height: 20,
              background: "var(--paper)",
              color: "var(--brand-text)",
              boxShadow: "0 0 0 1.5px var(--brand-solid)",
            }}
          >
            <Check size={12} strokeWidth={3.25} />
          </span>
        </span>
        <span className="flex-1 min-w-0 flex flex-col gap-1">
          <span
            className="block truncate"
            style={{
              fontSize: 17,
              lineHeight: 1.3,
              fontWeight: 600,
              color: "var(--ink-warm)",
            }}
          >
            {name}
          </span>
          <span
            style={{
              fontSize: 13,
              lineHeight: 1.35,
              color: "var(--body-warm)",
            }}
          >
            {t("onb.typed.meta")}
          </span>
        </span>
      </button>
    </div>
  );
}

/**
 * The commit bar's wheel, grown to the middle of the screen and turning while
 * the wheel is written. It starts exactly where the small one was: the rect was
 * measured when the button was pressed, and the offset is written into the
 * animation's custom properties before the first paint.
 */
function BuildingStep({
  places,
  growFrom,
}: {
  places: { key: string; name: string }[];
  growFrom: DOMRect | null;
}) {
  const { t } = useLang();
  const growRef = useRef<HTMLDivElement>(null);
  const SIZE = 184;

  useLayoutEffect(() => {
    const el = growRef.current;
    if (!el || !growFrom) return;
    const to = el.getBoundingClientRect();
    el.style.setProperty(
      "--grow-x",
      `${growFrom.left + growFrom.width / 2 - (to.left + to.width / 2)}px`
    );
    el.style.setProperty(
      "--grow-y",
      `${growFrom.top + growFrom.height / 2 - (to.top + to.height / 2)}px`
    );
    el.style.setProperty("--grow-s", `${growFrom.width / to.width}`);
    el.classList.add("onb-grow");
  }, [growFrom]);

  return (
    <div className="grow flex flex-col items-center justify-center gap-7 px-5 py-8 w-full text-center">
      <div ref={growRef} style={{ width: SIZE, height: SIZE }}>
        <div className="animate-orb-spin w-full h-full">
          <PaneWheel count={places.length} size={SIZE} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="type-section" style={{ color: "var(--ink-warm)" }}>
          {t("onb.building.title")}
        </h1>
        <p className="type-meta" style={{ color: "var(--body-warm)" }}>
          {t("onb.building.desc", { n: places.length })}
        </p>
      </div>
      <ul className="flex flex-wrap justify-center gap-2 max-w-md">
        {places.map((p, i) => (
          <li
            key={p.key}
            className="onb-arrive px-3 py-1.5"
            style={{
              ["--i" as string]: i,
              borderRadius: "var(--radius-chip)",
              border: "1px solid var(--border)",
              background: "var(--paper)",
              color: "var(--ink-warm)",
              fontSize: 14,
            }}
          >
            {p.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ErrorNote({
  children,
  tone = "error",
}: {
  children: React.ReactNode;
  tone?: "error" | "warn";
}) {
  const token = tone === "warn" ? "--brand" : "--destructive";
  return (
    <div
      className="flex items-start gap-2.5 px-3.5 py-2.5 type-meta w-full text-left"
      style={{
        borderRadius: "var(--radius-chip)",
        background: `oklch(from var(${token}) l c h / 0.10)`,
        border: `1px solid oklch(from var(${token}) l c h / 0.25)`,
        color: `var(${token})`,
      }}
    >
      <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}
