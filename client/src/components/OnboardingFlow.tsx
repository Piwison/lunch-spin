/**
 * First run: Locate → Pick → Spin.
 *
 * The nearby search IS the onboarding. One tap finds real restaurants near you,
 * already ticked; the only job is adjusting the list; then the wheel is built
 * and spun. Zero typed characters — the wheel is named after the neighbourhood
 * (shared/areaName) — and anyone who would rather not share a location drops
 * through to the ordinary create dialog via `onManualCreate`.
 *
 * The list itself — ranked by distance, a page at a time, chips, the low-rating
 * cut, "look farther" — is components/NearbyPicker, shared with the Places
 * tab's Nearby (BACKLOG.md 1a–1d, rules in shared/candidates). Ranked by
 * DISTANCE, not Google's default prominence: measured at 內湖, the two shared
 * 2 of 20 places and only distance found the neighbourhood lunch spots.
 *
 * What this flow adds on top is the selection:
 *
 *   - One selection across every list (shared/candidates `nextSelection`): a
 *     place ticked while searching "noodle" is still on the wheel after "back
 *     to all". Searching ADDS; it never replaces what was chosen.
 *   - Only the plain nearby list ticks anything by itself, once, when it first
 *     arrives. A search's results are never ticked for you — that is what once
 *     leaked three noodle shops nobody chose into the wheel (failure mode 65).
 *   - Every selected place sits in the "Selected" row above the button, whether
 *     or not its list is the one showing, and can be removed there. So the
 *     number on the button always matches something on screen (failure modes
 *     38/54), even when a filter or a search hides the card it came from.
 *
 * The motion follows the product's one rule — it answers the person, nothing
 * idles. See the "First run" block in index.css.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
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
import { placeMapUrl } from "@/components/onboarding/PlaceCard";
import ErrorNote from "@/components/onboarding/ErrorNote";
import NearbyPicker, { BandHeading, useNearbyPool, type NearbyRow } from "@/components/NearbyPicker";
import { MAX_SEGMENTS } from "@shared/nearby";
import { MIN_SPINNABLE, canStartSpinning } from "@shared/onboarding";
import { DEMO_DRAFT_KEY, parseDemoDraft } from "@shared/demoDraft";
import { bestNameMatch } from "@shared/nameMatch";
import { arrivalTicks, filterCandidates, nextSelection } from "@shared/candidates";
import { ArrowRight, Check, Loader2, MapPin, PenLine, X } from "lucide-react";
import { devicePlaceLanguage } from "@/lib/placeLanguage";

type Step = "locate" | "pick" | "building" | "office";

/** How long the found places sit on the radar before the list takes over. */
const REVEAL_MS = 1100;
const CAP_FLASH_MS = 2600;

export default function OnboardingFlow({
  onCreated,
  onManualCreate,
}: {
  /** A wheel now exists — hand control back to the app. */
  onCreated: (wheelId: number) => void;
  /** "I'll add places myself" — open the ordinary create dialog. */
  onManualCreate: () => void;
}) {
  const { t } = useLang();
  const reducedMotion = useReducedMotion();

  const [step, setStep] = useState<Step>("locate");
  // Where we searched from. `label` is set when the user picked a named place
  // (their office) rather than raw geolocation — that name becomes the wheel's
  // office label, so settings shows "台北101" and not a bare "Office".
  const [origin, setOrigin] = useState<PickedLocation | null>(null);
  // One ordered selection across every list (see the header).
  const [selection, setSelection] = useState<string[]>([]);
  const [initialTicks, setInitialTicks] = useState(0);
  // How many of those arrival ticks are places reported closed. Non-zero only
  // in a quiet hour (see preselectPlaceIds), and then the copy has to say so.
  const [initialClosed, setInitialClosed] = useState(0);
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
  // Typed names that turned out to be a place in the nearby list (shared/
  // nameMatch): typed name → that place's id. A matched name is represented by
  // the real listing — location, hours, walk time — not sent as a bare name.
  const [matched, setMatched] = useState<Record<string, string>>({});

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

  // The list itself — pools, craving, chips, "look farther" — is the shared
  // nearby picker's (components/NearbyPicker). This flow owns the selection.
  const nearby = useNearbyPool(null);
  const { search, pending, rows, known } = nearby;
  const createWheel = trpc.wheels.createFromNearby.useMutation();
  const saveOffice = trpc.wheels.setDistanceOrigin.useMutation();
  // The wheel just built from a raw location fix, while we ask whether that
  // spot is the office (plan 7c: saved only with a yes).
  const [builtId, setBuiltId] = useState<number | null>(null);

  const selected = useMemo(() => new Set(selection), [selection]);
  const wheel = useMemo(
    () => selection.map(id => known.get(id)).filter((r): r is NearbyRow => !!r),
    [selection, known]
  );
  const typedOnWheel = typed.filter(n => typedOn.has(n) && !(n in matched));
  // The wheel is the visible ticked nearby places PLUS the typed ones; every
  // count on screen (button, mini wheel, cap) is this one number.
  const total = wheel.length + typedOnWheel.length;
  const atCap = total >= MAX_SEGMENTS;
  const closedOnWheel = wheel.filter(p => p.open === false).length;

  // ── Requests ─────────────────────────────────────────────────────────────

  const searchFrom = (at: PickedLocation) => {
    setOrigin(at);
    nearby.searchFrom(at, fresh => {
        // A name typed on the landing page that is really one of these places
        // ticks that place instead of riding along as a second, location-less
        // copy of it (P1-F).
        const matches: Record<string, string> = {};
        for (const name of typed) {
          const hit = bestNameMatch(name, fresh.rows);
          if (hit) matches[name] = hit.placeId;
        }
        setMatched(matches);
        const matchedTicks = typed
          .filter(n => typedOn.has(n) && n in matches)
          .map(n => matches[n]);
        const unmatchedOn = typed.filter(n => typedOn.has(n) && !(n in matches)).length;
        // Array.from, not a Set spread: the client compiles to a pre-ES2015
        // target where spreading a Set is TS2802.
        const preset = Array.from(
          new Set([
            ...matchedTicks,
            ...arrivalTicks(
              filterCandidates(fresh.rows, {}).visible.filter(r => !matchedTicks.includes(r.placeId)),
              unmatchedOn + matchedTicks.length
            ),
          ])
        );
        setSelection(nextSelection([], { type: "arrive", list: "base", ticked: preset }));
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
    });
  };

  // ── Instant: never a request ─────────────────────────────────────────────

  const toggle = (placeId: string) => {
    if (!selected.has(placeId) && atCap) setCapAt(Date.now());
    setSelection(prev => nextSelection(prev, { type: "toggle", id: placeId, atCap }));
  };


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
          rating: p.rating,
          ratingCount: p.ratingCount,
          mapUrl: placeMapUrl(p.placeId, p.name),
        })),
        // Only a *named* pick becomes the wheel's office. A raw geolocation fix
        // is where the user happened to be standing, not their office.
        extraNames: typedOnWheel,
        language: devicePlaceLanguage(),
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
          // A raw location fix is where the person happened to stand, so it is
          // never saved as the office on its own — but it usually IS the
          // office, and without an origin no place has a walk time. Ask once.
          if (origin && !origin.label) {
            setBuiltId(res.id);
            setStep("office");
            return;
          }
          onCreated(res.id);
        },
        // Back to the list with every choice intact; the error shows there.
        onError: () => setStep("pick"),
      }
    );
  };

  // ── Save as office? ──────────────────────────────────────────────────────
  if (step === "office" && builtId !== null && origin) {
    const done = () => onCreated(builtId);
    return (
      <div className="grow flex flex-col items-center justify-center px-5 py-6 w-full">
        <div className="w-full max-w-sm flex flex-col items-center gap-4 text-center">
          <MapPin size={28} style={{ color: "var(--brand-text)" }} />
          <h1 className="type-title" style={{ color: "var(--ink-warm)" }}>
            {t("onb.office.title")}
          </h1>
          <p className="type-meta" style={{ color: "var(--body-warm)" }}>
            {t("onb.office.body")}
          </p>
          {saveOffice.isError && <ErrorNote>{t("onb.office.error")}</ErrorNote>}
          <div className="w-full flex flex-col gap-2">
            <Button
              className="w-full"
              disabled={saveOffice.isPending}
              onClick={() =>
                saveOffice.mutate(
                  {
                    id: builtId,
                    enabled: true,
                    originLat: origin.lat,
                    originLng: origin.lng,
                    originLabel: t("onb.office.label"),
                  },
                  { onSuccess: done }
                )
              }
            >
              {saveOffice.isPending ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
              {t("onb.office.save")}
            </Button>
            <Button variant="ghost" className="w-full" disabled={saveOffice.isPending} onClick={done}>
              {t("onb.office.skip")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Building ─────────────────────────────────────────────────────────────
  if (step === "building") {
    return <BuildingStep places={building} growFrom={growFrom} />;
  }

  // ── Pick ─────────────────────────────────────────────────────────────────
  if (step === "pick") {
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
            {!nearby.query && (
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

          <NearbyPicker
            nearby={nearby}
            selected={selected}
            atCap={atCap}
            onToggle={toggle}
            // Nothing ticked: a search adds places to choose from, not choices.
            onCraving={() => setSelection(prev => nextSelection(prev, { type: "arrive", list: "search", ticked: [] }))}
            inputId="onb-craving"
            notices={createWheel.isError && <ErrorNote>{t("onb.err.create")}</ErrorNote>}
            onChangePlace={() => {
              search.reset();
              setStep("locate");
            }}
            onManualCreate={onManualCreate}
            leading={
              typed.length > 0 && (
                  <section className="flex flex-col gap-2.5">
                    <BandHeading label={t("onb.typed.section")} count={typed.length} />
                    {typed.map((name, i) => {
                      const placeId = matched[name];
                      if (placeId) {
                        const on = selected.has(placeId);
                        return (
                          <TypedCard
                            key={`typed:${name}`}
                            name={name}
                            matchedTo={known.get(placeId)?.name}
                            on={on}
                            dimmed={atCap && !on}
                            index={i}
                            onToggle={() => toggle(placeId)}
                          />
                        );
                      }
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
              )
            }
          />
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
            {/* Everything on the wheel, whichever list it was chosen from —
                the one place the button's number can always be checked
                against, and the way to drop a place whose card is not the
                one showing. */}
            {/* Solid paper: it floats over the scrolling list, and anything
                less than opaque would put two layers of names on top of each
                other. Each item is a remove BUTTON, not a toggle chip — its
                one job is taking the place off. */}
            {total > 0 && (
              <div
                role="group"
                aria-label={t("onb.selected", { n: total })}
                className="pointer-events-auto onb-chips w-full flex items-center gap-2 overflow-x-auto px-3 py-2"
                style={{
                  borderRadius: "var(--radius-card)",
                  background: "var(--paper)",
                  border: "1px solid var(--border)",
                  boxShadow: "var(--glass-card-shadow)",
                }}
              >
                <span className="type-eyebrow flex-none pl-1" style={{ color: "var(--ink-warm)" }}>
                  {t("onb.selected", { n: total })}
                </span>
                {typedOnWheel.map(name => (
                  <Button
                    key={`typed:${name}`}
                    variant="secondary"
                    size="md"
                    className="flex-none whitespace-nowrap"
                    aria-label={t("onb.selected.remove", { name })}
                    onClick={() =>
                      setTypedOn(prev => {
                        const next = new Set(prev);
                        next.delete(name);
                        return next;
                      })
                    }
                  >
                    {name} <X size={14} />
                  </Button>
                ))}
                {wheel.map(p => (
                  <Button
                    key={p.placeId}
                    variant="secondary"
                    size="md"
                    className="flex-none whitespace-nowrap"
                    aria-label={t("onb.selected.remove", { name: p.name })}
                    onClick={() => setSelection(prev => nextSelection(prev, { type: "remove", id: p.placeId }))}
                  >
                    {p.name} <X size={14} />
                  </Button>
                ))}
              </div>
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

/**
 * A place the visitor typed on the landing page. Same card and same tick as a
 * nearby place, so it reads as one list — but the tile shows a pen instead of
 * a walk time, because a typed name has no location to walk to.
 */
function TypedCard({
  name,
  matchedTo,
  on,
  dimmed,
  index,
  onToggle,
}: {
  name: string;
  /** The Google listing this typed name was matched to, if any. */
  matchedTo?: string;
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
            {matchedTo ? t("onb.typed.matched", { name: matchedTo }) : t("onb.typed.meta")}
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

