import { useLang } from "@/i18n";
import { ratingStanding } from "@shared/candidates";
import { Check, MapPinned } from "lucide-react";

/** The fields of a nearby result the card shows. */
export interface PlaceCardData {
  placeId: string;
  name: string;
  walkMinutes: number;
  walkSource: "route" | "estimate";
  priceLevel: number | null;
  open: boolean | null;
  rating: number | null;
  ratingCount: number | null;
}

export function placeMapUrl(placeId: string, name: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${placeId}`;
}

/**
 * One place on the "pick your lunch list" step.
 *
 * The walk-minute tile IS the checkbox. Walking time is the thing this list is
 * sorted and sectioned by and the first thing anyone asks about lunch, so it is
 * the biggest type on the card; ticking the place lights that tile persimmon
 * and badges it, which makes the tick readable from across the list without a
 * separate 20px box that has to be aimed at.
 *
 * The map link is a SIBLING of the toggle, not inside it — a link nested in a
 * button is invalid and the tap would do both.
 */
export default function PlaceCard({
  place,
  on,
  dimmed,
  index,
  onToggle,
}: {
  place: PlaceCardData;
  on: boolean;
  /** The wheel is full and this place is not on it. */
  dimmed: boolean;
  /** Position in the list, for the arrival stagger. */
  index: number;
  onToggle: () => void;
}) {
  const { t } = useLang();
  const approx = place.walkSource !== "route";
  const minutes = Math.max(1, Math.round(place.walkMinutes));
  const standing = ratingStanding(place);

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
        className="flex-1 min-w-0 flex items-center gap-3.5 pl-2.5 pr-1 py-2.5 text-left active:scale-[var(--press-scale)] transition-transform"
        style={{ borderRadius: "var(--radius-card)" }}
      >
        {/* Walk tile / checkbox */}
        <span
          className="relative flex-none flex flex-col items-center justify-center"
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            background: "var(--muted)",
          }}
          aria-label={t(approx ? "onb.card.walkApprox" : "onb.card.walk", {
            n: minutes,
          })}
          role="img"
        >
          <span
            aria-hidden
            className="onb-tile-fill absolute inset-0"
            style={{ borderRadius: 18, background: "var(--brand-grad)" }}
          />
          <span
            aria-hidden
            className="onb-tile-num relative"
            style={{
              fontSize: 22,
              lineHeight: 1,
              fontWeight: 650,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
              color: on ? "var(--on-accent)" : "var(--ink-warm)",
            }}
          >
            {approx && <span style={{ fontSize: 14, fontWeight: 500 }}>~</span>}
            {minutes}
          </span>
          <span
            aria-hidden
            className="onb-tile-num relative"
            style={{
              marginTop: 3,
              fontSize: 11,
              lineHeight: 1,
              fontWeight: 600,
              color: on ? "var(--on-accent)" : "var(--body-warm)",
            }}
          >
            {t("onb.card.unit")}
          </span>
          <span
            aria-hidden
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
            {place.name}
          </span>
          <span
            className="flex items-center gap-x-2 gap-y-0.5 flex-wrap"
            style={{
              fontSize: 13,
              lineHeight: 1.35,
              color: "var(--body-warm)",
            }}
          >
            {standing === "rated" && place.rating != null ? (
              <span
                className="inline-flex items-center gap-1"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                <Star />
                <span style={{ color: "var(--ink-warm)", fontWeight: 600 }}>
                  {place.rating.toFixed(1)}
                </span>
                <span>({(place.ratingCount ?? 0).toLocaleString()})</span>
              </span>
            ) : (
              <span>
                {t(
                  standing === "few-reviews"
                    ? "onb.card.fewReviews"
                    : "onb.card.unrated"
                )}
              </span>
            )}
            {place.priceLevel != null && (
              <>
                <Dot />
                <span
                  style={{
                    color: "var(--brand-text)",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                  }}
                >
                  {"$".repeat(place.priceLevel)}
                </span>
              </>
            )}
            {place.open != null && (
              <>
                <Dot />
                <span
                  style={{
                    color: place.open ? "var(--ok)" : "var(--muted-foreground)",
                  }}
                >
                  {t(place.open ? "onb.card.open" : "onb.card.closed")}
                </span>
              </>
            )}
          </span>
        </span>
      </button>

      <a
        href={placeMapUrl(place.placeId, place.name)}
        target="_blank"
        rel="noreferrer"
        aria-label={t("onb.card.map", { name: place.name })}
        className="flex-none flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        style={{ width: 48, borderRadius: "var(--radius-card)" }}
      >
        <MapPinned size={17} />
      </a>
    </div>
  );
}

function Dot() {
  return (
    <span
      aria-hidden
      style={{
        width: 3,
        height: 3,
        borderRadius: 9,
        background: "var(--border)",
      }}
    />
  );
}

/** Filled star with a darker edge: --star alone is 2.4:1 on paper (failure
 *  mode 17), so the edge carries the shape and the number carries the value. */
function Star() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"
        fill="var(--star)"
        stroke="var(--star-edge)"
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </svg>
  );
}
