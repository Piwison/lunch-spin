import { useLang } from "@/i18n";

/**
 * The locate step's picture: where you are, and how far is walkable.
 *
 * Three rings at 3, 5 and 10 minutes' walk around a small Ember wheel. While a
 * search is in flight — the browser finding you, then Google answering — the
 * rings ping outward and the wheel turns; the moment the answer lands, every
 * place found drops onto the radar at its REAL bearing and walking time,
 * nearest first, before the list takes over. Nothing on it is decorative data:
 * the dots are the search result, drawn once.
 *
 * Radius is proportional to the square root of the walk, i.e. ring AREA grows
 * with walking time. On an even street grid that spreads the dots evenly
 * instead of piling the near ones into the centre, and it gives the 3- and
 * 5-minute rings room to be told apart around the hub.
 *
 * Nothing idles: without a search in flight the radar is a still picture.
 */

const VIEW = 280;
const C = VIEW / 2;
/** Radius of the 10-minute ring. */
const R10 = 118;
/** Anything walked farther than this sits just outside the last ring. */
const MAX_WALK = 11.5;
const RINGS = [3, 5, 10] as const;

export const ringRadius = (minutes: number) =>
  Math.sqrt(Math.min(Math.max(minutes, 0), MAX_WALK) / 10) * R10;

export interface RadarDot {
  id: string;
  /** Compass bearing from the origin, degrees clockwise from north. */
  bearing: number;
  walkMinutes: number;
}

/** Compass bearing from one coordinate to another (flat approximation — at
 *  walking range the error is far below a pixel). */
export function bearingDeg(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
) {
  const dy = to.lat - from.lat;
  const dx = (to.lng - from.lng) * Math.cos((from.lat * Math.PI) / 180);
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

export default function LocateRadar({
  busy,
  dots,
}: {
  busy: boolean;
  /** Set once the search has answered; drawn nearest-first. */
  dots: RadarDot[] | null;
}) {
  const { t } = useLang();

  return (
    <div
      className="relative flex-none"
      role="img"
      aria-label={t("onb.radarLabel")}
      style={{ width: "min(216px, 58vw, 26dvh)", aspectRatio: "1 / 1" }}
    >
      {/* Warmth under the rings, so the radar reads as a place rather than a
          diagram floating on the ground. Static. */}
      <div
        aria-hidden
        className="absolute inset-[-14%] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(closest-side, oklch(from var(--brand) l c h / 0.13), oklch(from var(--brand) l c h / 0.04) 62%, transparent)",
        }}
      />

      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="absolute inset-0 w-full h-full overflow-visible"
      >
        {busy &&
          [0, 1].map(i => (
            <circle
              key={`ping-${i}`}
              className="onb-ping"
              style={{ ["--i" as string]: i }}
              cx={C}
              cy={C}
              r={R10}
              fill="oklch(from var(--brand) l c h / 0.07)"
              stroke="var(--brand-solid)"
              strokeWidth={1.5}
            />
          ))}

        {RINGS.map((m, i) => {
          const r = ringRadius(m);
          return (
            <g key={m} className="onb-ring" style={{ ["--i" as string]: i }}>
              <circle
                cx={C}
                cy={C}
                r={r}
                fill="none"
                stroke="var(--border)"
                strokeWidth={m === 10 ? 1.5 : 1.25}
                strokeDasharray={m === 10 ? undefined : "2 6"}
                strokeLinecap="round"
              />
              {/* On the ring at 12 o'clock, stacked up the vertical axis: on
                  a shared diagonal the 3- and 5-minute labels sat 16px apart
                  and read as one smudge. Straight up, they are a scale. */}
              <text
                x={C}
                y={C - r}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="var(--muted-foreground)"
                stroke="var(--background)"
                strokeWidth={4}
                paintOrder="stroke"
                dominantBaseline="middle"
              >
                {t("onb.ring", { n: m })}
              </text>
            </g>
          );
        })}

        {dots?.map((d, i) => {
          const r = ringRadius(d.walkMinutes);
          const a = (d.bearing * Math.PI) / 180;
          return (
            <circle
              key={d.id}
              className="onb-dot"
              style={{ ["--i" as string]: i }}
              cx={C + r * Math.sin(a)}
              cy={C - r * Math.cos(a)}
              r={5}
              fill="var(--brand-solid)"
              stroke="var(--paper)"
              strokeWidth={2}
            />
          );
        })}
      </svg>

      {/* The hub: this product, at the centre of your neighbourhood. It winds
          in once on arrival and turns only while a search is running. Two
          elements, because an animation on the same box as another animation
          would override it (failure mode 24). */}
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: "19%",
          height: "19%",
          transform: "translate(-50%, -50%)",
        }}
      >
        <div className="onb-wind w-full h-full">
          <div
            className={`orb-wheel w-full h-full${busy ? " animate-orb-spin" : ""}`}
            style={{
              boxShadow:
                "inset 0 0 0 1px var(--wheel-hairline), 0 6px 16px -6px oklch(from var(--brand) l c h / 0.5)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
