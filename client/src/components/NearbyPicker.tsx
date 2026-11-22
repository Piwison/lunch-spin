/**
 * The nearby place list — first run's "pick your spots" and the Places tab's
 * "Nearby" are the same list now. The Places version used to be a second,
 * poorer copy: no ratings, no low-rating cut, no chips, a radius you widened by
 * hand, and a search box that grabbed focus on open (walkthrough P1-O).
 *
 * `useNearbyPool` owns every request to Google and the list state:
 *
 *   - Ranked by DISTANCE, a whole page (20) at a time, so the chips filter on
 *     the client instantly. Walk time, price and open-now never make a request;
 *     only a craving (keyword), "look farther" (the next page) or a list that
 *     has run dry goes back to Google. Each keyword's page is kept, so clearing
 *     it or typing it again costs nothing.
 *   - Judged Google ratings under 3.0 are hidden, and the list says how many
 *     and brings them back in one tap (shared/candidates).
 *
 * The CALLER owns the selection — first run ticks places on arrival and caps
 * the wheel; the Places tab ticks nothing and adds in one request — so the
 * picker only reports taps.
 */
import { useMemo, useState, type ReactNode } from "react";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { providerAlert } from "@/lib/placesError";
import { useLang } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Chip as UiChip } from "@/components/ui/chip";
import PlaceCard from "@/components/onboarding/PlaceCard";
import ErrorNote from "@/components/onboarding/ErrorNote";
import { MIN_SEGMENTS } from "@shared/nearby";
import {
  CANDIDATE_POOL,
  filterCandidates,
  mergeCandidatePages,
  relaxations,
  walkBand,
  type CandidateFilters,
  type RelaxationKind,
} from "@shared/candidates";
import { Loader2, MapPin, PenLine, Radar, Search, X } from "lucide-react";
import { devicePlaceLanguage } from "@/lib/placeLanguage";

export type NearbyRow = RouterOutputs["places"]["searchNearby"]["places"][number];
type SearchResult = RouterOutputs["places"]["searchNearby"];

/** One query's candidates. Keyed by keyword; "" is the plain nearby search. */
export interface Pool {
  rows: NearbyRow[];
  nextPageToken: string | null;
}

export interface SearchPoint {
  lat: number;
  lng: number;
}

const WALK_CHIPS = [5, 10] as const;
const PRICE_CHIPS = [1, 2] as const;

const toPool = (data: SearchResult): Pool => ({
  rows: data.places,
  nextPageToken: data.nextPageToken ?? null,
});

/**
 * One nearby search session. `wheelId` makes the server mark the places already
 * on that wheel (`alreadyAdded`); first run passes null.
 */
export function useNearbyPool(wheelId: number | null) {
  const search = trpc.places.searchNearby.useMutation();
  const [at, setAt] = useState<SearchPoint | null>(null);
  const [pools, setPools] = useState<Record<string, Pool>>({});
  const [query, setQuery] = useState(""); // the keyword whose pool is showing
  const [draft, setDraft] = useState(""); // what is typed in the craving box
  const [filters, setFilters] = useState<CandidateFilters>({});
  const [pending, setPending] = useState<null | "base" | "keyword" | "more">(null);

  const pool = pools[query] ?? null;
  const rows = useMemo(() => pool?.rows ?? [], [pool]);
  const view = useMemo(() => filterCandidates(rows, filters), [rows, filters]);
  // Every row any list has returned, so a place chosen in one search can still
  // be shown and built after the list on screen has changed.
  const known = useMemo(() => {
    const m = new Map<string, NearbyRow>();
    for (const p of Object.values(pools)) for (const r of p.rows) if (!m.has(r.placeId)) m.set(r.placeId, r);
    return m;
  }, [pools]);
  const lifts = useMemo(() => relaxations(rows, filters), [rows, filters]);

  const input = (p: SearchPoint) => ({
    wheelId,
    lat: p.lat,
    lng: p.lng,
    rankBy: "distance" as const,
    limit: CANDIDATE_POOL,
    language: devicePlaceLanguage(),
  });

  // ── Requests: only these three ever reach Google ─────────────────────────

  /** The plain nearby list from `p`. Replaces every list and filter. */
  const searchFrom = (p: SearchPoint, onArrive?: (fresh: Pool) => void) => {
    setAt(p);
    setPending("base");
    search.mutate(input(p), {
      onSuccess: (data) => {
        const fresh = toPool(data);
        setPools({ "": fresh });
        setQuery("");
        setDraft("");
        setFilters({});
        onArrive?.(fresh);
      },
      onSettled: () => setPending(null),
    });
  };

  /** Search the typed craving, or switch back to a list already fetched. */
  const runCraving = (onArrive?: () => void) => {
    const q = draft.trim();
    if (q === query) return;
    // Clearing, or a craving already searched this session: no request.
    if (!q || pools[q]) {
      setQuery(q);
      return;
    }
    if (!at) return;
    setPending("keyword");
    search.mutate(
      { ...input(at), keyword: q },
      {
        onSuccess: (data) => {
          setPools((prev) => ({ ...prev, [q]: toPool(data) }));
          setQuery(q);
          onArrive?.();
        },
        onSettled: () => setPending(null),
      },
    );
  };

  /** The next page of whichever list is showing, merged into it. */
  const lookFarther = () => {
    if (!at || !pool?.nextPageToken) return;
    const key = query;
    const held = pool.rows;
    setPending("more");
    search.mutate(
      { ...input(at), keyword: key || undefined, pageToken: pool.nextPageToken },
      {
        onSuccess: (data) => {
          setPools((prev) => ({
            ...prev,
            [key]: {
              rows: mergeCandidatePages(prev[key]?.rows ?? held, data.places),
              nextPageToken: data.nextPageToken ?? null,
            },
          }));
        },
        onSettled: () => setPending(null),
      },
    );
  };

  // ── Instant: never a request ─────────────────────────────────────────────

  const lift = (kind: RelaxationKind) =>
    setFilters((f) =>
      kind === "openOnly"
        ? { ...f, openOnly: false }
        : kind === "priceCap"
          ? { ...f, priceCap: null }
          : kind === "walkCap"
            ? { ...f, walkCap: null }
            : { ...f, showLowRated: true },
    );

  const clearQuery = () => {
    setDraft("");
    setQuery("");
  };

  /** After an add: these places are on the wheel now, in every list, without
   *  asking Google again. */
  const markOnWheel = (ids: Iterable<string>) => {
    const added = new Set(ids);
    setPools((prev) => {
      const next: Record<string, Pool> = {};
      for (const key of Object.keys(prev)) {
        const p = prev[key]!;
        next[key] = { ...p, rows: p.rows.map((r) => (added.has(r.placeId) ? { ...r, alreadyAdded: true } : r)) };
      }
      return next;
    });
  };

  const reset = () => {
    search.reset();
    setAt(null);
    setPools({});
    setQuery("");
    setDraft("");
    setFilters({});
  };

  return {
    search,
    at,
    pool,
    rows,
    view,
    known,
    lifts,
    query,
    draft,
    setDraft,
    filters,
    setFilters,
    pending,
    searchFrom,
    runCraving,
    lookFarther,
    lift,
    clearQuery,
    markOnWheel,
    reset,
  };
}

export type NearbyPool = ReturnType<typeof useNearbyPool>;

/**
 * The craving box, the filter chips, the low-rating line and the list itself,
 * sectioned by walk band, ending in "look farther" or — when the list has run
 * dry — the lifts that put places back. Renders siblings: the caller's column
 * spaces them.
 */
export default function NearbyPicker({
  nearby,
  selected,
  atCap,
  onToggle,
  onCraving,
  leading,
  notices,
  inputId,
  onChangePlace,
  onManualCreate,
}: {
  nearby: NearbyPool;
  selected: ReadonlySet<string>;
  /** The selection is full: unselected cards dim. */
  atCap: boolean;
  onToggle: (placeId: string) => void;
  /** A craving's list arrived (the caller may want to adjust its selection). */
  onCraving?: () => void;
  /** Rendered first inside the list (first run's typed names). */
  leading?: ReactNode;
  /** Rendered under the provider alert, above the list. */
  notices?: ReactNode;
  inputId: string;
  /** "Somewhere else" on a list that has run dry. */
  onChangePlace?: () => void;
  /** "Add it myself" on a list that has run dry. */
  onManualCreate?: () => void;
}) {
  const { t } = useLang();
  const { view, filters, setFilters, pending, pool, query, draft, setDraft, lifts } = nearby;
  const alert = pending === null ? providerAlert(nearby.search.error) : null;
  const bands = groupByBand(view.visible);
  const thin = view.visible.length < MIN_SEGMENTS;
  let cardIndex = 0;

  return (
    <>
      {/* Craving: the one control here that asks Google a new question. */}
      <div className="flex flex-col gap-2">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            nearby.runCraving(onCraving);
          }}
        >
          <label htmlFor={inputId} className="relative flex-1 min-w-0">
            <span className="sr-only">{t("onb.keyword.placeholder")}</span>
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--muted-foreground)" }}
            />
            <input
              id={inputId}
              aria-label={t("onb.keyword.placeholder")}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={120}
              enterKeyHint="search"
              placeholder={t("onb.keyword.placeholder")}
              className="w-full outline-none focus-visible:ring-2 pl-11 pr-4"
              style={{
                minHeight: 48,
                borderRadius: "var(--radius-control)",
                background: "var(--paper)",
                border: "1px solid var(--input)",
                color: "var(--ink-warm)",
                fontSize: 16,
              }}
            />
          </label>
          <Button
            type="submit"
            variant="brand-outline"
            size="md"
            className="flex-none min-h-12"
            disabled={pending !== null || draft.trim() === query}
          >
            {pending === "keyword" ? <Loader2 size={15} className="animate-spin" /> : null}
            {t("onb.keyword.submit")}
          </Button>
        </form>
        {query && (
          <p className="flex items-center gap-2 type-meta onb-flash" style={{ color: "var(--body-warm)" }}>
            <span className="truncate">{t("onb.keyword.active", { q: query })}</span>
            <button
              type="button"
              onClick={nearby.clearQuery}
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
        {WALK_CHIPS.map((n) => (
          <FilterChip
            key={`w${n}`}
            on={filters.walkCap === n}
            onClick={() => setFilters((f) => ({ ...f, walkCap: f.walkCap === n ? null : n }))}
          >
            {t("onb.chip.walk", { n })}
          </FilterChip>
        ))}
        <ChipRule />
        {PRICE_CHIPS.map((n) => (
          <FilterChip
            key={`p${n}`}
            on={filters.priceCap === n}
            onClick={() => setFilters((f) => ({ ...f, priceCap: f.priceCap === n ? null : n }))}
          >
            {t(n === 1 ? "onb.chip.price1" : "onb.chip.price2")}
          </FilterChip>
        ))}
        <ChipRule />
        <FilterChip on={!!filters.openOnly} onClick={() => setFilters((f) => ({ ...f, openOnly: !f.openOnly }))}>
          {t("onb.chip.open")}
        </FilterChip>
      </div>

      {view.lowRated.length > 0 && (
        <p className="flex items-center gap-2 flex-wrap type-meta -mt-1" style={{ color: "var(--body-warm)" }}>
          <span>
            {t(
              filters.showLowRated
                ? view.lowRated.length === 1
                  ? "onb.lowRated.shown.one"
                  : "onb.lowRated.shown.other"
                : view.lowRated.length === 1
                  ? "onb.lowRated.hidden.one"
                  : "onb.lowRated.hidden.other",
              { n: view.lowRated.length },
            )}
          </span>
          <button
            type="button"
            onClick={() => setFilters((f) => ({ ...f, showLowRated: !f.showLowRated }))}
            className="font-semibold underline underline-offset-4"
            style={{ color: "var(--ink-warm)", minHeight: 32 }}
          >
            {filters.showLowRated ? t("onb.lowRated.hide") : t("onb.lowRated.show")}
          </button>
        </p>
      )}

      {alert && <ErrorNote tone={alert.quota ? "warn" : "error"}>{t(alert.messageKey)}</ErrorNote>}
      {notices}

      {/* The list, sectioned by walk band. */}
      <div className="flex flex-col gap-5" aria-busy={pending === "keyword"}>
        {leading}

        {bands.map(({ band, places }) => (
          <section key={band ?? "far"} className="flex flex-col gap-2.5">
            <BandHeading label={band == null ? t("onb.band.far") : t("onb.band", { n: band })} count={places.length} />
            {places.map((p) => {
              const on = selected.has(p.placeId);
              return (
                <PlaceCard
                  key={p.placeId}
                  place={p}
                  on={on}
                  onWheel={p.alreadyAdded}
                  dimmed={atCap && !on}
                  index={cardIndex++}
                  onToggle={() => onToggle(p.placeId)}
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
            onLift={nearby.lift}
            onLookFarther={nearby.lookFarther}
            onChangePlace={onChangePlace}
            onManualCreate={onManualCreate}
          />
        ) : (
          pool?.nextPageToken && (
            <button
              type="button"
              onClick={nearby.lookFarther}
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
                <Loader2 size={18} className="animate-spin" style={{ color: "var(--brand-text)" }} />
              ) : (
                <Radar size={18} style={{ color: "var(--brand-text)" }} />
              )}
              <span className="flex flex-col items-start">
                <span style={{ fontSize: 15, fontWeight: 600 }}>
                  {pending === "more" ? t("onb.more.loading") : t("onb.more")}
                </span>
                <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{t("onb.more.hint")}</span>
              </span>
            </button>
          )
        )}
      </div>
    </>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

/** A list section's heading: its name, a rule, and how many it holds. Shared
 *  with first run's "you typed" section so the two read as one list. */
export function BandHeading({ label, count }: { label: string; count: number }) {
  const { t } = useLang();
  return (
    <div className="flex items-center gap-3 px-1">
      <h2 style={{ fontSize: 13, fontWeight: 650, color: "var(--ink-warm)", letterSpacing: "0.02em" }}>{label}</h2>
      <span aria-hidden className="flex-1 h-px" style={{ background: "var(--border)" }} />
      <span style={{ fontSize: 12, color: "var(--muted-foreground)", fontVariantNumeric: "tabular-nums" }}>
        {t("onb.band.count", { n: count })}
      </span>
    </div>
  );
}

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

/** A chip in the scrolling filter row — the design-system Chip, kept from
 *  shrinking or wrapping so the row scrolls instead. */
function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <UiChip pressed={on} onClick={onClick} className="flex-none whitespace-nowrap">
      {children}
    </UiChip>
  );
}

function ChipRule() {
  return <span aria-hidden className="flex-none w-px h-6" style={{ background: "var(--border)" }} />;
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
  onChangePlace?: () => void;
  onManualCreate?: () => void;
}) {
  const { t } = useLang();
  const labels: Record<RelaxationKind, Parameters<typeof t>[0]> = {
    openOnly: "onb.relax.openOnly",
    priceCap: "onb.relax.priceCap",
    walkCap: "onb.relax.walkCap",
    lowRated: "onb.relax.lowRated",
  };
  const exhausted = lifts.length === 0 && !canLookFarther;
  if (exhausted && !onChangePlace && !onManualCreate) {
    return (
      <p className="type-meta px-1" style={{ color: "var(--body-warm)" }}>
        {count === 0 ? t("onb.thin.titleNone") : t("onb.thin.exhausted")}
      </p>
    );
  }

  return (
    <div
      className="onb-arrive flex flex-col gap-3 p-5"
      style={{ borderRadius: "var(--radius-card)", border: "1.5px dashed var(--border)", background: "var(--paper)" }}
    >
      <p style={{ fontSize: 17, fontWeight: 650, color: "var(--ink-warm)" }}>
        {count === 0 ? t("onb.thin.titleNone") : t("onb.thin.title", { n: count })}
      </p>
      {exhausted ? (
        <>
          <p className="type-meta" style={{ color: "var(--body-warm)" }}>
            {t("onb.thin.exhausted")}
          </p>
          <div className="flex gap-2 flex-wrap">
            {onChangePlace && (
              <OutlineButton onClick={onChangePlace}>
                <MapPin size={15} /> {t("onb.pick.change")}
              </OutlineButton>
            )}
            {onManualCreate && (
              <OutlineButton onClick={onManualCreate}>
                <PenLine size={15} /> {t("onb.locate.manual")}
              </OutlineButton>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="type-meta" style={{ color: "var(--body-warm)" }}>
            {t("onb.thin.desc")}
          </p>
          <div className="flex gap-2 flex-wrap">
            {lifts.map((l) => (
              <OutlineButton key={l.kind} onClick={() => onLift(l.kind)}>
                {t(labels[l.kind])}
                <span style={{ color: "var(--brand-text)", fontWeight: 700 }}>{t("onb.relax.gain", { n: l.gain })}</span>
              </OutlineButton>
            ))}
            {canLookFarther && (
              <OutlineButton onClick={onLookFarther} disabled={looking} accent>
                {looking ? <Loader2 size={15} className="animate-spin" /> : <Radar size={15} />}
                {t("onb.more")}
                <span style={{ fontSize: 12, opacity: 0.8 }}>· {t("onb.relax.research")}</span>
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
  children: ReactNode;
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
